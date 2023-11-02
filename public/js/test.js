import { Plane } from "./plane.js";
import { createBrowserClient } from "../socketless.js";

const URLqueries = new URLSearchParams(window.location.search);
const experiment = URLqueries.get(`experiment`);

/**
 * ...docs go here...
 */
class BrowserClient {
  #plane;
  #authenticationProperty = `flight-owner-key`;

  /**
   * ...docs go here...
   */
  async init() {
    // this.#authenticate();
    this.#plane = new Plane(this.server);
    if (experiment) {
      import(`./experiments/${experiment}/index.js`).then(({ Experiment }) =>
        Experiment(this.#plane)
      );
    }
  }

  /**
   * ...docs go here...
   */
  async update(prevState) {
    this.#plane.updateState(this.state);
  }
}

// Create our browser client.
window.TEST = createBrowserClient(BrowserClient);
