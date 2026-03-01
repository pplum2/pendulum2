// ── Driven damped pendulum — Baker & Gollub, Chaotic Dynamics (eq. 2.3) ──────
//
//   d²θ/dt² = −(1/q)·dθ/dt − sin(θ) + g·cos(Ω_D·t)
//
// State:  { theta, omega, t }
// Params: { g, invQ, omegaD }
// ─────────────────────────────────────────────────────────────────────────────

function deriv(theta, omega, t, { g, invQ, omegaD }) {
  return {
    dTheta: omega,
    dOmega: -invQ * omega - Math.sin(theta) + g * Math.cos(omegaD * t),
  };
}

export function rk4Step(state, params, dt) {
  const { theta, omega, t } = state;

  const k1 = deriv(theta,                       omega,                       t,            params);
  const k2 = deriv(theta + 0.5*dt*k1.dTheta,   omega + 0.5*dt*k1.dOmega,   t + 0.5*dt,  params);
  const k3 = deriv(theta + 0.5*dt*k2.dTheta,   omega + 0.5*dt*k2.dOmega,   t + 0.5*dt,  params);
  const k4 = deriv(theta +     dt*k3.dTheta,    omega +     dt*k3.dOmega,    t +     dt,  params);

  return {
    theta: theta + (dt/6) * (k1.dTheta + 2*k2.dTheta + 2*k3.dTheta + k4.dTheta),
    omega: omega + (dt/6) * (k1.dOmega + 2*k2.dOmega + 2*k3.dOmega + k4.dOmega),
    t:     t + dt,
  };
}

// Run nSteps, recording every `stride`th point.
// Calls onProgress(fraction) periodically if provided.
export function runBatch(initialState, params, dt, nSteps, stride) {
  const points = [];
  let s = { ...initialState };
  const TWO_PI = 2 * Math.PI;

  for (let i = 0; i < nSteps; i++) {
    s = rk4Step(s, params, dt);
    if (i % stride === 0) {
      points.push({
        theta: s.theta,
        omega: s.omega,
        t:     s.t,
        phi:   ((params.omegaD * s.t) % TWO_PI + TWO_PI) % TWO_PI, // drive phase [0, 2π)
      });
    }
  }

  return { points, finalState: s };
}
