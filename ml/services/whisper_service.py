import io
import logging
import os
import re
import tempfile
import time

# ── Toggle: local Whisper vs Gemini API ──
USE_LOCAL_STT = os.getenv("USE_LOCAL_STT", "false").lower() == "true"

# ── Gemini client (new SDK, lazy init) ──
_gemini_client = None

def _get_gemini_client():
    global _gemini_client
    if _gemini_client is not None:
        return _gemini_client
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        # Try new google-genai SDK first
        from google import genai as _genai
        _gemini_client = _genai.Client(api_key=api_key)
        logging.info("[WHISPER] Using google-genai SDK")
    except ImportError:
        try:
            # Fall back to legacy google-generativeai
            import google.generativeai as _legacy
            _legacy.configure(api_key=api_key)
            _gemini_client = _legacy
            logging.info("[WHISPER] Using legacy google-generativeai SDK")
        except ImportError:
            logging.warning("[WHISPER] No Gemini SDK found — voice transcription via Gemini disabled")
    return _gemini_client

# ── Local Whisper model (lazy singleton) ──
_whisper_model = None


def get_whisper_model():
    """Load the local Whisper model once on first call."""
    global _whisper_model
    if _whisper_model is None:
        import whisper

        logging.info("[WHISPER LOCAL] Loading model...")
        _whisper_model = whisper.load_model("base")
        logging.info("[WHISPER LOCAL] Model loaded ✅")
    return _whisper_model


async def _transcribe_local(audio_bytes: bytes, topic: str = "") -> dict:
    """Transcribe audio using local Whisper model. Auto-detects language."""
    start = time.time()

    try:
        # Whisper needs a file path, not raw bytes
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        model = get_whisper_model()

        # language=None lets Whisper auto-detect the spoken language
        result = model.transcribe(
            tmp_path,
            language=None,
            initial_prompt=f"Formal debate about: {topic}" if topic else None,
            fp16=False,  # Set True if you have a GPU
        )

        os.unlink(tmp_path)
        text = result["text"].strip()
        detected_lang = result.get("language", "en")  # e.g. 'hi', 'fr', 'en'

        # Remove filler words
        text = re.sub(
            r"^(um+,?\s*|uh+,?\s*|like,?\s*|you know,?\s*)+",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()

        elapsed = round((time.time() - start) * 1000)
        words = len(text.split())
        logging.info(f"[WHISPER LOCAL] {words} words in {elapsed}ms | lang={detected_lang}")

        return {
            "text": text,
            "language": detected_lang,
            "duration_ms": elapsed,
            "word_count": words,
            "success": True,
        }

    except Exception as e:
        logging.error(f"[WHISPER LOCAL] Error: {e}")
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        return {
            "text": "",
            "language": "en",
            "duration_ms": 0,
            "word_count": 0,
            "success": False,
            "error": str(e),
        }


async def _transcribe_gemini(audio_bytes: bytes, topic: str = "") -> dict:
    """Transcribe using Google Gemini API with language detection."""
    start = time.time()

    client = _get_gemini_client()
    if not client:
        return {
            "text": "", "language": "en", "duration_ms": 0,
            "word_count": 0, "success": False,
            "error": "Gemini SDK not available",
        }

    try:
        prompt = (
            f"Transcribe this audio. Context: This is a formal debate argument about: {topic}. "
            "Also detect the spoken language. "
            "Respond in this exact format:\n"
            "LANG: <iso-639-1 code>\n"
            "TEXT: <transcribed text>"
            if topic
            else "Transcribe this audio. Also detect the spoken language. "
                 "Respond in this exact format:\n"
                 "LANG: <iso-639-1 code>\n"
                 "TEXT: <transcribed text>"
        )

        # Support both new google-genai and legacy google-generativeai
        if hasattr(client, 'aio'):  # new SDK
            from google.genai import types as _gtypes
            response = await client.aio.models.generate_content(
                model="gemini-2.0-flash",
                contents=[
                    _gtypes.Part.from_bytes(data=audio_bytes, mime_type="audio/webm"),
                    prompt,
                ],
            )
            raw_text = response.text.strip()
        else:  # legacy SDK
            model_obj = client.GenerativeModel("gemini-1.5-flash")
            audio_part = {"mime_type": "audio/webm", "data": audio_bytes}
            response = await model_obj.generate_content_async([prompt, audio_part])
            raw_text = response.text.strip()


        # Parse LANG: and TEXT: from response
        detected_lang = "en"
        text = raw_text
        if "LANG:" in raw_text and "TEXT:" in raw_text:
            import re as _re
            lang_match = _re.search(r'LANG:\s*(\w{2,3})', raw_text)
            text_match = _re.search(r'TEXT:\s*(.+)', raw_text, _re.DOTALL)
            if lang_match:
                detected_lang = lang_match.group(1).lower()
            if text_match:
                text = text_match.group(1).strip()

        # Clean filler words
        text = re.sub(
            r"^(um+,?\s*|uh+,?\s*|like,?\s*|you know,?\s*)+",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()

        elapsed = round((time.time() - start) * 1000)
        words = len(text.split())
        logging.info(f"[GEMINI-TRANSCRIPTION] {words} words transcribed in {elapsed}ms | lang={detected_lang}")

        return {
            "text": text,
            "language": detected_lang,
            "duration_ms": elapsed,
            "word_count": words,
            "success": True,
        }

    except Exception as e:
        logging.error(f"[GEMINI-TRANSCRIPTION] Error: {e}")
        return {
            "text": "",
            "language": "en",
            "duration_ms": 0,
            "word_count": 0,
            "success": False,
            "error": str(e),
        }


async def transcribe_audio(audio_bytes: bytes, topic: str = "") -> dict:
    """
    Transcribe user's spoken debate argument.
    Uses local Whisper when USE_LOCAL_STT=true, otherwise Gemini API.
    """
    if len(audio_bytes) < 1000:
        return {
            "text": "",
            "duration_ms": 0,
            "word_count": 0,
            "success": False,
            "error": "Audio too short",
        }

    if USE_LOCAL_STT:
        return await _transcribe_local(audio_bytes, topic)
    else:
        return await _transcribe_gemini(audio_bytes, topic)
