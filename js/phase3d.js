import * as THREE              from 'three';
import { OrbitControls }       from 'three/addons/controls/OrbitControls.js';
import { store }               from './store.js';

let renderer  = null;
let animId    = null;
let resizeOb  = null;

export function init(container) {
  container.innerHTML = `
    <div class="view-layout">
      <div class="panel">
        <h2>Phase 3D</h2>
        <p class="hint">Strange attractor — drag to orbit, scroll to zoom, right-drag to pan.</p>
        <p class="hint">Run <strong>Generator</strong> first.</p>

        <div class="divider"></div>

        <label>Axes
          <select id="p3-axes">
            <option value="tow">θ · ω · φ  (drive phase) — classic</option>
            <option value="tot">θ · ω · t  (time)</option>
          </select>
        </label>

        <label>Colour by
          <select id="p3-colour">
            <option value="time">Time</option>
            <option value="phi">Drive phase φ</option>
            <option value="omega">Speed |ω|</option>
          </select>
        </label>

        <label>Point size
          <div class="slider-row">
            <input type="range" id="p3-size" min="0.003" max="0.06" step="0.001" value="0.012">
            <span class="val" id="p3-sv">0.012</span>
          </div>
        </label>

        <label>Opacity
          <div class="slider-row">
            <input type="range" id="p3-alpha" min="0.1" max="1" step="0.01" value="0.75">
            <span class="val" id="p3-av">0.75</span>
          </div>
        </label>

        <label>Max points
          <div class="slider-row">
            <input type="range" id="p3-maxpts" min="10000" max="500000" step="10000" value="150000">
            <span class="val" id="p3-mv">150 k</span>
          </div>
        </label>

        <div class="btn-row">
          <button class="primary" id="p3-build">Build Scene</button>
          <button id="p3-reset-cam">Reset Camera</button>
        </div>

        <div class="stats-box" id="p3-info">—</div>

        <div class="divider"></div>
        <p class="hint">
          Axes: <em style="color:#e07070">red</em> = θ,
          <em style="color:#70e070">green</em> = ω,
          <em style="color:#7070e0">blue</em> = φ/t
        </p>
      </div>

      <div class="canvas-wrap" id="p3-wrap">
        <div id="p3-empty" style="
          display:flex; align-items:center; justify-content:center;
          height:100%; color:#404060; font:13px monospace; text-align:center;
          flex-direction:column; gap:10px;
        ">
          <div>Press <strong style="color:#5b9cf6">Build Scene</strong> to render the attractor</div>
          <div style="font-size:10px; color:#303050;">
            Generate data first if you haven't already
          </div>
        </div>
      </div>
    </div>
  `;

  bindVal('p3-size',   'p3-sv', v => v.toFixed(3));
  bindVal('p3-alpha',  'p3-av', v => v.toFixed(2));
  bindVal('p3-maxpts', 'p3-mv', v => (v/1000).toFixed(0) + ' k');

  document.getElementById('p3-build').addEventListener('click', buildScene);
  document.getElementById('p3-reset-cam').addEventListener('click', resetCamera);
}

export function destroy() {
  cancelAnimationFrame(animId);
  animId = null;
  if (renderer) { renderer.dispose(); renderer = null; }
  if (resizeOb) { resizeOb.disconnect(); resizeOb = null; }
}

// ── Scene management ───────────────────────────────────────────────────────

let camera   = null;
let controls = null;

function resetCamera() {
  if (!camera || !controls) return;
  camera.position.set(4, 3, 5);
  controls.target.set(0, 0, 0);
  controls.update();
}

