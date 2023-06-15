import {
  connectAPI,
  getAPI,
  getSpecialAPI,
  setAPI,
  addEventListenerAPI,
  removeEventListenerAPI,
  triggerEvent,
  authenticate,
  callAutopilot,
} from "./api.js";
import { Duncan } from "./locations.js";
import { Plane } from "./plane.js";
import { Questions } from "./questions.js";
import { map } from "./maps.js";
import { DEBUG } from "./debug-flag.js";

let plane;

if (DEBUG) {
  const MSFS = (globalThis.MSFS = {
    off: {},
    get: getAPI,
    getSpecial: getSpecialAPI,
    set: setAPI,
    trigger: triggerEvent,
    on: (name, handler) => {
      addEventListenerAPI(name, handler);
      MSFS.off[name] = () => {
        removeEventListenerAPI(name, handler);
      };
    },
    ap: (params) => callAutopilot(`update`, params),
  });
}

// Our method for communicating with the server

const WEBSOCKET_URL = window.location
  .toString()
  .replace(`http`, `ws`)
  .replace(`/index.html`, ``);

const URLqueries = new URLSearchParams(window.location.search);
let experimentRunner;

const props = {
  onOpen: async () => {
    console.log(`Socket to proxy established`);
  },
  onClose: async () => {
    console.log(`Proxy disappeared... starting reconnect loop`);
    setTimeout(() => connectAPI(WEBSOCKET_URL, props), 5000);
  },
  onError: async () => {
    console.log(`No proxy server, retrying in 5 seconds`);
    setTimeout(() => connectAPI(WEBSOCKET_URL, props), 5000);
  },
  onConnect: async () => {
    console.log(`connected to API server`);
    Questions.serverUp(true);
    console.log(`authenticating`);
    await authenticate(
      localStorage.getItem(`flight-owner-key`) ??
        (await fetch(`./fok`).then((t) => t.text()))
    );
    console.log(`sending initial autopilot get`);
    await callAutopilot(`get`);
    addEventListenerAPI(`MSFS`, () => {
      console.log(`API says MSFS can be reached`);
      Questions.msfsRunning(true);
      // Note: if we use = instead of ??= we'll constantly be
      plane ??= new Plane(map, Duncan, 130);
      plane.reset();
      plane.waitForInGame();

      const experiment = URLqueries.get(`experiment`);
      if (experiment) {
        import(`./experiments/${experiment}/index.js`).then(
          ({ Experiment }) => {
            experimentRunner ??= new Experiment(map, plane);
          }
        );
      }
    });
  },
  onDisconnect: async () => {
    console.log(`disconnected from API server`);
    Questions.serverUp(false);
    Questions.msfsRunning(false);
  },
};

connectAPI(WEBSOCKET_URL, props);
