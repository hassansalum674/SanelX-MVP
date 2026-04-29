// ═══════════════════════════════════════════════════
// SYNEX v2.3 — Advanced Logic & Interoperability
// ═══════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, onSnapshot, collection, query, where, orderBy, getDocs, addDoc, deleteDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

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

// --- State ---
const API_BASE = window.SYNEX_CONFIG?.API_URL?.replace('/analyze', '') || 'http://localhost:8000';
const ANALYZE_URL = `${API_BASE}/analyze`;
let currentUser = null;
let chartInstance = null;
let monthlyChartInstance = null;
let authMode = 'signin';
let userSettings = { currency: 'USD', solar_cost_preset: 1200, battery_cost_preset: 450 };

// --- Helpers ---
function $(id) { return document.getElementById(id); }
function parseCommaList(str) { return str.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v)); }
function getCurrencySymbol() {
    const syms = {USD:'$',TZS:'Tsh',KES:'Ksh',NGN:'₦',ZAR:'R',EUR:'€',GBP:'£',INR:'₹',AED:'د.إ'};
    return syms[userSettings.currency] || '$';
}

// --- Data ---
const SOLAR_PROFILES = {
    desert:   [0,0,0,0,0,0.02,0.15,0.4,0.7,0.9,0.98,1.0,0.98,0.9,0.7,0.4,0.15,0.02,0,0,0,0,0,0],
    high:     [0,0,0,0,0,0,0.05,0.2,0.5,0.8,0.95,1.0,0.95,0.8,0.5,0.2,0.05,0,0,0,0,0,0,0],
    moderate: [0,0,0,0,0,0,0.02,0.1,0.3,0.55,0.7,0.75,0.7,0.55,0.3,0.1,0.02,0,0,0,0,0,0,0],
    cloudy:   [0,0,0,0,0,0,0.01,0.05,0.15,0.3,0.4,0.42,0.4,0.3,0.15,0.05,0.01,0,0,0,0,0,0,0]
};
const LOAD_PROFILES = {
    residential_day:   [0.4,0.3,0.3,0.3,0.4,0.6,1.0,1.8,1.5,1.2,1.0,0.8,0.7,0.7,0.8,1.0,1.5,2.5,3.5,3.8,3.0,2.0,1.2,0.6],
    residential_night: [0.5,0.4,0.3,0.3,0.3,0.4,0.5,0.6,0.7,0.6,0.5,0.5,0.5,0.5,0.5,0.6,1.0,2.0,3.5,4.5,4.0,3.5,2.5,1.0],
    office:            [0.2,0.2,0.2,0.2,0.2,0.3,0.5,1.5,3.0,3.5,3.5,3.0,2.5,3.0,3.5,3.5,3.0,1.5,0.5,0.3,0.2,0.2,0.2,0.2],
    industrial:        [1.5,1.5,1.5,1.5,1.5,2.0,3.0,4.0,4.5,4.5,4.5,4.0,3.5,4.0,4.5,4.5,4.0,3.0,2.0,1.5,1.5,1.5,1.5,1.5]
};
const HARDWARE_SPECS = {
    tesla_powerwall_2: { capacity: 13.5 },
    byd_battery_box_lv: { capacity: 15.4 },
    pylontech_us3000c: { capacity: 3.55 },
    enphase_iq_10: { capacity: 10.08 }
};
let activeProfile = 'residential_day';

// ═══════════════════════════════════════════
// UI NAVIGATION & INITIALIZATION
// ═══════════════════════════════════════════

function showSection(id) {
    $('analyzer-view').style.display = id === 'analyzer' ? 'block' : 'none';
    $('history-view').style.display = id === 'history' ? 'block' : 'none';
    $('results-view').style.display = id === 'results' ? 'block' : 'none';
    
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const navBtn = id === 'results' ? $('nav-analyzer') : $(`nav-${id}`);
    if (navBtn) navBtn.classList.add('active');
}

