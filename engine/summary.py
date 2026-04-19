from typing import List, Dict, Any

def calculate_summary(hourly_results: List[Dict[str, Any]], battery_throughput: float = 0.0, wear_cost: float = 0.05) -> Dict[str, Any]:
    """
    Aggregates hourly results into a daily summary.
    """
    summary = {
        "total_demand": sum(h["demand"] for h in hourly_results),
        "total_solar_generated": sum(h["solar_generated"] for h in hourly_results),
        "total_solar_used": sum(h["solar_used"] for h in hourly_results),
        "total_battery_charged": sum(h["battery_charged"] for h in hourly_results),
        "total_battery_discharged": sum(h["battery_discharged"] for h in hourly_results),
        "total_grid_used": sum(h["grid_used"] for h in hourly_results),
        "total_unmet_demand": sum(h["unmet_demand"] for h in hourly_results),
        "total_grid_cost": sum(h["hourly_cost"] for h in hourly_results),
        "total_wasted_solar": sum(h["wasted_solar"] for h in hourly_results),
        "battery_throughput_kwh": battery_throughput,
        "battery_degradation_cost": battery_throughput * wear_cost, 
        "final_battery_soc": hourly_results[-1]["battery_soc_end"],
        "max_demand_hour": max(hourly_results, key=lambda x: x["demand"])["hour"],
        "max_grid_hour": max(hourly_results, key=lambda x: x["grid_used"])["hour"],
        "peak_charging_hour": max(hourly_results, key=lambda x: x["battery_charged"])["hour"],
    }
    
    # Total Operational Cost = Grid Cost + Wear Cost
    summary["total_operational_cost"] = summary["total_grid_cost"] + summary["battery_degradation_cost"]

    # Calculate Percentages
    if summary["total_demand"] > 0:
        summary["solar_coverage_percent"] = (summary["total_solar_used"] / summary["total_demand"]) * 100
        summary["grid_dependency_percent"] = (summary["total_grid_used"] / summary["total_demand"]) * 100
    else:
        summary["solar_coverage_percent"] = 0.0
        summary["grid_dependency_percent"] = 0.0
        
    return summary
