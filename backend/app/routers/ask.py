from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.routers.deps import get_current_user
from app.services.ai_assistant import ask_question

router = APIRouter(prefix="/ask", tags=["ask"])


class AskRequest(BaseModel):
    question: str


@router.post("/")
def ask(body: AskRequest, _: str = Depends(get_current_user)):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Pergunta não pode estar vazia")
    return ask_question(body.question.strip())
