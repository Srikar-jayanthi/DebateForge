import os
import numpy as np
import logging

_genai_client = None

def _get_client():
    global _genai_client
    if _genai_client is not None:
        return _genai_client
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
        
    try:
        from google import genai
        _genai_client = genai.Client(api_key=api_key)
        return _genai_client
    except ImportError:
        return None

async def get_embedding(text: str):
    """Get embedding vector from Gemini API."""
    client = _get_client()
    if not client:
        # Return zero vector if API not available (fallback)
        return np.zeros(768).tolist()
        
    try:
        # Use models/embedding-001 (dimension 768)
        response = client.models.embed_content(
            model="models/embedding-001",
            contents=text
        )
        return response.embeddings[0].values
    except Exception as e:
        logging.error(f"[EMBEDDING] Gemini API failed: {e}")
        return np.zeros(768).tolist()

async def get_embeddings(texts: list):
    """Batch get embeddings."""
    client = _get_client()
    if not client:
        return [np.zeros(768).tolist() for _ in texts]
        
    try:
        response = client.models.embed_content(
            model="models/embedding-001",
            contents=texts
        )
        return [e.values for e in response.embeddings]
    except Exception as e:
        logging.error(f"[EMBEDDING] Gemini API batch failed: {e}")
        return [np.zeros(768).tolist() for _ in texts]
