// First we load our .env file:
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/.env` });

// Then we set up socketless so it can do its thing:
import { createServer } from "socketless";
import { ServerClass } from "./src/classes/index.js";

// Where "its thing" is creating an API server:
const { webserver } = createServer(ServerClass);

// Which we then run like any other Node server.
const { API_PORT } = process.env;
webserver.listen(API_PORT, () => {
  console.log(`Server listening on http://localhost:${API_PORT}`);
});
