from .validators import validate_inputs
from .simulator import run_simulation
from .summary import calculate_summary
from .recommendations import generate_recommendations
from .optimizer import compare_battery_sizes
from .advisor import SmartAdvisor
from .hardware_db import get_hardware_specs
from typing import Dict, Any

def run_synex_simulation(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main entry point for the Synex simulation engine.
    Maps API-style inputs to internal logic and returns a structured response.
    """
    # 0. Hardware & Economic Inputs
    cost_params = input_data.get("cost_params") or {}
    # 0.5 Hardware Interoperability Modeling
    batt_model = input_data.get("battery_model", "generic_lifepo4")
    inv_model = input_data.get("inverter_model", "generic")
    batt_specs = get_hardware_specs("batteries", batt_model)
    inv_specs = get_hardware_specs("inverters", inv_model)

    # Weather-aware reserve logic
    weather = input_data.get("weather_outlook", "sunny")
    base_reserve = 1.0 - batt_specs["dod"]
    if weather == "cloudy": base_reserve = max(base_reserve, 0.4)
    if weather == "stormy": base_reserve = max(base_reserve, 0.6)

    ASSUMPTIONS = {
        "install_fee": float(cost_params.get("install_fee", 1500.0)),
        "solar_cost_kw": float(cost_params.get("solar_cost_kw", 1000.0)),
        "battery_cost_per_kwh": float(cost_params.get("battery_cost_kwh", 300.0)),
        "battery_wear_cost_per_kwh": 0.05,
        "grid_price": float(input_data.get("grid_price", 0.15)),
        "battery_min_soc": base_reserve, 
        "battery_round_trip_efficiency": batt_specs["round_trip_efficiency"],
        "max_charge_rate_kw": batt_specs.get("max_charge_rate_kw", 5.0),
        "max_discharge_rate_kw": batt_specs.get("max_discharge_rate_kw", 5.0),
        "inverter_efficiency": inv_specs["efficiency"],
        "maint_pct": float(cost_params.get("maint_pct", 1.0))
    }

    # 1. Weather Scenario Logic
    scenario = input_data.get("weather_scenario", "average")
    days_to_sim = 1
    solar_scale = 1.0

    if scenario == "sunny": solar_scale = 1.2
    elif scenario == "cloudy": solar_scale = 0.4
    elif scenario == "3day_stress":
        solar_scale = 0.4
        days_to_sim = 3
    elif scenario == "rainy_week":
        solar_scale = 0.2
        days_to_sim = 7

    # Map API keys
    base_solar = input_data.get("hourly_solar_profile", [])
    scaled_solar = [min(1.0, s * solar_scale) for s in base_solar]

    mapped_inputs = {
        "solar_system_size_kw": input_data.get("solar_kw", 0),
        "battery_capacity_kwh": input_data.get("battery_kwh", 0),
        "initial_battery_charge_kwh": input_data.get("initial_battery_kwh", 0),
        "hourly_demand_kwh": input_data.get("hourly_demand", []),
        "hourly_solar_profile": scaled_solar,
        "grid_price_per_kwh": ASSUMPTIONS["grid_price"],
        "battery_min_soc_kwh": ASSUMPTIONS["battery_min_soc"] * input_data.get("battery_kwh", 0),
        "battery_round_trip_efficiency": ASSUMPTIONS["battery_round_trip_efficiency"],
        "max_charge_rate_kw": ASSUMPTIONS["max_charge_rate_kw"],
        "max_discharge_rate_kw": ASSUMPTIONS["max_discharge_rate_kw"],
        "strategy_mode": input_data.get("strategy_mode", "self_consumption"),
        "peak_shaving_threshold_kw": input_data.get("peak_shaving_threshold_kw", 5.0),
        "tou_peak_start": input_data.get("tou_peak_start", 18),
        "tou_peak_end": input_data.get("tou_peak_end", 22),
        "inverter_efficiency": ASSUMPTIONS["inverter_efficiency"],
        "time_step_hours": 1
    }

    # 2. Validation
    validate_inputs(mapped_inputs)

    # 3. Multi-Day Simulation Loop
    all_hourly = []
    total_throughput = 0
    current_init_charge = mapped_inputs["initial_battery_charge_kwh"]
    lowest_soc = current_init_charge

    for d in range(days_to_sim):
        day_inputs = mapped_inputs.copy()
        day_inputs["initial_battery_charge_kwh"] = current_init_charge
        
        sim_day = run_simulation(day_inputs)
        all_hourly.extend(sim_day["hourly_results"])
        total_throughput += sim_day["final_battery_throughput"]
        
        current_init_charge = sim_day["hourly_results"][-1]["battery_soc_end"]
        # Track stress
        day_min = min(h["battery_soc_end"] for h in sim_day["hourly_results"])
        lowest_soc = min(lowest_soc, day_min)

    # 4. Summarize (Average daily performance)
    # We pass the full history but result is averaged for summary
    summary = calculate_summary(all_hourly, total_throughput, ASSUMPTIONS["battery_wear_cost_per_kwh"])
    
    # Correct the totals to "per day" averages for the summary
    if days_to_sim > 1:
        for key in ["total_demand", "total_solar_generated", "total_solar_used", 
                    "total_battery_charged", "total_battery_discharged", 
                    "total_grid_used", "total_unmet_demand", "total_grid_cost", 
                    "total_wasted_solar", "battery_degradation_cost", "total_operational_cost"]:
            summary[key] /= days_to_sim
    
    summary["lowest_soc_reached"] = lowest_soc
    summary["sim_days"] = days_to_sim
    summary["weather_scenario"] = scenario

    # For charts, we only return the LAST day to keep UI clean, or first day?
    # User proposed: 24h representative day. Let's use the average of all days for the chart profile?
    # Actually, returning the full 3/7 days might be better for "trust", but keeping chart 24h as proposed.
    representative_hourly = all_hourly[-24:] # Last 24h represents the "steady state" stress


    # 5. Recommendations
    recommendations = generate_recommendations(summary, mapped_inputs)

    # 6. Sanity Checks (Model Notes)
    model_notes = []
    if summary["solar_coverage_percent"] > 99.9 and summary["total_demand"] < 5:
        model_notes.append("Low demand profile used; 100% solar coverage may be optimistic in real-world conditions.")
    if summary["total_wasted_solar"] > summary["total_demand"] * 1.5:
        model_notes.append("Significant solar energy is being wasted. Consider adding more battery storage or shifting high-energy usage to midday.")
    if summary["total_battery_discharged"] < (mapped_inputs["battery_capacity_kwh"] * 0.1) and mapped_inputs["battery_capacity_kwh"] > 0:
        model_notes.append("Battery storage appears significantly oversized for this load profile.")
    
    # 7. Optimization
    test_sizes = [0, 5, 10, 15, 20]
    if mapped_inputs["battery_capacity_kwh"] not in test_sizes:
        test_sizes.append(mapped_inputs["battery_capacity_kwh"])
        test_sizes.sort()
        
    optimization_results = compare_battery_sizes(mapped_inputs, test_sizes)

    # 8. Premium Insights
    baseline_opt = next((x for x in optimization_results["all_options"] if x["capacity"] == 0), optimization_results["all_options"][0])
    best_opt = optimization_results["best_option"]
    current_grid_cost = summary["total_grid_cost"]
    
    baseline_daily = baseline_opt["total_cost"]
    daily_savings = baseline_daily - current_grid_cost
    
    # 4. ROI calculation
    best_batt_cap = best_opt["capacity"]
    # System cost = (Solar size * cost/kW) + (Battery size * cost/kWh) + install
    capital_cost_solar = mapped_inputs["solar_system_size_kw"] * ASSUMPTIONS["solar_cost_kw"]
    capital_cost_batt = best_batt_cap * ASSUMPTIONS["battery_cost_per_kwh"]
    system_cost = ASSUMPTIONS["install_fee"] + capital_cost_solar + capital_cost_batt
    
    payback_years = 0
    is_payback_favorable = True

    if best_batt_cap > 0:
        best_daily_savings = baseline_daily - best_opt["total_cost"]
        # Subtract annual maintenance from annual savings
        annual_maint = system_cost * (ASSUMPTIONS["maint_pct"] / 100)
        best_annual_savings = (best_daily_savings * 365) - annual_maint
        
        if best_annual_savings > 50: # Savings must be enough to cover maint
            payback_years = system_cost / best_annual_savings
            if payback_years > 25:
                is_payback_favorable = False
        else:
            is_payback_favorable = False
            payback_years = float('inf')

    premium_insights = {
        "savings_forecast": {
            "daily_grid_cost": current_grid_cost,
            "daily_wear_cost": summary["battery_degradation_cost"],
            "monthly_cost": current_grid_cost * 30,
            "annual_cost": current_grid_cost * 365,
            "optimal_annual_savings": (baseline_daily - best_opt["total_cost"]) * 365
        },
        "smart_recommendation": {
            "best_capacity": best_batt_cap,
            "estimated_system_cost": system_cost,
            "payback_years": payback_years,
            "is_payback_favorable": is_payback_favorable
        },
        "hourly_insights": {
            "max_demand_hour": summary.get("max_demand_hour", 0),
            "max_grid_hour": summary.get("max_grid_hour", 0),
            "peak_charging_hour": summary.get("peak_charging_hour", 0),
            "total_wasted_solar_kwh": summary.get("total_wasted_solar", 0.0)
        },
        "scenarios": {
            "baseline": {"name": "No Battery (Grid Only)", "daily_cost": baseline_daily, "grid_usage": baseline_opt["grid_usage"]},
            "current": {"name": "Your Current Setup", "daily_cost": current_grid_cost, "grid_usage": summary["total_grid_used"]},
            "optimal": {"name": "Recommended Setup", "daily_cost": best_opt["total_cost"], "grid_usage": best_opt["grid_usage"]}
        }
    }

    # 9. Smart Advisor (Intelligent Advisor Layer)
    advisor = SmartAdvisor(summary, mapped_inputs, premium_insights)
    advisor_data = advisor.get_advice()

    # 10. Premium Analytics (Seasonality, Sensitivity, Reliability)
    # Sensitivity Test (+10%, +25%, +50%)
    base_price = ASSUMPTIONS["grid_price"]
    sensitivity = {
        "price_10": summary["total_grid_used"] * (base_price * 1.1),
        "price_25": summary["total_grid_used"] * (base_price * 1.25),
        "price_50": summary["total_grid_used"] * (base_price * 1.5)
    }

    # Seasonal Outlook & 12-Month Billing Forecast
    # We use a sinusoidal curve to estimate solar production variation throughout the year
    # Tanzania/Kenya (Equatorial): minor variation
    # USA/Europe: significant variation
    
    monthly_forecast = []
    # Production multipliers by month (Jan=0, Dec=11)
    # Simple model: peak in summer (July=6), trough in winter (Jan=0)
    for month in range(12):
        # Sine wave centered at July (index 6)
        # USA/High Sun: 0.5 to 1.5 multiplier
        # High Sun (Equatorial): 0.8 to 1.2 multiplier
        amplitude = 0.4 if scenario == "high" else 0.2
        phase_shift = 6
        multiplier = 1.0 + amplitude * 0.5 * (1.0 + 0.5 * (1.0 + 0.5)) # Placeholder logic, let's keep it simpler
        
        # Simpler: use the current summary as baseline and scale solar
        # Jan(0.6), Feb(0.7), Mar(0.9), Apr(1.0), May(1.1), Jun(1.2), Jul(1.3), Aug(1.2), Sep(1.1), Oct(1.0), Nov(0.8), Dec(0.6)
        season_multipliers = [0.6, 0.7, 0.9, 1.0, 1.1, 1.2, 1.3, 1.2, 1.1, 1.0, 0.8, 0.6]
        m = season_multipliers[month]
        
        month_solar_used = min(summary["total_demand"], summary["total_solar_used"] * m)
        month_grid_cost = (summary["total_demand"] - month_solar_used) * base_price * 30 # 30 days
        
        monthly_forecast.append({
            "month": month,
            "solar_multiplier": m,
            "projected_cost": month_grid_cost,
            "solar_coverage": (month_solar_used / summary["total_demand"]) * 100 if summary["total_demand"] > 0 else 100
        })

    seasonal_outlook = {
        "sunny": {"daily_cost": (summary["total_demand"] - min(summary["total_demand"], summary["total_solar_used"] * 1.3)) * base_price, "solar_cov": 100}, # simplified
        "cloudy": {"daily_cost": (summary["total_demand"] - summary["total_solar_used"] * 0.5) * base_price, "solar_cov": 0}, # simplified
        "monthly_forecast": monthly_forecast
    }

    # Reliability Score (0-100)
    # Penalize grid dependency and heavily penalize unmet demand
    unmet_penalty = (summary["total_unmet_demand"] / summary["total_demand"]) * 500 if summary["total_demand"] > 0 else 0
    grid_penalty = summary["grid_dependency_percent"] * 0.5
    reliability_score = max(0, min(100, 100 - grid_penalty - unmet_penalty))

    # Key Moments (Battery Full/Empty)
    battery_full_hour = next((h["hour"] for h in all_hourly if h["battery_soc_end"] >= mapped_inputs["battery_capacity_kwh"] * 0.98), None)
    battery_empty_hour = next((h["hour"] for h in all_hourly if h["battery_soc_end"] <= mapped_inputs["battery_min_soc_kwh"] + 0.05), None)

    return {
        "summary": summary,
        "hourly": representative_hourly,
        "recommendations": recommendations,
        "model_notes": model_notes,
        "assumptions": ASSUMPTIONS,
        "premium_insights": {
            **premium_insights,
            "sensitivity": sensitivity,
            "seasonal_outlook": seasonal_outlook,
            "reliability_score": reliability_score,
            "key_moments": {
                "battery_full": battery_full_hour,
                "battery_empty": battery_empty_hour,
                "lowest_soc": lowest_soc
            }
        },
        "advisor": advisor_data
    }
