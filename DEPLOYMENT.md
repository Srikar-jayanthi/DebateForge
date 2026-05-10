# 🚀 DebateForge Production Deployment Guide

This guide outlines the professional deployment workflow for the DebateForge platform.

## 🏗️ Architecture Overview
- **Frontend**: Vite/React (Single Page Application)
- **Backend**: Node.js/Express (API & WebSocket Server)
- **ML Layer**: Python/Flask (Whisper STT & ML Analysis)
- **Database**: MongoDB (Persistence)
- **Cache**: Redis (Real-time state & session management)

---

## 1. Environment Configuration

Create a `.env.production` file in the `backend/` directory with the following variables:

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_32_character_random_secret
REDIS_URL=your_redis_connection_string
FRONTEND_URL=https://your-domain.com
OLLAMA_URL=http://your-ml-server:11434
OLLAMA_MODEL=llama3
```

---

## 2. Backend Deployment (Node.js)

### Hardware Requirements
- **CPU**: 2+ Cores recommended for high-concurrency WebSockets.
- **RAM**: 2GB+ recommended.

### Steps
1.  **Install Dependencies**: `npm install --production`
2.  **Process Management**: Use `PM2` to ensure the server stays alive and utilizes all CPU cores.
    ```bash
    npm install -g pm2
    pm2 start server.js --name "debate-forge-api" -i max
    ```
3.  **Reverse Proxy**: Use Nginx or Caddy to handle SSL (HTTPS) and proxy requests to `localhost:5000`.

---

## 3. Frontend Deployment (Static Hosting)

### Build Process
1.  Navigate to `frontend/`
2.  Run `npm run build`
3.  The resulting `dist/` folder contains optimized, minified static assets.

### Hosting Options
- **Vercel / Netlify**: Simply link the `frontend` directory and set the build command to `npm run build` and output directory to `dist`.
- **Nginx**: Serve the `dist/` folder as a static site.

---

## 4. ML Services Deployment (Python)

The ML services require high-performance GPU or high-threaded CPU for Whisper.

### Steps
1.  Navigate to `ml/`
2.  Install dependencies: `pip install -r requirements.txt`
3.  Run using a production WSGI server like `Gunicorn`:
    ```bash
    gunicorn --workers 4 --bind 0.0.0.0:8000 main:app
    ```

---

## 5. Deployment Checklist
- [ ] **SSL (HTTPS)**: Ensure all endpoints are served over HTTPS.
- [ ] **Database Backup**: Set up automated daily backups in MongoDB Atlas.
- [ ] **Monitoring**: Set up UptimeRobot or Sentry for error tracking.
- [ ] **CORS**: Verify `FRONTEND_URL` in backend exactly matches your production domain.
- [ ] **Rate Limiting**: Verify you haven't whitelisted your own IP by mistake.

---

## 📊 Maintenance Plan
- **Weekly**: Review `security-logger.service` logs for suspicious activity.
- **Monthly**: Update `npm` dependencies for security patches.
- **On Demand**: Scale ML workers if STT latency exceeds 3 seconds.

---

*“Refining the art of discourse, one byte at a time.”*
