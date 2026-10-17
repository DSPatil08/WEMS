/* ============================================================
   Fleet Checkpoint — app.js
   Cloud database: Google Firebase Firestore
   Real-time sync across all devices — no backend server needed.

   SETUP: Replace the FIREBASE_CONFIG values below with your
   own project credentials from the Firebase Console.
   See README.md for step-by-step instructions.
   ============================================================ */

'use strict';

// ── STEP 1: Paste your Firebase config here ─────────────────
//  Firebase Console → Project Settings → Your apps → SDK setup & config
const FIREBASE_CONFIG = {
  apiKey:            "PASTE_YOUR_API_KEY_HERE",
  authDomain:        "PASTE_YOUR_AUTH_DOMAIN_HERE",
  projectId:         "PASTE_YOUR_PROJECT_ID_HERE",
  storageBucket:     "PASTE_YOUR_STORAGE_BUCKET_HERE",
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID_HERE",
  appId:             "PASTE_YOUR_APP_ID_HERE"
};
// ────────────────────────────────────────────────────────────

const CHECK_ITEMS = [
  "Tires & Wheels",
  "Brakes",
  "Lights & Horn",
  "Hydraulics / Forks",
  "Fuel / Battery Level",
  "Leaks (Oil / Hydraulic)",
  "Safety Belt",
  "Fire Extinguisher"
];

// ── App state ──────────────────────────────────────────────
let firestoreDB   = null;
let checkerName   = localStorage.getItem('fleet_checker_name') || '';
let view          = 'submit';
let defectFilter  = 'open';
let itemState     = {};
let selectedVehicle = null;
let driverInput   = '';
let opDraftName   = '';
let pendingPhoto  = null;
let vehDraftName  = '';
let vehDraftType  = '';

// Live data arrays — updated by Firestore real-time listeners
let vehicles    = [];
let operators   = [];
let checkpoints = [];
let defects     = [];

// ── Utilities ──────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function pad(n) { return String(n).padStart(2, '0'); }

function nowParts() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    iso:  d.toISOString()
  };
}

function findOperator(name) {
  const n = (name || '').trim().toLowerCase();
  if (!n) return null;
  return operators.find(o => (o.name || '').trim().toLowerCase() === n) || null;
}

// Resize photo to max 160 px, JPEG 75% — keeps Firestore doc well under 1 MB
function compressPhoto(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
    img.onload  = () => {
      try {
        const MAX = 160;
        const s   = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const c   = document.createElement('canvas');
        c.width   = Math.max(1, Math.round(img.naturalWidth  * s));
        c.height  = Math.max(1, Math.round(img.naturalHeight * s));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.75));
      } catch(e) { rej(e); }
    };
    img.src = url;
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Firebase config check ──────────────────────────────────
function isConfigured() {
  return Object.values(FIREBASE_CONFIG).every(v => v && !v.startsWith('PASTE_'));
}

// ── Boot ───────────────────────────────────────────────────
function boot() {
  CHECK_ITEMS.forEach(i => itemState[i] = { status: 'OK', notes: '', severity: 'Minor' });

  if (!isConfigured()) {
    renderNav();
    showSetupScreen();
    return;
  }

  // Initialise Firebase
  firebase.initializeApp(FIREBASE_CONFIG);
  firestoreDB = firebase.firestore();

  // Real-time Firestore listeners — update local arrays and re-render
  firestoreDB.collection('vehicles')
    .onSnapshot(snap => {
      vehicles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (['submit','vehicles'].includes(view)) render();
    }, err => console.error('vehicles listener:', err));

  firestoreDB.collection('operators')
    .orderBy('name')
    .onSnapshot(snap => {
      operators = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (['submit','operators'].includes(view)) render();
    }, err => console.error('operators listener:', err));

  firestoreDB.collection('checkpoints')
    .orderBy('reportedAt', 'desc').limit(300)
    .onSnapshot(snap => {
      checkpoints = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (view === 'export') render();
    }, err => console.error('checkpoints listener:', err));

  firestoreDB.collection('defects')
    .orderBy('reportedAt', 'desc').limit(600)
    .onSnapshot(snap => {
      defects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (['defects','vehicles','export'].includes(view)) render();
    }, err => console.error('defects listener:', err));

  renderNav();

  if (!checkerName) {
    showCheckerModal();
  } else {
    render();
  }
}