$('nav-analyzer')?.addEventListener('click', e => { e.preventDefault(); showSection('analyzer'); });
$('nav-history')?.addEventListener('click', e => { e.preventDefault(); showSection('history'); loadHistory(); });

// Sidebar toggle
const hamburger = $('hamburger-btn');
const backdrop = $('sidebar-backdrop');
const sidebar = $('app-sidebar');
if (hamburger) hamburger.onclick = () => { sidebar.classList.toggle('open'); backdrop.classList.toggle('active'); };
if (backdrop) backdrop.onclick = () => { sidebar.classList.remove('open'); backdrop.classList.remove('active'); };

// Settings
const settingsModal = $('settings-modal');
$('nav-settings')?.addEventListener('click', e => { e.preventDefault(); settingsModal.classList.add('active'); });
$('close-settings-btn')?.addEventListener('click', () => settingsModal.classList.remove('active'));
$('save-settings-btn')?.addEventListener('click', async () => {
    userSettings.currency = $('setting-currency').value;
    userSettings.solar_cost_preset = parseFloat($('setting-solar-cost').value) || 1200;
    userSettings.battery_cost_preset = parseFloat($('setting-battery-cost').value) || 450;
    
    document.querySelectorAll('.currency-symbol').forEach(el => el.innerText = getCurrencySymbol());
    if (currentUser) {
        try { await setDoc(doc(dbFs,"users",currentUser.uid), { settings:userSettings }, { merge:true }); } catch(e) {}
    }
    settingsModal.classList.remove('active');
});

// Profile Tiles
document.querySelectorAll('.profile-tile').forEach(tile => {
    tile.addEventListener('click', () => {
        document.querySelectorAll('.profile-tile').forEach(t => t.classList.remove('active'));
        tile.classList.add('active');
        activeProfile = tile.dataset.profile;
        $('custom-demand-group').style.display = activeProfile === 'custom' ? 'block' : 'none';
    });
});

// Strategy Selector
$('strategy-mode')?.addEventListener('change', (e) => {
    const mode = e.target.value;
    $('strategy-config-shaving').style.display = mode === 'peak_shaving' ? 'block' : 'none';
    $('strategy-config-tou').style.display = mode === 'tou_arbitrage' ? 'block' : 'none';
});

// Hardware Selector
$('battery-model')?.addEventListener('change', (e) => {
    const model = e.target.value;
    if (HARDWARE_SPECS[model]) {
        $('battery-kwh').value = HARDWARE_SPECS[model].capacity;
        $('battery-kwh').style.borderColor = 'var(--success-color)';
        setTimeout(() => { $('battery-kwh').style.borderColor = ''; }, 1000);
    }
});

// Chart Tabs
document.querySelectorAll('.chart-tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.chart-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const isHourly = btn.dataset.chart === 'hourly';
        $('hourly-chart-container').style.display = isHourly ? 'block' : 'none';
        $('monthly-chart-container').style.display = isHourly ? 'none' : 'block';
    };
});

// Engineering Toggle
$('toggle-engineering')?.addEventListener('click', () => {
    const content = $('engineering-content');
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    $('toggle-engineering').querySelector('.fa-chevron-down').style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0)';
});

// ═══════════════════════════════════════════
// ANALYSIS ENGINE
// ═══════════════════════════════════════════

