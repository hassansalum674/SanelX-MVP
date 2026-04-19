import { SOLAR_PROFILES } from '../profiles/solarProfiles.js';
import { DEMAND_PROFILES } from '../profiles/demandProfiles.js';

/**
 * Returns a 24-hour solar profile string (comma separated)
 */
export function generateSolarArray(type) {
    const profile = SOLAR_PROFILES[type];
    if (!profile) return "";
    return profile.join(', ');
}

/**
 * Returns a 24-hour demand profile string (comma separated), 
 * scaled to reach a target daily usage in kWh.
 */
export function generateScaledDemandArray(type, targetDailyKwh) {
    const baseProfile = DEMAND_PROFILES[type];
    if (!baseProfile) return "";
    
    // Calculate current total of the shape
    const currentTotal = baseProfile.reduce((acc, val) => acc + val, 0);
    
    // Scale the profile
    const scaledProfile = baseProfile.map(val => (val * (targetDailyKwh / currentTotal)).toFixed(2));
    
    return scaledProfile.join(', ');
}
