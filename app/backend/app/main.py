from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import clients, contracts, plans

app = FastAPI(title="SoporteFlow API")

app.add_middleware(

    CORSMiddleware,
    allow_origins=["*"],
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

app.include_router(clients.router)
app.include_router(contracts.router)
app.include_router(plans.router)