$('analyze-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('analyze-btn');
    const spinner = $('analyze-spinner');
    const btnText = $('analyze-btn-text');
    const errorEl = $('analyze-error');

    btn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    btnText.textContent = 'Processing...';
    errorEl.style.display = 'none';

    try {
        let demand = activeProfile === 'custom' ? parseCommaList($('hourly-demand').value) : LOAD_PROFILES[activeProfile];
        if (!demand || demand.length !== 24) throw new Error('Load profile must have 24 values.');

        const payload = {
            solar_kw: parseFloat($('solar-kw').value) || 0,
            battery_kwh: parseFloat($('battery-kwh').value) || 0,
            initial_battery_kwh: (parseFloat($('battery-initial').value) || 0) / 100 * (parseFloat($('battery-kwh').value) || 1),
            grid_price: parseFloat($('grid-price').value) || 0.15,
            cost_params: {
                solar_cost_kw: userSettings.solar_cost_preset || 1200,
                battery_cost_kwh: userSettings.battery_cost_preset || 450,
                install_fee: 1000,
                maint_pct: 1.0
            },
            hourly_demand: demand,
            hourly_solar_profile: SOLAR_PROFILES[$('climate').value] || SOLAR_PROFILES.high,
            battery_model: $('battery-model').value,
            inverter_model: $('inverter-model').value,
            strategy_mode: $('strategy-mode').value,
            peak_shaving_threshold_kw: parseFloat($('peak-threshold').value) || 5.0,
            tou_peak_start: parseInt($('tou-start').value) || 18,
            tou_peak_end: parseInt($('tou-end').value) || 22,
            weather_outlook: $('weather-outlook').value
        };

        const res = await fetch(ANALYZE_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        if (!res.ok) throw new Error('Backend failed.');
        const data = await res.json();
        
        renderResults(data);
        showSection('results');
        window.scrollTo({ top:0, behavior:'smooth' });

    } catch (err) {
        errorEl.textContent = 'Error: ' + err.message;
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        if (spinner) spinner.style.display = 'none';
        btnText.textContent = 'Analyze System';
    }
});

