export const SOLAR_PROFILES = {
    "desert": [0,0,0,0,0,0, 0.1, 0.3, 0.6, 0.85, 0.98, 1.0, 0.98, 0.85, 0.6, 0.3, 0.1, 0,0,0,0,0,0,0],
    "high":   [0,0,0,0,0,0, 0.05, 0.2, 0.5, 0.8, 0.95, 1.0, 0.95, 0.8, 0.5, 0.2, 0.05, 0,0,0,0,0,0,0],
    "moderate":[0,0,0,0,0,0, 0.03, 0.15, 0.4, 0.6, 0.7, 0.75, 0.7, 0.6, 0.4, 0.15, 0.03, 0,0,0,0,0,0,0],
    "cloudy":  [0,0,0,0,0,0, 0.02, 0.08, 0.2, 0.3, 0.35, 0.4, 0.35, 0.3, 0.2, 0.08, 0.02, 0,0,0,0,0,0,0]
};

export const REGION_DEFAULTS = {
    "Tanzania": "high",
    "Kenya": "high",
    "Nigeria": "moderate",
    "South Africa": "moderate",
    "India": "high",
    "UAE": "desert",
    "USA": "moderate",
    "Custom": "moderate"
};
