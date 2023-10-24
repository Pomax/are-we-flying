import url from "url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../.env` });
const { API_PORT } = process.env;

import { ClientClass, ServerClass } from "../classes/index.js";
import { linkClasses } from "socketless";
const factory = linkClasses(ClientClass, ServerClass);
const { webserver } = factory.createServer();

webserver.addRoute(`/`, (_, res) => {
  res.writeHead(200, { "Content-Type": `text/html` });
  res.end(
    `<!doctype html><p>API server status: running, MSFS${
      api.connected ? `` : ` not`
    } connected${api.connected ? `` : ` (yet)`}.</p>`
  );
});

webserver.listen(API_PORT, () => {
  console.log(`Server listening on http://localhost:${API_PORT}`);
});
