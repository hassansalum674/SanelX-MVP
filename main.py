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
import hmac
import hashlib
import json
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timedelta, timezone

# Initialize Firebase Admin
# In production (Cloud Run), it will use the service account automatically
try:
    firebase_admin.initialize_app()
except ValueError:
    # Already initialized
    pass

db = firestore.client()

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

# --- Gumroad Webhook Integration ---

@app.post("/api/gumroad/webhook")
async def gumroad_webhook(request: Request):
    """
    Receives Gumroad sale notifications and unlocks premium status for users.
    """
    # 1. Get raw body for signature verification
    payload_body = await request.body()
    
    # 2. Verify Signature
    # Gumroad sends the signature in the 'x-gumroad-signature' header
    signature = request.headers.get('x-gumroad-signature')
    secret = os.getenv("GUMROAD_WEBHOOK_SECRET")
    
    if secret and signature:
        expected_sig = hmac.new(
            key=secret.encode('utf-8'),
            msg=payload_body,
            digestmod=hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(expected_sig, signature):
            raise HTTPException(status_code=403, detail="Invalid signature")

    # 3. Parse Data
    try:
        data = await request.json()
    except Exception:
        # Gumroad sometimes sends form-encoded data depending on version
        # But usually it's JSON for webhooks. 
        # For simplicity in this MVP, we assume JSON as per standard FastAPI usage.
        form_data = await request.form()
        data = dict(form_data)

    event = data.get('event')
    user_id = data.get('user_id') or data.get('custom_fields', {}).get('user_id')
    email = data.get('email') or data.get('buyer_email')
    product_name = data.get('product_name')
    sale_id = data.get('sale_id')
    seller_id = data.get('seller_id')
    
    # Optional: Log for debugging
    print(f"Gumroad Webhook: {event} for {email} (UID: {user_id}, Seller: {seller_id})")

    # 4. Filter for successful sales and specific product
    if event in ['sale', 'ping']:
        # --- SECURITY CHECK: Seller ID ---
        # If Secret is missing, fallback to verifying the Seller ID
        expected_seller_id = os.getenv("GUMROAD_SELLER_ID")
        if expected_seller_id and seller_id != expected_seller_id:
            print(f"Unauthorized Gumroad request: Seller ID mismatch ({seller_id})")
            raise HTTPException(status_code=403, detail="Unauthorized Seller ID")

        # Validate Product Name
        if product_name != "Synex Premium Access" and event != 'ping':
            print(f"Ignoring sale for unexpected product: {product_name}")
            return {"status": "ignored_product", "product": product_name}

        if user_id or email:
            try:
                # 1. Try updating by User ID (most reliable)
                if user_id:
                    user_ref = db.collection('users').document(user_id)
                    
                    # --- IDEMPOTENCY CHECK ---
                    doc = user_ref.get()
                    if doc.exists():
                        user_data = doc.to_dict()
                        if user_data.get('last_sale_id') == sale_id:
                            return {"status": "success", "message": "Already processed."}
                    
                    # Calculate Monthly Expiry (30 days from now)
                    now = datetime.now(timezone.utc)
                    expiry = now + timedelta(days=30)

                    user_ref.update({
                        "premium": True,
                        "plan": "premium",
                        "premiumSince": now,
                        "premiumUntil": expiry,
                        "last_sale_id": sale_id,
                        "gumroad_ip": request.client.host
                    })
                    return {"status": "success", "message": f"User ID {user_id} upgraded."}
                
                # 2. Fallback to Email search
                elif email:
                    users_ref = db.collection('users')
                    query = users_ref.where('email', '==', email).limit(1).get()
                    
                    if query:
                        user_doc = query[0]
                        
                        # IDEMPOTENCY CHECK for fallback
                        if user_doc.to_dict().get('last_sale_id') == sale_id:
                            return {"status": "success", "message": "Already processed."}

                        # Calculate Monthly Expiry
                        now = datetime.now(timezone.utc)
                        expiry = now + timedelta(days=30)

                        user_doc.reference.update({
                            "premium": True,
                            "plan": "premium",
                            "premiumSince": now,
                            "premiumUntil": expiry,
                            "last_sale_id": sale_id
                        })
                        return {"status": "success", "message": f"User {email} upgraded via fallback."}
                    else:
                        print(f"Webhook error: User {email} not found.")
                        return {"status": "pending_user_creation", "email": email}
                    
            except Exception as e:
                print(f"Database error during webhook: {str(e)}")
                raise HTTPException(status_code=500, detail="Database update failed")
    
    return {"status": "ignored", "event": event}

@app.get("/api/user/status/{user_id_or_email}")
async def get_user_status(user_id_or_email: str):
    """
    Checks if a user has premium status.
    Accepts either Firebase UID or Email.
    """
    try:
        # 1. Try by UID first
        user_ref = db.collection('users').document(user_id_or_email)
        doc = user_ref.get()
        
        if doc.exists():
            user_data = doc.to_dict()
            return {
                "uid": doc.id,
                "email": user_data.get("email"),
                "premium": user_data.get("premium", False),
                "plan": user_data.get("plan", "free"),
                "premiumUntil": user_data.get("premiumUntil").isoformat() if user_data.get("premiumUntil") else None
            }
        
        # 2. Try by Email
        users_ref = db.collection('users')
        query = users_ref.where('email', '==', user_id_or_email).limit(1).get()
        
        if query:
            user_doc = query[0]
            user_data = user_doc.to_dict()
            return {
                "uid": user_doc.id,
                "email": user_data.get("email"),
                "premium": user_data.get("premium", False),
                "plan": user_data.get("plan", "free"),
                "premiumUntil": user_data.get("premiumUntil").isoformat() if user_data.get("premiumUntil") else None
            }
            
        return {"error": "User not found", "premium": False}
        
    except Exception as e:
        print(f"Error checking user status: {str(e)}")
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
