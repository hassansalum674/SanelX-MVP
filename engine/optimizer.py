from .simulator import run_simulation
from .summary import calculate_summary
from typing import List, Dict, Any

def compare_battery_sizes(base_inputs: Dict[str, Any], test_capacities: List[float]) -> Dict[str, Any]:
    """
    Tests multiple battery sizes and compares results.
    Decision Rule: Minimize unmet demand first, then cost, then grid usage.
    """
    results = []
    
    for cap in test_capacities:
        # Create a copy of inputs with the new battery capacity
        inputs = base_inputs.copy()
        inputs["battery_capacity_kwh"] = cap
        # Also set initial charge to half of capacity for fair testing
        inputs["initial_battery_charge_kwh"] = cap * 0.5
        
        sim_data = run_simulation(inputs)
        summary = calculate_summary(sim_data["hourly_results"], sim_data["final_battery_throughput"])
        
        results.append({
            "capacity": cap,
            "total_cost": summary["total_grid_cost"],
            "grid_usage": summary["total_grid_used"],
            "unmet_demand": summary["total_unmet_demand"]
        })
        
    # Find best option
    # Sorted by: unmet demand (asc), total cost (asc), grid usage (asc)
    sorted_results = sorted(results, key=lambda x: (x["unmet_demand"], x["total_cost"], x["grid_usage"]))
    
    return {
        "all_options": results,
        "best_option": sorted_results[0]
    }
