# Synex Backend: Cloud Run Deployment

This guide provides instructions for deploying the Synex FastAPI backend to Google Cloud Run.

## 1. Prerequisites
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and configured.
- A Google Cloud Project with Billing and Cloud Run API enabled.

## 2. Environment Configuration
The backend relies on the following environment variables:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `ENV` | Environment mode (`development` or `production`). | `production` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins. | `https://synex.sanelx.com` |
| `PORT` | The port the server listens on (Cloud Run sets this automatically). | `8080` |

### Manual Configuration in Cloud Run Console:
After deployment, ensure these are set in the **Edit & Deploy New Revision** -> **Variables & Secrets** section of your Cloud Run service.

---

## 3. Local Testing
To test the production-ready container logic locally:

### Option A: Direct Python (Recommended with Venv)
Modern Linux (Ubuntu 23.04+) restricts system-wide `pip` installs. Always use a Virtual Environment:

1. **Install Venv Package** (if missing):
   `sudo apt install python3-venv`
2. **Create and Activate Venv**:
   `python3 -m venv venv`
   `source venv/bin/activate`
3. **Install Dependencies**:
   `pip install -r requirements.txt`
4. **Run Server**:
   `python3 main.py`

*Note: If you don't want to activate the venv, run directly:*
`./venv/bin/python3 main.py`

### Option B: Docker
```bash
docker build -t synex-backend .
docker run -p 8080:8080 -e ALLOWED_ORIGINS="http://localhost:8080" synex-backend
```

---

## 4. Cloud Run Deployment
Run the following command from the project root:

```bash
gcloud run deploy synex-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="ENV=production,ALLOWED_ORIGINS=https://synex.sanelx.com"
```

### Post-Deployment Checklist:
1. Copy the **Service URL** provided by the command above (e.g., `https://synex-backend-xyz.a.run.app`).
2. Update your frontend `config.js` to point `API_URL` to this address.
3. Whitelist your custom frontend domain (if different) in the `ALLOWED_ORIGINS` environment variable.

---

## 5. Development Notes
- **Entrypoint**: `main.py` (FastAPI `app` object).
- **Server**: `uvicorn` with `uvloop` (via `uvicorn[standard]`).
- **Health Check**: `GET /health` is used for container health verification.
