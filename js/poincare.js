// ── Poincaré Section ──────────────────────────────────────────────────────
//
// The key insight: choose dt = T_D / stepsPerPeriod so the integrator hits
// φ = 0 exactly every stepsPerPeriod steps — no interpolation, no smearing.
// Record (θ, ω) at that instant. Run for many periods. Discard the burn-in.
//
// ─────────────────────────────────────────────────────────────────────────

import { store }         from './store.js';
import { rk4Step }       from './physics.js';
import { renderPresets } from './presets.js';

const CHUNK_PERIODS = 80; // periods computed per setTimeout tick

let running    = false;
let chunkTimer = null;
let resizeOb   = null;
let pcPoints   = []; // { theta, omega }

export function init(container) {
  container.innerHTML = `
    <div class="view-layout">
      <div class="panel">
        <h2>Poincaré Section</h2>
        <p class="hint">
          Samples (θ, ω) once per drive period by choosing dt = T<sub>D</sub> / steps
          so the integrator lands <em>exactly</em> on the section — no interpolation.
        </p>

        <div class="divider"></div>

        <label>Driving amplitude <em>g</em>
          <div class="slider-row">
            <input type="range" id="pc-g" min="0" max="2" step="0.01" value="${store.params.g}">
            <span class="val" id="pc-gv">${store.params.g.toFixed(2)}</span>
          </div>
        </label>

        <label>Damping <em>1/q</em>
          <div class="slider-row">
            <input type="range" id="pc-q" min="0.05" max="2" step="0.01" value="${store.params.invQ}">
            <span class="val" id="pc-qv">${store.params.invQ.toFixed(2)}</span>
          </div>
        </label>

        <label>Drive frequency <em>Ω<sub>D</sub></em>
          <div class="slider-row">
            <input type="range" id="pc-w" min="0.1" max="2" step="0.01" value="${store.params.omegaD}">
            <span class="val" id="pc-wv">${store.params.omegaD.toFixed(2)}</span>
          </div>
        </label>

        <div class="divider"></div>

        <label>Steps per period <em>(precision)</em>
          <div class="slider-row">
            <input type="range" id="pc-spp" min="50" max="500" step="10" value="200">
            <span class="val" id="pc-sppv">200</span>
          </div>
        </label>
        <p class="hint" id="pc-dt-hint" style="margin-top:2px;"></p>

        <label>Burn-in periods <em>(discard transient)</em>
          <div class="slider-row">
            <input type="range" id="pc-burn" min="0" max="2000" step="50" value="500">
            <span class="val" id="pc-burnv">500</span>
          </div>
        </label>

        <label>Record periods
          <div class="slider-row">
            <input type="range" id="pc-n" min="1000" max="100000" step="1000" value="20000">
            <span class="val" id="pc-nv">20 k</span>
          </div>
        </label>

        <div class="btn-row">
          <button class="primary" id="pc-run">▶  Run</button>
          <button id="pc-stop" disabled>■  Stop</button>
          <button id="pc-clear">✕  Clear</button>
        </div>

        <div class="progress-wrap" id="pc-prog-wrap" style="display:none; margin-top:12px;">
          <div class="progress-bar"><div class="progress-bar-fill" id="pc-bar"></div></div>
          <p class="hint" id="pc-pct" style="margin-top:4px;"></p>
        </div>

        <div class="stats-box" id="pc-info">—</div>

        <div class="divider"></div>
        <p class="hint" style="margin-bottom:6px;">Quick presets</p>
        <div id="pc-presets"></div>
      </div>

      <div class="panel" style="min-width:160px; max-width:180px; border-right: 1px solid var(--border);">
        <h2>Display</h2>

        <label>Colour by
          <select id="pc-colour">
            <option value="time">Time</option>
            <option value="omega">Speed |ω|</option>
            <option value="theta">Position θ</option>
          </select>
        </label>

        <label>Point size
          <div class="slider-row">
            <input type="range" id="pc-size" min="0.5" max="8" step="0.1" value="2">
            <span class="val" id="pc-sv">2.0</span>
          </div>
        </label>

        <label>Opacity
          <div class="slider-row">
            <input type="range" id="pc-alpha" min="0.05" max="1" step="0.01" value="0.65">
            <span class="val" id="pc-av">0.65</span>
          </div>
        </label>

        <div class="btn-row">
          <button id="pc-redraw">Redraw</button>
        </div>
      </div>

      <div class="canvas-wrap">
        <canvas id="pc-canvas"></canvas>
      </div>
    </div>
  `;

  // Physics sliders — sync to store
  bindSlider('pc-g', 'pc-gv', 'g',      v => v.toFixed(2));
  bindSlider('pc-q', 'pc-qv', 'invQ',   v => v.toFixed(2));
  bindSlider('pc-w', 'pc-wv', 'omegaD', v => { updateDtHint(); return v.toFixed(2); });

  // Config sliders
  bindVal('pc-spp',  'pc-sppv', v => { updateDtHint(); return v.toFixed(0); });
  bindVal('pc-burn', 'pc-burnv', v => v.toFixed(0));
  bindVal('pc-n',    'pc-nv',   v => (v >= 1000 ? (v/1000).toFixed(0) + ' k' : v));

  // Display sliders
  bindVal('pc-size',  'pc-sv', v => v.toFixed(1));
  bindVal('pc-alpha', 'pc-av', v => v.toFixed(2));

  document.getElementById('pc-run').addEventListener('click',    startRun);
  document.getElementById('pc-stop').addEventListener('click',   stopRun);
  document.getElementById('pc-clear').addEventListener('click',  clearPlot);
  document.getElementById('pc-redraw').addEventListener('click', redraw);

  // Preset buttons — clear existing run when a preset is chosen
  renderPresets(document.getElementById('pc-presets'), () => {
    pcPoints = [];
    drawEmpty();
    updateDtHint();
  });

  updateDtHint();

  const canvas = document.getElementById('pc-canvas');
  fitCanvas(canvas);
  resizeOb = new ResizeObserver(() => { fitCanvas(canvas); redraw(); });
  resizeOb.observe(canvas.parentElement);

  // Show any existing data immediately
  if (pcPoints.length > 0) redraw(); else drawEmpty();
}

