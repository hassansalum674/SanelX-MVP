import requests
payload = {
    "solar_kw": 5, "battery_kwh": 10, "initial_battery_kwh": 5, "grid_price": 0.15,
    "hourly_demand": [1]*24, "hourly_solar_profile": [0.5]*24
}
r = requests.post("http://localhost:8000/analyze", json=payload)
print(r.status_code)
print(r.json().get('summary', {}).keys())
