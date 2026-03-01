import { init as initPendulum, destroy as destroyPendulum } from './pendulum.js';
import { init as initGenerator }                            from './generator.js';
import { init as initPhase2D }                             from './phase2d.js';
import { init as initPhase3D, destroy as destroyPhase3D }  from './phase3d.js';

const views = {
  pendulum:  { init: initPendulum,  destroy: destroyPendulum  },
  generator: { init: initGenerator, destroy: null             },
  phase2d:   { init: initPhase2D,   destroy: null             },
  phase3d:   { init: initPhase3D,   destroy: destroyPhase3D   },
};

let current = null;

function activate(name) {
  if (name === current) return;

  // Tear down old view
  if (current) {
    document.getElementById(`view-${current}`).classList.remove('active');
    document.querySelector(`[data-view="${current}"]`).classList.remove('active');
    if (views[current].destroy) views[current].destroy();
  }

  current = name;
  const el = document.getElementById(`view-${name}`);
  el.classList.add('active');
  document.querySelector(`[data-view="${name}"]`).classList.add('active');
  views[name].init(el);
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => activate(item.dataset.view));
});

activate('pendulum');