export function destroy() {
  stopRun();
  if (resizeOb) { resizeOb.disconnect(); resizeOb = null; }
}

// ── Simulation ─────────────────────────────────────────────────────────────

function startRun() {
  if (running) return;
  running = true;
  pcPoints = [];
  setButtons(true);

  const params     = { ...store.params };
  const spp        = parseInt(document.getElementById('pc-spp').value);   // steps per period
  const burnIn     = parseInt(document.getElementById('pc-burn').value);   // periods to discard
  const nRecord    = parseInt(document.getElementById('pc-n').value);      // periods to record
  const T_D        = (2 * Math.PI) / params.omegaD;                       // drive period
  const dt         = T_D / spp;                                            // step hits φ=0 exactly

  let s            = { theta: 0.2, omega: 0.0, t: 0.0 };
  let periodsDone  = 0;
  const totalPeriods = burnIn + nRecord;

  document.getElementById('pc-prog-wrap').style.display = 'block';

  function chunk() {
    if (!running) { finish(); return; }

    const end = Math.min(periodsDone + CHUNK_PERIODS, totalPeriods);

    for (let p = periodsDone; p < end; p++) {
      // Integrate exactly one drive period
      for (let step = 0; step < spp; step++) {
        s = rk4Step(s, params, dt);
      }
      // After burn-in, record the Poincaré point
      if (p >= burnIn) {
        pcPoints.push({ theta: s.theta, omega: s.omega });
      }
    }
    periodsDone = end;

    // UI update
    const pct = periodsDone / totalPeriods;
    const bar = document.getElementById('pc-bar');
    const lbl = document.getElementById('pc-pct');
    if (bar) bar.style.width = (pct * 100).toFixed(1) + '%';
    if (lbl) lbl.textContent =
      `${(pct*100).toFixed(0)}%  —  period ${periodsDone.toLocaleString()} / ${totalPeriods.toLocaleString()}` +
      (periodsDone <= burnIn ? '  (burn-in)' : `  —  ${pcPoints.length.toLocaleString()} pts`);

    // Live redraw every few chunks
    if (periodsDone % (CHUNK_PERIODS * 5) === 0) redraw();

    if (periodsDone < totalPeriods) {
      chunkTimer = setTimeout(chunk, 0);
    } else {
      finish();
    }
  }

  chunkTimer = setTimeout(chunk, 0);
}

