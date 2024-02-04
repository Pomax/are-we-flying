import { createBrowserClient } from "../socketless.js";

// Let's import a class that's *actually* going to do all the work...
import { Plane } from "./plane.js";

// And then we update our browser client, whose sole responsibility
// is to hand off state updates to our new "Plane" object:
class BrowserClient {
  async init() {
    this.plane = new Plane(this.server);
  }

  async update(prevState) {
    // set a class on the HTML body based on our connection state...
    document.body.classList.toggle(`connected`, this.state.serverConnection);

    // And then, ather than "doing anything" here, we just pass the current
    // state on to the Plane. All we do in this file is wait for the next update.
    this.plane?.updateState(this.state);
  }
}

window.browserClient = createBrowserClient(BrowserClient);
