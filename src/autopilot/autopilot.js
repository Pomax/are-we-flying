import url from "node:url";
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
} from "../utils/constants.js";
import { degrees } from "../utils/utils.js";
import { ALOSInterface } from "../elevation/alos-interface.js";

// allow hot-reloading of flyLevel and altitudeHold code,
// with the functions (re)bound in the AutoPilot instance.
import { watch } from "../utils/reload-watcher.js";
import { flyLevel as fl } from "./fly-level.js";
import { altitudeHold as ah } from "./altitude-hold.js";
import { followTerrain as ft } from "./terrain-follow.js";

// allow hot-reloading of these classes with global binding.
import { AutoTakeoff as ato } from "./auto-takeoff.js";
import { FlightInformation as fi } from "../utils/flight-information.js";
import { WayPoints as wp } from "./waypoints/waypoints.js";

let AutoTakeoff = ato;
let FlightInformation = fi;
let WayPoints = wp;

const FAST_AUTOPILOT = 200;
const REGULAR_AUTOPILOT = 500;

export const LOAD_TIME = Date.now();

export class AutoPilot {
  constructor(api, onChange = () => {}) {
    this.api = api;
    this.alos = new ALOSInterface(process.env.DATA_FOLDER);
    this.onChange = onChange;
    this.AP_INTERVAL = REGULAR_AUTOPILOT;
    this.reset();
    this.watchForUpdates();
  }

  async reset() {
    console.log(`resetting autopilot`);
    this.bootstrap();
    this.autoPilotEnabled = false;
    this.autoTakeoff = false;
    this.modes = {
      [LEVEL_FLIGHT]: false,
      [HEADING_MODE]: false,
      [ALTITUDE_HOLD]: false,
      [AUTO_THROTTLE]: false,
      [TERRAIN_FOLLOW]: false,
      [AUTO_TAKEOFF]: false,
      [INVERTED_FLIGHT]: false, // TODO: fly upside down. It has to happen again. It's just too good.
    };
    this.onChange(await this.getParameters);
  }

  bootstrap() {
    // Set up values we need during the autopilot main loop
    this.paused = false;
    this.resetTrim();
    this.waypoints ??= new WayPoints(this);
    this.waypoints.resetWaypoints();

    // set up a new flight information object and instantiate it.
    this.flightInformation = new FlightInformation(this.api);
    this.flightInformation.update();

    // operators
    this.flyLevel = fl;
    this.altitudeHold = ah;
    this.followTerrain = ft;
  }

  resetTrim() {
    this.trim = {
      pitch: 0,
      roll: 0,
      yaw: 0,
    };
  }

  // Hot-reload watching
  watchForUpdates() {
    watch(`${__dirname}../utils/flight-information.js`, (module) => {
      FlightInformation = module.FlightInformation;
      if (this.flightInformation) {
        Object.setPrototypeOf(
          this.flightInformation,
          FlightInformation.prototype
        );
      }
    });
    watch(`${__dirname}fly-level.js`, (module) => {
      this.flyLevel = module.flyLevel;
    });
    watch(`${__dirname}altitude-hold.js`, (module) => {
      this.altitudeHold = module.altitudeHold;
    });
    watch(`${__dirname}terrain-follow.js`, (module) => {
      this.followTerrain = module.followTerrain;
    });
    watch(`${__dirname}auto-takeoff.js`, (module) => {
      AutoTakeoff = module.AutoTakeoff;
      this.autoTakeoff = new AutoTakeoff(this, this.autoTakeoff);
    });
    watch(`${__dirname}waypoints/waypoints.js`, (module) => {
      WayPoints = module.WayPoints;
      this.waypoints = new WayPoints(this, this.waypoints);
    });
  }

  setPaused(value) {
    this.paused = value;
  }

  async getWaypoints() {
    const { PLANE_LATITUDE: lat, PLANE_LONGITUDE: long } = await this.get(
      `PLANE_LATITUDE`,
      `PLANE_LONGITUDE`
    );
    return this.waypoints.getWaypoints(lat, long);
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

  async trigger(name, value) {
    if (!this.api.connected) {
      return;
    }
    this.api.trigger(name, value);
  }

  async getParameters() {
    const state = {
      MASTER: this.autoPilotEnabled,
      waypoints: await this.getWaypoints(),
      elevation: this.modes[TERRAIN_FOLLOW] ? this.elevation : false,
    };
    Object.entries(this.modes).forEach(([key, value]) => {
      state[key] = value;
    });
    return state;
  }

  async setParameters(params) {
    console.log(`received params`, params);
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
    if (typeof value === `number`) {
      value = parseFloat(value.toFixed(2));
    }
    if (prev === value) return;
    modes[type] = value;
    console.log(`changing ${type} from ${prev} to ${value}`);
    this.processChange(type, prev, value);
  }

  async processChange(type, oldValue, newValue) {
    if (type === AUTO_TAKEOFF) {
      if (oldValue === false && newValue === true) {
        this.autoTakeoff = new AutoTakeoff(this);
        this.resetTrim();
      }
      this.AP_INTERVAL = newValue ? FAST_AUTOPILOT : REGULAR_AUTOPILOT;
    }

    if (type === LEVEL_FLIGHT && newValue === true) {
      const { AILERON_TRIM_PCT: roll } = await this.get("AILERON_TRIM_PCT");
      // console.log(`Engaging level mode, trim=${x}`);
      this.trim.roll = roll;
    }

    if (type === ALTITUDE_HOLD) {
      const { ELEVATOR_TRIM_POSITION: pitch } = await this.get(
        "ELEVATOR_TRIM_POSITION"
      );
      // console.log(`Engaging altitude hold at ${newValue} feet, trim=${y}`);
      this.trim.pitch = pitch;
    }

    if (type === HEADING_MODE) {
      if (newValue !== false) {
        // console.log(`Engaging heading hold at ${newValue} degrees`);
        this.set("AUTOPILOT_HEADING_LOCK_DIR", newValue);
      }
    }

    this.onChange(await this.getParameters());
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

    // get the up to date flight information
    await this.flightInformation.updateFlight();

    if (!this.modes[AUTO_TAKEOFF] && this.flightInformation.speed < 15) {
      // disengage autopilot, but preserve all settings
      // in case we want to turn it back on momentarily.
      return;
    }

    // Are we in auto-takeoff?
    if (this.modes[AUTO_TAKEOFF]) {
      this.autoTakeoff.run(this.flightInformation);
    }

    // Do we need to level the wings / fly a specific heading?
    if (this.modes[LEVEL_FLIGHT]) {
      const { noAileronTrim } = this.flightInformation.model;
      this.flyLevel(this, this.flightInformation, noAileronTrim);
    }

    // Do we need to hold our altitude / fly a specific altitude?
    if (this.modes[ALTITUDE_HOLD]) {
      if (this.modes[TERRAIN_FOLLOW] !== false && this.alos.loaded) {
        // If we are in terrain-follow mode, make sure the correct
        // altitude is set before running the ALT pass.
        this.followTerrain(this, this.flightInformation);
      }

      const { noElevatorTrim } = this.flightInformation.model;
      console.log(`noElevatorTrim: ${noElevatorTrim}`);
      this.altitudeHold(this, this.flightInformation, noElevatorTrim);
    }
  }
}
