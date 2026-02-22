// ── STATE ──
let imgBase64 = null;
let imgType = 'image/png';
let csvData = '';
let delayType = 'material';
let parsedWeeks = [];
let currentWeek = 1;

const API_BASE = 'http://localhost:8765';

// ── IMAGE UPLOAD ──
function handleImgSelect(inp) { if (inp.files[0]) loadImg(inp.files[0]); }
function handleImgDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag');
  if (e.dataTransfer.files[0]) loadImg(e.dataTransfer.files[0]);
}
function loadImg(f) {
  imgType = f.type || 'image/png';
  document.getElementById('uploadFilename').textContent = '✓ ' + f.name;
  document.getElementById('uploadLabel').style.display = 'none';
  const r = new FileReader();
  r.onload = e => { imgBase64 = e.target.result.split(',')[1]; };
  r.readAsDataURL(f);
}

// ── CSV UPLOAD ──
function handleCsvSelect(inp) {
  if (!inp.files[0]) return;
  document.getElementById('csvFilename').textContent = '✓ ' + inp.files[0].name;
  const r = new FileReader();
  r.onload = e => {
    csvData = e.target.result;
    document.getElementById('scheduleText').value = csvData;
  };
  r.readAsText(inp.files[0]);
}

// ── WEEK SLIDER ──
function onWeekSlide(v) {
  currentWeek = parseInt(v);
  document.getElementById('weekNumDisplay').textContent = String(currentWeek).padStart(2, '0');
  if (parsedWeeks.length >= currentWeek) {
    const w = parsedWeeks[currentWeek - 1];
    document.getElementById('weekActDisplay').textContent = w.activity || '—';
    document.getElementById('weekMetaDisplay').textContent =
      (w.trades || '') + (w.materials ? ' · ' + w.materials : '');
  } else {
    document.getElementById('weekActDisplay').textContent = 'Week ' + currentWeek;
    document.getElementById('weekMetaDisplay').textContent = 'Enter schedule to see details';
  }
  document.getElementById('sWeek').textContent = String(currentWeek).padStart(2, '0');
}

// ── TABS ──
function tab(n) {
  const names = ['layout', 'paths', 'query', 'replan'];
  document.querySelectorAll('.dash-tab').forEach((t, i) => t.classList.toggle('active', names[i] === n));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + n).classList.add('active');
}

// ── DELAY TYPE ──
function setDT(t) {
  delayType = t;
  document.querySelectorAll('.delay-type-btn').forEach(b => b.classList.remove('sel'));
  document.getElementById('dt-' + t).classList.add('sel');
}

// ── QUERY PRESET ──
function setQ(t) { document.getElementById('queryInput').value = t.replace(/^→ /, ''); }

// ── SERVER CALL ──
async function callServer(endpoint, payload) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  return res.json();
}

// ── HELPERS ──
function getScheduleText() { return document.getElementById('scheduleText').value.trim() || csvData; }
function getWeekContext() {
  if (parsedWeeks.length >= currentWeek) return parsedWeeks[currentWeek - 1];
  const lines = getScheduleText().split('\n').filter(l => l.trim());
  return { activity: lines[currentWeek - 1] || `Week ${currentWeek} activity`, trades: '', materials: '' };
}

// ── PARSE SCHEDULE ──
async function parseSchedule(sched) {
  if (!sched) return;
  try {
    const data = await callServer('/parse-schedule', { schedule: sched });
    if (data.weeks) {
      parsedWeeks = data.weeks;
      document.getElementById('weekSlider').max = parsedWeeks.length;
      onWeekSlide(currentWeek);
    }
  } catch (e) {
    console.warn('Schedule parse failed:', e.message);
  }
}

