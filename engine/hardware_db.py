# Synex Hardware Intelligence Database
# Contains technical specifications for interoperability modeling

HARDWARE_LIBRARY = {
    "batteries": {
        "generic_lifepo4": {
            "name": "Generic LiFePO4",
            "capacity_kwh": 10.0,
            "max_charge_rate_kw": 5.0,
            "max_discharge_rate_kw": 5.0,
            "dod": 0.8,
            "efficiency": 0.95,
            "round_trip_efficiency": 0.90,
            "soh": 1.0
        },
        "tesla_powerwall_2": {
            "name": "Tesla Powerwall 2",
            "capacity_kwh": 13.5,
            "max_charge_rate_kw": 5.0,
            "max_discharge_rate_kw": 5.0,
            "dod": 1.0,
            "efficiency": 0.92,
            "round_trip_efficiency": 0.90,
            "soh": 0.95
        },
        "enphase_iq_10": {
            "name": "Enphase IQ Battery 10T",
            "capacity_kwh": 10.08,
            "max_charge_rate_kw": 3.84,
            "max_discharge_rate_kw": 3.84,
            "dod": 1.0,
            "efficiency": 0.96,
            "round_trip_efficiency": 0.89,
            "soh": 1.0
        },
        "byd_battery_box_lv": {
            "name": "BYD B-Box Premium LV",
            "capacity_kwh": 15.4,
            "max_charge_rate_kw": 7.5,
            "max_discharge_rate_kw": 7.5,
            "dod": 0.95,
            "efficiency": 0.96,
            "round_trip_efficiency": 0.92,
            "soh": 1.0
        },
        "pylontech_us3000c": {
            "name": "Pylontech US3000C",
            "capacity_kwh": 3.55,
            "max_charge_rate_kw": 1.7,
            "max_discharge_rate_kw": 3.5,
            "dod": 0.95,
            "efficiency": 0.95,
            "round_trip_efficiency": 0.90,
            "soh": 0.98
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
            "max_power_kw": 4.0,
            "euro_efficiency": 0.95,
            "protocols": ["Modbus/TCP", "MQTT"]
        },
        "growatt_sph_6000": {
            "name": "Growatt SPH 6000 TL3",
            "efficiency": 0.975,
            "max_power_kw": 6.0,
            "euro_efficiency": 0.97,
            "protocols": ["ShineServer API"]
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
