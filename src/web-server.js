import express from "express";
import expressWs from "express-ws";
import WebSocket from "ws";
import open from "open";

import dotenv from "dotenv";
dotenv.config({ path: `../.env` });
const { API_PORT } = process.env;
const PORT = process.env.WEB_PORT;

const API_SERVER_URL = `http://localhost:${API_PORT}`;
const app = express();
expressWs(app);

app.use(express.static(`../public`));
// app.get(`/geotiff/*`, (req, res) => {
//   const filepath = `${DATA_FOLDER}/${req.url.replace(
//     `/geotiff/`,
//     ``
//   )}`.replaceAll(`\\`, ``);
//   res.sendFile(filepath);
// });
// app.get(`/alos/:ne_lat/:ne_long/:sw_lat/:sw_long/:lat/:long`, (req, res) => {
//   const { ne_lat, ne_long, sw_lat, sw_long, lat, long } = req.params;
//   console.log(ne_lat, ne_long, sw_lat, sw_long, `--`, lat, long);
//   const tile = alos.getTileFor(lat, long);
//   res.sendFile(tile.toPNG());
// });
app.get(`/fok`, (_, res) => res.send(process.env.FLIGHT_OWNER_KEY));
app.get(`/`, (_, res) => res.redirect(`/index.html`));

const webSocketProxy = {
  api: false,
  clients: [],
};

const proxy = (data) =>
  webSocketProxy.clients.forEach((socket) =>
    socket.send(data.toString("utf-8"))
  );

app.ws("/", (socket) => {
  webSocketProxy.clients.push(socket);
  // forward any message from the client to the API server
  socket.on(`message`, (bytes) => {
    try {
      webSocketProxy.api?.send(bytes.toString("utf-8"));
    } catch (e) {
      console.log();
      throw e;
    }
  });
  // and let them know the connection's "good to go" if the API is already available:
  if (webSocketProxy.api) socket.send(`connected`);
  console.log(`Client socket established.`);
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  setupSocket();
  if (process.argv.includes(`--browser`)) {
    open(`http://localhost:${PORT}`);
  }
});

async function setupSocket() {
  try {
    await fetch(API_SERVER_URL);
    const WSURL = API_SERVER_URL.replace(`http`, `ws`);
    let socket = new WebSocket(WSURL);
    socket.on(`open`, () => {
      console.log("API Server socket established");
      webSocketProxy.api = socket;
      webSocketProxy.api.on(`message`, (msg) => proxy(msg));
      proxy(`connected`);
    });
    socket.on(`close`, () => {
      socket.close();
      webSocketProxy.api = undefined;
      proxy(`disconnected`);
      console.log(`going back into wait mode`);
      setupSocket();
    });
  } catch (error) {
    error = JSON.parse(JSON.stringify(error));
    const { code } = error.cause;
    if (code === `ECONNREFUSED`) {
      // If we were unable to establish a web socket connection,
      // the API server might just not be running (yet), so retry
      // the connection 5 seconds from now.
      console.log(`no API server (yet), retrying in 5 seconds`);
      setTimeout(setupSocket, 5000);
    } else {
      // If a different kind of error occurred, we should probably stop
      // trying to connect, because something unexpected is happening.
      console.error(error);
    }
  }
}
