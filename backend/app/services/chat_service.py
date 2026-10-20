import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from dotenv import load_dotenv
from app.db.prisma_db import prisma

load_dotenv()
logger = logging.getLogger(__name__)

try:
    from google import genai as genai_sdk
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

class ChatService:
    def __init__(self):
        self.client = None
        raw_keys = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY", "")
        key_list = [k.strip() for k in raw_keys.split(",") if k.strip()]
        if key_list and GEMINI_AVAILABLE:
            try:
                self.client = genai_sdk.Client(api_key=key_list[0])
            except Exception as e:
                logger.error(f"Failed to init chat gemini client: {e}")

    async def get_user_financial_context(self, user_id: str) -> str:
        try:
            profile = await prisma.profile.find_unique(where={"id": user_id})
            if not profile or not profile.family_id:
                return "El usuario no pertenece a ninguna familia."

            family_id = profile.family_id
            accounts = await prisma.account.find_many(where={"family_id": family_id})
            budgets = await prisma.budget.find_many(where={"family_id": family_id}, include={"category": True})

            # Fetch transactions for current month & last 30 days to give rich context
            now = datetime.utcnow()
            start_of_month = datetime(now.year, now.month, 1)
            transactions = await prisma.transaction.find_many(
                where={
                    "family_id": family_id,
                    "date": {"gte": start_of_month}
                },
                order={"date": "desc"},
                include={"category": True, "account": True}
            )

            # If fewer than 5 transactions this month, take the last 20 overall so the AI has plenty of history
            if len(transactions) < 5:
                transactions = await prisma.transaction.find_many(
                    where={"family_id": family_id},
                    take=25,
                    order={"date": "desc"},
                    include={"category": True, "account": True}
                )

            acc_summary = ", ".join([f"{a.name} ({a.type}): ${a.balance:,.2f}" for a in accounts])
            budget_summary = ", ".join([f"{b.category.name if b.category else 'General'}: ${b.spent if hasattr(b, 'spent') else 0}/${b.amount}" for b in budgets]) if budgets else "Sin presupuestos configurados."

            tx_list_str = "; ".join([f"[{t.type}] {t.description}: ${t.amount:,.2f} ({t.date.strftime('%Y-%m-%d')} en {t.account.name if t.account else 'Cuenta'})" for t in transactions])
            tx_summary = tx_list_str if tx_list_str else "No hay transacciones registradas."

            return f"""Contexto financiero del hogar del usuario (Mes actual y movimientos recientes):
- Cuentas y Saldos Actuales: {acc_summary}
- Presupuestos Activos: {budget_summary}
- Movimientos Registrados: {tx_summary}
"""
        except Exception as e:
            logger.error(f"Error fetching financial context for chat: {e}")
            return "No se pudo cargar el contexto financiero completo."

    async def chat_with_assistant(self, user_id: str, message: str, history: List[Dict[str, str]] = []) -> str:
        # Save user message
        try:
            await prisma.aichatmessage.create(data={
                "user_id": user_id,
                "role": "user",
                "content": message
            })
        except Exception as e:
            logger.warning(f"Failed to save user chat message: {e}")

        if not self.client:
            reply = "El asistente de IA no está disponible en este momento (Falta configurar API Key de Gemini)."
            await self._save_assistant_reply(user_id, reply)
            return reply

        context = await self.get_user_financial_context(user_id)

        system_instruction = f"""Eres NiddoAI, un asistente financiero inteligente, amigable, conciso y directo, integrado en la plataforma NiddoFlow.
Ayudas a las familias y usuarios a gestionar sus finanzas, responder dudas sobre sus cuentas, analizar gastos y dar consejos de ahorro.
Aquí tienes información en tiempo real sobre el estado financiero actual del usuario:
{context}

INSTRUCCIONES DE FORMATO:
- Responde de manera clara y directa.
- Usa párrafos cortos separados por saltos de línea.
- Utiliza viñetas (-) para listas o desglose de datos.
- NUNCA uses asteriscos dobles (**) o markdown crudo para negritas si confunden la lectura; usa texto plano limpio o mayúsculas destacadas para títulos.
- Si te piden registrar gastos o acciones que no puedes hacer directamente por chat, guíalos amablemente a usar el formulario correspondiente."""

        # Format history for Gemini
        contents = []
        for h in history[-10:]:
            role = "user" if h.get("role") == "user" else "model"
            contents.append({"role": role, "parts": [{"text": h.get("content", "")}]})

        contents.append({"role": role if False else "user", "parts": [{"text": message}]})

        try:
            response = await self.client.aio.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=contents,
                config={
                    "system_instruction": system_instruction,
                    "temperature": 0.7,
                }
            )
            reply = response.text if response and response.text else "Lo siento, no pude procesar tu consulta financiera."
        except Exception as e:
            logger.error(f"Gemini chat error: {e}")
            reply = f"Ocurrió un error al comunicarse con el asistente de IA: {str(e)}"

        await self._save_assistant_reply(user_id, reply)
        return reply

    async def _save_assistant_reply(self, user_id: str, content: str):
        try:
            await prisma.aichatmessage.create(data={
                "user_id": user_id,
                "role": "assistant",
                "content": content
            })
        except Exception as e:
            logger.warning(f"Failed to save assistant reply: {e}")

    async def get_chat_history(self, user_id: str, limit: int = 50):
        try:
            messages = await prisma.aichatmessage.find_many(
                where={"user_id": user_id},
                order={"created_at": "asc"},
                take=limit
            )
            return [m.dict() for m in messages]
        except Exception as e:
            logger.error(f"Error fetching chat history: {e}")
            return []
