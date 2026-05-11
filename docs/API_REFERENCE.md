# DebateForge API Reference

DebateForge uses a three-tier microservices architecture. This document outlines the core API contracts for the Backend (Node.js) and ML Service (FastAPI).

## 1. Backend Service (Port 5001)

### Authentication
- **POST /api/auth/register**: Register a new user.
- **POST /api/auth/login**: Login and receive a JWT.
- **GET /api/auth/verify**: Verify the current session token.

### Debate Management
- **GET /api/debates/topics**: List available debate topics.
- **POST /api/debates/start**: Initialize a new debate session.
- **GET /api/debates/history**: Retrieve the user's debate history.
- **GET /api/debates/:id**: Get details for a specific debate.

### User Profile
- **GET /api/profile/me**: Get current user stats, ELO, and achievements.
- **GET /api/profile/fallacies**: Get the user's fallacy DNA profile.
- **GET /api/profile/leaderboard**: Get global rankings.

### WebSocket (Real-time Debate)
- **Event: join_debate**: Connect to a debate room.
- **Event: audio_chunk**: Stream audio for transcription.
- **Event: transcript_final**: Send text argument directly.
- **Event: ai_thinking**: AI is generating a rebuttal.
- **Event: ai_text_chunk**: Streamed AI response text.
- **Event: judge_verdict**: Debate ended; final report card delivered.

---

## 2. ML Microservice (Port 8001)

### Fallacy Detection
- **POST /fallacy/detect**
  - **Input**: `{ "argument": string, "context": string[] }`
  - **Output**: `{ "detected": boolean, "fallacy_type": string, "explanation": string }`

### Argument Scoring
- **POST /scorer/score**
  - **Input**: `{ "argument": string, "topic": string }`
  - **Output**: `{ "logic": int, "evidence": int, "clarity": int, "overall": int }`
  - **Advanced NLP**: Uses NLTK for Lexical Diversity and SpaCy for Named Entity Density.

### Vector Memory
- **POST /memory/store**: Embed and store an argument in FAISS.
- **GET /memory/weaknesses/:user_id**: Analyze past arguments to find user-specific weaknesses.
- **GET /memory/coaching-plan/:user_id**: Generate a targeted coaching scenario.

### Transcription
- **POST /transcription/transcribe**
  - **Input**: Multi-part audio file.
  - **Output**: `{ "text": string, "language": string }`
  - **Engine**: Local Whisper (Base model) or Gemini API fallback.
