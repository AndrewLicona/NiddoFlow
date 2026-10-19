from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from app.dependencies import get_current_user
from app.services.chat_service import ChatService

router = APIRouter(prefix="/api/chat", tags=["AI Chat"])

class ChatMessageRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = []

class ChatMessageResponse(BaseModel):
    reply: str

def get_chat_service():
    return ChatService()

@router.post("/message", response_model=ChatMessageResponse)
async def send_chat_message(
    payload: ChatMessageRequest,
    user = Depends(get_current_user),
    service: ChatService = Depends(get_chat_service)
):
    try:
        reply = await service.chat_with_assistant(str(user.id), payload.message, payload.history)
        return {"reply": reply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history", response_model=List[dict])
async def get_history(
    user = Depends(get_current_user),
    service: ChatService = Depends(get_chat_service)
):
    try:
        return await service.get_chat_history(str(user.id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
