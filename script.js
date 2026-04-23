import { REGION_DEFAULTS } from './profiles/solarProfiles.js';
import { generateSolarArray, generateScaledDemandArray } from './utils/generateProfiles.js';

// --- Firebase Initialization ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyChBYiaxQ2F58C0uBRopU-g6US0E9npLWo",
    authDomain: "sanelx-a681c.firebaseapp.com",
    projectId: "sanelx-a681c",
    storageBucket: "sanelx-a681c.firebasestorage.app",
    messagingSenderId: "429996696902",
    appId: "1:429996696902:web:f49930cd4aedfe78783147" // Reconstructed for web
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Configurable API URL from config.js
const API_BASE_URL = window.SYNEX_CONFIG?.API_URL?.replace('/analyze', '') || 'http://localhost:8000';
const ANALYZE_URL = `${API_BASE_URL}/analyze`;
let currentUser = null;
let energyChartInstance = null;
let authMode = 'signin'; // 'signin' or 'signup'

const SAMPLE_DATA = {
    "solar_kw": 5.0,
    "battery_kwh": 10.0,
    "initial_battery_kwh": 5.0,
    "grid_price": 0.15,
    "hourly_demand": [
        0.4, 0.3, 0.3, 0.3, 0.4, 0.6,
        1.2, 2.5, 2.0, 1.5, 1.0, 0.8,
        0.7, 0.7, 0.8, 1.0, 1.2, 1.5,
        2.8, 3.5, 3.2, 2.0, 1.0, 0.6
    ],
    "hourly_solar_profile": [
        0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
        0.05, 0.2, 0.5, 0.8, 0.95, 1.0,
        0.95, 0.8, 0.5, 0.2, 0.05, 0.0,
        0.0, 0.0, 0.0, 0.0, 0.0, 0.0
    ]
};

// --- NEW ONBOARDING LOGIC ---

function updateProfiles() {
    // If advanced mode is on, we don't auto-update textareas
    if (document.getElementById('advanced-toggle').checked) return;

    const climate = document.getElementById('climate').value;
    const usage = document.getElementById('usage_type').value;
    const dailyKwhInput = document.getElementById('daily_usage_kwh');
    const targetKwh = parseFloat(dailyKwhInput.value);
    
    // Safety: don't generate if value is clearly invalid/NaN
    if (isNaN(targetKwh) || targetKwh < 0) return;

    document.getElementById('hourly_solar_profile').value = generateSolarArray(climate);
    document.getElementById('hourly_demand').value = generateScaledDemandArray(usage, targetKwh);
}

function markResultsStale() {
    const resultsSection = document.getElementById('results-section');
    if (resultsSection.style.display === 'block') {
        resultsSection.classList.add('stale');
    }
}

// --- Form Persistence ---
function saveFormState() {
    const formData = {
        country: document.getElementById('country').value,
        climate: document.getElementById('climate').value,
        usage_type: document.getElementById('usage_type').value,
        solar_kw: document.getElementById('solar_kw').value,
        battery_kwh: document.getElementById('battery_kwh').value,
        initial_battery_kwh: document.getElementById('initial_battery_kwh').value,
        grid_price: document.getElementById('grid_price').value,
        weather_scenario: document.getElementById('weather_scenario').value,
        solar_cost_kw: document.getElementById('solar_cost_kw').value,
        battery_cost_kwh: document.getElementById('battery_cost_kwh').value,
        install_fee: document.getElementById('install_fee').value,
        maint_pct: document.getElementById('maint_pct').value,
        hourly_demand: document.getElementById('hourly_demand').value,
        hourly_solar_profile: document.getElementById('hourly_solar_profile').value,
        isAdvanced: document.getElementById('advanced-toggle').checked,
        isCostAdvanced: document.getElementById('cost-advanced-toggle').checked
    };
    localStorage.setItem('synex_form_data', JSON.stringify(formData));
}

function loadFormState() {
    const saved = localStorage.getItem('synex_form_data');
    if (!saved) return;
    try {
        const data = JSON.parse(saved);
        if (data.country) document.getElementById('country').value = data.country;
        if (data.climate) document.getElementById('climate').value = data.climate;
        if (data.usage_type) document.getElementById('usage_type').value = data.usage_type;
        if (data.solar_kw) document.getElementById('solar_kw').value = data.solar_kw;
        if (data.battery_kwh) document.getElementById('battery_kwh').value = data.battery_kwh;
        if (data.initial_battery_kwh) document.getElementById('initial_battery_kwh').value = data.initial_battery_kwh;
        if (data.grid_price) document.getElementById('grid_price').value = data.grid_price;
        if (data.weather_scenario) document.getElementById('weather_scenario').value = data.weather_scenario;
        if (data.solar_cost_kw) document.getElementById('solar_cost_kw').value = data.solar_cost_kw;
        if (data.battery_cost_kwh) document.getElementById('battery_cost_kwh').value = data.battery_cost_kwh;
        if (data.install_fee) document.getElementById('install_fee').value = data.install_fee;
        if (data.maint_pct) document.getElementById('maint_pct').value = data.maint_pct;
        if (data.hourly_demand) document.getElementById('hourly_demand').value = data.hourly_demand;
        if (data.hourly_solar_profile) document.getElementById('hourly_solar_profile').value = data.hourly_solar_profile;
        
        if (data.isAdvanced) {
            document.getElementById('advanced-toggle').checked = true;
            document.getElementById('advanced-inputs').style.display = 'block';
        }
        if (data.isCostAdvanced) {
            document.getElementById('cost-advanced-toggle').checked = true;
            document.getElementById('cost-advanced-inputs').style.display = 'block';
        }
    } catch (e) {
        console.error("Error loading form state", e);
    }
}

