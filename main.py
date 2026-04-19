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

# Load environment variables
load_dotenv()

app = FastAPI(
    title="Synex Energy Intelligence API",
    description="Professional energy simulation engine for residential and commercial solar systems.",
    version="1.1.0"
)

# CORS Configuration
# Standardizing on ALLOWED_ORIGINS as per Cloud Run deployment requirements
env_origins = os.getenv("ALLOWED_ORIGINS", os.getenv("CORS_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080,http://localhost:8000"))
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

# --- Local Static Serving ---
# For convenient local preview. In production, Cloud Run usually serves the API only.
if os.path.exists("index.html"):
    app.mount("/static", StaticFiles(directory="./", html=True), name="static")

if __name__ == "__main__":
    # Cloud Run populates the PORT environment variable automatically
    port = int(os.getenv("PORT", 8080))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"Starting Synex FastAPI Backend in {os.getenv('ENV', 'development')} mode on {host}:{port}")
    uvicorn.run("main:app", host=host, port=port, reload=(os.getenv("ENV") != "production"))
