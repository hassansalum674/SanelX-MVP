from typing import Dict, Any, List

class SmartAdvisor:
    """
    Synex Intelligent Advisor Engine.
    Uses rule-based logic to provide professional, human-quality energy insights.
    """

    def __init__(self, summary: Dict[str, Any], inputs: Dict[str, Any], premium_insights: Dict[str, Any]):
        self.summary = summary
        self.inputs = inputs
        self.premium = premium_insights
        self.advice = {}

    def get_advice(self) -> Dict[str, Any]:
        """
        Processes metrics and returns structured professional advisor data.
        """
        grid_price = self.inputs.get("grid_price_per_kwh", 0)
        daily_usage = self.summary.get("total_demand", 0)
        solar_capacity = self.inputs.get("solar_system_size_kw", 0)
        battery_capacity = self.inputs.get("battery_capacity_kwh", 0)
        grid_dep = self.summary.get("grid_dependency_percent", 0)
        solar_cov = self.summary.get("solar_coverage_percent", 0)
        wasted_solar = self.summary.get("total_wasted_solar", 0)
        unmet = self.summary.get("total_unmet_demand", 0)
        is_favorable = self.premium.get("smart_recommendation", {}).get("is_payback_favorable", True)

        # 1. Structured Professional Insight
        # A. What is happening
        what = "The system is currently balancing generation and demand."
        if unmet > 0:
            what = f"The system is failing to meet {unmet:.1f}kWh of daily demand."
        elif grid_dep > 50:
            what = "Your property remains heavily reliant on expensive grid energy."
        elif wasted_solar > 5:
            what = "A significant volume of free solar energy is being discarded."
        
        # B. Why it is happening
        why = "Solar generation and battery capacity are currently in sync with usage."
        if unmet > 0:
            why = "Current storage and generation ceilings are too low for peak load spikes."
        elif grid_dep > 50 and solar_capacity < (daily_usage / 4):
            why = "The solar array is undersized relative to your {daily_usage:.1f}kWh daily consumption."
        elif wasted_solar > 5 and battery_capacity < solar_capacity:
            why = "The battery hits full capacity early in the day, leaving midday solar with nowhere to go."

        # C. Weakness detected
        weakness = "None identified for this specific profile."
        if unmet > 0:
            weakness = "Critical energy deficit during peak hours."
        elif grid_dep > 50 and wasted_solar > 2:
            weakness = "Poor Energy Time-Shifting (Solar waste vs Nighttime grid reliance)."
        elif not is_favorable:
            weakness = "High capital expenditure relative to grid savings."

        # D. Best Next Action (Quantified)
        action = "Maintain current setup and monitor seasonal variations."
        if unmet > 0:
            action = "Immediately increase solar by 2kW and battery by 5kWh to ensure reliability."
        elif wasted_solar > 3:
            action = f"Add {max(5, int(wasted_solar * 1.5))}kWh of battery capacity to capture ${wasted_solar * grid_price * 365:.0f}/yr in wasted solar."
        elif grid_dep > 60:
            action = "Expand the solar array capacity by 50% to improve daytime coverage."

        # 2. Key Action Plan (3 Step Roadmap)
        plan = self._generate_plan(unmet, wasted_solar, grid_dep, is_favorable)

        return {
            "professional_insight": {
                "what": what,
                "why": why,
                "weakness": weakness,
                "best_next_action": action
            },
            "reliability_note": self._get_reliability_note(unmet, battery_capacity, grid_dep),
            "action_plan": plan,
            "full_explanation": self._generate_explanation(what, why, action)
        }

    def _get_reliability_note(self, unmet, battery_capacity, grid_dep) -> str:
        if unmet > 0: return "Low reliability. Frequent power shortages expected."
        if battery_capacity == 0: return "Medium reliability. Vulnerable to grid outages at night."
        if grid_dep < 15: return "Exceptional resilience. Capable of off-grid operation."
        return "Standard reliability for grid-tied solar."

    def _generate_plan(self, unmet, wasted_solar, grid_dep, is_favorable) -> List[str]:
        if unmet > 0:
            return ["Reduce non-essential loads immediately.", "Consult installer for array expansion.", "Verify battery discharge peak limits."]
        if wasted_solar > 2:
            return ["Identify loads to move to 11am-2pm.", "Increase battery capacity to bridge evening gap.", "Install EMS to automate solar priority."]
        if not is_favorable:
            return ["Re-evaluate battery sizing strategy.", "Check for local solar tax credits.", "Monitor grid price hike forecasts."]
        return ["Schedule bi-annual panel cleaning.", "Set battery DoD to 80% for longevity.", "Update profile if large appliances are added."]

    def _generate_explanation(self, what, why, action) -> str:
        return f"{what} {why} {action} This assessment is based on a 24-hour simulation using current regional solar values and your specific demand profile."