// Attach change listeners to all inputs for auto-save
const allInputIds = [
    'country', 'climate', 'usage_type', 'solar_kw', 'battery_kwh', 
    'initial_battery_kwh', 'grid_price', 'weather_scenario', 
    'solar_cost_kw', 'battery_cost_kwh', 'install_fee', 'maint_pct',
    'hourly_demand', 'hourly_solar_profile', 'advanced-toggle', 'cost-advanced-toggle'
];
allInputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', saveFormState);
});

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    loadFormState();
    updateProfiles();
    updateAuthStateUI();
});

// All inputs that should trigger stale state
const allInputs = ['country', 'climate', 'usage_type', 'daily_usage_kwh', 'solar_kw', 'battery_kwh', 'initial_battery_kwh', 'grid_price'];

allInputs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    
    el.addEventListener('input', () => {
        markResultsStale();
        if (['climate', 'usage_type', 'daily_usage_kwh'].includes(id)) {
            updateProfiles();
        }
    });

    if (id === 'country') {
        el.addEventListener('change', (e) => {
            const region = e.target.value;
            if (REGION_DEFAULTS[region] && REGION_DEFAULTS[region] !== "custom") {
                document.getElementById('climate').value = REGION_DEFAULTS[region];
                updateProfiles();
            } else if (region === "Custom") {
                document.getElementById('advanced-toggle').checked = true;
                document.getElementById('advanced-inputs').style.display = 'block';
            }
        });
    }
});
// Advanced Cost Toggle
document.getElementById('cost-advanced-toggle').addEventListener('change', (e) => {
    const grid = document.getElementById('cost-inputs-grid');
    if (e.target.checked) {
        grid.style.opacity = '1';
        grid.style.pointerEvents = 'all';
    } else {
        grid.style.opacity = '0.6';
        grid.style.pointerEvents = 'none';
        updateCostPresets(document.getElementById('country').value);
    }
    markResultsStale();
});

function updateCostPresets(country) {
    const solar = document.getElementById('solar_cost_kw');
    const batt = document.getElementById('battery_cost_kwh');
    const inst = document.getElementById('install_fee');
    
    const presets = {
        "USA": { solar: 2800, batt: 600, inst: 2500 },
        "Tanzania": { solar: 1200, batt: 350, inst: 800 },
        "Nigeria": { solar: 1400, batt: 400, inst: 1000 },
        "South Africa": { solar: 1600, batt: 450, inst: 1200 },
        "Kenya": { solar: 1300, batt: 380, inst: 900 },
        "India": { solar: 800, batt: 300, inst: 500 },
        "UAE": { solar: 1100, batt: 320, inst: 700 }
    };

    const p = presets[country] || { solar: 1000, batt: 300, inst: 1500 };
    solar.value = p.solar;
    batt.value = p.batt;
    inst.value = p.inst;
}

document.getElementById('advanced-toggle').addEventListener('change', (e) => {
    const isAdvanced = e.target.checked;
    document.getElementById('advanced-inputs').style.display = isAdvanced ? 'block' : 'none';
    if (!isAdvanced) {
        updateProfiles(); 
    }
    markResultsStale();
});

document.getElementById('country').addEventListener('change', (e) => {
    const region = e.target.value;
    if (REGION_DEFAULTS[region] && REGION_DEFAULTS[region] !== "custom") {
        document.getElementById('climate').value = REGION_DEFAULTS[region];
        updateProfiles();
    } else if (region === "Custom") {
        document.getElementById('advanced-toggle').checked = true;
        document.getElementById('advanced-inputs').style.display = 'block';
    }
    
    if (!document.getElementById('cost-advanced-toggle').checked) {
        updateCostPresets(region);
    }
    markResultsStale();
});

