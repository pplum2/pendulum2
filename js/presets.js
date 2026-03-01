// ── Parameter presets — Baker & Gollub, Chaotic Dynamics ─────────────────
//
// All use q=2 (invQ=0.5), Ω_D=2/3 except where noted — the canonical
// parameters from the book. g is varied to walk the bifurcation cascade.
// ─────────────────────────────────────────────────────────────────────────

export const PRESETS = [
  {
    group: 'Periodic orbits',
    items: [
      {
        name:  'Free decay',
        desc:  'No driving — natural damped oscillation spirals to rest',
        g: 0.0,  invQ: 0.5,  omegaD: 2/3,
      },
      {
        name:  'Period-1',
        desc:  'Stable limit cycle. One loop in phase space per drive period',
        g: 0.9,  invQ: 0.5,  omegaD: 2/3,
      },
      {
        name:  'Period-2',
        desc:  'First period-doubling bifurcation. Two loops before repeating',
        g: 1.07, invQ: 0.5,  omegaD: 2/3,
      },
      {
        name:  'Period-4',
        desc:  'Second doubling. Poincaré shows 4 discrete points',
        g: 1.33, invQ: 0.5,  omegaD: 2/3,
      },
      {
        name:  'Period-3 window',
        desc:  'Island of order embedded in the chaotic sea — 3 Poincaré dots',
        g: 1.47, invQ: 0.5,  omegaD: 2/3,
      },
    ],
  },
  {
    group: 'Chaotic regimes',
    items: [
      {
        name:  'Chaos onset',
        desc:  'Just crossed the chaos threshold — intermittent bursts',
        g: 1.35, invQ: 0.5,  omegaD: 2/3,
      },
      {
        name:  'Chaos — B&G',
        desc:  'The primary example from Baker & Gollub. Strange attractor',
        g: 1.5,  invQ: 0.5,  omegaD: 2/3,
        highlight: true,
      },
      {
        name:  'Deep chaos',
        desc:  'Strongly chaotic, attractor fills a wider region',
        g: 1.8,  invQ: 0.5,  omegaD: 2/3,
      },
      {
        name:  'Intermittency',
        desc:  'Alternates between near-periodic laminar phases and chaos',
        g: 1.37, invQ: 0.5,  omegaD: 2/3,
      },
    ],
  },
  {
    group: 'Varying damping',
    items: [
      {
        name:  'Low damping',
        desc:  'Very lightly damped — sensitive to initial conditions',
        g: 1.5,  invQ: 0.1,  omegaD: 2/3,
      },
      {
        name:  'High damping',
        desc:  'Overdamped — chaos suppressed, settles to periodic',
        g: 1.5,  invQ: 1.5,  omegaD: 2/3,
      },
    ],
  },
  {
    group: 'Varying frequency',
    items: [
      {
        name:  'Near resonance',
        desc:  'Drive frequency close to natural frequency — large amplitude',
        g: 0.9,  invQ: 0.5,  omegaD: 1.0,
      },
      {
        name:  'Fast drive',
        desc:  'High frequency driving — different attractor topology',
        g: 1.5,  invQ: 0.5,  omegaD: 1.4,
      },
      {
        name:  'Slow drive',
        desc:  'Low frequency — pendulum can swing over the top',
        g: 1.5,  invQ: 0.5,  omegaD: 0.4,
      },
    ],
  },
];

// ── Apply a preset to store.params and sync all visible sliders ────────────

import { store } from './store.js';

export function applyPreset(preset) {
  store.params.g       = preset.g;
  store.params.invQ    = preset.invQ;
  store.params.omegaD  = preset.omegaD;
  syncSliders();
}

// Syncs whichever param sliders happen to be in the DOM right now.
function syncSliders() {
  const { g, invQ, omegaD } = store.params;

  const updates = {
    // Slider values
    'pn-g': g,      'gn-g': g,      'pc-g': g,
    'pn-q': invQ,   'gn-q': invQ,   'pc-q': invQ,
    'pn-w': omegaD, 'gn-w': omegaD, 'pc-w': omegaD,
    // Display spans
    'pn-gv': g.toFixed(2),      'gn-gv': g.toFixed(2),      'pc-gv': g.toFixed(2),
    'pn-qv': invQ.toFixed(2),   'gn-qv': invQ.toFixed(2),   'pc-qv': invQ.toFixed(2),
    'pn-wv': omegaD.toFixed(2), 'gn-wv': omegaD.toFixed(2), 'pc-wv': omegaD.toFixed(2),
  };

  for (const [id, val] of Object.entries(updates)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.tagName === 'INPUT') el.value = val;
    else el.textContent = val;
  }

  // Also update the Poincaré dt hint if visible
  const hint = document.getElementById('pc-dt-hint');
  if (hint) {
    const spp = parseFloat(document.getElementById('pc-spp')?.value ?? 200);
    const T_D = (2 * Math.PI) / omegaD;
    hint.textContent = `T_D = ${T_D.toFixed(4)} s,  dt = ${(T_D / spp).toFixed(5)} s`;
  }
}

// ── Render a compact preset panel into any container element ───────────────

export function renderPresets(container, onSelect) {
  const el = document.createElement('div');
  el.className = 'preset-panel';

  for (const group of PRESETS) {
    const groupEl = document.createElement('div');
    groupEl.className = 'preset-group';
    groupEl.innerHTML = `<div class="preset-group-label">${group.group}</div>`;

    for (const preset of group.items) {
      const btn = document.createElement('button');
      btn.className = 'preset-btn' + (preset.highlight ? ' preset-btn--star' : '');
      btn.textContent = preset.name;
      btn.title = `g=${preset.g.toFixed(2)}  1/q=${preset.invQ.toFixed(2)}  Ω_D=${preset.omegaD.toFixed(3)}\n${preset.desc}`;

      btn.addEventListener('click', () => {
        // Clear active state from siblings
        el.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('preset-btn--active'));
        btn.classList.add('preset-btn--active');

        applyPreset(preset);
        if (onSelect) onSelect(preset);
      });

      groupEl.appendChild(btn);
    }

    el.appendChild(groupEl);
  }

  container.appendChild(el);
  return el;
}
