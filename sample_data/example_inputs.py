# Sample data for a realistic 24-hour simulation

# Hourly demand (kWh) - typical residential profile
# Higher in the morning (7-9 AM) and evening (6-10 PM)
HOURLY_DEMAND = [
    0.4, 0.3, 0.3, 0.3, 0.4, 0.6,  # 00:00 - 05:00
    1.2, 2.5, 2.0, 1.5, 1.0, 0.8,  # 06:00 - 11:00
    0.7, 0.7, 0.8, 1.0, 1.2, 1.5,  # 12:00 - 17:00
    2.8, 3.5, 3.2, 2.0, 1.0, 0.6   # 18:00 - 23:00
]

# Normalized hourly solar profile (0.0 to 1.0)
# Standard bell curve peaking at noon
HOURLY_SOLAR_PROFILE = [
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0,  # Night
    0.05, 0.2, 0.5, 0.8, 0.95, 1.0, # Morning to Noon
    0.95, 0.8, 0.5, 0.2, 0.05, 0.0, # Afternoon to Sunset
    0.0, 0.0, 0.0, 0.0, 0.0, 0.0   # Night
]

EXAMPLE_INPUTS = {
    "solar_system_size_kw": 5.0,
    "battery_capacity_kwh": 10.0,
    "initial_battery_charge_kwh": 5.0,
    "hourly_demand_kwh": HOURLY_DEMAND,
    "hourly_solar_profile": HOURLY_SOLAR_PROFILE,
    "grid_price_per_kwh": 0.15,
    "battery_min_soc_kwh": 1.0,
    "battery_round_trip_efficiency": 0.9,
    "time_step_hours": 1
}