function buildScene() {
  const data = store.data;
  const info = document.getElementById('p3-info');

  if (!data || data.length === 0) {
    if (info) info.textContent = 'No data — run the Generator first.';
    return;
  }

  // Tear down old renderer
  cancelAnimationFrame(animId);
  if (renderer) { renderer.dispose(); renderer = null; }
  if (resizeOb) { resizeOb.disconnect(); resizeOb = null; }

  const wrap = document.getElementById('p3-wrap');
  const empty = document.getElementById('p3-empty');
  if (empty) empty.style.display = 'none';

  // Remove old canvas if any
  const old = wrap.querySelector('canvas');
  if (old) old.remove();

  const W = wrap.clientWidth;
  const H = wrap.clientHeight;

  // Three.js
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a16);

  camera = new THREE.PerspectiveCamera(55, W / H, 0.001, 2000);
  camera.position.set(4, 3, 5);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  wrap.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.07;
  controls.minDistance    = 0.5;
  controls.maxDistance    = 50;

  // Axis helper
  scene.add(new THREE.AxesHelper(3));

  // Point cloud
  const axisMode = document.getElementById('p3-axes').value;
  const colMode  = document.getElementById('p3-colour').value;
  const ptSize   = parseFloat(document.getElementById('p3-size').value);
  const ptAlpha  = parseFloat(document.getElementById('p3-alpha').value);
  const maxPts   = parseInt(document.getElementById('p3-maxpts').value);

  const n    = data.length;
  const skip = Math.max(1, Math.floor(n / maxPts));
  const count = Math.ceil(n / skip);

  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);

  // Normalisation
  let minT = Infinity, maxT = -Infinity;
  let minO = Infinity, maxO = -Infinity;
  let tMax = 0;
  for (const p of data) {
    if (p.theta < minT) minT = p.theta;
    if (p.theta > maxT) maxT = p.theta;
    if (p.omega < minO) minO = p.omega;
    if (p.omega > maxO) maxO = p.omega;
    if (p.t > tMax) tMax = p.t;
  }
  const rT   = maxT - minT || 1;
  const rO   = maxO - minO || 1;
  const absMaxO = Math.max(Math.abs(minO), Math.abs(maxO)) || 1;

  for (let i = 0, idx = 0; i < n; i += skip, idx++) {
    const p    = data[i];
    const base = idx * 3;

    // Map to scene units (roughly −2..2 on each axis)
    const xNorm = (p.theta - minT) / rT * 4 - 2;   // θ → x
    const yNorm = (p.omega - minO) / rO * 4 - 2;   // ω → y

    let zNorm;
    if (axisMode === 'tow') {
      zNorm = (p.phi / (2 * Math.PI)) * 4 - 2;     // φ → z (periodic)
    } else {
      zNorm = (p.t / tMax) * 4 - 2;                // t → z
    }

    positions[base]     = xNorm;
    positions[base + 1] = yNorm;
    positions[base + 2] = zNorm;

    // Colour
    let hue;
    if      (colMode === 'time')  hue = (i / n) * 0.78;
    else if (colMode === 'phi')   hue = p.phi / (2 * Math.PI) * 0.78;
    else                          hue = (Math.abs(p.omega) / absMaxO) * 0.65;

    const col = new THREE.Color().setHSL(hue, 0.9, 0.6);
    colors[base]     = col.r;
    colors[base + 1] = col.g;
    colors[base + 2] = col.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

  const mat = new THREE.PointsMaterial({
    size:            ptSize,
    vertexColors:    true,
    transparent:     true,
    opacity:         ptAlpha,
    sizeAttenuation: true,
    depthWrite:      false,
  });

  scene.add(new THREE.Points(geo, mat));

  // Axis label sprites
  const labelDefs = axisMode === 'tow'
    ? [['θ', new THREE.Vector3(2.6, 0, 0)], ['ω', new THREE.Vector3(0, 2.6, 0)], ['φ', new THREE.Vector3(0, 0, 2.6)]]
    : [['θ', new THREE.Vector3(2.6, 0, 0)], ['ω', new THREE.Vector3(0, 2.6, 0)], ['t', new THREE.Vector3(0, 0, 2.6)]];
  labelDefs.forEach(([text, pos]) => scene.add(makeLabel(text, pos)));

  if (info) {
    info.innerHTML =
      `<strong>${count.toLocaleString()}</strong> points rendered<br>` +
      `from ${n.toLocaleString()} total`;
  }

  // Resize
  resizeOb = new ResizeObserver(() => {
    if (!renderer) return;
    const nW = wrap.clientWidth, nH = wrap.clientHeight;
    camera.aspect = nW / nH;
    camera.updateProjectionMatrix();
    renderer.setSize(nW, nH);
  });
  resizeOb.observe(wrap);

  // Render loop
  function animate() {
    animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

// ── Sprite label ───────────────────────────────────────────────────────────

function makeLabel(text, position) {
  const c = document.createElement('canvas');
  c.width = 80; c.height = 80;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 52px serif';
  ctx.fillStyle = '#aaaacc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 40, 40);

  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const spr = new THREE.Sprite(mat);
  spr.position.copy(position);
  spr.scale.set(0.6, 0.6, 1);
  return spr;
}

// ── Tiny helper ────────────────────────────────────────────────────────────

function bindVal(id, valId, fmt) {
  const s = document.getElementById(id);
  const d = document.getElementById(valId);
  s.addEventListener('input', () => { d.textContent = fmt(parseFloat(s.value)); });
}
