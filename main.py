import os
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv

from engine.core import run_synex_simulation
import json
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timedelta, timezone

# Initialize Firebase Admin
# Logic: Try loading from ENV variable (Option A), then file, then default credentials
try:
    firebase_json = os.getenv("FIREBASE_CONFIG_JSON")
    if firebase_json:
        # Load from Environment Variable (Best for Render)
        cred_dict = json.loads(firebase_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
        print("DEBUG: Firebase initialized via FIREBASE_CONFIG_JSON env variable.")
    elif os.path.exists("firebase-service-account.json"):
        # Load from local file
        cred = credentials.Certificate("firebase-service-account.json")
        firebase_admin.initialize_app(cred)
        print("DEBUG: Firebase initialized via local JSON file.")
    else:
        # Fallback to Application Default Credentials (Cloud Run)
        firebase_admin.initialize_app()
        print("DEBUG: Firebase initialized with default credentials.")
except ValueError:
    # Already initialized
    pass
except Exception as e:
    print(f"CRITICAL: Failed to initialize Firebase: {str(e)}")

db = firestore.client()

# Load environment variables
load_dotenv()

app = FastAPI(
    title="Synex Energy Intelligence API",
    description="Professional energy simulation engine for residential and commercial solar systems.",
    version="1.1.0"
)

# CORS Configuration
env_origins = os.getenv("ALLOWED_ORIGINS", "https://synex.sanelx.com,https://synex-frontend.onrender.com,http://localhost:8080,http://127.0.0.1:8080,http://localhost:8000")
origins = [o.strip() for o in env_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*", "OPTIONS"],
    allow_headers=["*"],
)

# --- Global Error Handling ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Ensures that any internal server errors return a clean JSON response 
    without leaking internal stack traces in production.
    """
    is_debug = os.getenv("ENV", "development") == "development"
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": str(exc) if is_debug else "An unexpected error occurred. Please contact support.",
            "type": exc.__class__.__name__
        }
    )

# --- Request Models ---
class CostParams(BaseModel):
    model_config = ConfigDict(extra='ignore')
    solar_cost_kw: float
    battery_cost_kwh: float
    install_fee: float
    maint_pct: float

class UserSettings(BaseModel):
    model_config = ConfigDict(extra='ignore')
    currency: Optional[str] = "USD"
    theme: Optional[str] = "dark"
    solar_cost_preset: Optional[float] = None
    battery_cost_preset: Optional[float] = None

class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra='ignore')
    solar_kw: float
    battery_kwh: float
    initial_battery_kwh: float
    grid_price: float
    weather_scenario: Optional[str] = "average"
    cost_params: Optional[CostParams] = None
    hourly_demand: List[float]
    hourly_solar_profile: List[float]
    # NEW: Hardware Interoperability
    battery_model: Optional[str] = "generic_lifepo4"
    inverter_model: Optional[str] = "generic"

# --- Endpoints ---

@app.get("/health")
async def health():
    """Cloud Run uptime monitoring endpoint."""
    return {"status": "ok", "service": "synex-api", "env": os.getenv("ENV", "development")}

@app.post("/analyze")
async def analyze(request: AnalyzeRequest):
    """
    Primary simulation endpoint. 
    Processes energy metrics and returns a complete intelligence report.
    """
    try:
        # Convert Pydantic model to dict for simulation engine
        input_dict = request.model_dump()
        results = run_synex_simulation(input_dict)
        return results
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=f"Validation Error: {str(ve)}")
    except Exception as e:
        # Caught by global handler but providing specific HTTP exception here for clarity
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/user/settings/{user_id}")
async def get_settings(user_id: str):
    """Fetches user preferences from Firestore."""
    try:
        user_ref = db.collection('users').document(user_id)
        doc = user_ref.get()
        if doc.exists():
            data = doc.to_dict()
            return data.get('settings', {"currency": "USD", "theme": "dark"})
        return {"currency": "USD", "theme": "dark"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/user/settings/{user_id}")
async def save_settings(user_id: str, settings: UserSettings):
    """Saves user preferences to Firestore."""
    try:
        user_ref = db.collection('users').document(user_id)
        user_ref.set({"settings": settings.model_dump()}, merge=True)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

## Analytics unlock endpoint removed — no more premium gating

@app.get("/api/user/status/{user_id_or_email}")
async def get_user_status(user_id_or_email: str):
    """
    Checks if a user has premium status.
    Accepts either Firebase UID or Email.
    """
    print(f"DEBUG: Checking status for: {user_id_or_email}")
    try:
        # 1. Try by UID first
        user_ref = db.collection('users').document(user_id_or_email)
        doc = user_ref.get()
        
        if doc.exists():
            user_data = doc.to_dict()
            print(f"DEBUG: Found user by UID: {user_id_or_email}. Premium: {user_data.get('premium')}")
            return {
                "uid": doc.id,
                "email": user_data.get("email"),
                "premium": user_data.get("premium", False),
                "plan": user_data.get("plan", "free"),
                "premiumUntil": user_data.get("premiumUntil").isoformat() if user_data.get("premiumUntil") else None
            }
        
        # 2. Try by Email
        print(f"DEBUG: UID {user_id_or_email} not found, trying email lookup...")
        users_ref = db.collection('users')
        query = users_ref.where('email', '==', user_id_or_email.lower()).limit(1).get()
        
        if query:
            user_doc = query[0]
            user_data = user_doc.to_dict()
            print(f"DEBUG: Found user by Email: {user_id_or_email}. Premium: {user_data.get('premium')}")
            return {
                "uid": user_doc.id,
                "email": user_data.get("email"),
                "premium": user_data.get("premium", False),
                "plan": user_data.get("plan", "free"),
                "premiumUntil": user_data.get("premiumUntil").isoformat() if user_data.get("premiumUntil") else None
            }
            
        print(f"DEBUG: User {user_id_or_email} not found in database.")
        return {"error": "User not found", "premium": False}
        
    except Exception as e:
        print(f"DEBUG: Error checking user status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch user status")

# --- Local Static Serving ---
# For convenient local preview and handling of /dashboard redirects.
if os.path.exists("index.html"):
    @app.get("/")
    @app.get("/dashboard")
    async def serve_index(request: Request):
        from fastapi.responses import FileResponse
        return FileResponse("index.html")

    app.mount("/", StaticFiles(directory="./", html=True), name="static")

if __name__ == "__main__":
    # Cloud Run populates the PORT environment variable automatically
    port = int(os.getenv("PORT", 8080))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"Starting Synex FastAPI Backend in {os.getenv('ENV', 'development')} mode on {host}:{port}")
    uvicorn.run("main:app", host=host, port=port, reload=(os.getenv("ENV") != "production"))