function renderResults(data) {
    const s = data.summary;
    const p = data.premium_insights;
    const advisor = data.advisor || {};
    const assumptions = data.assumptions || {};
    const roi = p.smart_recommendation;
    const symbol = getCurrencySymbol();

    // KPIs
    $('kpi-daily-cost').innerText = (s.total_operational_cost||0).toFixed(2);
    $('kpi-daily-cost-sub').innerText = `Grid: ${symbol}${(s.total_grid_cost||0).toFixed(2)}`;
    $('kpi-solar').innerText = `${(s.solar_coverage_percent||0).toFixed(0)}%`;
    $('kpi-solar-sub').innerText = `${(s.total_solar_used||0).toFixed(1)} kWh`;
    $('kpi-grid').innerText = `${(s.grid_dependency_percent||0).toFixed(0)}%`;
    $('kpi-grid-sub').innerText = `${(s.total_grid_used||0).toFixed(1)} kWh`;
    
    if (roi.payback_years < 100) {
        $('kpi-payback').innerText = `${roi.payback_years.toFixed(1)}y`;
        $('kpi-payback').style.color = roi.payback_years < 10 ? 'var(--success-color)' : 'var(--warning-color)';
    } else { $('kpi-payback').innerText = 'N/A'; }
    $('kpi-payback-sub').innerText = roi.best_capacity > 0 ? `${roi.best_capacity}kWh optimal` : 'Grid-only best';

    const co2Avoided = (s.total_solar_used||0) * 0.4 * 365;
    $('kpi-co2').innerText = `${Math.round(co2Avoided)}kg`;
    $('kpi-co2-sub').innerText = `≈ ${Math.round(co2Avoided/21)} trees`;

    // Decision
    const statusEl = $('decision-status');
    if (roi.best_capacity === 0) { statusEl.innerText = 'GRID OPTIMIZED'; statusEl.className='decision-status status-no'; }
    else if (roi.is_payback_favorable) { statusEl.innerText = 'BUY ASSET'; statusEl.className='decision-status status-buy'; }
    else { statusEl.innerText = 'HOLD'; statusEl.className='decision-status status-wait'; }
    
    $('decision-reason').innerText = advisor.professional_insight?.best_next_action || 'System balanced.';
    
    const interopScore = getInteropScore($('battery-model').value, $('inverter-model').value);
    $('decision-interop').innerText = `${interopScore}%`;
    $('decision-interop').style.color = interopScore > 80 ? 'var(--success-color)' : 'var(--warning-color)';

    $('decision-savings').innerText = `+${symbol}${(p.savings_forecast.optimal_annual_savings||0).toFixed(0)}/yr`;
    $('decision-battery').innerText = roi.best_capacity > 0 ? `${roi.best_capacity} kWh` : '—';
    $('decision-system-cost').innerText = roi.estimated_system_cost > 0 ? `${symbol}${Math.round(roi.estimated_system_cost)}` : '—';

    // Insights & Smart Advice
    const smartAdvice = getSmartAdvice(data, $('strategy-mode').value);
    const combinedInsights = [...(advisor.action_plan || []).slice(0,2), ...smartAdvice];
    $('key-insights-list').innerHTML = combinedInsights.map(a => `<div class="insight-item"><i class="fas fa-lightbulb" style="color:var(--warning-color)"></i><p>${a}</p></div>`).join('');
    $('action-plan').innerHTML = (advisor.action_plan || []).map((a,i) => `<div class="action-item"><span class="action-num">${i+1}</span><span class="action-text">${a}</span></div>`).join('');

    // Charts
    renderChart(data.hourly);
    if (p.seasonal_outlook?.monthly_forecast) renderMonthlyChart(p.seasonal_outlook.monthly_forecast);

    // Grid Comparison
    const sc = p.scenarios;
    $('scenarios-grid').innerHTML = `
        <div class="summary-card"><span class="summary-label">Grid Baseline</span><span class="summary-val">${symbol}${sc.baseline.daily_cost.toFixed(2)}</span></div>
        <div class="summary-card highlight-card"><span class="summary-label">Your Setup</span><span class="summary-val">${symbol}${sc.current.daily_cost.toFixed(2)}</span></div>
    `;

    // Seasonal
    const so = p.seasonal_outlook;
    $('seasonal-grid').innerHTML = `
        <div class="summary-card"><span class="summary-label">High Sun</span><span class="summary-val">${symbol}${so.sunny.daily_cost.toFixed(2)}</span></div>
        <div class="summary-card"><span class="summary-label">Low Sun</span><span class="summary-val">${symbol}${so.cloudy.daily_cost.toFixed(2)}</span></div>
    `;

    // Sensitivity
    const sen = p.sensitivity;
    $('sensitivity-container').innerHTML = `
        <table class="premium-table">
            <thead><tr><th>Utility Hike</th><th>+10%</th><th>+25%</th></tr></thead>
            <tbody><tr><td>Daily Cost</td><td>${symbol}${sen.price_10.toFixed(2)}</td><td>${symbol}${sen.price_25.toFixed(2)}</td></tr></tbody>
        </table>`;

    // Engineering
    const hi = p.hourly_insights;
    $('hourly-insights-grid').innerHTML = `
        <div class="summary-card"><span class="summary-label">Peak Grid Hour</span><span class="summary-val">${String(hi.max_grid_hour).padStart(2,'0')}:00</span></div>
        <div class="summary-card"><span class="summary-label">Solar Surplus</span><span class="summary-val">${(hi.total_wasted_solar_kwh||0).toFixed(1)} kWh</span></div>
    `;
    $('assumptions-content').innerHTML = `<div class="assumption-chip"><span>Tariff</span><span>${symbol}${assumptions.grid_price}/kWh</span></div>`;

    if (currentUser) saveAnalysisToFirestore(data);
}

// --- Logic Helpers ---
function getInteropScore(batt, inv) {
    if (batt === 'generic_lifepo4' || inv === 'generic') return 85;
    if (inv === 'victron_multiplus_ii_5k' && batt === 'pylontech_us3000c') return 98;
    if (inv === 'huawei_sun2000_6ktl' && batt === 'tesla_powerwall_2') return 70;
    return 90;
}

function getSmartAdvice(data, strategy) {
    const advice = [];
    const h = data.hourly;
    const peakHour = h.reduce((prev, curr) => (prev.demand > curr.demand) ? prev : curr).hour;
    if (strategy === 'self_consumption') {
        advice.push(`Shift heavy loads to ${String(peakHour).padStart(2,'0')}:00 to maximize direct solar.`);
    }
    if (data.summary.total_wasted_solar > 2) {
        advice.push("Significant solar waste detected. Consider larger battery or EV charging.");
    }
    if ($('weather-outlook').value === 'stormy') {
        advice.push("Stormy weather reserve (60%) active to ensure backup.");
    }
    return advice;
}

