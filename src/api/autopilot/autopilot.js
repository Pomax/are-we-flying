import url from "url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

import {
  ACROBATIC,
  ALTITUDE_HOLD,
  AUTO_TAKEOFF,
  AUTO_THROTTLE,
  HEADING_MODE,
  INVERTED_FLIGHT,
  LEVEL_FLIGHT,
  TERRAIN_FOLLOW,
} from "./utils/constants.js";
import { degrees } from "./utils/utils.js";
import { followTerrain } from "./terrain-follow.js";
import { ALOSInterface } from "../../elevation/alos-interface.js";

// allow hot-reloading of flyLevel and altitudeHold code
import { addReloadWatcher } from "./reload-watcher.js";
import { flyLevel as fl } from "./fly-level.js";
import { altitudeHold as ah } from "./altitude-hold.js";
import { AutoTakeoff as ato } from "./auto-takeoff.js";
import { AP_VARIABLES as apv } from "./utils/ap-variables.js";
import { State as st } from "./utils/ap-state.js";
import { WayPoints as wp } from "./waypoints/waypoints.js";

let flyLevel = fl;
let altitudeHold = ah;
let AutoTakeoff = ato;
let AP_VARIABLES = apv;
let State = st;
let WayPoints = wp;

const FAST_AUTOPILOT = 200;
const REGULAR_AUTOPILOT = 500;

export class AutoPilot {
  constructor(api, onChange = () => {}) {
    this.api = api;
    this.alos = new ALOSInterface(process.env.DATA_FOLDER);
    this.onChange = onChange;
    this.AP_INTERVAL = REGULAR_AUTOPILOT;
    this.reset();
    this.watchForUpdates();
  }

  reset() {
    this.bootstrap();
    this.autoPilotEnabled = false;
    this.autoTakeoff = false;
    this.modes = {
      [LEVEL_FLIGHT]: false,
      [HEADING_MODE]: false,
      [ALTITUDE_HOLD]: false,
      [AUTO_THROTTLE]: true,
      [TERRAIN_FOLLOW]: false,
      [AUTO_TAKEOFF]: false,
      // we're going to ignore these two for now.
      [ACROBATIC]: false, // use the special acrobatic code instead?
      [INVERTED_FLIGHT]: false, // fly upside down?
    };
    this.onChange(this.getParameters);
  }

  bootstrap() {
    // Set up values we need during the autopilot main loop
    this.paused = false;
    this.resetTrim();
    this.prevState = new State();
    this.waypoints = new WayPoints(this);
  }

  resetTrim() {
    this.trim = { x: 0, y: 0, z: 0 };
  }

  // Hot-reload watching
  watchForUpdates() {
    addReloadWatcher(
      __dirname,
      `/utils/ap-variables.js`,
      (lib) => (AP_VARIABLES = lib.AP_VARIABLES)
    );
    addReloadWatcher(
      __dirname,
      `/utils/ap-state.js`,
      (lib) => (State = lib.State)
    );
    addReloadWatcher(
      __dirname,
      `fly-level.js`,
      (lib) => (flyLevel = lib.flyLevel)
    );
    addReloadWatcher(
      __dirname,
      `altitude-hold.js`,
      (lib) => (altitudeHold = lib.altitudeHold)
    );
    addReloadWatcher(__dirname, `auto-takeoff.js`, (lib) => {
      AutoTakeoff = lib.AutoTakeoff;
      this.autoTakeoff = new AutoTakeoff(this, this.autoTakeoff);
    });
    addReloadWatcher(__dirname, `waypoints/waypoints.js`, (lib) => {
      WayPoints = lib.WayPoints;
      this.waypoints = new WayPoints(this, this.waypoints);
    });
  }

  setPaused(value) {
    this.paused = value;
  }

  getWaypoints() {
    return this.waypoints.getWaypoints();
  }

  addWaypoint(lat, long, alt, landing) {
    this.waypoints.add(lat, long, alt, landing);
  }

  moveWaypoint(id, lat, long) {
    this.waypoints.move(id, lat, long);
  }

  elevateWaypoint(id, alt) {
    this.waypoints.elevate(id, alt);
  }

  removeWaypoint(id) {
    this.waypoints.remove(id);
  }

  clearWaypoints() {
    this.waypoints.reset();
  }

  async revalidateFlight() {
    const { PLANE_LATITUDE: lat, PLANE_LONGITUDE: long } = await this.get(
      `PLANE_LATITUDE`,
      `PLANE_LONGITUDE`
    );
    this.waypoints.revalidate(degrees(lat), degrees(long));
  }

  resetFlight() {
    this.waypoints.resetWaypoints();
  }