// ── Setup screen (Firebase not yet configured) ─────────────
function showSetupScreen() {
  document.getElementById('main').innerHTML = `
  <div class="card setup-card">
    <h2>⚙️ Firebase setup required</h2>
    <p class="muted">Open <strong>app.js</strong> and replace the FIREBASE_CONFIG values at the top with your own project credentials. Follow these steps:</p>

    <div class="step">
      <div class="step-num">1</div>
      <div class="step-body">
        Go to <a href="https://console.firebase.google.com/" target="_blank">console.firebase.google.com</a>
        and click <strong>Add project</strong>. Give it any name (e.g. <em>fleet-checkpoint</em>).
      </div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-body">
        Inside your project, go to <strong>Firestore Database → Create database</strong>.
        Choose <em>Production mode</em>, pick the closest server region, and click Enable.
      </div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-body">
        In Firestore → <strong>Rules</strong> tab, paste and publish these rules so the app can read and write:
        <code>rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}</code>
        <span class="muted">For production, restrict access using Firebase Authentication (see README).</span>
      </div>
    </div>
    <div class="step">
      <div class="step-num">4</div>
      <div class="step-body">
        Go to <strong>Project Settings (⚙️) → Your apps → Add app → Web (&lt;/&gt;)</strong>.
        Register the app, then copy the <code>firebaseConfig</code> object shown.
      </div>
    </div>
    <div class="step">
      <div class="step-num">5</div>
      <div class="step-body">
        Open <strong>app.js</strong>, find <code>const FIREBASE_CONFIG = {…}</code> at the top,
        and replace each <code>PASTE_YOUR_…_HERE</code> value with the matching value from step 4.
        Save the file, reload the page — you're live!
      </div>
    </div>
  </div>`;
}

// ── Checker name modal (first run on a new device) ─────────
function showCheckerModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Welcome</h2>
      <p>Enter your name. This identifies you as the checker on this device and is saved locally.</p>
      <label>Your name</label>
      <input type="text" id="checkerInput" placeholder="e.g. Ravi Kumar" style="margin-bottom:14px;">
      <button class="primary" id="checkerSave" style="margin-top:0;">Start</button>
    </div>`;
  document.body.appendChild(overlay);
  const input = document.getElementById('checkerInput');
  const save  = document.getElementById('checkerSave');
  input.focus();
  const go = () => {
    const val = input.value.trim();
    if (!val) { input.style.borderColor = 'var(--bad)'; return; }
    checkerName = val;
    localStorage.setItem('fleet_checker_name', val);
    document.body.removeChild(overlay);
    render();
  };
  save.addEventListener('click', go);
  input.addEventListener('keydown', e => e.key === 'Enter' && go());
}

// ── Navigation ─────────────────────────────────────────────
function renderNav() {
  const tabs = [
    ['submit',    'Checkpoint'],
    ['defects',   'Defect Log'],
    ['operators', 'Operators'],
    ['vehicles',  'Vehicles'],
    ['export',    'Export']
  ];
  document.getElementById('nav').innerHTML =
    tabs.map(([k, l]) =>
      `<button data-tab="${k}" class="${view === k ? 'active' : ''}">${l}</button>`
    ).join('');
  document.querySelectorAll('nav button').forEach(b =>
    b.addEventListener('click', () => {
      view = b.dataset.tab;
      if (!isConfigured()) { renderNav(); showSetupScreen(); return; }
      renderNav();
      render();
    })
  );
}

// ── Main render dispatcher ─────────────────────────────────
function render() {
  const m = document.getElementById('main');
  if (view === 'submit')    m.innerHTML = renderSubmit();
  if (view === 'defects')   m.innerHTML = renderDefects();
  if (view === 'operators') m.innerHTML = renderOperators();
  if (view === 'vehicles')  m.innerHTML = renderVehicles();
  if (view === 'export')    m.innerHTML = renderExport();
  wireView();
}

// ── Checkpoint form ────────────────────────────────────────
function matchHTML() {
  const t  = driverInput.trim();
  if (!t) return `<p class="muted" style="margin-top:8px;">Type the driver's name to load their details.</p>`;
  const op = findOperator(t);
  if (!op) return `<div class="nomatch">No operator named "${esc(t)}" found. Add them in the Operators tab first.</div>`;
  return `
    <div class="opcard">
      ${op.photo
        ? `<img src="${op.photo}" alt="Operator photo">`
        : `<div class="thumb none" style="width:72px;height:72px;">No photo</div>`}
      <div>
        <div class="muted">Operator on record</div>
        <strong>${esc(op.name)}</strong>
      </div>
    </div>`;
}

