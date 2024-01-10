// We don't need to put a "socketless.js" in our public dir,
// this is a "magic import" that works when we're connected
// to a socketless web server:
import { createBrowserClient } from "../socketless.js";

// Then we set up our browser client to announce its connections:
class BrowserClient {
  async init() {
    console.log(`[browser] We're connected to our web client!`);

    // And then as part of startup, we'll call the server's
    // test function, just to confirm that works:
    console.log(`Calling test:`, await this.server.test());
  }
}

// Then the only thing left to do in the browser is to create a browser client instance:
createBrowserClient(BrowserClient);
