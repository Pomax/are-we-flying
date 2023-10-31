import url from "url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/.env` });
const { API_PORT, WEB_PORT, FLIGHT_OWNER_KEY } = process.env;

import { ClientClass, ServerClass } from "./src/classes/index.js";
import { linkClasses } from "socketless";
const factory = linkClasses(ClientClass, ServerClass);

const serverURL = `http://localhost:${API_PORT}`;
const dir = `${__dirname}/public`;
const { clientWebServer } = factory.createWebClient(serverURL, dir);
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
