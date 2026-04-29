from .battery import Battery
from typing import List, Dict, Any

def run_simulation(inputs: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Runs a 24-hour energy simulation.
    Supports modes: self_consumption, peak_shaving, tou_arbitrage
    """
    solar_size = inputs["solar_system_size_kw"]
    battery_cap = inputs["battery_capacity_kwh"]
    init_charge = inputs["initial_battery_charge_kwh"]
    demand_profile = inputs["hourly_demand_kwh"]
    solar_profile = inputs["hourly_solar_profile"]
    grid_price = inputs["grid_price_per_kwh"]
    min_soc = inputs.get("battery_min_soc_kwh", 0.0)
    efficiency = inputs.get("battery_round_trip_efficiency", 0.9)
    
    # NEW Strategy Params
    mode = inputs.get("strategy_mode", "self_consumption")
    peak_threshold = inputs.get("peak_shaving_threshold_kw", 5.0)
    tou_start = inputs.get("tou_peak_start", 18)
    tou_end = inputs.get("tou_peak_end", 22)
    
    # NEW Hardware Specs
    max_charge = inputs.get("max_charge_rate_kw", 5.0)
    max_discharge = inputs.get("max_discharge_rate_kw", 5.0)

    battery = Battery(battery_cap, init_charge, min_soc, efficiency, max_charge, max_discharge)
    
    hourly_results = []

    for hour in range(24):
        demand = demand_profile[hour]
        solar_gen = solar_profile[hour] * solar_size
        
        solar_used = 0.0
        battery_charged = 0.0
        battery_discharged = 0.0
        grid_used = 0.0
        wasted_solar = 0.0
        
        remaining_demand = demand
        
        # ─── LOGIC MODE: TOU ARBITRAGE (Night Charge) ───
        # Charge from grid during 00:00 - 05:00 if enabled
        if mode == "tou_arbitrage" and hour >= 0 and hour <= 5:
            if battery.get_soc() < battery_cap:
                grid_charge_need = battery_cap - battery.get_soc()
                battery_charged += battery.charge(grid_charge_need)
                grid_used += (battery_charged / efficiency) # Roughly

        # ─── STEP 1: SOLAR FIRST ───
        if solar_gen >= remaining_demand:
            solar_used = remaining_demand
            remaining_solar = solar_gen - remaining_demand
            remaining_demand = 0
            # Charge battery with excess solar
            added = battery.charge(remaining_solar)
            battery_charged += added
            wasted_solar = remaining_solar - added
        else:
            solar_used = solar_gen
            remaining_demand -= solar_gen

        # ─── STEP 2: STRATEGY-BASED DISCHARGE ───
        is_peak_hour = (hour >= tou_start and hour <= tou_end)
        
        should_discharge = False
        if mode == "self_consumption":
            should_discharge = True
        elif mode == "tou_arbitrage" and is_peak_hour:
            should_discharge = True
        elif mode == "peak_shaving" and remaining_demand > peak_threshold:
            # Only discharge enough to stay below threshold
            shave_need = remaining_demand - peak_threshold
            battery_discharged = battery.discharge(shave_need)
            remaining_demand -= battery_discharged
        
        if should_discharge and remaining_demand > 0:
            battery_discharged = battery.discharge(remaining_demand)
            remaining_demand -= battery_discharged

        # ─── STEP 3: GRID LAST ───
        if remaining_demand > 0:
            grid_used += remaining_demand
            
        hourly_results.append({
            "hour": hour,
            "demand": demand,
            "solar_generated": solar_gen,
            "solar_used": solar_used,
            "battery_charged": battery_charged,
            "battery_discharged": battery_discharged,
            "grid_used": grid_used,
            "wasted_solar": wasted_solar,
            "battery_soc_end": battery.get_soc(),
            "hourly_cost": grid_used * grid_price
        })
        
    return {
        "hourly_results": hourly_results,
        "final_battery_throughput": battery.get_throughput()
    }
