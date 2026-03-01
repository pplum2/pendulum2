// Shared application state — single source of truth for params & data

export const store = {
  params: {
    g:       1.5,    // driving amplitude
    invQ:    0.5,    // damping  (1/q)
    omegaD:  2 / 3, // drive frequency
  },
  dt:     0.02,  // integration time step
  data:   [],    // array of { theta, omega, t, phi } — filled by generator
};
