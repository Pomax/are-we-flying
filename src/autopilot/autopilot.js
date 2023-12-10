import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

import {
  ACROBATIC,
  ALTITUDE_HOLD,
  AUTO_LAND,
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
let flyLevel = fl;
watch(__dirname, `fly-level.js`, (module) => {
  flyLevel = module.flyLevel;
});

import { altitudeHold as ah } from "./altitude-hold.js";
let altitudeHold = ah;
watch(__dirname, `altitude-hold.js`, (module) => {
  altitudeHold = module.altitudeHold;
});

import { followTerrain as ft } from "./terrain-follow.js";
let followTerrain = ft;
watch(__dirname, `terrain-follow.js`, (module) => {
  followTerrain = module.followTerrain;
});

import { AutoTakeoff as ato } from "./auto-takeoff.js";
let AutoTakeoff = ato;

import { AutoLand as atl } from "./auto-land/auto-land.js";
let AutoLand = atl;

import { WayPoints as wp } from "./waypoints/waypoints.js";
let WayPoints = wp;

// ---- hot reloads end ---

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

  async sendParameters() {
    const params = await this.getParameters();
    this.onChange(params);
  }

  async reset(flightInformation, flightInfoUpdateHandler) {
    console.log(`resetting autopilot`);
    this.flightInfoUpdateHandler = flightInfoUpdateHandler;
    this.bootstrap(flightInformation);
    this.paused = false;
    this.autoPilotEnabled = false;
    this.autoTakeoff = false;
    this.modes = {
      [LEVEL_FLIGHT]: false,
      [HEADING_MODE]: false,
      [ALTITUDE_HOLD]: false,
      [AUTO_THROTTLE]: false,
      [TERRAIN_FOLLOW]: false,
      [AUTO_TAKEOFF]: false,
      [AUTO_LAND]: false,
      [INVERTED_FLIGHT]: false, // TODO: fly upside down. It has to happen again. It's just too good.
    };
    // this.onChange(await this.getParameters);
    this.sendParameters();
  }

  bootstrap(flightInformation) {
    this.resetTrim();
    this.autoland = undefined;
    this.waypoints ??= new WayPoints(this);
    this.waypoints.resetWaypoints();
    this.flightInformation = flightInformation;
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
    watch(__dirname, `auto-takeoff.js`, (module) => {
      AutoTakeoff = module.AutoTakeoff;
      if (this.autoTakeoff) {
        Object.setPrototypeOf(this.autoTakeoff, AutoTakeoff.prototype);
      }
    });
    watch(__dirname, `auto-land/auto-land.js`, (module) => {
      AutoLand = module.AutoLand;
      this.autoland = AutoLand.from(this.autoland);
    });
    watch(__dirname, `waypoints/waypoints.js`, (module) => {
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
      landingTarget: this.landingTarget,
    };
    Object.entries(this.modes).forEach(([key, value]) => {
      state[key] = value;
    });
    return state;
  }

  async engageAutoLand(Add_WAYPOINTS = true) {
    this.modes[AUTO_LAND] = true;
    this.autoland = new AutoLand(this.api, this);
    this.landingTarget = await this.autoland.land(
      this.flightInformation,
      Add_WAYPOINTS
    );
  }

  async setParameters(params) {
    try {
      if (params[AUTO_TAKEOFF] === true) {
        params.MASTER = true;
      }
      if (params[AUTO_LAND] === true) {
        await this.engageAutoLand();
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
    } catch (e) {
      console.warn(e);
    }
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
    // ignore changes that are too small, unless we're in auto
    // take-off, or autolanding mode. Then every decimal matters.
    if (
      typeof value === `number` &&
      !(this.modes[AUTO_TAKEOFF] || this.modes[AUTO_LAND])
    ) {
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

    //this.onChange(await this.getParameters());
    this.sendParameters();
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
    this.flightInfoUpdateHandler(await this.flightInformation.update());
    const { flightData, flightModel } = this.flightInformation;

    if (!this.modes[AUTO_TAKEOFF] && !this.modes[AUTO_LAND] && flightData.speed < 15) {
      // disengage autopilot, but preserve all settings
      // in case we want to turn it back on momentarily.
      return;
    }

    // Are we in auto-takeoff?
    if (this.modes[AUTO_TAKEOFF]) {
      this.autoTakeoff.run(this.flightInformation);
    }

    // Are we in an auto-landing?
    try {
      await this.autoland?.run();
    } catch (e) {
      console.warn(`AUTOLAND THROW`, e);
    }

    // Do we need to level the wings / fly a specific heading?
    if (this.modes[LEVEL_FLIGHT]) {
      const { noAileronTrim } = flightModel;
      flyLevel(this, this.flightInformation, noAileronTrim);
    }

    // Do we need to hold our altitude / fly a specific altitude?
    if (this.modes[ALTITUDE_HOLD]) {
      if (this.modes[TERRAIN_FOLLOW] !== false && this.alos.loaded) {
        // If we are in terrain-follow mode, make sure the correct
        // altitude is set before running the ALT pass.
        followTerrain(this, this.flightInformation);
      }

      const { noElevatorTrim } = flightModel;
      altitudeHold(this, this.flightInformation, noElevatorTrim);
    }
  }
}
