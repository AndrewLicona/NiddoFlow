"""Servicio del chat de NiddoAI (CONTRATOS_IMPLEMENTACION.md §5).

Responsabilidades:

* **Contexto real** (§5.1): el contexto que ve el modelo se construye con
  `InsightsService` (agente A), de modo que los totales, el gasto por
  categoría, el gasto por miembro y el `spent` REAL de los presupuestos son
  exactamente los mismos que muestra `/insights` y `/budgets`.
* **Tool calling** (§5.2): el modelo puede pedir datos concretos mediante
  herramientas de solo lectura (`app.services.ai_tools`). El intercambio se
  guarda en `ai_chat_messages.tool_calls`.
* **Propuestas con confirmación** (§5.3): la IA NUNCA escribe en
  `transactions`. Si el usuario pide registrar algo, la respuesta incluye una
  propuesta que el frontend renderiza con los botones "Confirmar"/"Descartar".
* **Memoria entre sesiones** (§5.4): al empezar se cargan los últimos
  mensajes del usuario desde `ai_chat_messages`.

Ningún error de Gemini rompe el flujo: siempre se devuelve un mensaje amable.
"""

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

from app.db.prisma_db import prisma
from app.repositories.insights_repository import InsightsRepository
from app.services.ai_tools import AITools, ToolContext
from app.services.insights_service import InsightsService

load_dotenv()
logger = logging.getLogger(__name__)

try:
    from google import genai as genai_sdk

    GEMINI_AVAILABLE = True
except ImportError:  # pragma: no cover - el SDK es opcional en los tests
    genai_sdk = None
    GEMINI_AVAILABLE = False


# --------------------------------------------------------------------------- #
# Constantes
# --------------------------------------------------------------------------- #
# Modelos probados por orden de latencia (mismo criterio que el OCR).
CHAT_MODELS = ("gemini-3.5-flash-lite", "gemini-3.8-flash")

# Tope de vueltas del bucle de tool calling (evita bucles infinitos).
MAX_TOOL_ITERATIONS = 5

# Mensajes de memoria que se cargan de `ai_chat_messages`.
MEMORY_MESSAGES_LIMIT = 20

# Marca que el modelo debe usar para devolver una propuesta.
PROPOSAL_MARKER = "PROPUESTA_NIDDO_JSON"

# Mensajes de respuesta ante fallos.
NO_AI_MESSAGE = (
    "El asistente de IA no está disponible en este momento "
    "(falta configurar la API Key de Gemini)."
)
GENERIC_ERROR_MESSAGE = (
    "No pude comunicarme con el asistente de IA en este momento. "
    "Inténtalo de nuevo en un momento."
)
TOOL_LIMIT_MESSAGE = (
    "Consulté tus datos varias veces y no logré armar la respuesta completa. "
    "Prueba con una pregunta más específica."
)

# Etiquetas legibles de los tipos de movimiento (para las propuestas).
TRANSACTION_TYPE_LABELS = {
    "expense": "Gasto",
    "income": "Ingreso",
    "transfer": "Transferencia",
}


def _format_money(value: Any) -> str:
    """Formato de miles español (1.234.567)."""
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        number = 0.0
    return f"{number:,.0f}".replace(",", ".")