function stopRun() {
  if (!running) return;
  running = false;
  clearTimeout(chunkTimer);
  finish();
}

function clearPlot() {
  pcPoints = [];
  document.getElementById('pc-info').textContent = '—';
  drawEmpty();
}

function finish() {
  running = false;
  setButtons(false);
  updateInfo();
  redraw();
}

function setButtons(isRunning) {
  const run  = document.getElementById('pc-run');
  const stop = document.getElementById('pc-stop');
  if (run)  run.disabled  = isRunning;
  if (stop) stop.disabled = !isRunning;
}

function updateInfo() {
  const el = document.getElementById('pc-info');
  if (!el || pcPoints.length === 0) return;

  let minT = Infinity, maxT = -Infinity, minO = Infinity, maxO = -Infinity;
  for (const p of pcPoints) {
    if (p.theta < minT) minT = p.theta;
    if (p.theta > maxT) maxT = p.theta;
    if (p.omega < minO) minO = p.omega;
    if (p.omega > maxO) maxO = p.omega;
  }

  const spp = parseInt(document.getElementById('pc-spp').value);
  const T_D = (2 * Math.PI) / store.params.omegaD;
  const dt  = T_D / spp;

  el.innerHTML =
    `<strong>${pcPoints.length.toLocaleString()}</strong> Poincaré points<br>` +
    `dt = ${dt.toFixed(5)} s<br>` +
    `θ ∈ [${minT.toFixed(3)}, ${maxT.toFixed(3)}]<br>` +
    `ω ∈ [${minO.toFixed(3)}, ${maxO.toFixed(3)}]`;
}

function updateDtHint() {
  const hint = document.getElementById('pc-dt-hint');
  if (!hint) return;
  const spp  = parseFloat(document.getElementById('pc-spp')?.value ?? 200);
  const w    = parseFloat(document.getElementById('pc-w')?.value   ?? store.params.omegaD);
  const T_D  = (2 * Math.PI) / w;
  const dt   = T_D / spp;
  hint.textContent = `T_D = ${T_D.toFixed(4)} s,  dt = ${dt.toFixed(5)} s`;
}

// ── Drawing ────────────────────────────────────────────────────────────────