function renderSubmit() {
  const np    = nowParts();
  const vOpts = vehicles.map(v =>
    `<option value="${esc(v.id)}" ${selectedVehicle === v.id ? 'selected' : ''}>${esc(v.name)} — ${esc(v.type)}</option>`
  ).join('');
  const veh   = vehicles.find(v => v.id === selectedVehicle);
  const dl    = operators.map(o => `<option value="${esc(o.name)}"></option>`).join('');

  return `
  <div class="card">
    <h2>Daily checkpoint</h2>
    <p class="muted">Date, time and checker are filled automatically. Data saves instantly to the cloud.</p>

    <div class="row2" style="margin-top:10px;">
      <div class="auto"><span>Date</span><span>${np.date}</span></div>
      <div class="auto"><span>Time</span><span>${np.time}</span></div>
    </div>
    <div class="auto" style="margin-top:8px;"><span>Checker</span><span>${esc(checkerName)}</span></div>

    <label>Vehicle / Equipment</label>
    <select id="vehSel">
      <option value="">${vehicles.length ? 'Select vehicle…' : 'No vehicles yet — add one in Vehicles tab'}</option>
      ${vOpts}
    </select>
    ${veh ? `<div class="auto" style="margin-top:8px;"><span>Vehicle type</span><span>${esc(veh.type)}</span></div>` : ''}

    <label>Driver name</label>
    <input type="text" id="driverIn" list="opList" value="${esc(driverInput)}" placeholder="Type driver name…" autocomplete="off">
    <datalist id="opList">${dl}</datalist>
    <div id="matchPanel">${matchHTML()}</div>

    <label style="margin-top:16px;">Checklist</label>
    ${CHECK_ITEMS.map(it => {
      const st      = itemState[it];
      const flagged = st.status === 'Defect';
      return `
      <div class="item ${flagged ? 'flagged' : ''}" data-item="${esc(it)}">
        <div class="item-top">
          <strong>${esc(it)}</strong>
          <div class="seg">
            <button type="button" data-set="OK"     class="${!flagged ? 'on ok'  : ''}">OK</button>
            <button type="button" data-set="Defect" class="${ flagged ? 'on bad' : ''}">Defect</button>
          </div>
        </div>
        <div class="detail">
          <label style="margin-top:8px;">Severity</label>
          <select data-sev>
            <option value="Minor"    ${st.severity === 'Minor'    ? 'selected' : ''}>Minor</option>
            <option value="Major"    ${st.severity === 'Major'    ? 'selected' : ''}>Major</option>
            <option value="Critical" ${st.severity === 'Critical' ? 'selected' : ''}>Critical</option>
          </select>
          <label>Notes</label>
          <textarea data-notes placeholder="Describe the defect">${esc(st.notes)}</textarea>
        </div>
      </div>`;
    }).join('')}

    <button class="primary" id="submitBtn">Submit checkpoint</button>
  </div>`;
}

// ── Defect log ─────────────────────────────────────────────
function renderDefects() {
  const filtered = defects.filter(d =>
    defectFilter === 'all' ? true : d.status.toLowerCase() === defectFilter
  );
  return `
  <div class="card">
    <h2>Defect log</h2>
    <div class="filterbar">
      <button data-f="open"   class="${defectFilter === 'open'   ? 'on' : ''}">Open (${defects.filter(d => d.status === 'Open').length})</button>
      <button data-f="closed" class="${defectFilter === 'closed' ? 'on' : ''}">Resolved</button>
      <button data-f="all"    class="${defectFilter === 'all'    ? 'on' : ''}">All</button>
    </div>
    ${filtered.length
      ? `<div style="overflow-x:auto;"><table>
           <thead><tr><th>Vehicle</th><th>Driver</th><th>Item</th><th>Severity</th><th>Status</th><th>Reported</th><th></th></tr></thead>
           <tbody>${filtered.map(d => `
           <tr>
             <td>${esc(d.vehicleName)}</td>
             <td>${esc(d.driverName || '')}</td>
             <td>${esc(d.item)}<br><span class="muted">${esc(d.notes || '')}</span></td>
             <td><span class="pill ${esc(d.severity.toLowerCase())}">${esc(d.severity)}</span></td>
             <td><span class="pill ${esc(d.status.toLowerCase())}">${esc(d.status)}</span></td>
             <td>${(d.reportedAt || '').slice(0, 10)}<br><span class="muted">${esc(d.reportedBy || '')}</span></td>
             <td>${d.status === 'Open'
               ? `<button class="ghost" data-resolve="${esc(d.id)}">Resolve</button>`
               : ''}</td>
           </tr>`).join('')}
           </tbody></table></div>`
      : `<div class="empty">No ${defectFilter === 'all' ? '' : defectFilter} defects.</div>`}
  </div>`;
}

