import { Plane } from "./plane.js";
import { createBrowserClient } from "../socketless.js";

class BrowserClient {
  plane;

  async init() {
    this.plane = new Plane(this.server);
    const URLqueries = new URLSearchParams(window.location.search);
    const experiment = URLqueries.get(`experiment`);
    if (experiment) {
      this.loadExperiment(experiment);
    }
  }

  async loadExperiment(experiment) {
    import(`./experiments/${experiment}/index.js`).then(
      ({ Experiment }) => new Experiment(this.plane)
    );
  }

  async update(prevState) {
    this.plane.updateState(this.state);
  }
}

window.TEST = createBrowserClient(BrowserClient);
