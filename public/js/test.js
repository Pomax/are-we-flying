import { Plane } from "./plane.js";
import { createBrowserClient } from "../socketless.js";

const URLqueries = new URLSearchParams(window.location.search);
const experiment = URLqueries.get(`experiment`);

class BrowserClient {
  #plane;
  #authenticationProperty = `flight-owner-key`;

  async init() {
    this.#authenticate();
    this.#plane = new Plane(this.server);
    if (experiment) {
      import(`./experiments/${experiment}/index.js`).then(({ Experiment }) =>
        Experiment(this.#plane)
      );
    }
  }

  async #authenticate() {
    const label = this.#authenticationProperty;
    if (!localStorage.getItem(label)) {
      localStorage.setItem(label, await fetch(`./fok`).then((t) => t.text()));
    }
    const FOK = localStorage.getItem(label);
    if (FOK) await this.server.authenticate(FOK);
  }

  async update(prevState) {
    this.#plane.updateState(this.state);
  }
}

window.TEST = createBrowserClient(BrowserClient);
