import { watch } from "../../../utils/reload-watcher.js";
import { runLater } from "../../../utils/utils.js";

let plane;
let { MockPlane } = await watch(
  import.meta.dirname,
  "./mock-plane.js",
  (lib) => {
    MockPlane = lib.MockPlane;
    if (plane) {
      Object.setPrototypeOf(plane, MockPlane.prototype);
    }
  }
);

export class MOCK_API {
  constructor() {
    console.log(`
      ==========================================
      =                                        =
      =        !!! USING MOCKED API !!!        =
      =                                        =
      ==========================================
    `);
    this.reset();
  }

  reset(notice) {
    if (notice) console.log(notice);
    plane ??= new MockPlane();
    plane.reset();
    this.connected = true;
    this.started = false;
    const { autopilot } = this;
    if (autopilot) {
      autopilot.disable();
      this.setAutopilot(autopilot);
    }
  }

  async setAutopilot(autopilot) {
    if (this.started) return;
    this.autopilot = autopilot;
    this.started = true;
    runLater(
      () => {
        autopilot.setParameters({
          MASTER: true,
          LVL: true,
          ALT: 1500,
          HDG: 270,
        });
      },
      10000,
      `--- Starting autopilot in 10 seconds ---`,
      () => {
        for (let i = 1; i < 10; i++) {
          const msg = `${10 - i}...`;
          setTimeout(() => console.log(msg), 1000 * i);
        }
      }
    );
  }

  async get(...props) {
    const first = props[0];
    // Airport calls get handled diuectly...
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
    // ...and everything else, we pull from our plane.
    const response = {};
    props.forEach((name) => {
      response[name] = plane.data[name.replace(/:.*/, ``)];
    });
    return response;
  }

  // Setters, we hand off to the plane itself, but triggers
  // and event registration, we flat out don't care about.
  set = async (name, value) => plane.set(name.replace(/:.*/, ``), value);
  trigger = async () => {};
  on = async () => {};

  // And the connect handler is just "yep, connected" =)
  connect = async (options) => options.onConnect();
}
