import { store }   from './store.js';
import { rk4Step } from './physics.js';

const CHUNK_SIZE = 8000; // steps computed per setTimeout tick

let running    = false;
let chunkTimer = null;
let resizeOb   = null;

export function init(container) {
  container.innerHTML = `
    <div class="view-layout">
      <div class="panel">
        <h2>Generator</h2>
        <p class="hint">Run the simulation at full speed to collect phase-space data for the plots.</p>

        <div class="divider"></div>

        <label>Driving amplitude <em>g</em>
          <div class="slider-row">
            <input type="range" id="gn-g" min="0" max="2" step="0.01" value="${store.params.g}">
            <span class="val" id="gn-gv">${store.params.g.toFixed(2)}</span>
          </div>
        </label>

        <label>Damping <em>1/q</em>
          <div class="slider-row">
            <input type="range" id="gn-q" min="0.05" max="2" step="0.01" value="${store.params.invQ}">
            <span class="val" id="gn-qv">${store.params.invQ.toFixed(2)}</span>
          </div>
        </label>

        <label>Drive frequency <em>Ω<sub>D</sub></em>
          <div class="slider-row">
            <input type="range" id="gn-w" min="0.1" max="2" step="0.01" value="${store.params.omegaD}">
            <span class="val" id="gn-wv">${store.params.omegaD.toFixed(2)}</span>
          </div>
        </label>

        <div class="divider"></div>

        <label>Total iterations
          <div class="slider-row">
            <input type="range" id="gn-n" min="10000" max="2000000" step="10000" value="500000">
            <span class="val" id="gn-nv">500 k</span>
          </div>
        </label>

        <label>Record every N<sup>th</sup> step
          <div class="slider-row">
            <input type="range" id="gn-stride" min="1" max="50" step="1" value="5">
            <span class="val" id="gn-sv">5</span>
          </div>
        </label>

        <div class="btn-row">
          <button class="primary" id="gn-run">▶  Run</button>
          <button id="gn-stop" disabled>■  Stop</button>
          <button id="gn-clear">✕  Clear</button>
        </div>

        <div class="progress-wrap" id="gn-progress-wrap" style="display:none; margin-top:14px;">
          <div class="progress-bar"><div class="progress-bar-fill" id="gn-bar"></div></div>
          <p class="hint" id="gn-pct" style="margin-top:5px;"></p>
        </div>

        <div class="stats-box" id="gn-stats">No data yet.</div>
      </div>

      <div class="canvas-wrap">
        <canvas id="gn-canvas"></canvas>
      </div>
    </div>
  `;

  // Sliders
  bindSlider('gn-g',      'gn-gv',  'g',      v => v.toFixed(2));
  bindSlider('gn-q',      'gn-qv',  'invQ',   v => v.toFixed(2));
  bindSlider('gn-w',      'gn-wv',  'omegaD', v => v.toFixed(2));
  bindSlider('gn-n',      'gn-nv',  null,     v => fmtK(v));
  bindSlider('gn-stride', 'gn-sv',  null,     v => v.toFixed(0));

  document.getElementById('gn-run').addEventListener('click',   startGen);
  document.getElementById('gn-stop').addEventListener('click',  stopGen);
  document.getElementById('gn-clear').addEventListener('click', clearData);

  // Resize canvas
  const canvas = document.getElementById('gn-canvas');
  fitCanvas(canvas);
  resizeOb = new ResizeObserver(() => { fitCanvas(canvas); drawPreview(canvas); });
  resizeOb.observe(canvas.parentElement);

  drawPreview(canvas);
  updateStats();
}

export function destroy() {
  stopGen();
  if (resizeOb) { resizeOb.disconnect(); resizeOb = null; }
}

// ── Internals ──────────────────────────────────────────────────────────────

function bindSlider(id, valId, paramKey, fmt) {
  const slider  = document.getElementById(id);
  const display = document.getElementById(valId);
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    if (paramKey) store.params[paramKey] = v;
    display.textContent = fmt(v);
  });
}

function fmtK(v) {
  return v >= 1e6 ? (v/1e6).toFixed(1) + ' M' : (v/1e3).toFixed(0) + ' k';
}

function fitCanvas(canvas) {
  const wrap = canvas.parentElement;
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
}

