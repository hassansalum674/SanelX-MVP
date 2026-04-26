import os
import uvicorn
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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

# --- Email Helper ---
def send_premium_confirmation_email(user_email: str, user_id: str):
    """
    Sends a confirmation email to the user when they upgrade to premium.
    """
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    sender_email = os.getenv("SENDER_EMAIL", smtp_user)

    if not all([smtp_user, smtp_password]):
        print("DEBUG: SMTP credentials missing, skipping email.")
        return False

    try:
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = user_email
        msg['Subject'] = "Welcome to Synex Premium!"

        body = f"""
        Hello,

        Thank you for your purchase! Your Synex account has been upgraded to Premium.

        Account Details:
        - Email: {user_email}
        - User ID: {user_id}

        You can now access professional energy insights, seasonal forecasting, and ROI mapping.

        Login here: {os.getenv('FRONTEND_URL', 'https://synex.sanelx.com')}

        Best regards,
        The Synex Team
        """
        msg.attach(MIMEText(body, 'plain'))

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        
        print(f"DEBUG: Confirmation email sent to {user_email}")
        return True
    except Exception as e:
        print(f"DEBUG: Failed to send email: {str(e)}")
        return False

# --- Gumroad Webhook Integration ---

@app.post("/api/gumroad/webhook")
async def gumroad_webhook(request: Request):
    """
    Receives Gumroad sale notifications and unlocks premium status for users.
    """
    # 1. Get raw body for signature verification
    payload_body = await request.body()
    
    # 2. Verify Signature
    signature = request.headers.get('x-gumroad-signature')
    secret = os.getenv("GUMROAD_WEBHOOK_SECRET")
    
    if secret and signature:
        expected_sig = hmac.new(
            key=secret.encode('utf-8'),
            msg=payload_body,
            digestmod=hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(expected_sig, signature):
            print("DEBUG: Gumroad Webhook Invalid Signature")
            raise HTTPException(status_code=403, detail="Invalid signature")

    # 3. Parse Data
    try:
        # Try JSON first
        data = await request.json()
    except Exception:
        # Fallback to Form Data
        form_data = await request.form()
        data = dict(form_data)

    event = data.get('event')
    user_id = data.get('user_id') or data.get('custom_fields', {}).get('user_id')
    email = data.get('email') or data.get('buyer_email')
    product_name = data.get('product_name')
    sale_id = data.get('sale_id')
    seller_id = data.get('seller_id')
    
    print(f"DEBUG: Gumroad Webhook Received. Event: {event}, Email: {email}, UID: {user_id}, Seller: {seller_id}")

    # 4. Filter for successful sales and specific product
    if event in ['sale', 'ping']:
        # Security Check: Seller ID
        expected_seller_id = os.getenv("GUMROAD_SELLER_ID")
        if expected_seller_id and seller_id != expected_seller_id:
            print(f"DEBUG: Seller ID Mismatch. Got: {seller_id}, Expected: {expected_seller_id}")
            raise HTTPException(status_code=403, detail="Unauthorized Seller ID")

        # Validate Product Name
        if product_name != "Synex Premium Access" and event != 'ping':
            print(f"DEBUG: Ignoring product: {product_name}")
            return {"status": "ignored_product", "product": product_name}

        if user_id or email:
            try:
                # 1. Update by User ID
                if user_id:
                    user_ref = db.collection('users').document(user_id)
                    doc_snap = user_ref.get()
                    
                    if doc_snap.exists:
                        if doc_snap.to_dict().get('last_sale_id') == sale_id:
                            return {"status": "success", "message": "Already processed."}
                    
                    now = datetime.now(timezone.utc)
                    expiry = now + timedelta(days=30)

                    user_ref.set({
                        "premium": True,
                        "plan": "premium",
                        "premiumSince": now,
                        "premiumUntil": expiry,
                        "last_sale_id": sale_id,
                        "email": email or doc_snap.to_dict().get('email')
                    }, merge=True)
                    
                    if email:
                        send_premium_confirmation_email(email, user_id)
                    return {"status": "success", "message": f"User {user_id} upgraded."}
                
                # 2. Update by Email Fallback
                elif email:
                    users_ref = db.collection('users')
                    query = users_ref.where('email', '==', email).limit(1).get()
                    
                    if query:
                        user_doc = query[0]
                        if user_doc.to_dict().get('last_sale_id') == sale_id:
                            return {"status": "success", "message": "Already processed."}

                        now = datetime.now(timezone.utc)
                        expiry = now + timedelta(days=30)

                        user_doc.reference.update({
                            "premium": True,
                            "plan": "premium",
                            "premiumSince": now,
                            "premiumUntil": expiry,
                            "last_sale_id": sale_id
                        })
                        
                        send_premium_confirmation_email(email, user_doc.id)
                        return {"status": "success", "message": f"User {email} upgraded via fallback."}
                    else:
                        print(f"DEBUG: Webhook - User {email} not found in database.")
                        return {"status": "pending_user_creation", "email": email}
                    
            except Exception as e:
                print(f"DEBUG: Database Error during webhook: {str(e)}")
                raise HTTPException(status_code=500, detail="Database update failed")
    
    return {"status": "ignored", "event": event}

@app.post("/api/analytics/unlock")
async def log_unlock(request: Request):
    """
    Logs premium unlock events for analytics.
    """
    try:
        data = await request.json()
        print(f"ANALYTICS: User {data.get('email')} unlocked premium from {data.get('country')} at {data.get('timestamp')}")
        
        # Save to Firestore for future follow-ups
        db.collection('analytics_unlocks').add({
            **data,
            "server_timestamp": firestore.SERVER_TIMESTAMP
        })
        return {"status": "logged"}
    except Exception as e:
        print(f"DEBUG: Analytics logging failed: {str(e)}")
        return {"status": "error", "message": str(e)}

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