// ── GENERATE LAYOUT ──
async function generateLayout() {
  const sched = getScheduleText();
  if (!sched && !imgBase64) {
    alert('Please upload a site plan and/or enter your project schedule first.');
    return;
  }

  const btn = document.getElementById('generateBtn');
  btn.textContent = '⬡ GENERATING...';
  btn.disabled = true;

  tab('layout');

  document.getElementById('layoutEmpty').style.display = 'none';
  const lo = document.getElementById('layoutOut');
  lo.style.display = 'flex';
  lo.innerHTML = '<div class="empty"><div class="thinking" style="font-size:16px">Reading site plan and schedule<span>.</span><span>.</span><span>.</span></div></div>';

  const wd = getWeekContext();

  if (sched) parseSchedule(sched); // background, not awaited

  try {
    const data = await callServer('/generate-layout', {
      project: 'Construction Project',
      dims: '',
      week: currentWeek,
      weekContext: wd,
      schedule: sched.slice(0, 6000),
      image: imgBase64 ? { data: imgBase64, type: imgType } : null
    });

    renderLayout(data, currentWeek);

    if (data.materialsTable) {
      document.getElementById('matTable').innerHTML = data.materialsTable.map(m =>
        `<tr>
          <td>${m.material}</td>
          <td><span class="fv ${m.volume === 'High' ? 'fv-h' : m.volume === 'Low' ? 'fv-l' : 'fv-m'}">${m.volume}</span></td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--muted)">${m.zone}</td>
        </tr>`).join('');
    }
    document.getElementById('dashTitle').textContent = 'SPATIALFLOW';
    document.getElementById('dashSub').textContent = `WEEK ${currentWeek} · ${wd.activity || 'Construction'}`;
  } catch (err) {
    lo.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="ai-text" style="color:var(--red)">
            Error: ${err.message}<br><br>
            Make sure the server is running at <code>${API_BASE}</code>
            and <code>ANTHROPIC_API</code> is set in your <code>.env</code> file.
          </div>
        </div>
      </div>`;
  }

  btn.textContent = '⬡ REGENERATE LAYOUT ▶';
  btn.disabled = false;
}

// ── RENDER LAYOUT ──
function renderLayout(data, week) {



  document.getElementById('layoutOut').innerHTML = `
    ${data.siteObservations ? `
      <div class="card">
        <div class="card-header">
          <div class="card-title"><div class="card-dot" style="background:var(--muted)"></div>SITE OBSERVATIONS</div>
        </div>
        <div class="card-body">
          <div style="font-size:13px;line-height:1.7;color:var(--text);">${data.siteObservations}</div>
        </div>
      </div>` : ''}
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="card-dot" style="background:var(--accent)"></div>
          TEMPORARY ZONE RECOMMENDATIONS — WEEK ${week}
        </div>
        <span class="card-tag" style="background:rgba(240,165,0,0.1);color:var(--accent);border:1px solid rgba(240,165,0,0.2)">
          ${(data.materialZones || []).length} ZONES
        </span>
      </div>
      <div class="card-body">
        <div class="zone-grid">
          ${(data.materialZones || []).map(z => `
            <div class="zone-block ${z.type || 'material'}">
              <div class="zb-type">${(z.type || 'ZONE').toUpperCase()} · ${z.tempDuration || ''}</div>
              <div class="zb-name">${z.name}</div>
              <div class="zb-detail">${z.location}<br>${z.contents}</div>
              <div class="zb-reason">↳ ${z.reason}</div>
            </div>`).join('')}
        </div>
        ${data.optimizationNote ? `
          <div style="margin-top:12px;padding:10px 13px;background:rgba(0,196,167,0.05);border:1px solid rgba(0,196,167,0.15);border-radius:5px;font-size:12px;line-height:1.7;">
            <span style="font-family:var(--mono);font-size:9px;color:var(--teal);letter-spacing:1px;display:block;margin-bottom:4px;">KEY INSIGHT</span>
            ${data.optimizationNote}
          </div>` : ''}
      </div>
    </div>
    `;

  // PATHS TAB
  document.getElementById('pathsEmpty').style.display = 'none';
  const po = document.getElementById('pathsOut');
  po.style.display = 'flex';
  po.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><div class="card-dot" style="background:var(--teal)"></div>OPTIMIZED TEMPORARY WORKER PATHS</div>
        <span class="card-tag" style="background:rgba(0,196,167,0.1);color:var(--teal);border:1px solid rgba(0,196,167,0.2)">${(data.workerPaths || []).length} PATHS</span>
      </div>
      <div class="card-body">
        ${(data.workerPaths || []).map(p => `
          <div class="path-item">
            <div class="path-label">${p.label} · ${p.name} · ${p.workers} workers · ~${p.distanceFt}ft</div>
            <div class="path-nodes">
              ${(p.nodes || []).map((n, i) =>
                `<div class="path-node">${n}</div>${i < p.nodes.length - 1 ? '<div class="path-sep">→</div>' : ''}`
              ).join('')}
            </div>
            <div class="path-meta">Avoids: ${p.avoids || '—'}</div>
          </div>`).join('')}
      </div>
    </div>`;

}

// ── QUERY ──
async function runQuery() {
  const q = document.getElementById('queryInput').value.trim();
  if (!q) return;
  tab('query');
  document.getElementById('queryEmpty').style.display = 'none';
  document.getElementById('queryOut').style.display = 'block';
  const el = document.getElementById('queryText');
  el.innerHTML = '<span class="thinking">Analyzing<span>.</span><span>.</span><span>.</span></span>';

  const wd = getWeekContext();
  try {
    const data = await callServer('/query', {
      question: q,
      project: 'Construction Project',
      dims: '',
      week: currentWeek,
      weekContext: wd,
      schedule: getScheduleText().slice(0, 800),
      image: imgBase64 ? { data: imgBase64, type: imgType } : null
    });
    typeText(el, data.answer);
  } catch (err) {
    el.innerHTML = `<span style="color:var(--red)">Error: ${err.message}</span>`;
  }
}

// ── REPLAN ──
async function replan() {
  const desc = document.getElementById('delayInput').value.trim();
  if (!desc) { alert('Describe the disruption first.'); return; }
  const sched = getScheduleText();
  if (!sched) { alert('Please enter your project schedule first.'); return; }

  tab('replan');
  document.getElementById('replanEmpty').style.display = 'none';
  const ro = document.getElementById('replanOut');
  ro.style.display = 'flex';
  ro.innerHTML = '<div class="empty"><div class="thinking" style="font-size:16px">Building revised schedule<span>.</span><span>.</span><span>.</span></div></div>';

  try {
    const data = await callServer('/replan', {
      disruption: desc,
      delayType,
      week: currentWeek,
      project: 'Construction Project',
      schedule: sched
    });
    renderReplan(data, desc);
  } catch (err) {
    ro.innerHTML = `
      <div class="replan-wrap">
        <div class="replan-header">⚠ ERROR</div>
        <div class="replan-body">
          <div class="ai-text" style="color:var(--red)">${err.message}</div>
        </div>
      </div>`;
  }
}

// ── RENDER REPLAN ──
function renderReplan(data, desc) {
  const statusColors = { ON_TRACK: 'pill-ontrack', MOVED: 'pill-moved', DELAYED: 'pill-delayed', PARALLEL: 'pill-parallel', NEW: 'pill-new' };
  const statusLabels = { ON_TRACK: 'ON TRACK',     MOVED: 'MOVED',     DELAYED: 'DELAYED',     PARALLEL: 'PARALLEL',     NEW: 'NEW TASK' };
  const ro = document.getElementById('replanOut');
  ro.innerHTML = `
    <div class="replan-wrap">
      <div class="replan-header">
        <span>⚠ REVISED SCHEDULE · ${delayType.toUpperCase()} DISRUPTION</span>
        <span style="font-size:11px;letter-spacing:0;">
          ${data.daysLost || 0} days lost · ${data.daysRecovered || 0} recovered · Net: ${data.netImpact || 0} day impact
        </span>
      </div>
      <div class="replan-body">
        <div style="margin-bottom:14px;padding:10px 13px;background:rgba(224,92,42,0.06);border:1px solid rgba(224,92,42,0.2);border-radius:5px;font-size:13px;line-height:1.7;">
          <span style="font-family:var(--mono);font-size:9px;color:var(--orange);letter-spacing:1px;display:block;margin-bottom:3px;">SUMMARY</span>
          ${data.summary || desc}
        </div>
        <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <span class="status-pill pill-ontrack">● ON TRACK</span>
          <span class="status-pill pill-moved">● MOVED</span>
          <span class="status-pill pill-delayed">● DELAYED</span>
          <span class="status-pill pill-parallel">● PARALLEL ADDED</span>
          <span class="status-pill pill-new">● NEW TASK</span>
        </div>
        <div style="overflow-x:auto;">
          <table class="sched-table">
            <thead>
              <tr><th>WK</th><th>Activity</th><th>Trades</th><th>Materials</th><th>Status</th><th>Change / Note</th></tr>
            </thead>
            <tbody>
              ${(data.weeks || []).map(w => `
                <tr class="${w.status === 'MOVED' ? 'changed' : w.status === 'DELAYED' ? 'delayed' : (w.status === 'PARALLEL' || w.status === 'NEW') ? 'parallel' : ''}">
                  <td><div class="week-cell">${String(w.week).padStart(2, '0')}</div></td>
                  <td style="font-weight:600;max-width:160px;">${w.activity || '—'}</td>
                  <td style="font-family:var(--mono);font-size:10px;color:var(--muted);max-width:100px;">${w.trades || '—'}</td>
                  <td style="font-family:var(--mono);font-size:10px;color:var(--muted);max-width:120px;">${w.materials || '—'}</td>
                  <td><span class="status-pill ${statusColors[w.status] || 'pill-ontrack'}">${statusLabels[w.status] || w.status}</span></td>
                  <td style="font-family:var(--mono);font-size:10px;color:var(--muted);max-width:180px;">${w.change || w.note || '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ── TYPE ANIMATION ──
function typeText(el, text) {
  el.innerHTML = '';
  let i = 0;
  const c = document.createElement('span');
  c.className = 'cursor';
  function type() {
    if (i < text.length) {
      el.innerHTML = text.slice(0, i + 1).replace(/\n/g, '<br>');
      el.appendChild(c);
      i++;
      setTimeout(type, 10);
    } else if (c.parentNode) {
      c.parentNode.removeChild(c);
    }
  }
  type();
}

// ── KEYBOARD SHORTCUTS ──
document.addEventListener('keydown', e => {
  const sl  = document.getElementById('weekSlider');
  const tag = document.activeElement.tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT') return;
  if (e.key === 'ArrowRight') { sl.value = Math.min(parseInt(sl.max), parseInt(sl.value) + 1); onWeekSlide(sl.value); }
  if (e.key === 'ArrowLeft')  { sl.value = Math.max(1, parseInt(sl.value) - 1);                onWeekSlide(sl.value); }
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('queryInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runQuery(); }
  });
  document.getElementById('delayInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); replan(); }
  });
});