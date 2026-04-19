from typing import Dict, Any, List

def generate_recommendations(summary: Dict[str, Any], inputs: Dict[str, Any]) -> List[str]:
    """
    Produces simple recommendations based on the simulation summary.
    """
    recommendations = []
    
    grid_dep = summary["grid_dependency_percent"]
    solar_cov = summary["solar_coverage_percent"]
    unmet = summary["total_unmet_demand"]
    
    # Logic for battery size
    total_discharged = summary["total_battery_discharged"]
    capacity = inputs["battery_capacity_kwh"]
    
    if unmet > 0:
        recommendations.append("High priority: System has unmet demand. Consider increasing solar size or battery capacity.")
    
    if grid_dep > 50:
        recommendations.append("Grid dependency is high (>50%). Increasing solar generation or battery storage could reduce costs.")
    
    if solar_cov < 30:
        recommendations.append("Solar coverage is low. You might benefit from a larger solar array.")
        
    if total_discharged > (capacity * 0.8) and grid_dep > 20:
        recommendations.append("Battery capacity is being heavily utilized. A larger battery could capture more excess solar.")
    elif total_discharged < (capacity * 0.2) and capacity > 0:
        recommendations.append("Battery appears oversized for current demand/solar patterns.")

    if not recommendations:
        recommendations.append("System appears well-balanced for the current load and generation profile.")
        
    return recommendations
