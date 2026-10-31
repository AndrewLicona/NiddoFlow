from fastapi import APIRouter, Depends
from typing import List, Optional
from pydantic import BaseModel
from app.dependencies import get_current_user
from app.services.chat_service import ChatService

router = APIRouter(prefix="/api/chat", tags=["AI Chat"])

class ChatMessageRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = []

class ChatMessageResponse(BaseModel):
    """Respuesta del chat.

    `proposals` siempre está presente (aunque sea una lista vacía) porque el
    frontend renderiza los botones "Confirmar"/"Descartar" de cada propuesta.
    La IA NUNCA escribe en `transactions`: solo propone.
    """
    reply: str
    proposals: List[dict] = []

def get_chat_service():
    return ChatService()

@router.post("/message", response_model=ChatMessageResponse)
async def send_chat_message(
    payload: ChatMessageRequest,
    user = Depends(get_current_user),
    service: ChatService = Depends(get_chat_service)
):
    try:
        result = await service.chat_with_assistant(
            str(user.id), payload.message, payload.history
        )
    except Exception as e:
        # Nunca se devuelve un 500 por un fallo puntual del asistente: se
        # responde con un mensaje amable y sin propuestas.
        return {
            "reply": (
                "No pude procesar tu consulta en este momento. "
                "Inténtalo de nuevo en un momento."
            ),
            "proposals": [],
        }
    return {
        "reply": result.get("reply", ""),
        "proposals": result.get("proposals", []) or [],
    }

@router.get("/history", response_model=List[dict])
async def get_history(
    user = Depends(get_current_user),
    service: ChatService = Depends(get_chat_service)
):
    try:
        return await service.get_chat_history(str(user.id))
    except Exception as e:
        return []