function redraw() {
  const canvas = document.getElementById('pc-canvas');
  if (!canvas) return;

  if (pcPoints.length === 0) { drawEmpty(); return; }

  const ctx     = canvas.getContext('2d');
  const W       = canvas.width;
  const H       = canvas.height;
  const ptSize  = parseFloat(document.getElementById('pc-size').value);
  const alpha   = parseFloat(document.getElementById('pc-alpha').value);
  const colMode = document.getElementById('pc-colour').value;
  const n       = pcPoints.length;

  ctx.clearRect(0, 0, W, H);

  const M  = 54;
  const PW = W - 2*M;
  const PH = H - 2*M;

  // Extents
  let minT = Infinity, maxT = -Infinity, minO = Infinity, maxO = -Infinity;
  for (const p of pcPoints) {
    if (p.theta < minT) minT = p.theta;
    if (p.theta > maxT) maxT = p.theta;
    if (p.omega < minO) minO = p.omega;
    if (p.omega > maxO) maxO = p.omega;
  }

  const padT = (maxT - minT) * 0.04 || 0.05;
  const padO = (maxO - minO) * 0.04 || 0.05;
  minT -= padT; maxT += padT;
  minO -= padO; maxO += padO;
  const rT = maxT - minT;
  const rO = maxO - minO;
  const absMaxO = Math.max(Math.abs(minO), Math.abs(maxO)) || 1;
  const rngT    = maxT - minT || 1;

  // Subtle grid
  ctx.strokeStyle = '#141424';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 8; g++) {
    const gx = M + (g / 8) * PW;
    const gy = M + (g / 8) * PH;
    ctx.beginPath(); ctx.moveTo(gx, M); ctx.lineTo(gx, M+PH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(M, gy); ctx.lineTo(M+PW, gy); ctx.stroke();
  }

  // Zero axes
  const zx = M + (0 - minT) / rT * PW;
  const zy = M + PH - (0 - minO) / rO * PH;
  ctx.strokeStyle = '#252545';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (zx >= M && zx <= M+PW) { ctx.moveTo(zx, M); ctx.lineTo(zx, M+PH); }
  if (zy >= M && zy <= M+PH) { ctx.moveTo(M, zy); ctx.lineTo(M+PW, zy); }
  ctx.stroke();

  // Plot — draw every point (Poincaré points are precious, don't skip)
  const r = ptSize / 2;
  for (let i = 0; i < n; i++) {
    const p   = pcPoints[i];
    const x   = M + (p.theta - minT) / rT * PW;
    const y   = M + PH - (p.omega - minO) / rO * PH;

    let hue;
    if      (colMode === 'time')  hue = (i / n) * 300;
    else if (colMode === 'omega') hue = (Math.abs(p.omega) / absMaxO) * 240;
    else                          hue = ((p.theta - minT) / rngT) * 300;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue},85%,65%,${alpha})`;
    ctx.fill();
  }

  // Axis labels
  ctx.fillStyle = '#606080';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('θ (rad)  at  φ = 0  (once per drive period)', W/2, H - 8);
  ctx.save();
  ctx.translate(13, H/2);
  ctx.rotate(-Math.PI/2);
  ctx.fillText('ω (rad/s)  at  φ = 0', 0, 0);
  ctx.restore();

  // Tick labels
  ctx.fillStyle = '#404060';
  ctx.font = '10px monospace';
  const ticks = 6;
  ctx.textAlign = 'center';
  for (let i = 0; i <= ticks; i++) {
    const v = minT + (i / ticks) * rT;
    const x = M + (i / ticks) * PW;
    ctx.fillText(v.toFixed(2), x, M + PH + 15);
  }
  ctx.textAlign = 'right';
  for (let i = 0; i <= ticks; i++) {
    const v = maxO - (i / ticks) * rO;
    const y = M + (i / ticks) * PH;
    ctx.fillText(v.toFixed(2), M - 5, y + 4);
  }

  // Point count annotation
  ctx.fillStyle = '#303050';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${n.toLocaleString()} pts`, W - M, M - 6);
}

function drawEmpty() {
  const canvas = document.getElementById('pc-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#404060';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Press  ▶ Run  to compute the Poincaré section', canvas.width/2, canvas.height/2);
  ctx.fillStyle = '#2a2a48';
  ctx.font = '11px monospace';
  ctx.fillText('(independent of the Generator — runs its own physics)', canvas.width/2, canvas.height/2 + 22);
}

// ── Tiny helpers ───────────────────────────────────────────────────────────

function fitCanvas(canvas) {
  const wrap = canvas.parentElement;
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
}

function bindSlider(id, valId, paramKey, fmt) {
  const s = document.getElementById(id);
  const d = document.getElementById(valId);
  s.addEventListener('input', () => {
    const v = parseFloat(s.value);
    store.params[paramKey] = v;
    d.textContent = fmt(v);
  });
}

function bindVal(id, valId, fmt) {
  const s = document.getElementById(id);
  const d = document.getElementById(valId);
  s.addEventListener('input', () => { d.textContent = fmt(parseFloat(s.value)); });
}
