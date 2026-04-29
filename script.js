// ═══════════════════════════════════════════════════
// SYNEX v2.0 — Clean rewrite, no gates, no broken imports
// ═══════════════════════════════════════════════════

// --- Firebase ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyChBYiaxQ2F58C0uBRopU-g6US0E9npLWo",
    authDomain: "sanelx-a681c.firebaseapp.com",
    projectId: "sanelx-a681c",
    storageBucket: "sanelx-a681c.firebasestorage.app",
    messagingSenderId: "429996696902",
    appId: "1:429996696902:web:f49930cd4aedfe78783147"
};
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const dbFs = getFirestore(fbApp);
const googleProvider = new GoogleAuthProvider();

// --- Config ---
const API_BASE = window.SYNEX_CONFIG?.API_URL?.replace('/analyze', '') || 'http://localhost:8000';
const ANALYZE_URL = `${API_BASE}/analyze`;
let currentUser = null;
let chartInstance = null;
let authMode = 'signin';
let userSettings = { currency: 'USD', solar_cost_preset: 1200, battery_cost_preset: 450 };

// --- Solar Profile Generator (inlined, no broken module import) ---
const SOLAR_PROFILES = {
    desert:   [0,0,0,0,0,0.02,0.15,0.4,0.7,0.9,0.98,1.0,0.98,0.9,0.7,0.4,0.15,0.02,0,0,0,0,0,0],
    high:     [0,0,0,0,0,0,0.05,0.2,0.5,0.8,0.95,1.0,0.95,0.8,0.5,0.2,0.05,0,0,0,0,0,0,0],
    moderate: [0,0,0,0,0,0,0.02,0.1,0.3,0.55,0.7,0.75,0.7,0.55,0.3,0.1,0.02,0,0,0,0,0,0,0],
    cloudy:   [0,0,0,0,0,0,0.01,0.05,0.15,0.3,0.4,0.42,0.4,0.3,0.15,0.05,0.01,0,0,0,0,0,0,0]
};
function getSolarProfile(climate) { return SOLAR_PROFILES[climate] || SOLAR_PROFILES.high; }

// --- Load Profile Templates ---
const LOAD_PROFILES = {
    residential_day:   [0.4,0.3,0.3,0.3,0.4,0.6,1.0,1.8,1.5,1.2,1.0,0.8,0.7,0.7,0.8,1.0,1.5,2.5,3.5,3.8,3.0,2.0,1.2,0.6],
    residential_night: [0.5,0.4,0.3,0.3,0.3,0.4,0.5,0.6,0.7,0.6,0.5,0.5,0.5,0.5,0.5,0.6,1.0,2.0,3.5,4.5,4.0,3.5,2.5,1.0],
    office:            [0.2,0.2,0.2,0.2,0.2,0.3,0.5,1.5,3.0,3.5,3.5,3.0,2.5,3.0,3.5,3.5,3.0,1.5,0.5,0.3,0.2,0.2,0.2,0.2],
    industrial:        [1.5,1.5,1.5,1.5,1.5,2.0,3.0,4.0,4.5,4.5,4.5,4.0,3.5,4.0,4.5,4.5,4.0,3.0,2.0,1.5,1.5,1.5,1.5,1.5]
};
let activeProfile = 'residential_day';

// --- CO2 Emission Factors (kg CO2 per kWh grid) by country ---
const CO2_FACTORS = { Tanzania:0.35, Kenya:0.25, Nigeria:0.45, "South Africa":0.9, India:0.7, UAE:0.42, USA:0.38, Custom:0.5 };

// --- Region Cost Presets ---
const REGION_COSTS = {
    USA:{solar:2800,batt:600,inst:2500}, Tanzania:{solar:1200,batt:350,inst:800},
    Nigeria:{solar:1400,batt:400,inst:1000}, "South Africa":{solar:1600,batt:450,inst:1200},
    Kenya:{solar:1300,batt:380,inst:900}, India:{solar:800,batt:300,inst:500},
    UAE:{solar:1100,batt:320,inst:700}
};

// ═══════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════

function $(id) { return document.getElementById(id); }
function parseCommaList(str) { return str.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v)); }

