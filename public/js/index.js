import { Plane } from "./plane.js";
import { createBrowserClient } from "../socketless.js";

class BrowserClient {
  plane;

  async init() {
    this.plane = new Plane(this.server);
  }

  async update(prevState) {
    document.body.classList.toggle(`connected`, this.state.serverConnection);
    this.plane.updateState(this.state);
  }
}

window.TEST = createBrowserClient(BrowserClient);
