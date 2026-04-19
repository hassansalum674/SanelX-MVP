from typing import Dict, Any, List

def validate_inputs(inputs: Dict[str, Any]) -> None:
    """
    Validates the input dictionary for the energy simulation engine.
    Raises ValueError if inputs are invalid.
    """
    required_keys = [
        "solar_system_size_kw",
        "battery_capacity_kwh",
        "initial_battery_charge_kwh",
        "hourly_demand_kwh",
        "hourly_solar_profile",
        "grid_price_per_kwh"
    ]
    
    for key in required_keys:
        if key not in inputs:
            raise ValueError(f"Missing required input: {key}")

    # Validate numeric types
    numeric_keys = [
        "solar_system_size_kw", "battery_capacity_kwh", 
        "initial_battery_charge_kwh", "grid_price_per_kwh",
        "battery_min_soc_kwh", "battery_round_trip_efficiency", "time_step_hours"
    ]
    
    for key in numeric_keys:
        if key in inputs and not isinstance(inputs[key], (int, float)):
            raise ValueError(f"Input {key} must be a number.")

    # Validate list sizes
    if not isinstance(inputs["hourly_demand_kwh"], list) or len(inputs["hourly_demand_kwh"]) != 24:
        raise ValueError("hourly_demand_kwh must be a list of 24 values.")
    
    if not isinstance(inputs["hourly_solar_profile"], list) or len(inputs["hourly_solar_profile"]) != 24:
        raise ValueError("hourly_solar_profile must be a list of 24 values.")

    # Validate values are non-negative
    if inputs["solar_system_size_kw"] < 0:
        raise ValueError("solar_system_size_kw cannot be negative.")
    if inputs["battery_capacity_kwh"] < 0:
        raise ValueError("battery_capacity_kwh cannot be negative.")
    if inputs["initial_battery_charge_kwh"] < 0:
        raise ValueError("initial_battery_charge_kwh cannot be negative.")
    if inputs["initial_battery_charge_kwh"] > inputs["battery_capacity_kwh"]:
        raise ValueError("initial_battery_charge_kwh cannot be greater than battery_capacity_kwh.")
    if inputs["grid_price_per_kwh"] < 0:
        raise ValueError("grid_price_per_kwh cannot be negative.")

    # Validate profile values are non-negative
    if any(v < 0 for v in inputs["hourly_demand_kwh"]):
        raise ValueError("hourly_demand_kwh cannot contain negative values.")
    if any(v < 0 for v in inputs["hourly_solar_profile"]):
        raise ValueError("hourly_solar_profile cannot contain negative values.")

    if inputs.get("battery_round_trip_efficiency", 0.9) <= 0 or inputs.get("battery_round_trip_efficiency", 0.9) > 1:
        raise ValueError("battery_round_trip_efficiency must be between 0 and 1.")