// Mobile sidebar toggle
const hamburger = $('hamburger-btn');
const backdrop = $('sidebar-backdrop');
const sidebar = $('app-sidebar');
if (hamburger) hamburger.onclick = () => { sidebar.classList.toggle('open'); backdrop.classList.toggle('active'); };
if (backdrop) backdrop.onclick = () => { sidebar.classList.remove('open'); backdrop.classList.remove('active'); };

// Settings modal
const settingsModal = $('settings-modal');
$('nav-settings')?.addEventListener('click', e => { e.preventDefault(); settingsModal.classList.add('active'); });
$('close-settings-btn')?.addEventListener('click', () => settingsModal.classList.remove('active'));
settingsModal?.addEventListener('click', e => { if (e.target === settingsModal) settingsModal.classList.remove('active'); });

$('save-settings-btn')?.addEventListener('click', async () => {
    userSettings.currency = $('setting-currency').value;
    userSettings.solar_cost_preset = parseFloat($('setting-solar-cost').value) || 1200;
    userSettings.battery_cost_preset = parseFloat($('setting-battery-cost').value) || 450;
    const syms = {USD:'$',TZS:'Tsh',KES:'Ksh',NGN:'₦',ZAR:'R',EUR:'€',GBP:'£',INR:'₹',AED:'د.إ'};
    document.querySelectorAll('.currency-symbol').forEach(el => el.innerText = syms[userSettings.currency]||'$');
    if (currentUser) {
        try { await fetch(`${API_BASE}/api/user/settings/${currentUser.uid}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(userSettings) }); } catch(e) {}
    }
    settingsModal.classList.remove('active');
});

// Profile tile selection
document.querySelectorAll('.profile-tile').forEach(tile => {
    tile.addEventListener('click', () => {
        document.querySelectorAll('.profile-tile').forEach(t => t.classList.remove('active'));
        tile.classList.add('active');
        activeProfile = tile.dataset.profile;
        const customGroup = $('custom-demand-group');
        if (activeProfile === 'custom') {
            customGroup.style.display = 'block';
        } else {
            customGroup.style.display = 'none';
        }
    });
});

// ═══════════════════════════════════════════
// FORM SUBMISSION — THE CORE
// ═══════════════════════════════════════════

$('analyze-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('analyze-btn');
    const spinner = $('analyze-spinner');
    const btnText = $('analyze-btn-text');
    const errorEl = $('analyze-error');

    btn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    btnText.textContent = 'Analyzing…';
    errorEl.style.display = 'none';

    try {
        // Build demand array
        let demand;
        if (activeProfile === 'custom') {
            demand = parseCommaList($('hourly-demand').value);
            if (demand.length !== 24) throw new Error('Custom demand must have exactly 24 values.');
        } else {
            demand = LOAD_PROFILES[activeProfile];
        }

        const payload = {
            solar_kw: parseFloat($('solar-kw').value) || 5,
            battery_kwh: parseFloat($('battery-kwh').value) || 10,
            initial_battery_kwh: (parseFloat($('battery-initial').value) || 50) / 100 * (parseFloat($('battery-kwh').value) || 10),
            grid_price: parseFloat($('grid-price').value) || 0.15,
            cost_params: {
                solar_cost_kw: userSettings.solar_cost_preset || 1200,
                battery_cost_kwh: userSettings.battery_cost_preset || 450,
                install_fee: (REGION_COSTS[$('country').value] || {}).inst || 1000,
                maint_pct: 1.0
            },
            hourly_demand: demand,
            hourly_solar_profile: getSolarProfile($('climate').value)
        };

        const res = await fetch(ANALYZE_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.detail || err.message || `Server error ${res.status}`); }
        const data = await res.json();
        renderResults(data);
        $('results-area').style.display = 'block';
        $('results-area').scrollIntoView({ behavior:'smooth' });

    } catch (err) {
        errorEl.textContent = '⚠ ' + err.message;
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        if (spinner) spinner.style.display = 'none';
        btnText.textContent = 'Analyze System';
    }
});

// ═══════════════════════════════════════════
// RENDER RESULTS — ALL OPEN, NO GATES
// ═══════════════════════════════════════════

function renderResults(data) {
    const s = data.summary;
    const p = data.premium_insights;
    const advisor = data.advisor || {};
    const assumptions = data.assumptions || {};
    const roi = p.smart_recommendation;
    const insight = advisor.professional_insight || {};
    const country = $('country').value;

    // --- KPI Cards ---
    $('kpi-daily-cost').innerText = `$${(s.total_operational_cost||0).toFixed(2)}`;
    $('kpi-daily-cost-sub').innerText = `Grid: $${(s.total_grid_cost||0).toFixed(2)}`;
    $('kpi-solar').innerText = `${(s.solar_coverage_percent||0).toFixed(0)}%`;
    $('kpi-solar-sub').innerText = `${(s.total_solar_used||0).toFixed(1)} kWh used`;
    const kpiGrid = document.querySelector('#kpi-grid .kpi-value[id="kpi-grid"]') || document.querySelectorAll('.kpi-value')[2];
    if (kpiGrid) { kpiGrid.innerText = `${(s.grid_dependency_percent||0).toFixed(0)}%`; }
    $('kpi-grid-sub').innerText = `${(s.total_grid_used||0).toFixed(1)} kWh drawn`;

    if (roi.payback_years && roi.payback_years < 100) {
        $('kpi-payback').innerText = `${roi.payback_years.toFixed(1)} yr`;
        $('kpi-payback').style.color = roi.payback_years < 10 ? 'var(--success-color)' : roi.payback_years < 20 ? 'var(--warning-color)' : 'var(--error-color)';
    } else { $('kpi-payback').innerText = 'N/A'; }
    $('kpi-payback-sub').innerText = roi.best_capacity > 0 ? `${roi.best_capacity} kWh optimal` : 'Grid-only best';

    // CO2
    const co2Factor = CO2_FACTORS[country] || 0.5;
    const gridOnlyDemand = s.total_demand || 0;
    const solarUsed = s.total_solar_used || 0;
    const co2Avoided = solarUsed * co2Factor * 365;
    $('kpi-co2').innerText = `${co2Avoided.toFixed(0)} kg/yr`;
    $('kpi-co2-sub').innerText = `≈ ${Math.round(co2Avoided/21)} trees planted`;

    // --- Decision Box ---
    const statusEl = $('decision-status');
    let status, cls;
    if (roi.best_capacity === 0) { status='GRID OPTIMIZED'; cls='status-no'; }
    else if (roi.is_payback_favorable) { status='INVEST'; cls='status-buy'; }
    else { status='HOLD'; cls='status-wait'; }
    statusEl.innerText = status;
    statusEl.className = `decision-status ${cls}`;
    $('decision-reason').innerText = insight.best_next_action || 'System is performing within expected parameters.';
    $('decision-confidence').innerText = roi.is_payback_favorable && roi.payback_years < 10 ? 'High' : roi.is_payback_favorable ? 'Medium' : 'Low';
    $('decision-savings').innerText = `+$${(p.savings_forecast.optimal_annual_savings||0).toFixed(0)}/yr`;
    $('decision-battery').innerText = roi.best_capacity > 0 ? `${roi.best_capacity} kWh` : '—';
    $('decision-system-cost').innerText = roi.estimated_system_cost > 0 ? `$${roi.estimated_system_cost.toFixed(0)}` : '—';

    // --- Key Insights ---
    $('key-insights-list').innerHTML = `
        <div class="insight-item"><i class="fas fa-bolt"></i><div><strong>What's Happening</strong><p>${insight.what||'System balanced.'}</p></div></div>
        <div class="insight-item"><i class="fas fa-search"></i><div><strong>Root Cause</strong><p>${insight.why||'Matched to demand.'}</p></div></div>
        <div class="insight-item"><i class="fas fa-exclamation-triangle"></i><div><strong>Weakness</strong><p>${insight.weakness||'None detected.'}</p></div></div>
        <div class="insight-item"><i class="fas fa-shield-alt"></i><div><strong>Reliability</strong><p>${advisor.reliability_note||'Standard grid-tied.'}</p></div></div>
    `;

    // --- Chart ---
    renderChart(data.hourly);

    // --- Scenarios ---
    const sc = p.scenarios;
    $('scenarios-grid').innerHTML = `
        <div class="summary-card"><span class="summary-label">Grid Only</span><span class="summary-val">$${sc.baseline.daily_cost.toFixed(2)}/day</span></div>
        <div class="summary-card highlight-card"><span class="summary-label">Your Setup</span><span class="summary-val">$${sc.current.daily_cost.toFixed(2)}/day</span></div>
        <div class="summary-card" style="border-color:var(--success-color)"><span class="summary-label">Optimal</span><span class="summary-val">$${sc.optimal.daily_cost.toFixed(2)}/day</span></div>
    `;

    // --- Seasonal ---
    const so = p.seasonal_outlook;
    $('seasonal-grid').innerHTML = `
        <div class="summary-card"><span class="summary-label">High-Solar Season</span><span class="summary-val">$${so.sunny.daily_cost.toFixed(2)}/day</span><small>${so.sunny.solar_cov.toFixed(0)}% coverage</small></div>
        <div class="summary-card"><span class="summary-label">Low-Solar Season</span><span class="summary-val">$${so.cloudy.daily_cost.toFixed(2)}/day</span><small>${so.cloudy.solar_cov.toFixed(0)}% coverage</small></div>
    `;

    // --- Sensitivity ---
    const sen = p.sensitivity;
    $('sensitivity-container').innerHTML = `<table class="premium-table"><thead><tr><th>Scenario</th><th>+10%</th><th>+25%</th><th>+50%</th></tr></thead><tbody>
        <tr><td>Daily Cost</td><td>$${sen.price_10.toFixed(2)}</td><td>$${sen.price_25.toFixed(2)}</td><td>$${sen.price_50.toFixed(2)}</td></tr>
        <tr><td>Monthly Δ</td><td>+$${((sen.price_10-s.total_grid_cost)*30).toFixed(0)}</td><td>+$${((sen.price_25-s.total_grid_cost)*30).toFixed(0)}</td><td>+$${((sen.price_50-s.total_grid_cost)*30).toFixed(0)}</td></tr>
    </tbody></table>`;

    // --- Action Plan ---
    const plan = advisor.action_plan || [];
    $('action-plan').innerHTML = plan.map((s,i) => `<div class="action-item"><span class="action-num">${i+1}</span><span class="action-text">${s}</span></div>`).join('');

    // --- Hourly Insights ---
    const hi = p.hourly_insights;
    $('hourly-insights-grid').innerHTML = `
        <div class="summary-card"><span class="summary-label">Peak Grid Hour</span><span class="summary-val">${String(hi.max_grid_hour).padStart(2,'0')}:00</span></div>
        <div class="summary-card"><span class="summary-label">Best Charge Window</span><span class="summary-val">${String(hi.peak_charging_hour).padStart(2,'0')}:00</span></div>
        <div class="summary-card" style="border-color:var(--warning-color)"><span class="summary-label">Wasted Solar</span><span class="summary-val" style="color:var(--warning-color)">${(hi.total_wasted_solar_kwh||0).toFixed(1)} kWh</span></div>
    `;

    // --- Model Notes ---
    const nc = $('model-notes-container');
    if (data.model_notes?.length) { nc.innerHTML = data.model_notes.map(n=>`<div class="model-note-item">${n}</div>`).join(''); nc.style.display='block'; }
    else { nc.style.display='none'; }

    // --- Assumptions ---
    $('assumptions-content').innerHTML = `
        <div class="assumption-chip"><span>Region</span><span>${country}</span></div>
        <div class="assumption-chip"><span>Grid Tariff</span><span>$${assumptions.grid_price}/kWh</span></div>
        <div class="assumption-chip"><span>Battery Cost</span><span>$${assumptions.battery_cost_per_kwh}/kWh</span></div>
        <div class="assumption-chip"><span>Min SoC</span><span>${(assumptions.battery_min_soc*100).toFixed(0)}%</span></div>
    `;
}

// ═══════════════════════════════════════════
// CHART
// ═══════════════════════════════════════════

function renderChart(hourly) {
    const ctx = $('energy-chart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    const labels = Array.from({length:24},(_,i)=>`${String(i).padStart(2,'0')}:00`);
    chartInstance = new Chart(ctx, {
        type:'line',
        data:{ labels, datasets:[
            { label:'Demand', data:hourly.map(h=>h.demand), borderColor:'#f85149', borderWidth:2, tension:0.3, pointRadius:0 },
            { label:'Solar Used', data:hourly.map(h=>h.solar_used), borderColor:'#3fb950', backgroundColor:'rgba(63,185,80,0.08)', fill:true, borderWidth:2, tension:0.3, pointRadius:0 },
            { label:'Grid Used', data:hourly.map(h=>h.grid_used), borderColor:'#58a6ff', borderDash:[5,5], borderWidth:2, tension:0.3, pointRadius:0 },
            { label:'Battery SoC', data:hourly.map(h=>h.battery_soc_end), borderColor:'#d29922', borderWidth:2, yAxisID:'y1', tension:0.3, pointRadius:0 }
        ]},
        options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
            scales:{
                y:{ beginAtZero:true, title:{display:true,text:'kWh',color:'#8b949e'}, grid:{color:'rgba(255,255,255,0.06)'}, ticks:{color:'#8b949e'} },
                y1:{ beginAtZero:true, position:'right', title:{display:true,text:'Battery (kWh)',color:'#d29922'}, grid:{drawOnChartArea:false}, ticks:{color:'#d29922'} },
                x:{ grid:{color:'rgba(255,255,255,0.06)'}, ticks:{color:'#8b949e',maxRotation:0,autoSkip:true,maxTicksLimit:12} }
            },
            plugins:{ legend:{labels:{color:'#c9d1d9',usePointStyle:true,padding:16}} }
        }
    });
}

// ═══════════════════════════════════════════
// AUTH (kept simple, no premium gating)
// ═══════════════════════════════════════════

const authModal = $('auth-modal');
function openAuthModal() { authModal.classList.add('active'); }
function closeAuthModal() { authModal.classList.remove('active'); }
$('close-modal-btn')?.addEventListener('click', closeAuthModal);
authModal?.addEventListener('click', e => { if(e.target===authModal) closeAuthModal(); });
$('nav-account')?.addEventListener('click', e => { e.preventDefault(); if(!currentUser) openAuthModal(); });

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        authMode = btn.dataset.tab;
        $('auth-submit-btn').textContent = authMode==='signin' ? 'Sign In' : 'Create Account';
    });
});

// Email/Password
$('auth-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const email = $('auth-email').value, pass = $('auth-password').value;
    const action = authMode==='signup' ? createUserWithEmailAndPassword(auth,email,pass) : signInWithEmailAndPassword(auth,email,pass);
    action.then(r => handleAuthSuccess(r.user)).catch(err => alert(err.message));
});

// Google
$('google-auth-btn')?.addEventListener('click', () => {
    signInWithPopup(auth, googleProvider).then(r => handleAuthSuccess(r.user)).catch(err => alert(err.message));
});

async function handleAuthSuccess(user) {
    currentUser = user;
    closeAuthModal();
    await setDoc(doc(dbFs,"users",user.uid), { email:user.email, lastLogin:new Date().toISOString() }, { merge:true });
    updateAuthUI();
}

function handleSignOut() {
    signOut(auth).then(() => { currentUser=null; updateAuthUI(); });
}

function updateAuthUI() {
    const profileNav = $('user-profile-nav');
    const emailDisp = $('user-email-display');
    const authBtn = $('auth-btn-nav');
    const authText = $('auth-btn-text-nav');
    const authIcon = $('auth-icon-nav');

    if (currentUser) {
        if(profileNav) profileNav.style.display='block';
        if(emailDisp) emailDisp.innerText = currentUser.email;
        if(authText) authText.innerText = 'Sign Out';
        if(authIcon) authIcon.className = 'fas fa-sign-out-alt';
        if(authBtn) authBtn.onclick = e => { e.preventDefault(); handleSignOut(); };
    } else {
        if(profileNav) profileNav.style.display='none';
        if(authText) authText.innerText = 'Sign In';
        if(authIcon) authIcon.className = 'fas fa-sign-in-alt';
        if(authBtn) authBtn.onclick = e => { e.preventDefault(); openAuthModal(); };
    }
}

onAuthStateChanged(auth, user => { currentUser = user || null; updateAuthUI(); });

// ═══════════════════════════════════════════
// MISC
// ═══════════════════════════════════════════

$('download-report-btn')?.addEventListener('click', () => window.print());
$('reset-btn')?.addEventListener('click', () => { $('results-area').style.display='none'; window.scrollTo({top:0,behavior:'smooth'}); });