// Supersede the old load sample logic
document.getElementById('load-sample-btn').addEventListener('click', () => {
    document.getElementById('country').value = "USA";
    document.getElementById('climate').value = "moderate";
    document.getElementById('usage_type').value = "residential";
    document.getElementById('solar_kw').value = "5.0";
    document.getElementById('battery_kwh').value = "10.0";
    document.getElementById('initial_battery_kwh').value = "5.0";
    document.getElementById('grid_price').value = "0.15";
    updateProfiles();
});

document.getElementById('analyze-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-btn');
    const loader = document.getElementById('loader');
    const btnText = document.getElementById('btn-text');
    const errorMsg = document.getElementById('error-message');
    const resultsSection = document.getElementById('results-section');

    // UI State: Loading
    submitBtn.disabled = true;
    loader.style.display = 'block';
    btnText.textContent = 'Analyzing...';
    errorMsg.style.display = 'none';
    
    try {
        const payload = {
            solar_kw: parseFloat(document.getElementById('solar_kw').value),
            battery_kwh: parseFloat(document.getElementById('battery_kwh').value),
            initial_battery_kwh: parseFloat(document.getElementById('initial_battery_kwh').value),
            grid_price: parseFloat(document.getElementById('grid_price').value),
            weather_scenario: document.getElementById('weather_scenario').value,
            cost_params: {
                solar_cost_kw: parseFloat(document.getElementById('solar_cost_kw').value),
                battery_cost_kwh: parseFloat(document.getElementById('battery_cost_kwh').value),
                install_fee: parseFloat(document.getElementById('install_fee').value),
                maint_pct: parseFloat(document.getElementById('maint_pct').value)
            },
            hourly_demand: parseCommaList(document.getElementById('hourly_demand').value),
            hourly_solar_profile: parseCommaList(document.getElementById('hourly_solar_profile').value)
        };

        // Validation
        if (payload.hourly_demand.length !== 24 || payload.hourly_solar_profile.length !== 24) {
            throw new Error('Both hourly profiles must contain exactly 24 values.');
        }

        const response = await fetch(ANALYZE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server returned ${response.status}`);
        }

        const data = await response.json();
        renderResults(data);
        resultsSection.style.display = 'block';
        resultsSection.classList.remove('stale'); // Reset stale state on success
        resultsSection.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        errorMsg.textContent = err.message;
        errorMsg.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        loader.style.display = 'none';
        btnText.textContent = 'Analyze System';
    }
});

function parseCommaList(str) {
    return str.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
}

function currentPaybackYears(summary, assumptions) {
    // Basic daily savings vs baseline
    const gridOnlyDaily = summary.total_demand * assumptions.grid_price;
    const currentDaily = summary.total_grid_cost;
    const dailySavings = gridOnlyDaily - currentDaily;
    
    if (dailySavings <= 0) return 99; // No savings
    
    const systemCost = (assumptions.solar_size || 5) * 1000 + (assumptions.battery_size || 10) * 300;
    return systemCost / (dailySavings * 365);
}

function renderResults(data) {
    const s = data.summary;
    const premium = data.premium_insights;
    const advisor = data.advisor || {};
    const assumptions = data.assumptions || {};
    const roi = premium.smart_recommendation;

    // 1. INVESTMENT SUMMARY HERO
    const annualSavings = (premium.savings_forecast.optimal_annual_savings || 0);
    document.getElementById('hero-savings').innerText = `$${annualSavings.toFixed(0)}`;
    
    let heroRec = "Optimal Investment Pathway";
    if (roi.best_capacity === 0) heroRec = "Grid-Optimized Strategy";
    else if (roi.best_capacity > s.battery_throughput_kwh) heroRec = "Asset Expansion Recommended";
    document.getElementById('hero-recommendation').innerText = heroRec;

    const insight = advisor.professional_insight || {};
    document.getElementById('hero-reason').innerText = insight.best_next_action || "Analysis indicates this configuration balances hardware cost with maximum energy savings.";

    // 2. INVESTMENT DECISION BOX
    const statusEl = document.getElementById('decision-status');
    const reasonEl = document.getElementById('decision-reason');
    const confidenceEl = document.getElementById('decision-confidence');
    
    let status = 'WAIT';
    let statusClass = 'status-wait';
    let confidence = 'Medium';
    let decisionReason = "System payback is within commercial thresholds.";

    if (roi.best_capacity === 0) {
        status = 'NO INVESTMENT';
        statusClass = 'status-no';
        confidence = 'High';
        decisionReason = "Grid-only reliance currently offers superior financial protection.";
    } else if (roi.is_payback_favorable) {
        status = 'BUY ASSET';
        statusClass = 'status-buy';
        confidence = roi.payback_years < 10 ? 'High' : 'Medium';
        decisionReason = `Projected ROI achieved in ${roi.payback_years.toFixed(1)} years.`;
    } else {
        status = 'HOLD / MONITOR';
        statusClass = 'status-wait';
        confidence = 'Low';
        decisionReason = "Payback horizon exceeds 20 years; awaiting better hardware pricing.";
    }

    statusEl.innerText = status;
    statusEl.className = `decision-status ${statusClass}`;
    reasonEl.innerText = decisionReason;
    confidenceEl.innerText = confidence;

    // 3. KEY PERFORMANCE INSIGHTS
    const insightsList = document.getElementById('key-insights-list');
    insightsList.innerHTML = `
        <div class="insight-item"><strong>Operational Impact:</strong> ${insight.what}</div>
        <div class="insight-item"><strong>Financial Opportunity:</strong> ${advisor.cost_saving_opportunity || "Strategic shifting of high-energy loads to peak solar hours."}</div>
        <div class="insight-item"><strong>Reliability Profile:</strong> ${advisor.reliability_note || "Standard grid-tied asset resilience."}</div>
        <div class="insight-item"><strong>Solar Utilization:</strong> Your array satisfies ${(s.solar_coverage_percent || 0).toFixed(0)}% of your total energy demand.</div>
    `;

    // 4. PRIORITIZED ACTION PLAN
    const actionPlan = document.getElementById('action-plan');
    if (advisor.action_plan && advisor.action_plan.length > 0) {
        actionPlan.innerHTML = advisor.action_plan.map((step, i) => `
            <div class="action-item">
                <span class="action-num">${i+1}</span>
                <span class="action-text">${step}</span>
            </div>
        `).join('');
    }

    // 5. SEASONAL PERFORMANCE (RESTORED)
    const so = premium.seasonal_outlook;
    document.getElementById('seasonal-grid').innerHTML = `
        <div class="summary-card">
            <span class="summary-label">High-Solar Season (Est.)</span>
            <span class="summary-val">$${so.sunny.daily_cost.toFixed(2)}/day</span>
            <small>${so.sunny.solar_cov.toFixed(0)}% Solar Coverage</small>
        </div>
        <div class="summary-card">
            <span class="summary-label">Low-Solar Season (Est.)</span>
            <span class="summary-val">$${so.cloudy.daily_cost.toFixed(2)}/day</span>
            <small>${so.cloudy.solar_cov.toFixed(0)}% Solar Coverage</small>
        </div>
    `;

    // 6. SENSITIVITY TEST (RESTORED)
    const sen = premium.sensitivity;
    document.getElementById('sensitivity-container').innerHTML = `
        <table class="premium-table">
            <thead>
                <tr>
                    <th>Grid Rate Hike</th>
                    <th>+10%</th>
                    <th>+25%</th>
                    <th>+50%</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Daily Cost Impact</td>
                    <td>$${sen.price_10.toFixed(2)}</td>
                    <td>$${sen.price_25.toFixed(2)}</td>
                    <td>$${sen.price_50.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Monthly Projected</td>
                    <td>+$${((sen.price_10 - s.total_grid_cost) * 30).toFixed(0)}</td>
                    <td>+$${((sen.price_25 - s.total_grid_cost) * 30).toFixed(0)}</td>
                    <td>+$${((sen.price_50 - s.total_grid_cost) * 30).toFixed(0)}</td>
                </tr>
            </tbody>
        </table>
    `;

    // 7. CURRENT ASSET PERFORMANCE (RESTORED SUMMARY)
    const summaryGrid = document.getElementById('summary-grid');
    summaryGrid.innerHTML = `
        <div class="summary-card">
            <span class="summary-label">Solar Coverage</span>
            <span class="summary-val">${(s.solar_coverage_percent || 0).toFixed(1)}%</span>
            <small>Energy met by sun</small>
        </div>
        <div class="summary-card">
            <span class="summary-label">Reliance on Grid</span>
            <span class="summary-val">${(s.grid_dependency_percent || 0).toFixed(1)}%</span>
            <small>Energy from utility</small>
        </div>
        <div class="summary-card">
            <span class="summary-label">Daily Operating Cost</span>
            <span class="summary-val">$${(s.total_operational_cost || 0).toFixed(2)}</span>
            <small>Grid: $${(s.total_grid_cost || 0).toFixed(2)} | Wear: $${(s.battery_degradation_cost || 0).toFixed(2)}</small>
        </div>
        <div class="summary-card">
            <span class="summary-label">Energy Not Supplied</span>
            <span class="summary-val">${(s.total_unmet_demand || 0).toFixed(2)} kWh</span>
            <small>Unmet critical load</small>
        </div>
    `;

    // 8. PROJECTED GRID EXPENSE (RESTORED SAVINGS GRID)
    const sf = premium.savings_forecast;
    document.getElementById('savings-grid').innerHTML = `
        <div class="summary-card">
            <span class="summary-label">Monthly Expense Forecast</span>
            <span class="summary-val">$${(sf.monthly_cost || 0).toFixed(2)}</span>
            <small>Projected utility bill</small>
        </div>
        <div class="summary-card">
            <span class="summary-label">Annual Expense Forecast</span>
            <span class="summary-val">$${(sf.annual_cost || 0).toFixed(2)}</span>
            <small>12-month grid dependency</small>
        </div>
        <div class="summary-card" style="border-color: var(--success-color);">
            <span class="summary-label">Net Annual Savings</span>
            <span class="summary-val" style="color: var(--success-color);">+$${(sf.optimal_annual_savings || 0).toFixed(0)}/yr</span>
            <small>Vs. grid-only baseline</small>
        </div>
    `;

    // 9. RECOMMENDED INVESTMENT (RESTORED ROI BOX)
    const roiBox = document.getElementById('roi-box');
    if (roi.best_capacity > 0) {
        roiBox.innerHTML = `
            <div class="recommendation-item" style="border-left-color: var(--accent-color);">
                <strong>Optimal Asset Size: ${roi.best_capacity} kWh</strong>
                <p style="margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">
                    Estimated Investment: <strong>$${(roi.estimated_system_cost || 0).toFixed(0)}</strong>
                </p>
                <p style="margin-top: 0.5rem; font-size: 1.1rem;">
                    Projected Payback: <strong style="color: var(--accent-color);">${(roi.payback_years || 0).toFixed(1)} Years</strong>
                </p>
                <div class="calculation-footer">* Includes installation and hardware acquisition costs.</div>
            </div>
        `;
    } else {
        roiBox.innerHTML = `<div class="recommendation-item"><strong>ROI Analysis:</strong> Current demand-to-grid ratios favor maintaining your existing setup without further storage investment.</div>`;
    }

    // 10. ENGINEERING DETAILS (CHART + HOURLY)
    renderChart(data.hourly, premium.key_moments);
    const hi = premium.hourly_insights;
    document.getElementById('hourly-insights-grid').innerHTML = `
        <div class="summary-card">
            <span class="summary-label">Peak Cost Reliance</span>
            <span class="summary-val">${String(hi.max_grid_hour).padStart(2, '0')}:00</span>
            <small>Highest grid demand hour</small>
        </div>
        <div class="summary-card">
            <span class="summary-label">Best Charging Window</span>
            <span class="summary-val">${String(hi.peak_charging_hour).padStart(2, '0')}:00</span>
            <small>Maximum solar surplus</small>
        </div>
        <div class="summary-card" style="border-color: var(--warning-color);">
            <span class="summary-label">Lost Savings Opportunity</span>
            <span class="summary-val" style="color: var(--warning-color);">${(hi.total_wasted_solar_kwh || 0).toFixed(1)} kWh/day</span>
            <small>Uncaptured solar energy</small>
        </div>
    `;

    // 11. SCENARIO COMPARISON (RESTORED)
    const sc = premium.scenarios;
    document.getElementById('scenarios-grid').innerHTML = `
        <div class="summary-card">
            <span class="summary-label">Grid Only (Baseline)</span>
            <span class="summary-val">$${sc.baseline.daily_cost.toFixed(2)}/day</span>
            <small>ROI: N/A</small>
        </div>
        <div class="summary-card highlight-card">
            <span class="summary-label">Current Configuration</span>
            <span class="summary-val">$${sc.current.daily_cost.toFixed(2)}/day</span>
            <small>Reliance: ${s.grid_dependency_percent.toFixed(0)}%</small>
        </div>
        <div class="summary-card" style="border-color: var(--success-color);">
            <span class="summary-label">Target Configuration</span>
            <span class="summary-val">$${sc.optimal.daily_cost.toFixed(2)}/day</span>
            <small>Payback: ${roi.payback_years.toFixed(1)}y</small>
        </div>
    `;

    // 12. AUDIT TRAIL (ASSUMPTIONS)
    document.getElementById('assumptions-content').innerHTML = `
        <div class="assumption-chip"><span>Region</span><span>${document.getElementById('country').value}</span></div>
        <div class="assumption-chip"><span>Tariff Basis</span><span>$${assumptions.grid_price}/kWh</span></div>
        <div class="assumption-chip"><span>Hardware Basis</span><span>$${assumptions.battery_cost_per_kwh}/kWh</span></div>
        <div class="assumption-chip"><span>System Reserve</span><span>${(assumptions.battery_min_soc * 100).toFixed(0)}%</span></div>
    `;

    // 13. MODEL NOTES
    const notesContainer = document.getElementById('model-notes-container');
    if (data.model_notes && data.model_notes.length > 0) {
        notesContainer.innerHTML = data.model_notes.map(n => `<div class="model-note-item">${n}</div>`).join('');
        notesContainer.style.display = 'block';
    } else {
        notesContainer.style.display = 'none';
    }

    updatePremiumGate();
}

// Technical Details Toggle Logic
const toggleBtn = document.getElementById('toggle-technical-btn');
if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
        const details = document.getElementById('technical-details');
        const isHidden = details.style.display === 'none';
        details.style.display = isHidden ? 'block' : 'none';
        this.innerHTML = isHidden ? 'Hide Engineering Data &uarr;' : 'View Detailed Engineering Data &darr;';
    });
}

function renderChart(hourlyData, moments) {
    const ctx = document.getElementById('energy-chart').getContext('2d');
    
    // Destroy existing instance if it exists
    if (energyChartInstance) {
        energyChartInstance.destroy();
    }

    const labels = Array.from({length: 24}, (_, i) => `${String(i).padStart(2, '0')}:00`);
    
    // Create annotations for key moments if they exist
    const plugins = {
        legend: { labels: { color: '#c9d1d9' } }
    };

    energyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Demand (kWh)',
                    data: hourlyData.map(h => h.demand),
                    borderColor: '#f85149',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.3
                },
                {
                    label: 'Solar Used (kWh)',
                    data: hourlyData.map(h => h.solar_used),
                    borderColor: '#3fb950',
                    backgroundColor: 'rgba(63, 185, 80, 0.1)',
                    fill: true,
                    borderWidth: 2,
                    tension: 0.3
                },
                {
                    label: 'Grid Used (kWh)',
                    data: hourlyData.map(h => h.grid_used),
                    borderColor: '#58a6ff',
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    tension: 0.3
                },
                {
                    label: 'Battery SOC (kWh)',
                    data: hourlyData.map(h => h.battery_soc_end),
                    borderColor: '#d29922',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    yAxisID: 'y1',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Energy (kWh)', color: '#8b949e' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#8b949e' }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    title: { display: true, text: 'Battery Level (kWh)', color: '#d29922' },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#d29922' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#8b949e' }
                }
            },
            plugins: plugins
        }
    });
}

// ==========================================
// AUTHENTICATION UI MOCK LOGIC
// ==========================================

const authModal = document.getElementById('auth-modal');
const headerSigninBtn = document.getElementById('header-signin-btn');
const unlockBtn = document.getElementById('unlock-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const authStateDiv = document.getElementById('auth-state');
const authForm = document.getElementById('auth-form');
const googleAuthBtn = document.getElementById('google-auth-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const authSubmitBtnText = document.getElementById('auth-btn-text');


function openAuthModal() {
    authModal.classList.add('active');
}

function closeAuthModal() {
    authModal.classList.remove('active');
}

function updatePremiumGate() {
    // Premium logic: check both login status and the 'premium' flag from Firestore
    const isLoggedIn = !!currentUser;
    const isPremium = currentUser && currentUser.isPremium;
    const isEmailVerified = currentUser && (currentUser.emailVerified || currentUser.providerData.some(p => p.providerId === 'google.com'));
    
    // The report is UNLOCKED if the user is authenticated, verified, AND a premium member
    const isActuallyUnlocked = isLoggedIn && isEmailVerified && isPremium;
    
    const advancedContainer = document.getElementById('advanced-container');
    const lockedOverlay = document.getElementById('locked-overlay');
    const lockedMessage = document.querySelector('.locked-message');
    
    if (isActuallyUnlocked) {
        if (advancedContainer) advancedContainer.classList.remove('locked');
        if (lockedOverlay) lockedOverlay.classList.remove('active');
    } else {
        if (advancedContainer) advancedContainer.classList.add('locked');
        if (lockedOverlay) lockedOverlay.classList.add('active');
        
        // Update message based on login state
        const unlockBtn = document.getElementById('unlock-btn');
        const upgradeBtn = document.getElementById('upgrade-premium-btn');
        
        if (!isLoggedIn) {
            lockedMessage.innerText = "Unlock full professional analysis: seasonal forecasting, price sensitivity, and optimized ROI mapping.";
            if (unlockBtn) unlockBtn.style.display = 'flex';
            if (upgradeBtn) upgradeBtn.style.display = 'none';
        } else if (!isEmailVerified) {
            lockedMessage.innerHTML = `Please verify your email to continue. <br><button id="resend-verification-btn" class="secondary" style="margin-top: 1rem; padding: 0.5rem 1rem; font-size: 0.8rem;">Resend Verification Email</button>`;
            if (unlockBtn) unlockBtn.style.display = 'none';
            if (upgradeBtn) upgradeBtn.style.display = 'none';
            
            // Add resend logic
            setTimeout(() => {
                const resendBtn = document.getElementById('resend-verification-btn');
                if (resendBtn) {
                    resendBtn.addEventListener('click', async () => {
                        try {
                            await sendEmailVerification(currentUser);
                            alert("Verification email sent! Please check your inbox and refresh this page once verified.");
                        } catch (err) {
                            alert("Error sending verification: " + err.message);
                        }
                    });
                }
            }, 0);
        } else if (!isPremium) {
            lockedMessage.innerHTML = `
                <div style="background: rgba(255, 255, 255, 0.05); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
                    <p style="margin-bottom: 1rem; font-weight: 500;">Your account is active. Upgrade to Premium to unlock monthly access.</p>
                    <button id="upgrade-premium-btn" class="primary" style="display: flex; align-items: center; gap: 0.5rem; justify-content: center; width: 100%;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        Upgrade to Premium
                    </button>
                    <div style="margin-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1rem; text-align: left;">
                        <p style="font-size: 0.85rem; color: #ffd700; margin-bottom: 0.5rem; font-weight: bold;">⚠️ After Payment:</p>
                        <p style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
                            1. Check your email for a receipt from Gumroad.<br>
                            2. Keep this tab open; it will unlock <strong>automatically</strong>.<br>
                            3. Your 30-day access starts the moment you pay.
                        </p>
                        <button id="confirm-purchase-btn" class="secondary" style="margin-top: 1rem; padding: 0.5rem 1rem; font-size: 0.8rem; width: 100%;">Already Paid? Refresh Status</button>
                    </div>
                </div>
            `;
            if (unlockBtn) unlockBtn.style.display = 'none';
            
            // Add listeners after innerHTML update
            setTimeout(() => {
                const upBtn = document.getElementById('upgrade-premium-btn');
                if (upBtn) upBtn.addEventListener('click', handleUpgradeClick);
                
                const confBtn = document.getElementById('confirm-purchase-btn');
                if (confBtn) confBtn.addEventListener('click', async () => {
                    confBtn.disabled = true;
                    confBtn.textContent = "Checking...";
                    try {
                        const res = await fetch(`${API_BASE_URL}/api/user/status/${currentUser.email}`);
                        const data = await res.json();
                        if (data.premium) {
                            alert("Purchase confirmed! Unlocking features now.");
                            window.location.reload();
                        } else {
                            alert("We couldn't confirm your purchase yet. If you just paid, please wait a minute for the email confirmation and try again.");
                        }
                    } catch (err) {
                        alert("Error checking purchase: " + err.message);
                    } finally {
                        confBtn.disabled = false;
                        confBtn.textContent = "Confirm My Purchase";
                    }
                });
            }, 0);
        }
    }
}

function updateAuthStateUI() {
    if (currentUser) {
        let premiumBadge = '';
        if (currentUser.isPremium) {
            const expiryStr = currentUser.premiumUntil ? currentUser.premiumUntil.toLocaleDateString() : 'Active';
            premiumBadge = `<span class="premium-badge" title="Expires: ${expiryStr}">Premium</span>`;
        }
        
        authStateDiv.innerHTML = `
            <div class="user-info">
                ${premiumBadge}
                <div class="user-email">${currentUser.email}</div>
            </div>
            <button type="button" class="secondary auth-btn" id="header-signout-btn" style="padding: 0.5rem 1rem; font-size: 0.8rem;">Sign Out</button>
        `;
        document.getElementById('header-signout-btn').addEventListener('click', handleSignOut);
    } else {
        authStateDiv.innerHTML = `<button type="button" class="secondary auth-btn" id="header-signin-btn">Sign In</button>`;
        document.getElementById('header-signin-btn').addEventListener('click', openAuthModal);
    }
    updatePremiumGate();
}

let unsubUser = null;

async function handleAuthSuccess(user) {
    currentUser = user;
    closeAuthModal();
    
    // Sync with Firestore
    const userRef = doc(db, "users", user.uid);
    
    // Set basic info if it's a new user (don't overwrite premium status)
    await setDoc(userRef, {
        email: user.email,
        lastLogin: new Date().toISOString()
    }, { merge: true });

    // Listen for real-time changes (e.g. from Gumroad Webhook)
    if (unsubUser) unsubUser();
    unsubUser = onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
            const userData = doc.data();
            const now = new Date();
            let isPremium = userData.premium === true;
            
            // Check for monthly expiry
            if (userData.premiumUntil) {
                const expiryDate = userData.premiumUntil.toDate();
                if (expiryDate < now) {
                    isPremium = false;
                    console.log("Premium subscription expired.");
                } else {
                    currentUser.premiumUntil = expiryDate;
                }
            }
            
            currentUser.isPremium = isPremium;
            updatePremiumGate();
        }
    });

    updateAuthStateUI();
}

function handleSignOut() {
    signOut(auth).then(() => {
        currentUser = null;
        updateAuthStateUI();
    }).catch((error) => {
        console.error("Sign out error", error);
    });
}

// --- Firebase Auth Observer ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
    } else {
        currentUser = null;
    }
    updateAuthStateUI();
});

// Event Listeners
if(headerSigninBtn) headerSigninBtn.addEventListener('click', openAuthModal);
if(unlockBtn) unlockBtn.addEventListener('click', openAuthModal);
if(closeModalBtn) closeModalBtn.addEventListener('click', closeAuthModal);

// Close on outside click
authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeAuthModal();
});

// Tab switching logic
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        authMode = btn.dataset.tab;
        authSubmitBtnText.textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';
    });
});

// Real Firebase Email/Password Auth
authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const btnText = authMode === 'signin' ? 'Signing In...' : 'Creating Account...';
    
    const originalBtnText = authSubmitBtnText.textContent;
    authSubmitBtnText.textContent = btnText;

    if (authMode === 'signup') {
        createUserWithEmailAndPassword(auth, email, password)
            .then(async (userCredential) => {
                // Send verification email immediately
                await sendEmailVerification(userCredential.user);
                alert("Account created! A verification email has been sent. Please verify your email before upgrading to Premium.");
                
                handleAuthSuccess(userCredential.user);
                authSubmitBtnText.textContent = originalBtnText;
                authForm.reset();
            })
            .catch((error) => {
                alert("Error creating account: " + error.message);
                authSubmitBtnText.textContent = originalBtnText;
            });
    } else {
        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                handleAuthSuccess(userCredential.user);
                authSubmitBtnText.textContent = originalBtnText;
                authForm.reset();
            })
            .catch((error) => {
                alert("Login Error: " + error.message);
                authSubmitBtnText.textContent = originalBtnText;
            });
    }
});

// Real Firebase Google Auth
googleAuthBtn.addEventListener('click', () => {
    const originalContent = googleAuthBtn.innerHTML;
    googleAuthBtn.innerHTML = 'Connecting to Google...';
    
    signInWithPopup(auth, googleProvider)
        .then((result) => {
            handleAuthSuccess(result.user);
            googleAuthBtn.innerHTML = originalContent;
        })
        .catch((error) => {
            alert("Google Sign-in Error: " + error.message);
            googleAuthBtn.innerHTML = originalContent;
        });
});

// Download PDF logic
document.getElementById('download-report-btn').addEventListener('click', () => {
    window.print();
});

function handleUpgradeClick() {
    const gumroadUrl = "https://hassansalum.gumroad.com/l/ogoyv";
    const email = currentUser ? currentUser.email : "";
    const uid = currentUser ? currentUser.uid : "";
    
    // Save current form state so it's not lost on redirect/refresh
    saveFormState();
    
    // Inform the user of the flow with more detail
    alert("IMPORTANT: After paying on Gumroad, check your email for a receipt. Your premium status will unlock automatically in this tab within seconds. Do NOT close this tab!");
    
    // Open in a new tab so they don't lose their place in Synex
    window.open(`${gumroadUrl}?email=${encodeURIComponent(email)}&user_id=${encodeURIComponent(uid)}`, '_blank');
}

// Gumroad Upgrade Logic
const upgradePremiumBtn = document.getElementById('upgrade-premium-btn');
if (upgradePremiumBtn) {
    upgradePremiumBtn.addEventListener('click', handleUpgradeClick);
}

// Handle Payment Success Return
async function pollForPremiumStatus(userIdOrEmail) {
    const statusUrl = `${API_BASE_URL}/api/user/status/${userIdOrEmail}`;
    let attempts = 0;
    const maxAttempts = 12; // Poll for 1 minute (5s intervals)
    
    const interval = setInterval(async () => {
        attempts++;
        try {
            const res = await fetch(statusUrl);
            const data = await res.json();
            
            if (data.premium) {
                clearInterval(interval);
                alert("Payment Confirmed! Your account is now Premium. The page will refresh to unlock features.");
                window.location.reload();
            }
        } catch (e) {
            console.error("Polling error:", e);
        }
        
        if (attempts >= maxAttempts) {
            clearInterval(interval);
            console.log("Polling stopped after max attempts.");
        }
    }, 5000);
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('payment') === 'success') {
    // If we have a success redirect, prioritize polling to show immediate feedback
    alert("Payment received! We are confirming your premium status. This usually takes 5-10 seconds...");
    
    // Check if we can identify the user to poll for
    if (currentUser) {
        pollForPremiumStatus(currentUser.uid);
    } else {
        // Fallback: search by email if provided in URL or if they just signed up
        const email = urlParams.get('email');
        if (email) pollForPremiumStatus(email);
    }
    
    // Clean up the URL
    window.history.replaceState({}, document.title, window.location.pathname);
}

// Explanation Modal Close
document.getElementById('close-explanation-btn').addEventListener('click', () => {
    document.getElementById('explanation-modal').classList.remove('active');
});
document.getElementById('close-explanation-footer-btn').addEventListener('click', () => {
    document.getElementById('explanation-modal').classList.remove('active');
});
document.getElementById('explanation-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('explanation-modal')) {
        document.getElementById('explanation-modal').classList.remove('active');
    }
});
