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
        what = "Energy generation and usage are currently balanced for optimal reliability."
        if unmet > 0:
            what = f"The current system setup is unable to meet {unmet:.1f}kWh of your daily demand, leading to potential operational disruptions."
        elif grid_dep > 50:
            what = "High operational expenditure detected; the property remains heavily reliant on expensive grid energy during critical hours."
        elif wasted_solar > 5:
            what = "Capital inefficiency detected: a significant volume of free solar energy is being discarded instead of being stored for later use."
        
        # B. Why it is happening
        why = "The system is currently matched to your demand profile."
        if unmet > 0:
            why = "Peak energy demands are exceeding the current generation and storage ceiling."
        elif grid_dep > 50 and solar_capacity < (daily_usage / 4):
            why = "The current solar array is undersized relative to your daily consumption, forcing reliance on external power."
        elif wasted_solar > 5 and battery_capacity < solar_capacity:
            why = "The storage system reaches capacity too early, leaving no room to capture high-value midday solar energy."

        # C. Weakness detected
        weakness = "System is performing within expected parameters."
        if unmet > 0:
            weakness = "Critical energy deficit during peak operational windows."
        elif grid_dep > 50 and wasted_solar > 2:
            weakness = "Inefficient energy time-shifting; high nighttime grid dependency despite high daytime solar waste."
        elif not is_favorable:
            weakness = "Investment viability is limited by high hardware costs relative to current grid savings."

        # D. Best Next Action (Quantified)
        action = "Monitor seasonal variations and maintain current energy hygiene."
        if unmet > 0:
            action = "Immediately expand solar capacity and storage to protect against operational downtime."
        elif wasted_solar > 3:
            action = f"Expanding storage by {max(5, int(wasted_solar * 1.5))}kWh is projected to capture an additional ${wasted_solar * grid_price * 365:.0f}/yr in energy value."
        elif grid_dep > 60:
            action = "Expanding the solar array by 50% is recommended to reduce long-term grid dependency."

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
        if unmet > 0: return "Low operational reliability. Frequent shortages expected."
        if battery_capacity == 0: return "Vulnerable to grid fluctuations and nighttime outages."
        if grid_dep < 15: return "High energy independence; capable of sustained off-grid operation."
        return "Standard reliability for grid-tied solar assets."

    def _generate_plan(self, unmet, wasted_solar, grid_dep, is_favorable) -> List[str]:
        if unmet > 0:
            return ["Increase solar array capacity immediately.", "Prioritize battery expansion for critical loads.", "Implement energy load management."]
        if wasted_solar > 2:
            return ["Optimize load scheduling for peak solar hours.", "Increase storage capacity to bridge the evening gap.", "Install smart energy controls to automate savings."]
        if not is_favorable:
            return ["Optimize battery sizing to maximize ROI.", "Investigate local incentives or tax credits.", "Hedge against forecasted grid price increases."]
        return ["Maintain panels for peak efficiency.", "Configure battery settings for maximum longevity.", "Review ROI annually as grid prices fluctuate."]

    def _generate_explanation(self, what, why, action) -> str:
        return f"{what} {why} {action} This assessment is based on a 24-hour simulation using current regional solar values and your specific demand profile."