// ── Operators tab ──────────────────────────────────────────
function rosterHTML() {
  if (!operators.length) return `<div class="empty">No operators added yet.</div>`;
  return `
    <div style="overflow-x:auto;"><table style="margin-top:8px;">
      <thead><tr><th>Photo</th><th>Name</th><th>Added</th></tr></thead>
      <tbody>${operators.map(o => `
      <tr>
        <td>${o.photo
          ? `<img class="thumb" src="${o.photo}" alt="">`
          : `<div class="thumb none">—</div>`}</td>
        <td>${esc(o.name)}</td>
        <td class="muted">${(o.addedAt || '').slice(0, 10)}</td>
      </tr>`).join('')}
      </tbody></table></div>`;
}

function renderOperators() {
  return `
  <div class="card">
    <h2>Add operator</h2>
    <p class="muted">Add each driver/operator once with a photo. Their details will appear automatically when the checker enters their name during a checkpoint.</p>

    <label>Operator name</label>
    <input type="text" id="opNewName" value="${esc(opDraftName)}" placeholder="Full name">

    <label>Photo</label>
    <div class="photo-wrap">
      <button type="button" class="ghost" style="width:100%;text-align:left;">📷 Choose photo from gallery</button>
      <input type="file" id="opNewPhoto" accept="image/*">
    </div>
    <div class="muted" id="photoStatus" style="margin-top:6px;">${pendingPhoto ? 'Photo ready ✓' : 'No photo chosen (optional)'}</div>
    <div id="opPreview">${pendingPhoto ? `<img class="thumb lg" src="${pendingPhoto}" alt="">` : ''}</div>

    <button class="ghost" id="addOp" style="margin-top:14px;">Add operator</button>
  </div>

  <div class="card">
    <h2>Operator roster</h2>
    <div id="rosterBox">${rosterHTML()}</div>
  </div>`;
}

// ── Vehicles tab ───────────────────────────────────────────
function renderVehicles() {
  return `
  <div class="card">
    <h2>Vehicle &amp; equipment list</h2>
    <p class="muted">Add each vehicle or piece of equipment once. It will appear in the checkpoint dropdown and its open defect count will show here.</p>
    <div class="addrow">
      <input type="text" id="newName" value="${esc(vehDraftName)}" placeholder="ID / Name (e.g. FL-04)">
      <input type="text" id="newType" value="${esc(vehDraftType)}" placeholder="Type (e.g. Forklift)">
      <button class="ghost" id="addVeh">Add</button>
    </div>
    ${vehicles.length
      ? `<div style="overflow-x:auto;"><table style="margin-top:14px;">
           <thead><tr><th>Name / ID</th><th>Type</th><th>Open defects</th></tr></thead>
           <tbody>${vehicles.map(v => `
           <tr>
             <td>${esc(v.name)}</td>
             <td>${esc(v.type)}</td>
             <td>${defects.filter(d => d.vehicleId === v.id && d.status === 'Open').length}</td>
           </tr>`).join('')}
           </tbody></table></div>`
      : `<div class="empty">No vehicles added yet.</div>`}
  </div>`;
}

// ── Export tab ─────────────────────────────────────────────
function renderExport() {
  return `
  <div class="card">
    <h2>Export to Excel</h2>
    <p class="muted">Downloads one .xlsx workbook with four sheets — Checkpoints, Defects, Operators, and Vehicles. Operator photos are not included in the file.</p>
    <div class="auto"><span>Checkpoints</span><span>${checkpoints.length}</span></div>
    <div class="auto" style="margin-top:6px;"><span>Defects (open)</span><span>${defects.filter(d => d.status === 'Open').length}</span></div>
    <div class="auto" style="margin-top:6px;"><span>Operators</span><span>${operators.length}</span></div>
    <div class="auto" style="margin-top:6px;"><span>Vehicles</span><span>${vehicles.length}</span></div>
    <button class="primary" id="exportBtn">⬇ Download Excel workbook</button>
  </div>`;
}

