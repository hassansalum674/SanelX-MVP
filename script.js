import { REGION_DEFAULTS } from './profiles/solarProfiles.js';
import { generateSolarArray, generateScaledDemandArray } from './utils/generateProfiles.js';

// Configurable API URL from config.js
const API_URL = window.SYNEX_CONFIG?.API_URL || 'http://localhost:8000/analyze';
let isUnlocked = false;
let currentUser = null;
let energyChartInstance = null;

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

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
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
    
    // Reset unlock state on new analysis
    isUnlocked = false;

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

        const response = await fetch(API_URL, {
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
    const recs = data.recommendations;
    const premium = data.premium_insights;
    const notes = data.model_notes || [];
    const assumptions = data.assumptions || {};
    const advisor = data.advisor || {};

    // 0. Update Advisor Hero
    const insight = advisor.professional_insight || {};
    const scenario = s.weather_scenario || "average";
    const scenarioName = document.querySelector(`#weather_scenario option[value="${scenario}"]`).innerText;
    
    document.getElementById('advisor-weakness').innerText = `${scenarioName}: ${insight.weakness || "Analysis complete."}`;
    document.getElementById('advisor-improvement').innerText = insight.best_next_action || "No specific improvement suggested.";
    document.getElementById('advisor-opportunity').innerText = advisor.cost_saving_opportunity || "--";
    document.getElementById('advisor-reliability').innerText = advisor.reliability_note || "--";

    if (s.sim_days > 1) {
        document.getElementById('advisor-reliability').innerHTML += `<br><small style="color:var(--error-color)">Lowest Storage: ${s.lowest_soc_reached.toFixed(1)}kWh during ${s.sim_days}-day stress test</small>`;
    }

    // Action Plan
    const actionPlan = document.getElementById('action-plan');
    if (advisor.action_plan && advisor.action_plan.length > 0) {
        actionPlan.innerHTML = advisor.action_plan.map((step, i) => `
            <div class="action-item">
                <span class="action-num">${i+1}</span>
                <span class="action-text">${step}</span>
            </div>
        `).join('');
    }

    // Modal Explainer logic
    const explainBtn = document.getElementById('explain-results-btn');
    explainBtn.onclick = () => {
        document.getElementById('explanation-body').innerText = advisor.full_explanation || "Detailed analysis not available.";
        document.getElementById('explanation-modal').classList.add('active');
    };

    // 1. Render Model Notes (Sanity Checks)
    const notesContainer = document.getElementById('model-notes-container');
    if (notes && notes.length > 0) {
        notesContainer.innerHTML = notes.map(n => `<div class="model-note-item">${n}</div>`).join('');
        notesContainer.style.display = 'block';
    } else {
        notesContainer.style.display = 'none';
    }

    // 2. Render Basic Summary
    const summaryGrid = document.getElementById('summary-grid');
    summaryGrid.innerHTML = `
        <div class="summary-card">
            <span class="summary-label">Solar Coverage</span>
            <span class="summary-val">${(s.solar_coverage_percent || 0).toFixed(1)}%</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">Demand met by solar</small>
        </div>
        <div class="summary-card">
            <span class="summary-label">Grid Dependency</span>
            <span class="summary-val">${(s.grid_dependency_percent || 0).toFixed(1)}%</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">Demand met by grid</small>
        </div>
        <div class="summary-card">
            <span class="summary-label">Daily Operational Cost</span>
            <span class="summary-val">$${(s.total_operational_cost || 0).toFixed(2)}</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">Grid: $${(s.total_grid_cost || 0).toFixed(2)} | Wear: $${(s.battery_degradation_cost || 0).toFixed(2)}</small>
        </div>
        <div class="summary-card">
            <span class="summary-label">Unmet Demand</span>
            <span class="summary-val">${(s.total_unmet_demand || 0).toFixed(2)} kWh</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">Energy not supplied</small>
        </div>
    `;

    const previewRec = document.getElementById('preview-recommendation');
    if (recs.length > 0) {
        previewRec.innerHTML = `<div class="recommendation-item" style="border-left-color: var(--accent-color); background: rgba(186, 155, 110, 0.1);"><strong>Insight:</strong> ${recs[0]}</div>`;
    } else {
        previewRec.innerHTML = '';
    }

    // 3. Render Assumptions Panel
    const assumptionsSection = document.getElementById('assumptions-panel');
    const assumptionsContent = document.getElementById('assumptions-content');
    
    // Detailed assumptions for trust
    const country = document.getElementById('country').value;
    const usageType = document.getElementById('usage_type').value;
    const climateType = document.getElementById('climate').value;

    assumptionsContent.innerHTML = `
        <div class="assumption-chip"><span>Region</span><span>${country}</span></div>
        <div class="assumption-chip"><span>Usage Type</span><span>${usageType}</span></div>
        <div class="assumption-chip"><span>Solar Preset</span><span>${climateType}</span></div>
        <div class="assumption-chip"><span>Grid Tariff</span><span>$${assumptions.grid_price}/kWh</span></div>
        <div class="assumption-chip"><span>Batt. Efficiency</span><span>${(assumptions.battery_efficiency * 100).toFixed(0)}%</span></div>
        <div class="assumption-chip"><span>Min. Reserve</span><span>${(assumptions.battery_min_soc * 100).toFixed(0)}%</span></div>
        <div class="assumption-chip"><span>Capital Basis</span><span>$${assumptions.battery_cost_per_kwh}/kWh</span></div>
        <div class="assumption-chip"><span>Analysis Horizon</span><span>24h Simulation</span></div>
    `;
    assumptionsSection.style.display = 'block';

    // 4. Render Premium Charts & Callouts
    renderChart(data.hourly, premium.key_moments);

    // Populate Reliability & Sensitivity
    document.getElementById('reliability-score').innerText = (premium.reliability_score || 0).toFixed(0);
    
    // Seasonal Grid
    const so = premium.seasonal_outlook;
    document.getElementById('seasonal-grid').innerHTML = `
        <div class="summary-card">
            <span class="summary-label">Sunny Season (Est.)</span>
            <span class="summary-val">$${so.sunny.daily_cost.toFixed(2)}/day</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">${so.sunny.solar_cov.toFixed(0)}% Solar Coverage</small>
        </div>
        <div class="summary-card">
            <span class="summary-label">Cloudy Season (Est.)</span>
            <span class="summary-val">$${so.cloudy.daily_cost.toFixed(2)}/day</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">${so.cloudy.solar_cov.toFixed(0)}% Solar Coverage</small>
        </div>
    `;

    // Sensitivity Table
    const sen = premium.sensitivity;
    document.getElementById('sensitivity-container').innerHTML = `
        <table class="premium-table">
            <thead>
                <tr>
                    <th>Grid Tariff Hike</th>
                    <th>+10%</th>
                    <th>+25%</th>
                    <th>+50%</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Daily Expense</td>
                    <td>$${sen.price_10.toFixed(2)}</td>
                    <td>$${sen.price_25.toFixed(2)}</td>
                    <td>$${sen.price_50.toFixed(2)}</td>
                </tr>
                <tr>
                    <td>Est. Monthly Impact</td>
                    <td>+$${((sen.price_10 - s.total_grid_cost) * 30).toFixed(0)}</td>
                    <td>+$${((sen.price_25 - s.total_grid_cost) * 30).toFixed(0)}</td>
                    <td>+$${((sen.price_50 - s.total_grid_cost) * 30).toFixed(0)}</td>
                </tr>
            </tbody>
        </table>
    `;

    // Populate Premium Savings Forecast
    const sf = premium.savings_forecast;
    document.getElementById('savings-grid').innerHTML = `
        <div class="summary-card">
            <span class="summary-label">Monthly Grid Project.</span>
            <span class="summary-val">$${(sf.monthly_cost || 0).toFixed(2)}</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">Pure electricity usage</small>
        </div>
        <div class="summary-card">
            <span class="summary-label">Annual Grid Project.</span>
            <span class="summary-val">$${(sf.annual_cost || 0).toFixed(2)}</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">12-month consumption</small>
        </div>
        <div class="summary-card" style="border-color: var(--success-color);">
            <span class="summary-label">Net Annual Savings</span>
            <span class="summary-val" style="color: var(--success-color);">+$${(sf.optimal_annual_savings || 0).toFixed(0)}/yr</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">Vs. no-battery baseline</small>
        </div>
    `;

    // Populate ROI
    const roi = premium.smart_recommendation;
    const roiBox = document.getElementById('roi-box');
    
    if (roi.best_capacity > 0) {
        let paybackMsg = `<p style="margin-top: 0.5rem; font-size: 1.1rem;">Estimated ROI Payback: <strong style="color: var(--accent-color);">${(roi.payback_years || 0).toFixed(1)} years</strong></p>`;
        if (!roi.is_payback_favorable) {
            paybackMsg = `<p style="margin-top: 0.5rem; font-size: 1rem; color: var(--warning-color);">⚠️ Payback not favorable (>20 yrs)</p>`;
        }

        roiBox.innerHTML = `
            <div class="recommendation-item" style="border-left-color: var(--accent-color);">
                <strong>Optimal Battery Size: ${roi.best_capacity} kWh</strong>
                <p style="margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">
                    Estimated System Capital Cost: <strong>$${(roi.estimated_system_cost || 0).toFixed(0)}</strong>
                </p>
                ${paybackMsg}
                <div class="calculation-footer">* Includes $${assumptions.install_fee || 1500} installation + $${assumptions.battery_cost_per_kwh || 300}/kWh hardware.</div>
            </div>
        `;
    } else {
        roiBox.innerHTML = `<div class="recommendation-item"><strong>ROI Analysis:</strong> Grid-only setup is currently more favorable than battery storage based on your tariffs and demand profile.</div>`;
    }

    // Populate Hourly Deep Insights
    const hi = premium.hourly_insights;
    document.getElementById('hourly-insights-grid').innerHTML = `
        <div class="summary-card">
            <span class="summary-label">Peak Grid Usage</span>
            <span class="summary-val">${String(hi.max_grid_hour).padStart(2, '0')}:00</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">Highest reliance hour</small>
        </div>
        <div class="summary-card">
            <span class="summary-label">Best Charging Time</span>
            <span class="summary-val">${String(hi.peak_charging_hour).padStart(2, '0')}:00</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">Max solar surplus</small>
        </div>
        <div class="summary-card" style="border-color: var(--warning-color);">
            <span class="summary-label">Technical Solar Waste</span>
            <span class="summary-val" style="color: var(--warning-color);">${(hi.total_wasted_solar_kwh || 0).toFixed(1)} kWh/day</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">Lost potential energy</small>
        </div>
    `;

    // Populate Scenarios
    const sc = premium.scenarios;
    const optimalPayback = premium.smart_recommendation.payback_years;
    const currentPayback = currentPaybackYears(s, assumptions); // Helper needed or use logic

    document.getElementById('scenarios-grid').innerHTML = `
        <div class="summary-card">
            <span class="summary-label">${sc.baseline.name}</span>
            <span class="summary-val">$${sc.baseline.daily_cost.toFixed(2)}</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">Grid: 100% | Payback: N/A</small>
        </div>
        <div class="summary-card highlight-card">
            <span class="summary-label">${sc.current.name}</span>
            <span class="summary-val">$${sc.current.daily_cost.toFixed(2)}</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">Grid: ${s.grid_dependency_percent.toFixed(0)}% | ROI: --</small>
        </div>
        <div class="summary-card" style="border-color: var(--success-color);">
            <span class="summary-label">${sc.optimal.name}</span>
            <span class="summary-val">$${sc.optimal.daily_cost.toFixed(2)}</span>
            <small style="color:var(--text-secondary); font-size:0.75rem;">Size: ${premium.smart_recommendation.best_capacity}kWh | ROI: ${optimalPayback.toFixed(1)}y</small>
        </div>
    `;

    // 5. Add Scenario Reasoning
    let scenarioReasoning = `<div style="margin-top: 1.5rem; padding: 1rem; background: rgba(88, 166, 255, 0.05); border-left: 3px solid var(--accent-color); border-radius: 4px;">
        <strong style="display:block; margin-bottom: 0.5rem; color: var(--text-primary);">Why this recommendation?</strong>
        <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.5;">`;
    
    if (premium.smart_recommendation.best_capacity > s.battery_throughput_kwh) {
        scenarioReasoning += `The <strong>Recommended Setup</strong> increases your battery to <strong>${premium.smart_recommendation.best_capacity} kWh</strong>. This cuts your daily grid expense from $${sc.current.daily_cost.toFixed(2)} down to $${sc.optimal.daily_cost.toFixed(2)}, accelerating ROI. `;
    } else if (premium.smart_recommendation.best_capacity === 0) {
        scenarioReasoning += `The <strong>Baseline</strong> (Grid Only) is mathematically superior. Based on your current demand patterns and hardware costs, a battery system does not generate enough daily savings ($${(sc.baseline.daily_cost - sc.optimal.daily_cost).toFixed(2)}/day) to justify the capital expense. `;
    } else {
        scenarioReasoning += `Your <strong>Current Setup</strong> is closely aligned with the optimal mathematical model. The recommended size of ${premium.smart_recommendation.best_capacity} kWh balances the hardware cost against the long-term grid savings, offering a return in ${optimalPayback.toFixed(1)} years. `;
    }

    if (s.weather_scenario === '3day_stress' || s.weather_scenario === 'rainy_week') {
        scenarioReasoning += `Furthermore, during this <strong>stress-test</strong> simulation, a larger battery prevents critical depletion.`;
    }

    scenarioReasoning += `</p></div>`;
    
    // Check if the container exists or create it
    let reasonContainer = document.getElementById('scenario-reasons');
    if (!reasonContainer) {
        reasonContainer = document.createElement('div');
        reasonContainer.id = 'scenario-reasons';
        document.getElementById('scenarios-grid').after(reasonContainer);
    }
    reasonContainer.innerHTML = scenarioReasoning;

    // Manage Lock State
    const advancedContainer = document.getElementById('advanced-container');
    const lockedOverlay = document.getElementById('locked-overlay');
    
    // If the user already paid/unlocked it. (For now, just tying unlock directly to Auth state for MVP gating)
    if (currentUser) {
        isUnlocked = true;
    }

    if (isUnlocked) {
        advancedContainer.classList.remove('locked');
        lockedOverlay.classList.remove('active');
    } else {
        advancedContainer.classList.add('locked');
        lockedOverlay.classList.add('active');
    }
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

let authMode = 'signin'; // 'signin' or 'signup'

function openAuthModal() {
    authModal.classList.add('active');
}

function closeAuthModal() {
    authModal.classList.remove('active');
}

function updateAuthStateUI() {
    if (currentUser) {
        authStateDiv.innerHTML = `
            <div class="user-email">${currentUser.email}</div>
            <button type="button" class="secondary auth-btn" id="header-signout-btn" style="padding: 0.5rem 1rem; font-size: 0.8rem;">Sign Out</button>
        `;
        document.getElementById('header-signout-btn').addEventListener('click', handleSignOut);
        
        // Auto-unlock features once logged in (Simulating the gate drop)
        isUnlocked = true;
        const advancedContainer = document.getElementById('advanced-container');
        const lockedOverlay = document.getElementById('locked-overlay');
        if (advancedContainer) advancedContainer.classList.remove('locked');
        if (lockedOverlay) lockedOverlay.classList.remove('active');
    } else {
        authStateDiv.innerHTML = `<button type="button" class="secondary auth-btn" id="header-signin-btn">Sign In</button>`;
        document.getElementById('header-signin-btn').addEventListener('click', openAuthModal);
        
        isUnlocked = false;
        const advancedContainer = document.getElementById('advanced-container');
        const lockedOverlay = document.getElementById('locked-overlay');
        if (advancedContainer) advancedContainer.classList.add('locked');
        if (lockedOverlay) lockedOverlay.classList.add('active');
    }
}

function handleAuthSuccess(email) {
    currentUser = { email };
    closeAuthModal();
    updateAuthStateUI();
}

function handleSignOut() {
    currentUser = null;
    updateAuthStateUI();
}

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

// Mock Email/Password form submit
authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const btnText = authMode === 'signin' ? 'Signing In...' : 'Creating Account...';
    
    authSubmitBtnText.textContent = btnText;
    const originalBtnContent = authSubmitBtnText.innerHTML;
    
    // Simulate network delay
    setTimeout(() => {
        handleAuthSuccess(email);
        authSubmitBtnText.innerHTML = originalBtnContent; // reset
        authForm.reset();
    }, 800);
});

// Mock Google Auth click
googleAuthBtn.addEventListener('click', () => {
    const originalContent = googleAuthBtn.innerHTML;
    googleAuthBtn.innerHTML = 'Connecting to Google...';
    
    // Simulate network popup delay
    setTimeout(() => {
        handleAuthSuccess("google_user@gmail.com");
        googleAuthBtn.innerHTML = originalContent; // reset
    }, 1000);
});

// Download PDF logic
document.getElementById('download-report-btn').addEventListener('click', () => {
    window.print();
});

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
