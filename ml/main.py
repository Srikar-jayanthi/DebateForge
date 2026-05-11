import os
import asyncio
from dotenv import load_dotenv
load_dotenv()
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

print("--- ML SERVICE INITIALIZING (LIGHTWEIGHT MODE) ---")

from models.store import model_store

# Routers
from routers.fallacy import router as fallacy_router
from routers.scorer import router as scorer_router
from routers.memory import router as memory_router
from routers.transcription import router as transcription_router

app = FastAPI(title="DebateForge ML Service", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_URL", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global flag to track if initialization is done
initialization_complete = False

async def background_initialization():
    global initialization_complete
    print("Starting background initialization task...")
    
    # Initialize NLTK (downloads data if missing)
    try:
        from routers.scorer import initialize_nltk
        initialize_nltk()
        print("NLTK data check complete")
    except Exception as e:
        print(f"Error initializing NLTK: {e}")

    # Note: Sentence Transformer is now handled by Gemini API (0 RAM usage)
    
    initialization_complete = True
    print("--- ALL SYSTEMS READY (GEMINI CLOUD EMBEDDINGS ACTIVE) ---")

@app.on_event("startup")
async def startup_event() -> None:
    asyncio.create_task(background_initialization())
    
    # Load lightweight local model paths
    base_dir = Path(__file__).parent
    for model_name in ["logic", "evidence", "clarity"]:
        path = base_dir / "models" / f"{model_name}_model.json"
        if path.exists():
            setattr(model_store, f"{model_name}_model", str(path))
    
    print("FastAPI server listening! (Initialization in background)")

app.include_router(fallacy_router, prefix="/fallacy")
app.include_router(scorer_router, prefix="/scorer")
app.include_router(memory_router, prefix="/memory")
app.include_router(transcription_router, prefix="/transcription")

@app.get("/health")
async def health():
    return {
        "status": "ok" if initialization_complete else "initializing",
        "models_ready": initialization_complete,
        "mode": "lightweight_gemini",
        "version": "1.1.0"
    }

@app.get("/")
async def root():
    return {
        "service": "DebateForge ML",
        "status": "online",
        "mode": "gemini_cloud_ai",
        "endpoints": ["/health", "/fallacy", "/scorer", "/memory", "/transcription"]
    }
