// Synex Frontend Configuration
window.SYNEX_CONFIG = {
    // For production, change this to your deployed API URL
    // e.g. "https://api.synex.sanelx.com/analyze"
    API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? "http://localhost:8000/analyze" 
        : "https://api.synex.sanelx.com/analyze"
};
