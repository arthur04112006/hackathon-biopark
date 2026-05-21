from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, protocols, import_data, scraping, reports, ask

app = FastAPI(title="Biopark - Protocolos", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Em produção, trocar pelo domínio Vercel
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(protocols.router)
app.include_router(import_data.router)
app.include_router(scraping.router)
app.include_router(reports.router)
app.include_router(ask.router)


@app.get("/health")
def health():
    return {"status": "ok"}