function startGen() {
  if (running) return;
  running = true;
  setButtons(true);

  const n      = parseInt(document.getElementById('gn-n').value);
  const stride = parseInt(document.getElementById('gn-stride').value);
  const params = { ...store.params };

  store.data = [];
  let s    = { theta: 0.2, omega: 0.0, t: 0.0 };
  let done = 0;

  const TWO_PI = 2 * Math.PI;

  const progressWrap = document.getElementById('gn-progress-wrap');
  if (progressWrap) progressWrap.style.display = 'block';

  function chunk() {
    if (!running) { finish(); return; }

    const end = Math.min(done + CHUNK_SIZE, n);
    for (let i = done; i < end; i++) {
      s = rk4Step(s, params, store.dt);
      if (i % stride === 0) {
        store.data.push({
          theta: s.theta,
          omega: s.omega,
          t:     s.t,
          phi:   ((params.omegaD * s.t) % TWO_PI + TWO_PI) % TWO_PI,
        });
      }
    }
    done = end;

    // Update progress UI
    const pct = done / n;
    const bar = document.getElementById('gn-bar');
    const lbl = document.getElementById('gn-pct');
    if (bar) bar.style.width = (pct * 100).toFixed(1) + '%';
    if (lbl) lbl.textContent = `${(pct*100).toFixed(0)}%  —  ${store.data.length.toLocaleString()} points`;

    // Redraw preview periodically
    const canvas = document.getElementById('gn-canvas');
    if (canvas && done % (CHUNK_SIZE * 4) === 0) drawPreview(canvas);

    if (done < n) {
      chunkTimer = setTimeout(chunk, 0);
    } else {
      finish();
    }
  }

  chunkTimer = setTimeout(chunk, 0);
}

function stopGen() {
  if (!running) return;
  running = false;
  clearTimeout(chunkTimer);
  finish();
}

function clearData() {
  store.data = [];
  updateStats();
  const canvas = document.getElementById('gn-canvas');
  if (canvas) drawPreview(canvas);
}

function finish() {
  running = false;
  setButtons(false);
  updateStats();
  const canvas = document.getElementById('gn-canvas');
  if (canvas) drawPreview(canvas);
}

function setButtons(isRunning) {
  const run  = document.getElementById('gn-run');
  const stop = document.getElementById('gn-stop');
  if (run)  run.disabled  = isRunning;
  if (stop) stop.disabled = !isRunning;
}

function updateStats() {
  const el = document.getElementById('gn-stats');
  if (!el) return;
  const d = store.data;
  if (d.length === 0) { el.textContent = 'No data yet.'; return; }

  let minT = Infinity, maxT = -Infinity;
  let minO = Infinity, maxO = -Infinity;
  for (const p of d) {
    if (p.theta < minT) minT = p.theta;
    if (p.theta > maxT) maxT = p.theta;
    if (p.omega < minO) minO = p.omega;
    if (p.omega > maxO) maxO = p.omega;
  }

  el.innerHTML =
    `<strong>${d.length.toLocaleString()}</strong> points stored<br>` +
    `θ ∈ [${minT.toFixed(2)}, ${maxT.toFixed(2)}] rad<br>` +
    `ω ∈ [${minO.toFixed(2)}, ${maxO.toFixed(2)}] rad/s<br>` +
    `t<sub>max</sub> = ${d[d.length-1].t.toFixed(1)} s`;
}

// ── Preview scatter plot ───────────────────────────────────────────────────

function drawPreview(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const data = store.data;
  if (data.length === 0) {
    ctx.fillStyle = '#404060';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Run the generator to see a live preview', W / 2, H / 2);
    ctx.fillStyle = '#303050';
    ctx.font = '11px monospace';
    ctx.fillText('(phase portrait will appear here while running)', W / 2, H / 2 + 22);
    return;
  }

  const M = 44; // margin
  const PW = W - 2*M, PH = H - 2*M;

  // Extents
  let minT = Infinity, maxT = -Infinity, minO = Infinity, maxO = -Infinity;
  for (const p of data) {
    if (p.theta < minT) minT = p.theta;
    if (p.theta > maxT) maxT = p.theta;
    if (p.omega < minO) minO = p.omega;
    if (p.omega > maxO) maxO = p.omega;
  }
  const rT = maxT - minT || 1, rO = maxO - minO || 1;

  // Axes
  const zx = M + (0 - minT) / rT * PW;
  const zy = M + PH - (0 - minO) / rO * PH;
  ctx.strokeStyle = '#252540';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (zx >= M && zx <= M+PW) { ctx.moveTo(zx, M); ctx.lineTo(zx, M+PH); }
  if (zy >= M && zy <= M+PH) { ctx.moveTo(M, zy); ctx.lineTo(M+PW, zy); }
  ctx.stroke();

  // Points — skip to keep renders fast
  const skip = Math.max(1, Math.floor(data.length / 60000));
  const n    = data.length;
  for (let i = 0; i < n; i += skip) {
    const p = data[i];
    const x = M + (p.theta - minT) / rT * PW;
    const y = M + PH - (p.omega - minO) / rO * PH;
    const hue = (i / n) * 280;
    ctx.fillStyle = `hsla(${hue},75%,62%,0.45)`;
    ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
  }

  // Labels
  ctx.fillStyle = '#606080';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('θ (rad)', W / 2, H - 6);
  ctx.save();
  ctx.translate(12, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('ω (rad/s)', 0, 0);
  ctx.restore();

  // Corner values
  ctx.textAlign = 'left';
  ctx.fillText(minT.toFixed(1), M, M + PH + 14);
  ctx.textAlign = 'right';
  ctx.fillText(maxT.toFixed(1), M + PW, M + PH + 14);
}
