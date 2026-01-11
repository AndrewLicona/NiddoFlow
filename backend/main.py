import time
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
from app.routers import family as family_router
from app.routers import account as account_router
from app.routers import transaction as transaction_router
from app.routers import category as category_router
from app.routers import budget as budget_router
from app.routers import debt as debt_router

app = FastAPI(title="NiddoFlow API")

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    # Log the time taken for each request
    logger.info(f"Path: {request.url.path} | Time: {process_time:.4f}s")
    response.headers["X-Process-Time"] = str(process_time)
    return response

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
