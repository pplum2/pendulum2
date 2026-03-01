import { store }          from './store.js';
import { rk4Step }        from './physics.js';
import { renderPresets }  from './presets.js';

const TRAIL = 150;
let animId   = null;
let state    = { theta: 0.2, omega: 0.0, t: 0.0 };
let trail    = [];
let resizeOb = null;

export function init(container) {
  container.innerHTML = `
    <div class="view-layout">
      <div class="panel">
        <h2>Pendulum</h2>
        <div class="eq">d²θ/dt² = −(1/q)ω − sinθ + g·cos(Ω<sub>D</sub>t)</div>

        <label>Driving amplitude <em>g</em>
          <div class="slider-row">
            <input type="range" id="pn-g" min="0" max="2" step="0.01" value="${store.params.g}">
            <span class="val" id="pn-gv">${store.params.g.toFixed(2)}</span>
          </div>
        </label>

        <label>Damping <em>1/q</em>
          <div class="slider-row">
            <input type="range" id="pn-q" min="0.05" max="2" step="0.01" value="${store.params.invQ}">
            <span class="val" id="pn-qv">${store.params.invQ.toFixed(2)}</span>
          </div>
        </label>

        <label>Drive frequency <em>Ω<sub>D</sub></em>
          <div class="slider-row">
            <input type="range" id="pn-w" min="0.1" max="2" step="0.01" value="${store.params.omegaD}">
            <span class="val" id="pn-wv">${store.params.omegaD.toFixed(2)}</span>
          </div>
        </label>

        <label>Steps per frame
          <div class="slider-row">
            <input type="range" id="pn-spf" min="1" max="20" step="1" value="4">
            <span class="val" id="pn-spfv">4</span>
          </div>
        </label>

        <div class="divider"></div>
        <div class="hud" id="pn-hud">
          t = —<br>θ = —<br>ω = —
        </div>

        <div class="btn-row">
          <button id="pn-reset">Reset</button>
        </div>

        <div class="divider"></div>
        <p class="hint" style="margin-bottom:6px;">Quick presets</p>
        <div id="pn-presets"></div>
      </div>

      <div class="canvas-wrap">
        <canvas id="pn-canvas"></canvas>
      </div>
    </div>
  `;

  const canvas = document.getElementById('pn-canvas');
  fitCanvas(canvas);

  resizeOb = new ResizeObserver(() => fitCanvas(canvas));
  resizeOb.observe(canvas.parentElement);

  bindSlider('pn-g',   'pn-gv',   'g',       v => v.toFixed(2));
  bindSlider('pn-q',   'pn-qv',   'invQ',    v => v.toFixed(2));
  bindSlider('pn-w',   'pn-wv',   'omegaD',  v => v.toFixed(2));
  bindSlider('pn-spf', 'pn-spfv', null,      v => v.toFixed(0));

  document.getElementById('pn-reset').addEventListener('click', () => {
    state = { theta: 0.2, omega: 0.0, t: 0.0 };
    trail = [];
  });

  // Preset buttons — reset state when a preset is chosen
  const presetContainer = document.getElementById('pn-presets');
  renderPresets(presetContainer, () => {
    state = { theta: 0.2, omega: 0.0, t: 0.0 };
    trail = [];
  });

  state = { theta: 0.2, omega: 0.0, t: 0.0 };
  trail = [];
  loop(canvas);
}

export function destroy() {
  cancelAnimationFrame(animId);
  animId = null;
  if (resizeOb) { resizeOb.disconnect(); resizeOb = null; }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fitCanvas(canvas) {
  const wrap = canvas.parentElement;
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
}

function bindSlider(id, valId, paramKey, fmt) {
  const slider  = document.getElementById(id);
  const display = document.getElementById(valId);
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    if (paramKey) store.params[paramKey] = v;
    display.textContent = fmt(v);
  });
}

function loop(canvas) {
  const ctx = canvas.getContext('2d');

  function frame() {
    const spf = parseInt(document.getElementById('pn-spf')?.value ?? 4);
    for (let i = 0; i < spf; i++) {
      state = rk4Step(state, store.params, store.dt);
    }

    const W  = canvas.width;
    const H  = canvas.height;
    const L  = Math.min(W, H) * 0.36;
    const cx = W / 2;
    const cy = H * 0.42;
    const bx = cx + L * Math.sin(state.theta);
    const by = cy + L * Math.cos(state.theta);

    trail.push({ x: bx, y: by });
    if (trail.length > TRAIL) trail.shift();

    ctx.clearRect(0, 0, W, H);

    // Trail
    for (let i = 1; i < trail.length; i++) {
      const a = i / trail.length;
      ctx.beginPath();
      ctx.moveTo(trail[i-1].x, trail[i-1].y);
      ctx.lineTo(trail[i].x,   trail[i].y);
      ctx.strokeStyle = `rgba(91,156,246,${a * 0.55})`;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }

    // Pivot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#404060';
    ctx.fill();

    // Rod
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = '#8080a0';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Bob
    ctx.beginPath();
    ctx.arc(bx, by, 15, 0, Math.PI * 2);
    ctx.fillStyle    = '#5b9cf6';
    ctx.shadowColor  = '#5b9cf6';
    ctx.shadowBlur   = 22;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Drive-phase indicator (orange arm at pivot)
    const phi = store.params.omegaD * state.t;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(phi);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(28, 0);
    ctx.strokeStyle = 'rgba(240,160,80,0.75)';
    ctx.lineWidth   = 2.5;
    ctx.stroke();
    ctx.restore();

    // HUD
    const hud = document.getElementById('pn-hud');
    if (hud) {
      hud.innerHTML =
        `t = <span>${state.t.toFixed(2)}</span><br>` +
        `θ = <span>${(state.theta * 180 / Math.PI).toFixed(2)}°</span><br>` +
        `ω = <span>${state.omega.toFixed(4)}</span>`;
    }

    animId = requestAnimationFrame(frame);
  }

  animId = requestAnimationFrame(frame);
}
