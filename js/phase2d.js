import { store } from './store.js';

let resizeOb = null;

export function init(container) {
  container.innerHTML = `
    <div class="view-layout">
      <div class="panel">
        <h2>Phase 2D</h2>
        <p class="hint">Phase portrait: angular velocity <em>ω</em> vs angle <em>θ</em>.</p>
        <p class="hint">Run <strong>Generator</strong> first to produce data.</p>

        <div class="divider"></div>

        <label>Colour by
          <select id="p2-colour">
            <option value="time">Time (rainbow)</option>
            <option value="phi">Drive phase φ</option>
            <option value="omega">Speed |ω|</option>
          </select>
        </label>

        <label>Point size
          <div class="slider-row">
            <input type="range" id="p2-size" min="0.5" max="5" step="0.1" value="1.5">
            <span class="val" id="p2-sv">1.5</span>
          </div>
        </label>

        <label>Opacity
          <div class="slider-row">
            <input type="range" id="p2-alpha" min="0.05" max="1" step="0.01" value="0.4">
            <span class="val" id="p2-av">0.40</span>
          </div>
        </label>

        <div class="divider"></div>

        <label>Max points rendered
          <div class="slider-row">
            <input type="range" id="p2-maxpts" min="5000" max="200000" step="5000" value="80000">
            <span class="val" id="p2-mv">80 k</span>
          </div>
        </label>

        <div class="btn-row">
          <button class="primary" id="p2-draw">Redraw</button>
        </div>

        <div class="stats-box" id="p2-info">—</div>
      </div>

      <div class="canvas-wrap">
        <canvas id="p2-canvas"></canvas>
      </div>
    </div>
  `;

  // Sliders
  bindVal('p2-size',   'p2-sv', v => v.toFixed(1));
  bindVal('p2-alpha',  'p2-av', v => v.toFixed(2));
  bindVal('p2-maxpts', 'p2-mv', v => (v/1000).toFixed(0) + ' k');

  document.getElementById('p2-draw').addEventListener('click', draw);

  const canvas = document.getElementById('p2-canvas');
  fitCanvas(canvas);
  resizeOb = new ResizeObserver(() => { fitCanvas(canvas); draw(); });
  resizeOb.observe(canvas.parentElement);

  draw();
}

export function destroy() {
  if (resizeOb) { resizeOb.disconnect(); resizeOb = null; }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function bindVal(id, valId, fmt) {
  const slider  = document.getElementById(id);
  const display = document.getElementById(valId);
  slider.addEventListener('input', () => { display.textContent = fmt(parseFloat(slider.value)); });
}

function fitCanvas(canvas) {
  const wrap = canvas.parentElement;
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
}

function draw() {
  const canvas = document.getElementById('p2-canvas');
  if (!canvas) return;
  fitCanvas(canvas);

  const ctx      = canvas.getContext('2d');
  const W        = canvas.width;
  const H        = canvas.height;

  ctx.clearRect(0, 0, W, H);

  const data = store.data;
  const info = document.getElementById('p2-info');

  if (!data || data.length === 0) {
    ctx.fillStyle = '#404060';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No data — run the Generator first', W/2, H/2);
    if (info) info.textContent = 'No data loaded.';
    return;
  }

  const ptSize  = parseFloat(document.getElementById('p2-size').value);
  const alpha   = parseFloat(document.getElementById('p2-alpha').value);
  const maxPts  = parseInt(document.getElementById('p2-maxpts').value);
  const colMode = document.getElementById('p2-colour').value;

  const M  = 50;
  const PW = W - 2*M;
  const PH = H - 2*M;
  const n  = data.length;

  // Extents (avoid spread for large arrays)
  let minT = Infinity, maxT = -Infinity, minO = Infinity, maxO = -Infinity;
  for (const p of data) {
    if (p.theta < minT) minT = p.theta;
    if (p.theta > maxT) maxT = p.theta;
    if (p.omega < minO) minO = p.omega;
    if (p.omega > maxO) maxO = p.omega;
  }
  const rT  = maxT - minT || 1;
  const rO  = maxO - minO || 1;
  const absMaxO = Math.max(Math.abs(minO), Math.abs(maxO));

  // Grid lines
  ctx.strokeStyle = '#1e1e32';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const zx = M + (-minT) / rT * PW;
  const zy = M + PH - (-minO) / rO * PH;
  if (zx >= M && zx <= M+PW) { ctx.moveTo(zx, M); ctx.lineTo(zx, M+PH); }
  if (zy >= M && zy <= M+PH) { ctx.moveTo(M, zy); ctx.lineTo(M+PW, zy); }
  ctx.stroke();

  // Border
  ctx.strokeStyle = '#252540';
  ctx.strokeRect(M, M, PW, PH);

  // Plot points
  const skip    = Math.max(1, Math.floor(n / maxPts));
  let plotted   = 0;

  for (let i = 0; i < n; i += skip) {
    const p   = data[i];
    const x   = M + (p.theta - minT) / rT * PW;
    const y   = M + PH - (p.omega - minO) / rO * PH;

    let hue;
    if      (colMode === 'time')  hue = (i / n) * 300;
    else if (colMode === 'phi')   hue = (p.phi / (2 * Math.PI)) * 300;
    else                          hue = (Math.abs(p.omega) / absMaxO) * 240;

    ctx.fillStyle = `hsla(${hue},80%,60%,${alpha})`;
    ctx.fillRect(x - ptSize/2, y - ptSize/2, ptSize, ptSize);
    plotted++;
  }

  // Axis labels
  ctx.fillStyle = '#606080';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('θ (rad)', W/2, H - 8);
  ctx.save();
  ctx.translate(13, H/2);
  ctx.rotate(-Math.PI/2);
  ctx.fillText('ω (rad/s)', 0, 0);
  ctx.restore();

  // Tick labels
  ctx.fillStyle = '#404060';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(minT.toFixed(2), M,    M + PH + 15);
  ctx.fillText(maxT.toFixed(2), M+PW, M + PH + 15);
  ctx.textAlign = 'right';
  ctx.fillText(maxO.toFixed(2), M-5, M + 10);
  ctx.fillText(minO.toFixed(2), M-5, M + PH);

  if (info) {
    info.innerHTML =
      `<strong>${plotted.toLocaleString()}</strong> plotted from ${n.toLocaleString()} total<br>` +
      `θ ∈ [${minT.toFixed(2)}, ${maxT.toFixed(2)}]<br>` +
      `ω ∈ [${minO.toFixed(2)}, ${maxO.toFixed(2)}]`;
  }
}
