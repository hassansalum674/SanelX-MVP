// Synex Frontend Configuration
window.SYNEX_CONFIG = {
    // Production API URL on Render
    API_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? "http://localhost:8080/analyze" 
        : "https://synex-api.onrender.com/analyze"
};