// ── Wire up all events for the current view ────────────────
function wireView() {
  if (view === 'submit') {
    const sel = document.getElementById('vehSel');
    if (sel) sel.addEventListener('change', () => { selectedVehicle = sel.value || null; render(); });

    const dIn = document.getElementById('driverIn');
    if (dIn) dIn.addEventListener('input', () => {
      driverInput = dIn.value;
      document.getElementById('matchPanel').innerHTML = matchHTML();
    });

    document.querySelectorAll('.item').forEach(row => {
      const it = row.dataset.item;
      row.querySelectorAll('[data-set]').forEach(b =>
        b.addEventListener('click', () => { itemState[it].status = b.dataset.set; render(); })
      );
      const sev = row.querySelector('[data-sev]');
      if (sev) sev.addEventListener('change', () => itemState[it].severity = sev.value);
      const nt  = row.querySelector('[data-notes]');
      if (nt)  nt.addEventListener('input',  () => itemState[it].notes    = nt.value);
    });

    const btn = document.getElementById('submitBtn');
    if (btn) btn.addEventListener('click', submitCheckpoint);
  }

  if (view === 'defects') {
    document.querySelectorAll('[data-f]').forEach(b =>
      b.addEventListener('click', () => { defectFilter = b.dataset.f; render(); })
    );
    document.querySelectorAll('[data-resolve]').forEach(b =>
      b.addEventListener('click', () => resolveDefect(b.dataset.resolve))
    );
  }

  if (view === 'operators') {
    const nameEl  = document.getElementById('opNewName');
    const photoEl = document.getElementById('opNewPhoto');
    const addBtn  = document.getElementById('addOp');
    if (nameEl)  nameEl.addEventListener('input', e => opDraftName = e.target.value);
    if (photoEl) photoEl.addEventListener('change', handlePhotoChange);
    if (addBtn)  addBtn.addEventListener('click', addOperator);
  }

  if (view === 'vehicles') {
    document.getElementById('newName').addEventListener('input', e => vehDraftName = e.target.value);
    document.getElementById('newType').addEventListener('input', e => vehDraftType = e.target.value);
    document.getElementById('addVeh').addEventListener('click', addVehicle);
  }

  if (view === 'export') {
    document.getElementById('exportBtn').addEventListener('click', exportExcel);
  }
}

// ── Photo handler (operators tab) ──────────────────────────
async function handlePhotoChange(e) {
  const f  = e.target.files[0];
  if (!f) return;
  const st = document.getElementById('photoStatus');
  st.textContent = 'Reading photo…';
  try {
    pendingPhoto = await compressPhoto(f);
    document.getElementById('opPreview').innerHTML = `<img class="thumb lg" src="${pendingPhoto}" alt="">`;
    st.textContent = 'Photo ready ✓';
  } catch {
    st.textContent = 'Could not read that file — try a JPG or PNG.';
    pendingPhoto = null;
  }
}

// ── Actions ────────────────────────────────────────────────
async function submitCheckpoint() {
  if (!selectedVehicle)         { toast('Select a vehicle first'); return; }
  const op = findOperator(driverInput);
  if (!op)                      { toast('Driver not found — add them in Operators tab'); return; }

  const veh  = vehicles.find(v => v.id === selectedVehicle);
  const np   = nowParts();
  const flaggedItems = CHECK_ITEMS.filter(i => itemState[i].status === 'Defect');

  const record = {
    vehicleId:     veh.id,
    vehicleName:   veh.name,
    vehicleType:   veh.type,
    date:          np.date,
    time:          np.time,
    checkerName,
    driverName:    op.name,
    operatorId:    op.id,
    overallStatus: flaggedItems.length ? 'Defects Found' : 'OK',
    defectCount:   flaggedItems.length,
    items:         Object.fromEntries(CHECK_ITEMS.map(i => [i, { ...itemState[i] }])),
    reportedAt:    np.iso
  };

  try {
    const ref = await firestoreDB.collection('checkpoints').add(record);

    const defectWrites = flaggedItems.map(it => {
      const s = itemState[it];
      return firestoreDB.collection('defects').add({
        vehicleId:    veh.id,
        vehicleName:  veh.name,
        checkpointId: ref.id,
        driverName:   op.name,
        item:         it,
        severity:     s.severity,
        notes:        s.notes,
        status:       'Open',
        reportedAt:   np.iso,
        reportedBy:   checkerName
      });
    });
    await Promise.all(defectWrites);

    // Reset form
    CHECK_ITEMS.forEach(i => itemState[i] = { status: 'OK', notes: '', severity: 'Minor' });
    driverInput     = '';
    selectedVehicle = null;

    toast(flaggedItems.length
      ? `Submitted — ${flaggedItems.length} defect(s) logged`
      : 'Checkpoint submitted — all clear ✓'
    );
    render();
  } catch(e) {
    toast('Could not submit — check your internet connection');
    console.error('submitCheckpoint error:', e);
  }
}