  async get(...names) {
    if (!this.api.connected) {
      return {};
    }
    return this.api.get(...names);
  }

  async set(name, value) {
    if (!this.api.connected) {
      return;
    }
    this.api.set(name, value);
  }

  async trigger(name) {
    if (!this.api.connected) {
      return;
    }
    this.api.trigger(name);
  }

  getParameters() {
    const state = {
      MASTER: this.autoPilotEnabled,
      waypoints: this.waypoints.getWaypoints(),
      elevation: this.modes[TERRAIN_FOLLOW] ? this.elevation : false,
    };
    Object.entries(this.modes).forEach(([key, value]) => {
      state[key] = value;
    });
    return state;
  }

  async setParameters(params) {
    if (params.ATO === true) {
      params.MASTER = true;
    }
    if (params.MASTER !== undefined) {
      this.autoPilotEnabled = params.MASTER;
      if (this.autoPilotEnabled) {
        // make sure the in-game autopilot is not running.
        const { AUTOPILOT_MASTER: on } = await this.get(`AUTOPILOT_MASTER`);
        if (on === 1) this.trigger(`AP_MASTER`);
        this.runAutopilot();
      }
    }
    if (params.zero !== undefined) {
      console.log(`resetting trim`);
      this.resetTrim();
    }
    Object.entries(params).forEach(([key, value]) =>
      this.setTarget(key, value)
    );
    return this.getParameters();
  }

  toggle(type) {
    const { modes } = this;
    if (modes[type] === undefined) return;
    this.setTarget(type, !modes[type]);
  }

  setTarget(type, value) {
    const { modes } = this;
    if (modes[type] === undefined) return;
    const prev = modes[type];
    modes[type] = value;
    this.processChange(type, prev, value);
  }

  async processChange(type, oldValue, newValue) {
    if (type === AUTO_TAKEOFF) {
      if (oldValue === false && newValue === true) {
        this.autoTakeoff = new AutoTakeoff(this);
        this.trim = { x: 0, y: 0, z: 0 };
      }
      this.AP_INTERVAL = newValue ? FAST_AUTOPILOT : REGULAR_AUTOPILOT;
    }

    if (type === LEVEL_FLIGHT && newValue === true) {
      const { AILERON_TRIM_PCT: x } = await this.get("AILERON_TRIM_PCT");
      // console.log(`Engaging level mode, trim=${x}`);
      this.trim.x = x;
    }

    if (type === ALTITUDE_HOLD) {
      const { ELEVATOR_TRIM_POSITION: y } = await this.get(
        "ELEVATOR_TRIM_POSITION"
      );
      // console.log(`Engaging altitude hold at ${newValue} feet, trim=${y}`);
      this.trim.y = y;
    }

    if (type === HEADING_MODE) {
      if (newValue !== false) {
        // console.log(`Engaging heading hold at ${newValue} degrees`);
        this.set("AUTOPILOT_HEADING_LOCK_DIR", newValue);
      }
    }

    this.onChange(this.getParameters());
  }

  async runAutopilot() {
    // This is our master autopilot entry point,
    // grabbing the current state from MSFS, and
    // forwarding it to the relevant AP handlers.
    if (!this.api.connected) return;
    if (!this.autoPilotEnabled) return;

    // If the autopilot is enabled, even if there
    // are errors due to MSFS glitching, or the DLL
    // handling glitching, or values somehow having
    // gone missing etc. etc: schedule the next call
    setTimeout(() => this.runAutopilot(), this.AP_INTERVAL);

    //  Are we flying, or paused/in menu/etc?
    if (this.paused) return;

    const data = await this.get(...AP_VARIABLES);
    const state = new State(data, this.prevState);

    if (!this.modes[AUTO_TAKEOFF] && state.speed < 15) {
      // disengage autopilot, but preserve all settings
      // in case we want to turn it back on momentarily.
      return;
    }

    // Are we in auto-takeoff?
    if (this.modes[AUTO_TAKEOFF]) {
      this.autoTakeoff.run(state);
    }

    // Do we need to level the wings / fly a specific heading?
    if (this.modes[LEVEL_FLIGHT]) {
      flyLevel(this, state);
    }

    // Do we need to hold our altitude / fly a specific altitude?
    if (this.modes[ALTITUDE_HOLD]) {
      if (this.modes[TERRAIN_FOLLOW] !== false && this.alos.loaded) {
        // If we are in terrain-follow mode, make sure the correct
        // altitude is set before running the ALT pass.
        followTerrain(this, state);
      }
      altitudeHold(this, state);
    }

    this.prevState = state;
  }
}
