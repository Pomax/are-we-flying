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
import { degrees, runLater, nf } from "../utils/utils.js";
import { ALOSInterface } from "../elevation/alos-interface.js";

// allow hot-reloading of flyLevel and altitudeHold code,
// with the functions (re)bound in the AutoPilot instance.
import { watch } from "../utils/reload-watcher.js";

import { flyLevel as fl } from "./fly-level.js";
let flyLevel = fl;

import { altitudeHold as ah } from "./altitude-hold.js";
let altitudeHold = ah;

import { autoThrottle as at } from "./auto-throttle.js";
let autoThrottle = at;

import { followTerrain as ft } from "./terrain-follow.js";
let followTerrain = ft;

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
    this.onChange = async (update) => {
      onChange(update ?? (await this.getParameters()));
    };
    this.AP_INTERVAL = REGULAR_AUTOPILOT;
    this.reset();

    // control functions
    this.flyLevel = flyLevel;
    this.altitudeHold = altitudeHold;
    this.autoThrottle = autoThrottle;
    this.followTerrain = followTerrain;
    this.watchForUpdates();
  }

  async reset(flightInformation, flightInfoUpdateHandler) {
    console.log(`resetting autopilot`);
    this.flightInfoUpdateHandler = flightInfoUpdateHandler;
    this.bootstrap(flightInformation);
    this.modes = {
      [ALTITUDE_HOLD]: false,
      [AUTO_LAND]: false,
      [AUTO_TAKEOFF]: false,
      [AUTO_THROTTLE]: false,
      [HEADING_MODE]: false,
      [LEVEL_FLIGHT]: false,
      [TERRAIN_FOLLOW]: false,
      [INVERTED_FLIGHT]: false, // TODO: fly upside down. It has to happen again. It's just too good.
    };
    this.onChange();
  }

  bootstrap(flightInformation) {
    this.resetTrim();
    this.autoTakeoff = undefined;
    this.autoland?.reset();
    this.autoland = undefined;

    // FIXME: this should be waypointsManager or something, since it's not the list of waypoints itself.
    this.waypoints ??= new WayPoints(this);
    this.waypoints.resetWaypoints();

    this.flightInformation = flightInformation;
    this.paused = false;
    this.autoPilotEnabled = false;
    this.glide = false;
  }

  resetTrim() {
    this.trim = {
      pitch: 0,
      roll: 0,
      yaw: 0,
      pitchLocked: false, // bypass alt-hold
      rollLocked: false, // bypass wing leveler
      yawLocked: false, // bypass auto rudder
    };
  }

  test() {
    console.log(`AutoPilot.test(): there is currently no test code defined.`);
  }

  // Hot-reload watching
  watchForUpdates() {
    watch(__dirname, `fly-level.js`, (module) => {
      this.flyLevel = module.flyLevel;
    });
    watch(__dirname, `altitude-hold.js`, (module) => {
      this.altitudeHold = module.altitudeHold;
    });
    watch(__dirname, `auto-throttle.js`, (module) => {
      this.autoThrottle = module.autoThrottle;
    });
    watch(__dirname, `terrain-follow.js`, (module) => {
      this.followTerrain = module.followTerrain;
    });
    watch(__dirname, `auto-takeoff.js`, (module) => {
      AutoTakeoff = module.AutoTakeoff;
      if (this.autoTakeoff) {
        Object.setPrototypeOf(this.autoTakeoff, AutoTakeoff.prototype);
      }
    });
    watch(__dirname, `auto-land/auto-land.js`, (module) => {
      AutoLand = module.AutoLand;
      if (this.autoland) {
        Object.setPrototypeOf(this.autoland, AutoLand.prototype);
      }
    });
    watch(__dirname, `waypoints/waypoints.js`, (module) => {
      WayPoints = module.WayPoints;
      this.waypoints = new WayPoints(this, this.waypoints);
    });
  }

  disable() {
    this.setParameters({ MASTER: false });
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
    this.onChange();
  }

  moveWaypoint(id, lat, long) {
    this.waypoints.move(id, lat, long);
    this.onChange();
  }

  elevateWaypoint(id, alt) {
    this.waypoints.elevate(id, alt);
    this.onChange();
  }

  removeWaypoint(id) {
    this.waypoints.remove(id);
    this.onChange();
  }

  clearWaypoints() {
    this.waypoints.reset();
    this.onChange();
  }

  async revalidateFlight() {
    const { PLANE_LATITUDE: lat, PLANE_LONGITUDE: long } = await this.get(
      `PLANE_LATITUDE`,
      `PLANE_LONGITUDE`
    );
    this.waypoints.revalidate(degrees(lat), degrees(long));
    this.onChange();
  }

  resetFlight() {
    this.waypoints.resetWaypoints();
    this.autoland.reset();
    this.onChange();
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

  async setParameters(params) {
    try {
      if (params[AUTO_TAKEOFF] === true) {
        params.MASTER = true;
      }
      if (params[AUTO_LAND] && !this.modes[AUTO_LAND]) {
        await this.engageAutoLand(params[AUTO_LAND]);
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
  }

  async engageAutoLand(ICAO, Add_WAYPOINTS = true) {
    // Note we do not turn autoland "on", that'll happen automatically
    // once we hit a waypoint that's marked as a landing waypoint.
    this.modes[AUTO_LAND] = true;
    this.autoland = new AutoLand(this.api, this);
    this.landingTarget = await this.autoland.land(
      this.flightInformation,
      ICAO,
      Add_WAYPOINTS
    );
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
    if (value == parseFloat(value)) {
      value = parseFloat(value);
    }
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
    this.onChange();
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
    runLater(() => this.runAutopilot(), this.AP_INTERVAL);

    //  Are we flying, or paused/in menu/etc?
    if (this.paused) return;

    // Do *not* crash the server.
    try {
      await this.run();
      this.onChange();
    } catch (e) {
      console.error(e);
    }
  }

  async run() {
    // get the up to date flight information
    this.flightInfoUpdateHandler(await this.flightInformation.update());
    const { flightData, flightModel } = this.flightInformation;

    if (
      !this.modes[AUTO_TAKEOFF] &&
      !this.modes[AUTO_LAND] &&
      flightData.speed < 15
    ) {
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
      this.flyLevel(this, this.flightInformation, noAileronTrim);
    }

    // Do we need to hold our altitude / fly a specific altitude?
    if (this.modes[ALTITUDE_HOLD]) {
      if (this.modes[TERRAIN_FOLLOW] !== false && this.alos.loaded) {
        // If we are in terrain-follow mode, make sure the correct
        // altitude is set before running the ALT pass.
        this.followTerrain(this, this.flightInformation);
      }

      const { noElevatorTrim } = flightModel;
      this.altitudeHold(this, this.flightInformation, noElevatorTrim);
    }

    // Do we need to throttle to a specific speed?
    if (this.modes[AUTO_THROTTLE]) {
      this.autoThrottle(this, this.flightInformation);
    }
  }
}
