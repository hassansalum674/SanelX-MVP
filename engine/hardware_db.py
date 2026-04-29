# Synex Hardware Intelligence Database
# Contains technical specifications for interoperability modeling

HARDWARE_LIBRARY = {
    "batteries": {
        "generic_lifepo4": {
            "name": "Generic LiFePO4",
            "capacity_kwh": 10.0,
            "max_discharge_rate": 0.5,  # 0.5C
            "dod": 0.8,                 # 80%
            "efficiency": 0.95,
            "round_trip_efficiency": 0.90
        },
        "tesla_powerwall_2": {
            "name": "Tesla Powerwall 2",
            "capacity_kwh": 13.5,
            "max_discharge_rate": 0.37, # 5kW / 13.5kWh
            "dod": 1.0,                 # 100%
            "efficiency": 0.92,
            "round_trip_efficiency": 0.90
        },
        "byd_battery_box_lv": {
            "name": "BYD B-Box Premium LV",
            "capacity_kwh": 15.4,
            "max_discharge_rate": 0.5,
            "dod": 0.95,
            "efficiency": 0.96,
            "round_trip_efficiency": 0.92
        },
        "pylontech_us3000c": {
            "name": "Pylontech US3000C",
            "capacity_kwh": 3.55,
            "max_discharge_rate": 1.0,  # High power density
            "dod": 0.95,
            "efficiency": 0.95,
            "round_trip_efficiency": 0.90
        }
    },
    "inverters": {
        "generic": {
            "name": "Generic Hybrid Inverter",
            "efficiency": 0.96,
            "max_power_kw": 5.0
        },
        "victron_multiplus_ii_5k": {
            "name": "Victron MultiPlus-II 48/5000",
            "efficiency": 0.96,
            "max_power_kw": 4.0, # 5000VA continuous at 25C
            "euro_efficiency": 0.95
        },
        "huawei_sun2000_6ktl": {
            "name": "Huawei SUN2000-6KTL-L1",
            "efficiency": 0.98,
            "max_power_kw": 6.0,
            "euro_efficiency": 0.97
        },
        "sma_sunny_boy_5": {
            "name": "SMA Sunny Boy 5.0",
            "efficiency": 0.97,
            "max_power_kw": 5.0,
            "euro_efficiency": 0.96
        }
    }
}

def get_hardware_specs(category, brand_key):
    return HARDWARE_LIBRARY.get(category, {}).get(brand_key, HARDWARE_LIBRARY[category]["generic"])
