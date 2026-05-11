import os
from dotenv import load_dotenv
load_dotenv()
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models.store import model_store

from routers.fallacy import router as fallacy_router
from routers.scorer import router as scorer_router
from routers.memory import router as memory_router
from routers.transcription import router as transcription_router

try:
    from sentence_transformers import SentenceTransformer
except ImportError:  # pragma: no cover - optional at runtime
    SentenceTransformer = None

app = FastAPI(title="DebateForge ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_URL", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


import asyncio

# Global flag to track if initialization is done
initialization_complete = False

async def background_initialization():
    global initialization_complete
    print("Starting background initialization...")
    
    # 1. Initialize NLTK (downloads data if missing)
    try:
        from routers.scorer import initialize_nltk
        initialize_nltk()
        print("NLTK data ready")
    except Exception as e:
        print(f"Error initializing NLTK: {e}")

    # 2. Load sentence transformer
    if SentenceTransformer is not None and model_store.sentence_model is None:
        try:
            model_store.sentence_model = SentenceTransformer("all-MiniLM-L6-v2")
            print("Sentence transformer loaded")
        except Exception as e:
            print(f"Error loading sentence transformer: {e}")

    # 3. Pre-load local models if toggles are enabled
    if os.getenv("USE_LOCAL_STT", "false").lower() == "true":
        try:
            from services.whisper_service import get_whisper_model
            get_whisper_model()
        except Exception as e:
            print(f"Local Whisper not loaded: {e}")

    if os.getenv("USE_LOCAL_TTS", "false").lower() == "true":
        try:
            from services.tts_service import get_tts_model
            get_tts_model()
        except Exception as e:
            print(f"Local TTS not loaded: {e}")

    initialization_complete = True
    print("All background models ready")

@app.on_event("startup")
async def startup_event() -> None:
    # Run heavy initialization in the background
    asyncio.create_task(background_initialization())
    
    # Still load lightweight local model paths synchronously
    base_dir = Path(__file__).parent
    logic_path = base_dir / "models" / "logic_model.json"
    evidence_path = base_dir / "models" / "evidence_model.json"
    clarity_path = base_dir / "models" / "clarity_model.json"

    if logic_path.exists():
        model_store.logic_model = str(logic_path)
    if evidence_path.exists():
        model_store.evidence_model = str(evidence_path)
    if clarity_path.exists():
        model_store.clarity_model = str(clarity_path)
    
    print("FastAPI server starting up (models loading in background)")


app.include_router(fallacy_router, prefix="/fallacy")
app.include_router(scorer_router, prefix="/scorer")
app.include_router(memory_router, prefix="/memory")
app.include_router(transcription_router, prefix="/transcription")


@app.get("/health")
async def health():
    return {
        "status": "ok" if initialization_complete else "initializing",
        "models_ready": initialization_complete,
        "sentence_model": model_store.sentence_model is not None
    }

@app.get("/")
async def root():
    return {
        "service": "DebateForge ML",
        "endpoints": [
          "/health",
          "/fallacy",
          "/scorer",
          "/memory",
        ],
    }
