// We start the same was as above:
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/.env` });

// Instead of "just a server" our web server will act as a client
// to our API server, but as web server for browsers that try to
// connect. As such we need to know both the port for our API server
// as well as what port we should use for our own server:
const { API_PORT, WEB_PORT } = process.env;

// Then we set up a socketless client with "browser connection" functionality:
import { ClientClass } from "./src/classes/index.js";
import { createWebClient } from "socketless";

// Clients need to know which URL to find the server at:
const serverURL = `http://localhost:${API_PORT}`;

// And web clients need to know which directory/folder to serve static content from:
const dir = `${__dirname}/public`;

// Which means we can now create our "web-enabled client":
const { clientWebServer } = createWebClient(ClientClass, serverURL, dir);

// And then we run its web server the same way we ran the API server:
clientWebServer.listen(WEB_PORT, () => {
  console.log(`Server listening on http://localhost:${WEB_PORT}`);

  // With an extra bit that automatically opens a browser for us:
  if (process.argv.includes(`--browser`)) {
    import("open").then(({ default: open }) => {
      open(`http://localhost:${WEB_PORT}`);
    });
  }
});
