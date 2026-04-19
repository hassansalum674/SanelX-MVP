from .battery import Battery
from typing import List, Dict, Any

def run_simulation(inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Runs a 24-hour energy simulation.
    Priority: 1. Solar, 2. Battery, 3. Grid
    """
    solar_size = inputs["solar_system_size_kw"]
    battery_cap = inputs["battery_capacity_kwh"]
    init_charge = inputs["initial_battery_charge_kwh"]
    demand_profile = inputs["hourly_demand_kwh"]
    solar_profile = inputs["hourly_solar_profile"]
    grid_price = inputs["grid_price_per_kwh"]
    min_soc = inputs.get("battery_min_soc_kwh", 0.0)
    efficiency = inputs.get("battery_round_trip_efficiency", 0.9)
    time_step = inputs.get("time_step_hours", 1)

    battery = Battery(battery_cap, init_charge, min_soc, efficiency)
    
    hourly_results = []

    for hour in range(24):
        demand = demand_profile[hour]
        solar_gen = solar_profile[hour] * solar_size
        
        solar_used = 0.0
        battery_charged = 0.0
        battery_discharged = 0.0
        grid_used = 0.0
        unmet_demand = 0.0
        wasted_solar = 0.0
        
        remaining_demand = demand
        
        # 1. Use Solar first
        if solar_gen >= remaining_demand:
            solar_used = remaining_demand
            remaining_solar = solar_gen - remaining_demand
            remaining_demand = 0
            
            # Use excess solar to charge battery
            battery_charged = battery.charge(remaining_solar)
            wasted_solar = remaining_solar - battery_charged
        else:
            solar_used = solar_gen
            remaining_demand -= solar_gen
            
            # 2. Use Battery second
            battery_discharged = battery.discharge(remaining_demand)
            remaining_demand -= battery_discharged
            
        # 3. Use Grid last
        if remaining_demand > 0:
            grid_used = remaining_demand
            remaining_demand = 0
            
        # Unmet demand (should be 0 in this simple model unless grid is capped, but good to track)
        unmet_demand = remaining_demand
        
        hourly_results.append({
            "hour": hour,
            "demand": demand,
            "solar_generated": solar_gen,
            "solar_used": solar_used,
            "battery_charged": battery_charged,
            "battery_discharged": battery_discharged,
            "grid_used": grid_used,
            "unmet_demand": unmet_demand,
            "wasted_solar": wasted_solar,
            "battery_soc_end": battery.get_soc(),
            "hourly_cost": grid_used * grid_price
        })
        
    return {
        "hourly_results": hourly_results,
        "final_battery_throughput": battery.get_throughput()
    }
