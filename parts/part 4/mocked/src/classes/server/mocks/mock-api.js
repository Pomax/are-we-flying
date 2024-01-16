import { watch } from "../../../utils/reload-watcher.js";
let { MockPlane } = await watch(import.meta.dirname, "./mock-plane.js", (lib) => {
  MockPlane = lib.MockPlane;
  if (plane) {
    Object.setPrototypeOf(plane, MockPlane.prototype);
  }
});
let plane = new MockPlane();

import { runLater } from "../../../utils/utils.js";

export class MOCK_API {
  constructor() {
    console.log(`
      ==========================================
      =                                        =
      =        !!! USING MOCKED API !!!        =
      =                                        =
      ==========================================
    `);
    this.connected = true;
  }

  async setAutopilot(autopilot) {
    console.log(`Starting flight in 10 seconds`);

    runLater(() => {
      autopilot.setParameters({
        MASTER: true,
        LVL: true,
        ALT: 1500,
      });
    }, 10000);

    for (let i = 1; i < 10; i++) {
      const msg = `${10 - i}...`;
      setTimeout(() => console.log(msg), 1000 * i);
    }
  }

  async connect(options) {
    options.onConnect();
  }

  async get(...props) {
    const first = props[0];
    if (props.length === 1 && first === `ALL_AIRPORTS`) {
      return { ALL_AIRPORTS: AIRPORTS };
    }
    if (props.length === 1 && first === `NEARBY_AIRPORTS`) {
      return { NEARBY_AIRPORTS: AIRPORTS };
    }
    if (props.length === 1 && first.startsWith(`AIRPORT:`)) {
      return {
        [first]: AIRPORTS.find((a) => a.icao === first.replace(`AIRPORT:`, ``)),
      };
    }
    // everything else gets handled by the "plane".
    const result = plane.get(props);
    return result;
  }

  async set(name, value) {
    plane.set(name.replace(/:.*/, ``), value);
  }

  async trigger(name, value) {
    plane.trigger(name, value);
  }

  async on({ name }, handler) {
    if (name === `Sim`) {
      runLater(() => handler(1), 1000);
    }
  }
}