// ═══════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════

function renderChart(hourly) {
    const ctx = $('energy-chart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type:'line',
        data:{ labels: Array.from({length:24},(_,i)=>`${String(i).padStart(2,'0')}:00`), datasets:[
            { label:'Demand', data:hourly.map(h=>h.demand), borderColor:'#f85149', borderWidth:2, pointRadius:0, tension:0.3 },
            { label:'Solar', data:hourly.map(h=>h.solar_used), borderColor:'#3fb950', backgroundColor:'rgba(63,185,80,0.1)', fill:true, borderWidth:2, pointRadius:0, tension:0.3 },
            { label:'Battery', data:hourly.map(h=>h.battery_soc_end), borderColor:'#d29922', borderWidth:2, pointRadius:0, tension:0.3, yAxisID:'y1' }
        ]},
        options:{ responsive:true, maintainAspectRatio:false, scales:{
            y:{ beginAtZero:true, grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8b949e'} },
            y1:{ beginAtZero:true, position:'right', grid:{drawOnChartArea:false}, ticks:{color:'#d29922'} },
            x:{ grid:{display:false}, ticks:{color:'#8b949e'} }
        }, plugins:{ legend:{labels:{color:'#c9d1d9',boxWidth:12}} }}
    });
}

function renderMonthlyChart(monthlyData) {
    const ctx = $('monthly-forecast-chart').getContext('2d');
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    monthlyChartInstance = new Chart(ctx, {
        type:'bar',
        data:{ labels:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], datasets:[
            { label:'Cost', data:monthlyData.map(d=>d.projected_cost), backgroundColor:'rgba(88,166,255,0.4)', borderRadius:4 }
        ]},
        options:{ responsive:true, maintainAspectRatio:false, scales:{
            y:{ beginAtZero:true, grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8b949e'} },
            x:{ grid:{display:false}, ticks:{color:'#8b949e'} }
        }, plugins:{ legend:{display:false} }}
    });
}

// ═══════════════════════════════════════════
// HISTORY & AUTH
// ═══════════════════════════════════════════

async function saveAnalysisToFirestore(data) {
    try {
        await addDoc(collection(dbFs, "users", currentUser.uid, "history"), {
            timestamp: new Date().toISOString(),
            label: `${$('country').value} — ${$('solar-kw').value}kW / ${$('battery-kwh').value}kWh`,
            data: data,
            inputs: { 
                country:$('country').value, solar:$('solar-kw').value, battery:$('battery-kwh').value, climate:$('climate').value,
                battery_model: $('battery-model').value, inverter_model: $('inverter-model').value,
                strategy_mode: $('strategy-mode').value, weather_outlook: $('weather-outlook').value
            }
        });
    } catch(e) {}
}