async function resolveDefect(id) {
  try {
    await firestoreDB.collection('defects').doc(id).update({
      status:     'Closed',
      resolvedAt: new Date().toISOString(),
      resolvedBy: checkerName
    });
    toast('Marked as resolved ✓');
  } catch(e) {
    toast('Could not update — check connection');
    console.error('resolveDefect error:', e);
  }
}

async function addOperator() {
  const name = opDraftName.trim();
  if (!name)               { toast('Enter the operator name'); return; }
  if (findOperator(name))  { toast('That operator already exists'); return; }
  try {
    await firestoreDB.collection('operators').add({
      name,
      photo:    pendingPhoto || '',
      addedAt:  new Date().toISOString()
    });
    opDraftName  = '';
    pendingPhoto = null;
    toast('Operator added ✓');
    render();
  } catch(e) {
    toast('Could not add operator — check connection');
    console.error('addOperator error:', e);
  }
}

async function addVehicle() {
  const name = vehDraftName.trim();
  const type = vehDraftType.trim();
  if (!name || !type) { toast('Enter both name and type'); return; }
  try {
    await firestoreDB.collection('vehicles').add({ name, type });
    vehDraftName = '';
    vehDraftType = '';
    toast('Vehicle added ✓');
    render();
  } catch(e) {
    toast('Could not add vehicle — check connection');
    console.error('addVehicle error:', e);
  }
}

async function exportExcel() {
  try {
    // Fetch full unlistened data for export
    const [vSnap, oSnap, cSnap, dSnap] = await Promise.all([
      firestoreDB.collection('vehicles').get(),
      firestoreDB.collection('operators').get(),
      firestoreDB.collection('checkpoints').orderBy('reportedAt', 'desc').get(),
      firestoreDB.collection('defects').orderBy('reportedAt', 'desc').get()
    ]);

    const vRows = vSnap.docs.map(d => ({ ID: d.id, Name: d.data().name, Type: d.data().type }));
    const oRows = oSnap.docs.map(d => ({
      ID: d.id, Name: d.data().name,
      HasPhoto: d.data().photo ? 'Yes' : 'No',
      AddedAt:  d.data().addedAt || ''
    }));
    const cRows = cSnap.docs.map(d => {
      const x = d.data();
      return { ID: d.id, Date: x.date, Time: x.time, Vehicle: x.vehicleName, Type: x.vehicleType,
               Checker: x.checkerName, Driver: x.driverName, Status: x.overallStatus, Defects: x.defectCount };
    });
    const dRows = dSnap.docs.map(d => {
      const x = d.data();
      return { ID: d.id, Vehicle: x.vehicleName, Driver: x.driverName || '', Item: x.item,
               Severity: x.severity, Notes: x.notes, Status: x.status,
               ReportedAt: x.reportedAt, ReportedBy: x.reportedBy,
               ResolvedAt: x.resolvedAt || '', ResolvedBy: x.resolvedBy || '' };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cRows), 'Checkpoints');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dRows), 'Defects');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(oRows), 'Operators');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vRows), 'Vehicles');

    const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, `fleet-checkpoint-${nowParts().date}.xlsx`);
    toast('Excel workbook downloaded ✓');
  } catch(e) {
    toast('Export failed — check connection');
    console.error('exportExcel error:', e);
  }
}

// ── Start ──────────────────────────────────────────────────
boot();
