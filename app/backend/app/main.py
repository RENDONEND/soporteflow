from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import applications, auth, clients, contracts, hour_bank, plans, users
from app.core.config import settings

app = FastAPI(title="SoporteFlow API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "SoporteFlow API"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(clients.router)
app.include_router(applications.router)
app.include_router(contracts.router)
app.include_router(plans.router)
app.include_router(hour_bank.router)
