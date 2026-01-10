from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import family as family_router
from app.routers import account as account_router
from app.routers import transaction as transaction_router
from app.routers import category as category_router
from app.routers import budget as budget_router
from app.routers import debt as debt_router

app = FastAPI(title="NiddoFlow API")

# Configure CORS
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.100.17:3000",
    "https://niddoflow.andrewlamaquina.my"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(family_router.router)
app.include_router(account_router.router)
app.include_router(transaction_router.router)
app.include_router(category_router.router)
app.include_router(budget_router.router)
app.include_router(debt_router.router)

@app.get("/")
def read_root():
    return {"message": "NiddoFlow Backend is running!"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
