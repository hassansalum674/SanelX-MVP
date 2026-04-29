import math

class Battery:
    """
    Simulates a battery storage system with efficiency and state-of-charge limits.
    """
    def __init__(self, 
                 capacity_kwh: float, 
                 initial_charge_kwh: float, 
                 min_soc_kwh: float = 0.0,
                 round_trip_efficiency: float = 0.9,
                 max_charge_rate_kw: float = 5.0,
                 max_discharge_rate_kw: float = 5.0):
        self.capacity = capacity_kwh
        self.current_charge = min(initial_charge_kwh, capacity_kwh)
        self.min_soc = min_soc_kwh
        self.max_charge_rate = max_charge_rate_kw
        self.max_discharge_rate = max_discharge_rate_kw
        self.throughput_kwh = 0.0
        
        # Split efficiency equally between charging and discharging
        # η_charge * η_discharge = η_round_trip
        # Use a small epsilon to prevent division by zero
        safe_efficiency = max(round_trip_efficiency, 0.0001)
        self.eff = math.sqrt(safe_efficiency)

    def charge(self, energy_kwh: float) -> float:
        """
        Charges the battery with given energy. 
        Returns the amount of energy actually absorbed (before efficiency losses).
        """
        if energy_kwh <= 0:
            return 0.0
            
        # Respect hardware max charge rate
        energy_kwh = min(energy_kwh, self.max_charge_rate)
            
        space_available = self.capacity - self.current_charge
        if space_available <= 0:
            return 0.0
            
        # Actual energy that can be added to the internal chemical storage
        energy_to_add = energy_kwh * self.eff
        
        if energy_to_add > space_available:
            # Only use enough energy to fill the remaining space
            actual_internal_added = space_available
            actual_external_used = space_available / self.eff
        else:
            actual_internal_added = energy_to_add
            actual_external_used = energy_kwh
            
        self.current_charge += actual_internal_added
        self.throughput_kwh += actual_internal_added
        return actual_external_used

    def discharge(self, demand_kwh: float) -> float:
        """
        Discharges the battery to meet demand.
        Returns the amount of energy delivered to the load.
        """
        if demand_kwh <= 0:
            return 0.0

        # Respect hardware max discharge rate
        demand_kwh = min(demand_kwh, self.max_discharge_rate)
            
        available_internal = self.current_charge - self.min_soc
        if available_internal <= 0:
            return 0.0
            
        # Max external energy we can deliver after efficiency loss
        max_external_delivery = available_internal * self.eff
        
        if demand_kwh > max_external_delivery:
            actual_external_delivered = max_external_delivery
            actual_internal_removed = available_internal
        else:
            actual_external_delivered = demand_kwh
            actual_internal_removed = demand_kwh / self.eff
            
        self.current_charge -= actual_internal_removed
        self.throughput_kwh += actual_internal_removed
        return actual_external_delivered

    def get_soc(self) -> float:
        """Returns current charge in kWh."""
        return self.current_charge

    def get_throughput(self) -> float:
        """Returns total energy throughput in kWh."""
        return self.throughput_kwh
