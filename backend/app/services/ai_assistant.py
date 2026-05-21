import json
from openai import OpenAI, RateLimitError, AuthenticationError
from fastapi import HTTPException
from app.config import settings
from app.supabase_client import get_supabase

client = OpenAI(api_key=settings.openai_api_key)

SYSTEM_PROMPT = """Você é um assistente especializado em análise de protocolos da Biopark.
Recebe dados de protocolos e responde perguntas sobre eles em português de forma clara e objetiva.

Campos disponíveis em cada protocolo:
- status: EM ANDAMENTO | PENDENTE | APROVADO | CANCELADO | REPROVADO
- projeto: nome do projeto
- protocolo: número/código
- atividade: descrição da atividade
- orgao_site_consultado: órgão ou site consultado
- atribuido_a: responsável (pode ser null)
- data_abertura / data_finalizacao: datas
- situacao: situação atual detalhada
- ativo: true/false

Regras:
- Seja direto e conciso
- Para listas longas, apresente os mais relevantes e informe o total
- Se não houver dados relevantes, diga claramente
- Use formatação simples (sem markdown excessivo)"""


def ask_question(question: str) -> dict:
    supabase = get_supabase()
    result = supabase.table("protocols").select("*").execute()
    protocols = result.data or []

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Dados dos protocolos ({len(protocols)} registros):\n"
                        f"{json.dumps(protocols[:300], default=str, ensure_ascii=False)}\n\n"
                        f"Pergunta: {question}"
                    ),
                },
            ],
            temperature=0.2,
            max_tokens=700,
        )
        return {
            "answer": response.choices[0].message.content.strip(),
            "total_protocolos": len(protocols),
        }
    except RateLimitError:
        raise HTTPException(status_code=402, detail="Cota da API OpenAI esgotada. Verifique o plano e billing em platform.openai.com.")
    except AuthenticationError:
        raise HTTPException(status_code=401, detail="Chave da API OpenAI inválida.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao consultar IA: {str(e)}")
