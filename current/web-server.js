const { dirname } = import.meta;

const { API_PORT, WEB_PORT } = process.env;

import { ClientClass } from "./src/classes/client/client.js";
import { createWebClient } from "socketless";

const serverURL = `http://localhost:${API_PORT}`;
const dir = `${dirname}/public`;
const { clientWebServer } = createWebClient(ClientClass, serverURL, dir);

clientWebServer.listen(WEB_PORT, () => {
  console.log(`Server listening on http://localhost:${WEB_PORT}`);
  if (process.argv.includes(`--browser`)) {
    import("open").then(({ default: open }) => {
      open(`http://localhost:${WEB_PORT}`);
    });
  }
});

// *SOMETHING* is interfering with the title getting set correctly.
setTimeout(() => {
  process.title = `Web Server`;
  process.stdout.write(`\x1b]2;${process.title}\x1b\x5c`);
}, 50);
