# Synex Deployment Guide

This document explains how to prepare and host the Synex Energy Intelligence application in a production environment.

## Architecture
- **Frontend**: Standard HTML/JS/CSS (Static). Can be hosted on Netlify, Vercel, Nginx, or GitHub Pages.
- **Backend**: FastAPI (Python). Requires a Python runtime and should be served using `uvicorn` behind a reverse proxy (like Nginx).

---

## 1. Backend Setup (API)

### Environment Variables
Copy `.env.example` to `.env` and configure:
- `PORT`: The port your API should listen on (default 8000).
- `HOST`: Set to `0.0.0.0` for production.
- `CORS_ORIGINS`: **CRITICAL**. Comma-separated list of domains allowed to access this API. Include your final frontend domain (e.g., `https://synex.sanelx.com`).

### Installation
```bash
pip install -r requirements.txt
```

### Running in Production
Use `uvicorn` to run the application:
```bash
uvicorn api:app --host 0.0.0.0 --port 8000
```

---

## 2. Frontend Setup

### Configuration
The frontend uses a `config.js` file to find the API.
1. Copy `config.example.js` to `config.js`.
2. Edit `API_URL` to point to your **deployed** backend address (e.g., `https://api.synex.sanelx.com/analyze`).

### Deployment
Simply upload all static files in the root directory (excluding Python files and `.env`) to your static host.
**Required Files**:
- `index.html`
- `style.css`
- `script.js`
- `config.js`
- `profiles/` (entire directory)
- `utils/` (entire directory)

---

## 3. Local Development
1. Start the backend: `python3 api.py`
2. Open `index.html` in your browser (or serve it using a local live server).
3. Ensure `config.js` points to `http://localhost:8000/analyze`.

---

## 4. CORS Troubleshooting
If you see "CORS Error" in the browser console:
1. Check that the `CORS_ORIGINS` in the backend `.env` perfectly matches the URL appearing in your browser address bar (including `https://` and no trailing slash).
2. Restart the backend after changing `.env`.