async function loadHistory() {
    const list = $('history-list');
    list.innerHTML = '<div class="spinner"></div>';
    if (!currentUser) { list.innerHTML = '<p class="mt-2" style="text-align:center;">Please sign in to view history.</p>'; return; }
    try {
        const q = query(collection(dbFs, "users", currentUser.uid, "history"));
        const snapshot = await getDocs(q);
        if (snapshot.empty) { list.innerHTML = '<p class="mt-2" style="text-align:center;">No saved analyses found.</p>'; return; }
        list.innerHTML = '';
        snapshot.forEach(docSnap => {
            const h = docSnap.data();
            const card = document.createElement('div');
            card.className = 'glass-card';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong>${h.label}</strong>
                    <button class="delete-btn" data-id="${docSnap.id}" style="background:none; border:none; color:var(--text-secondary); cursor:pointer;"><i class="fas fa-trash"></i></button>
                </div>
                <small style="color:var(--text-secondary);">${new Date(h.timestamp).toLocaleDateString()}</small>
                <button class="secondary-btn full-width mt-1 view-past-btn" data-id="${docSnap.id}">View Results</button>
            `;
            list.appendChild(card);
        });
        document.querySelectorAll('.view-past-btn').forEach(btn => btn.onclick = () => viewPast(btn.dataset.id));
        document.querySelectorAll('.delete-btn').forEach(btn => btn.onclick = (e) => { e.stopPropagation(); deleteHistory(btn.dataset.id); });
    } catch(e) { list.innerHTML = '<p>Error loading history.</p>'; }
}

async function viewPast(id) {
    const docSnap = await getDoc(doc(dbFs, "users", currentUser.uid, "history", id));
    if (docSnap.exists()) {
        const h = docSnap.data();
        if (h.inputs) {
            $('country').value = h.inputs.country; $('solar-kw').value = h.inputs.solar;
            $('battery-kwh').value = h.inputs.battery; $('climate').value = h.inputs.climate;
            if (h.inputs.battery_model) $('battery-model').value = h.inputs.battery_model;
            if (h.inputs.inverter_model) $('inverter-model').value = h.inputs.inverter_model;
            if (h.inputs.strategy_mode) $('strategy-mode').value = h.inputs.strategy_mode;
            if (h.inputs.weather_outlook) $('weather-outlook').value = h.inputs.weather_outlook;
        }
        renderResults(h.data); showSection('results');
    }
}

async function deleteHistory(id) {
    if (!confirm('Delete this record?')) return;
    await deleteDoc(doc(dbFs, "users", currentUser.uid, "history", id));
    loadHistory();
}

// --- Auth Boilers ---
function updateAuthUI() {
    const isUser = !!currentUser;
    $('user-profile-nav').style.display = isUser ? 'block' : 'none';
    if (isUser) $('user-email-display').innerText = currentUser.email;
    $('auth-btn-text-nav').innerText = isUser ? 'Sign Out' : 'Sign In';
    $('auth-icon-nav').className = isUser ? 'fas fa-sign-out-alt' : 'fas fa-sign-in-alt';
    $('auth-btn-nav').onclick = (e) => { e.preventDefault(); isUser ? handleSignOut() : openAuthModal(); };
}

onAuthStateChanged(auth, user => { 
    currentUser = user; updateAuthUI(); 
    if (user) {
        getDoc(doc(dbFs, "users", user.uid)).then(d => {
            if (d.exists() && d.data().settings) {
                userSettings = d.data().settings;
                $('setting-currency').value = userSettings.currency;
                document.querySelectorAll('.currency-symbol').forEach(el => el.innerText = getCurrencySymbol());
            }
        });
    }
});

function handleSignOut() { signOut(auth).then(() => { currentUser=null; updateAuthUI(); }); }
function openAuthModal() { $('auth-modal').classList.add('active'); }
function closeAuthModal() { $('auth-modal').classList.remove('active'); }
$('close-modal-btn')?.onclick = closeAuthModal;
$('auth-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const email = $('auth-email').value, pass = $('auth-password').value;
    const action = authMode === 'signup' ? createUserWithEmailAndPassword(auth,email,pass) : signInWithEmailAndPassword(auth,email,pass);
    action.then(r => handleAuthSuccess(r.user)).catch(err => alert(err.message));
});
$('google-auth-btn')?.onclick = () => signInWithPopup(auth, googleProvider).then(r => handleAuthSuccess(r.user));
async function handleAuthSuccess(u) { currentUser=u; closeAuthModal(); await setDoc(doc(dbFs,"users",u.uid),{email:u.email},{merge:true}); updateAuthUI(); }
document.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); authMode=btn.dataset.tab;
    $('auth-submit-btn').innerText = authMode==='signin' ? 'Sign In' : 'Sign Up';
});

// Misc
$('reset-btn')?.onclick = () => { showSection('analyzer'); window.scrollTo({top:0}); };
$('download-report-btn')?.onclick = () => window.print();