def _today_iso() -> str:
    """Fecha de hoy en formato YYYY-MM-DD (UTC)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class ChatService:
    """Servicio del chat con IA: contexto real, herramientas y propuestas."""

    def __init__(
        self,
        insights_service: Optional[InsightsService] = None,
        insights_repository: Optional[InsightsRepository] = None,
        tools: Optional[AITools] = None,
        gemini_client: Any = None,
        prisma_client: Any = None,
    ):
        self.insights_repository = insights_repository or InsightsRepository()
        self.insights_service = insights_service or InsightsService(
            self.insights_repository
        )
        self.tools = tools or AITools(
            insights_service=self.insights_service,
            insights_repository=self.insights_repository,
        )
        self.prisma = prisma_client if prisma_client is not None else prisma

        # Pool de clientes de Gemini: una clave por cliente, con rotación
        # automática cuando una clave se queda sin cuota.
        self.clients = self._build_clients()
        if gemini_client is not None:
            self.clients = [gemini_client]
        self.client = self.clients[0] if self.clients else None
        self._current_client_index = 0

    # ------------------------------------------------------------------
    # Cliente de Gemini
    # ------------------------------------------------------------------
    def _build_clients(self) -> List[Any]:
        """Crea un cliente por cada API key configurada (rotación de claves)."""
        if not GEMINI_AVAILABLE:
            return []
        raw_keys = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY", "")
        key_list = [key.strip() for key in raw_keys.split(",") if key.strip()]
        clients: List[Any] = []
        for key in key_list:
            try:
                clients.append(genai_sdk.Client(api_key=key))
            except Exception as exc:
                logger.error("No se pudo inicializar un cliente de Gemini: %s", exc)
        return clients

    def _build_gemini_tools(self) -> List[Any]:
        """Convierte las declaraciones del registro en `types.Tool`."""
        if not GEMINI_AVAILABLE:
            return []
        tools = []
        for declaration in self.tools.declarations():
            try:
                tools.append(
                    genai_sdk.types.Tool(function_declarations=[declaration])
                )
            except Exception as exc:  # pragma: no cover - defensa
                logger.error("Declaración de herramienta inválida: %s", exc)
        return tools

    async def _generate(
        self,
        contents: List[Any],
        system_instruction: str,
        tools_payload: List[Any],
    ) -> Any:
        """Llama a Gemini, rotando claves y modelos ante errores transitorios."""
        config: Dict[str, Any] = {
            "system_instruction": system_instruction,
            "temperature": 0.4,
        }
        if tools_payload:
            config["tools"] = tools_payload
            # El bucle de tool calling lo controla este servicio, no el SDK.
            config["automatic_function_calling"] = {"disable": True}

        last_error: Optional[Exception] = None
        total_clients = len(self.clients)
        for attempt in range(total_clients):
            index = (self._current_client_index + attempt) % total_clients
            client = self.clients[index]
            for model in CHAT_MODELS:
                try:
                    response = await client.aio.models.generate_content(
                        model=model, contents=contents, config=config
                    )
                    self._current_client_index = index
                    return response
                except Exception as exc:
                    last_error = exc
                    error_text = str(exc).lower()
                    logger.warning(
                        "Gemini falló (clave %d, modelo %s): %s", index, model, exc
                    )
                    if "429" in error_text or "quota" in error_text or "resource_exhausted" in error_text:
                        # Cuota agotada: se cambia de clave.
                        break
                    if "404" in error_text or "not found" in error_text:
                        # Modelo inexistente: se prueba el siguiente.
                        continue
        raise last_error if last_error else RuntimeError("Gemini no respondió.")

    # ------------------------------------------------------------------
    # Contexto real (§5.1)
    # ------------------------------------------------------------------
    async def build_financial_context(
        self,
        user_id: str,
        scope: str = "family",
        month: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Contexto financiero estructurado (totales, categorías, miembros...).

        Se apoya en `InsightsService`, así que el `spent` de los presupuestos
        es el MISMO que devuelve `GET /budgets/` para el mismo período.
        """
        insights = await self.insights_service.get_insights(user_id, scope, month)

        accounts = await self.tools.list_accounts(user_id)
        categories = await self.tools.list_categories(user_id)
        debts = await self.tools.list_debts(user_id)

        return {
            "month": insights.month,
            "scope": insights.scope,
            "totals": insights.totals.model_dump(),
            "by_category": [item.model_dump() for item in insights.by_category],
            "by_member": [item.model_dump() for item in insights.by_member],
            "by_account": [item.model_dump() for item in insights.by_account],
            "budgets": [item.model_dump() for item in insights.budgets],
            "top_merchants": [item.model_dump() for item in insights.top_merchants],
            "recurring": [item.model_dump() for item in insights.recurring],
            "anomalies": [item.model_dump() for item in insights.anomalies],
            "cashflow": insights.cashflow.model_dump(),
            "accounts": [
                {
                    "id": str(account.get("id") or ""),
                    "name": account.get("name") or "Cuenta",
                    "type": account.get("type") or "",
                    "balance": float(account.get("balance") or 0),
                }
                for account in accounts
            ],
            "categories": [
                {
                    "id": str(category.get("id") or ""),
                    "name": category.get("name") or "",
                    "type": category.get("type") or "",
                }
                for category in categories
            ],
            "debts": [
                {
                    "description": debt.get("description") or "",
                    "type": debt.get("type") or "",
                    "status": debt.get("status") or "",
                    "total_amount": float(debt.get("total_amount") or 0),
                    "remaining_amount": float(debt.get("remaining_amount") or 0),
                    "due_date": debt.get("due_date"),
                }
                for debt in debts
            ],
        }

    def render_financial_context(self, context: Dict[str, Any]) -> str:
        """Convierte el contexto estructurado en texto para el prompt."""
        totals = context.get("totals") or {}
        lines: List[str] = [
            f"CONTEXTO FINANCIERO REAL (mes {context.get('month')}, "
            f"alcance {context.get('scope')}):"
        ]

        lines.append(
            "- Totales del mes: ingresos ${}, gastos ${}, balance ${}, "
            "tasa de ahorro {}%, {} movimientos.".format(
                _format_money(totals.get("income")),
                _format_money(totals.get("expense")),
                _format_money(totals.get("balance")),
                round(float(totals.get("savings_rate") or 0), 1),
                totals.get("transaction_count", 0),
            )
        )

        categories = context.get("by_category") or []
        if categories:
            detail = "; ".join(
                "{} ${} ({}%)".format(
                    item.get("category") or "Sin categoría",
                    _format_money(item.get("amount")),
                    round(float(item.get("pct_of_total") or 0), 1),
                )
                for item in categories
            )
            lines.append(f"- Gasto por categoría: {detail}")
        else:
            lines.append("- Gasto por categoría: sin movimientos en el mes.")

        members = context.get("by_member") or []
        if members:
            detail = "; ".join(
                "{} ${} ({} movimientos)".format(
                    item.get("member") or "Sin asignar",
                    _format_money(item.get("amount")),
                    item.get("transaction_count", 0),
                )
                for item in members
            )
            lines.append(f"- Gasto por miembro: {detail}")
        else:
            lines.append("- Gasto por miembro: sin movimientos en el mes.")

        budgets = context.get("budgets") or []
        if budgets:
            detail = "; ".join(
                "{} ${} de ${} ({}%, estado {})".format(
                    item.get("category") or "General",
                    _format_money(item.get("spent")),
                    _format_money(item.get("amount")),
                    round(float(item.get("percent") or 0), 1),
                    item.get("status") or "ok",
                )
                for item in budgets
            )
            lines.append(f"- Presupuestos (gastado real / límite): {detail}")
        else:
            lines.append("- Presupuestos: no hay presupuestos configurados.")

        recurring = context.get("recurring") or []
        if recurring:
            detail = "; ".join(
                "{} ${} cada {}".format(
                    item.get("merchant") or "",
                    _format_money(item.get("amount")),
                    item.get("cadence") or "",
                )
                for item in recurring
            )
            lines.append(f"- Gastos recurrentes detectados: {detail}")

        merchants = context.get("top_merchants") or []
        if merchants:
            detail = "; ".join(
                "{} ${} ({} visitas)".format(
                    item.get("merchant") or "",
                    _format_money(item.get("amount")),
                    item.get("visits", 0),
                )
                for item in merchants
            )
            lines.append(f"- Comercios con más gasto: {detail}")

        debts = context.get("debts") or []
        if debts:
            detail = "; ".join(
                "{} (saldo ${})".format(
                    item.get("description") or "Deuda",
                    _format_money(item.get("remaining_amount")),
                )
                for item in debts
            )
            lines.append(f"- Deudas del hogar: {detail}")
        else:
            lines.append("- Deudas del hogar: no hay deudas registradas.")

        accounts = context.get("accounts") or []
        if accounts:
            detail = "; ".join(
                "{} (saldo ${})".format(
                    item.get("name") or "Cuenta",
                    _format_money(item.get("balance")),
                )
                for item in accounts
            )
            lines.append(f"- Cuentas: {detail}")

        anomalies = context.get("anomalies") or []
        if anomalies:
            detail = "; ".join(
                str(item.get("message") or "") for item in anomalies[:5]
            )
            lines.append(f"- Alertas: {detail}")

        return "\n".join(lines)

    async def get_user_financial_context(
        self,
        user_id: str,
        scope: str = "family",
        month: Optional[str] = None,
    ) -> str:
        """Contexto financiero en texto, listo para el system prompt."""
        try:
            context = await self.build_financial_context(user_id, scope, month)
        except Exception as exc:
            logger.error("[chat] Error construyendo el contexto financiero: %s", exc)
            return "No se pudo cargar el contexto financiero completo."
        return self.render_financial_context(context)

    # ------------------------------------------------------------------
    # System prompt
    # ------------------------------------------------------------------
    def build_system_instruction(self, context: Dict[str, Any]) -> str:
        """Instrucciones de sistema: rol, alcance, herramientas y propuestas."""
        accounts = context.get("accounts") or []
        categories = context.get("categories") or []

        accounts_text = (
            "; ".join(
                "{} (id {})".format(item.get("name") or "Cuenta", item.get("id"))
                for item in accounts
            )
            or "no hay cuentas registradas"
        )
        categories_text = (
            "; ".join(
                "{} (id {}, tipo {})".format(
                    item.get("name") or "", item.get("id"), item.get("type")
                )
                for item in categories
            )
            or "no hay categorías registradas"
        )

        return f"""Eres NiddoAI, un asistente financiero inteligente, amigable, conciso y directo, integrado en NiddoFlow.
Ayudas a las familias y usuarios a gestionar sus finanzas: analizas sus gastos, presupuestos y deudas, y das consejos de ahorro.

AQUÍ TIENES EL ESTADO FINANCIERO REAL DEL USUARIO (calculado por el servidor):
{self.render_financial_context(context)}

HERRAMIENTAS DISPONIBLES (solo lectura):
- get_summary: totales del mes (ingresos, gastos, balance, tasa de ahorro).
- get_spend_by_category: gasto del mes desglosado por categoría.
- get_spend_by_member: gasto del mes desglosado por miembro.
- get_budget_status: gastado real frente al límite de cada presupuesto.
- get_transactions: movimientos, con filtros por categoría, miembro y monto.
- get_debts: deudas del hogar.
- get_recurring: gastos recurrentes detectados.
- get_price_history: historial de precios de un producto.
ÚSALAS para responder con datos exactos. Si te faltan datos que no tienes en el contexto, llama a la herramienta correspondiente en lugar de estimar. NUNCA inventes cifras.

CÓMO ELEGIR EL ALCANCE (scope) EN LAS HERRAMIENTAS:
- scope "personal" cuando la pregunta es sobre el usuario: "¿gasté yo?", "¿cuánto gasté?", "mi gasto", "mis compras".
- scope "family" cuando la pregunta es sobre el hogar: "¿gastamos?", "¿cuánto gastamos?", "la familia", "nosotros".
- Ante la duda, usa "family" y aclara en la respuesta si el dato es de toda la familia.

CUENTAS DISPONIBLES PARA PROPUESTAS: {accounts_text}
CATEGORÍAS DISPONIBLES PARA PROPUESTAS: {categories_text}

NUNCA ESCRIBAS EN LA BASE DE DATOS. Si el usuario te pide registrar, crear o añadir un gasto, NO lo registres: prepáralo como una propuesta que el usuario confirmará. Para proponerlo, escribe tu respuesta normal y al final añade EXACTAMENTE este bloque (y nada más después del bloque):
{PROPOSAL_MARKER}
{{"type": "transaction", "label": "texto legible", "payload": {{"description": "Café", "amount": 32000, "type": "expense", "category_id": null, "account_id": "<id de cuenta>", "date": "YYYY-MM-DD"}}}}

Reglas de la propuesta:
- "type" del movimiento: "expense" (gasto), "income" (ingreso) o "transfer" (transferencia).
- "amount" es el número sin símbolos ni separadores (ejemplo 32000).
- "category_id" debe ser el id exacto de una de las categorías disponibles o null si no sabes cuál es.
- "account_id" debe ser el id exacto de una de las cuentas disponibles.
- "date" va en formato YYYY-MM-DD.
- Si te faltan datos para proponer (por ejemplo el monto o la cuenta), pregúntalos en la respuesta normal SIN añadir el bloque de propuesta.

FORMATO DE LA RESPUESTA:
- Responde de manera clara y directa, en español.
- Usa párrafos cortos separados por saltos de línea.
- Usa viñetas (-) para listas o desgloses de datos.
- No uses markdown crudo con asteriscos dobles; escribe texto plano limpio.
- Los montos se muestran en pesos (ejemplo: $32.000).
- Si un dato no está disponible, dilo con claridad en lugar de inventarlo."""

    # ------------------------------------------------------------------
    # Memoria entre sesiones (§5.4)
    # ------------------------------------------------------------------
    async def load_memory(
        self, user_id: str, limit: int = MEMORY_MESSAGES_LIMIT
    ) -> List[Dict[str, str]]:
        """Últimos mensajes del usuario guardados en `ai_chat_messages`.

        Se devuelve en orden cronológico y con el rol de Gemini
        (`user` / `model`).
        """
        try:
            rows = await self.prisma.aichatmessage.find_many(
                where={"user_id": user_id},
                order={"created_at": "desc"},
                take=limit,
            )
        except Exception as exc:
            logger.warning("[chat] No se pudo leer la memoria del chat: %s", exc)
            return []

        messages: List[Dict[str, str]] = []
        for row in reversed(list(rows or [])):
            role = getattr(row, "role", None)
            content = getattr(row, "content", None) or ""
            if not content:
                continue
            messages.append(
                {
                    "role": "user" if role == "user" else "model",
                    "content": content,
                }
            )
        return messages

    @staticmethod
    def _normalize_client_history(history: Optional[List[Dict[str, str]]]) -> List[Dict[str, str]]:
        """Historial que envía el navegador (se usa si no hay memoria en la BD)."""
        messages: List[Dict[str, str]] = []
        for item in history or []:
            if not isinstance(item, dict):
                continue
            content = (item.get("content") or "").strip()
            if not content:
                continue
            role = item.get("role")
            messages.append({"role": "user" if role == "user" else "model", "content": content})
        return messages

    # ------------------------------------------------------------------
    # Propuestas (§5.3)
    # ------------------------------------------------------------------
    @staticmethod
    def _extract_json_object(text: str, start: int) -> Optional[str]:
        """Extrae el objeto JSON que empieza en `start` (contando llaves)."""
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(text)):
            char = text[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return text[start : index + 1]
        return None

    def _parse_proposal_block(self, reply: str) -> Tuple[List[Dict[str, Any]], str]:
        """Extrae las propuestas del texto del modelo y limpia la respuesta."""
        if not reply or PROPOSAL_MARKER not in reply:
            return [], reply

        marker_index = reply.find(PROPOSAL_MARKER)
        rest = reply[marker_index + len(PROPOSAL_MARKER) :]
        brace_index = rest.find("{")
        if brace_index < 0:
            return [], reply[:marker_index].strip()

        raw_json = self._extract_json_object(rest, brace_index)
        clean_reply = reply[:marker_index].strip()
        if not raw_json:
            return [], clean_reply

        try:
            payload = json.loads(raw_json)
        except Exception as exc:
            logger.warning("[chat] La propuesta del modelo no es JSON válido: %s", exc)
            return [], clean_reply

        if isinstance(payload, dict) and "proposals" in payload:
            raw_proposals = payload.get("proposals") or []
        elif isinstance(payload, list):
            raw_proposals = payload
        elif isinstance(payload, dict):
            raw_proposals = [payload]
        else:
            raw_proposals = []

        proposals = [item for item in raw_proposals if isinstance(item, dict)]
        return proposals, clean_reply

    def _validate_proposal(
        self,
        proposal: Dict[str, Any],
        context: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Valida una propuesta y la normaliza al formato del contrato.

        Devuelve `None` si la propuesta no se puede construir (por ejemplo,
        si el usuario no tiene ninguna cuenta donde registrar el movimiento).
        """
        if str(proposal.get("type") or "transaction") != "transaction":
            return None

        payload = proposal.get("payload")
        if not isinstance(payload, dict):
            return None

        description = str(payload.get("description") or "").strip()
        if not description:
            return None

        try:
            amount = float(payload.get("amount"))
        except (TypeError, ValueError):
            return None
        if amount <= 0:
            return None

        tx_type = str(payload.get("type") or "expense").strip().lower()
        if tx_type not in TRANSACTION_TYPE_LABELS:
            tx_type = "expense"

        accounts = context.get("accounts") or []
        categories = context.get("categories") or []

        account_id = str(payload.get("account_id") or "").strip()
        valid_account = next(
            (item for item in accounts if str(item.get("id")) == account_id), None
        )
        if valid_account is None:
            # Si la cuenta no existe (o no la indicó), se usa la primera del
            # usuario: nunca se propone una cuenta ajena ni inventada.
            valid_account = accounts[0] if accounts else None
        if valid_account is None:
            return None
        account_id = str(valid_account.get("id") or "")

        category_id = payload.get("category_id")
        category_id = str(category_id).strip() if category_id else ""
        valid_category = next(
            (item for item in categories if str(item.get("id")) == category_id), None
        )
        if valid_category is None:
            # Se acepta también el NOMBRE de la categoría y se resuelve al id.
            name = category_id.lower()
            valid_category = next(
                (
                    item
                    for item in categories
                    if str(item.get("name") or "").lower() == name
                ),
                None,
            )
        if valid_category is not None:
            category_id = str(valid_category.get("id") or "")
            category_name = str(valid_category.get("name") or "")
        else:
            category_id = ""
            category_name = "Sin categoría"

        date = str(payload.get("date") or "").strip()
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
            date = _today_iso()

        label = "{} · {} · ${} · {}".format(
            TRANSACTION_TYPE_LABELS.get(tx_type, "Gasto"),
            description,
            _format_money(amount),
            category_name,
        )

        return {
            "type": "transaction",
            "label": label,
            "payload": {
                "description": description,
                "amount": amount,
                "type": tx_type,
                "category_id": category_id or None,
                "account_id": account_id,
                "date": date,
            },
        }

    def _build_proposals(
        self, raw_proposals: List[Dict[str, Any]], context: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """Valida y normaliza todas las propuestas del modelo."""
        proposals: List[Dict[str, Any]] = []
        for raw in raw_proposals or []:
            proposal = self._validate_proposal(raw, context)
            if proposal is not None:
                proposals.append(proposal)
        return proposals

    # ------------------------------------------------------------------
    # Persistencia del chat
    # ------------------------------------------------------------------
    async def _save_message(
        self,
        user_id: str,
        role: str,
        content: str,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """Guarda un mensaje en `ai_chat_messages` (y el intercambio de tools)."""
        data: Dict[str, Any] = {
            "user_id": user_id,
            "role": role,
            "content": content,
        }
        if tool_calls:
            data["tool_calls"] = tool_calls
        try:
            await self.prisma.aichatmessage.create(data=data)
        except Exception as exc:
            logger.warning("[chat] No se pudo guardar el mensaje del chat: %s", exc)
            if not tool_calls:
                return
            # Si la columna `tool_calls` todavía no existe, se guarda el
            # mensaje sin ella para no perder la conversación.
            try:
                await self.prisma.aichatmessage.create(
                    data={
                        "user_id": user_id,
                        "role": role,
                        "content": content,
                    }
                )
            except Exception as inner_exc:
                logger.warning("[chat] No se pudo guardar el mensaje: %s", inner_exc)

    # ------------------------------------------------------------------
    # Bucle de tool calling (§5.2)
    # ------------------------------------------------------------------
    async def _run_tool_loop(
        self,
        user_id: str,
        contents: List[Any],
        system_instruction: str,
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """Ejecuta el bucle de tool calling y devuelve (respuesta, tool_calls)."""
        tools_payload = self._build_gemini_tools()
        exchanges: List[Dict[str, Any]] = []
        context = ToolContext(user_id=user_id)

        for _ in range(MAX_TOOL_ITERATIONS):
            response = await self._generate(contents, system_instruction, tools_payload)

            function_calls = []
            try:
                function_calls = list(getattr(response, "function_calls", None) or [])
            except Exception as exc:
                logger.warning("[chat] No se pudieron leer las function calls: %s", exc)

            if not function_calls:
                return self._response_text(response), exchanges

            # El turno del modelo (con las function calls) se devuelve al
            # historial para que el SDK entienda la conversación.
            model_content = None
            try:
                candidates = getattr(response, "candidates", None) or []
                if candidates:
                    model_content = candidates[0].content
            except Exception as exc:
                logger.warning("[chat] No se pudo leer el contenido del modelo: %s", exc)
            if model_content is not None:
                contents.append(model_content)

            parts = []
            for function_call in function_calls:
                name = getattr(function_call, "name", "") or ""
                raw_args = getattr(function_call, "args", None) or {}
                args = dict(raw_args) if isinstance(raw_args, dict) else {}
                result = await self.tools.dispatch(name, args, context)
                exchanges.append({"name": name, "args": args, "result": result})
                parts.append(
                    genai_sdk.types.Part.from_function_response(
                        name=name, response={"result": result}
                    )
                )

            if not parts:
                return self._response_text(response), exchanges
            contents.append(genai_sdk.types.Content(role="user", parts=parts))

        return TOOL_LIMIT_MESSAGE, exchanges

    @staticmethod
    def _response_text(response: Any) -> str:
        """Texto de la respuesta del modelo (o vacío si no hay texto)."""
        try:
            text = getattr(response, "text", None)
        except Exception:
            text = None
        if not text:
            return ""
        return str(text).strip()

    # ------------------------------------------------------------------
    # Punto de entrada
    # ------------------------------------------------------------------
    async def chat_with_assistant(
        self,
        user_id: str,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """Atiende un mensaje del chat.

        Devuelve SIEMPRE `{"reply": str, "proposals": list}`.
        """
        message = (message or "").strip()
        if not message:
            return {
                "reply": "Escribe tu pregunta y con gusto te ayudo con tus finanzas.",
                "proposals": [],
            }

        # 1. Memoria entre sesiones (antes de guardar el mensaje actual, para
        #    no duplicarlo en el historial que se le envía al modelo).
        memory = await self.load_memory(user_id)
        conversation = memory or self._normalize_client_history(history)

        # 2. Se guarda el mensaje del usuario.
        await self._save_message(user_id, "user", message)

        if not self.clients:
            reply = NO_AI_MESSAGE
            await self._save_message(user_id, "assistant", reply)
            return {"reply": reply, "proposals": []}

        # 3. Contexto real + prompt.
        try:
            context = await self.build_financial_context(user_id)
        except Exception as exc:
            logger.error("[chat] No se pudo construir el contexto: %s", exc)
            context = {
                "month": "",
                "scope": "family",
                "totals": {},
                "by_category": [],
                "by_member": [],
                "budgets": [],
                "recurring": [],
                "top_merchants": [],
                "debts": [],
                "accounts": [],
                "categories": [],
            }
        system_instruction = self.build_system_instruction(context)

        # 4. Contenido de la conversación (memoria + mensaje actual).
        contents: List[Any] = []
        for item in conversation[-MEMORY_MESSAGES_LIMIT:]:
            contents.append(
                {"role": item["role"], "parts": [{"text": item["content"]}]}
            )
        contents.append({"role": "user", "parts": [{"text": message}]})

        # 5. Bucle de tool calling.
        try:
            reply, exchanges = await self._run_tool_loop(
                user_id, contents, system_instruction
            )
        except Exception as exc:
            logger.error("[chat] Error de Gemini en el chat: %s", exc)
            reply = GENERIC_ERROR_MESSAGE
            exchanges = []

        if not reply:
            reply = GENERIC_ERROR_MESSAGE

        # 6. Propuestas (la IA propone, el usuario confirma).
        raw_proposals, clean_reply = self._parse_proposal_block(reply)
        proposals = self._build_proposals(raw_proposals, context)
        if not clean_reply:
            # El modelo devolvió solo el bloque técnico: se le da un texto
            # legible en vez de mostrarle el JSON al usuario.
            clean_reply = (
                "Te propongo registrar este movimiento. Revísalo y confírmalo "
                "para guardarlo."
                if proposals
                else reply
            )

        # 7. Se guarda la respuesta junto con el intercambio de herramientas.
        await self._save_message(user_id, "assistant", clean_reply, tool_calls=exchanges)

        return {"reply": clean_reply, "proposals": proposals}

    # ------------------------------------------------------------------
    # Historial
    # ------------------------------------------------------------------
    async def get_chat_history(self, user_id: str, limit: int = 50):
        try:
            messages = await self.prisma.aichatmessage.find_many(
                where={"user_id": user_id},
                order={"created_at": "asc"},
                take=limit,
            )
            return [message.dict() for message in messages]
        except Exception as exc:
            logger.error("[chat] Error al leer el historial del chat: %s", exc)
            return []
