const dirname = import.meta.dirname;
import { watch } from "../utils/reload-watcher.js";
import { constrainMap, runLater } from "../utils/utils.js";
import { reloading } from "esm-class-reloading";

// Import our new constants
import {
  ALTITUDE_HOLD,
  AUTO_LANDING_DATA,
  AUTO_LANDING,
  AUTO_TAKEOFF,
  AUTO_THROTTLE,
  AUTOPILOT_INTERVAL,
  FAST_AUTOPILOT_INTERVAL,
  HEADING_MODE,
  HEADING_TARGETS,
  LEVEL_FLIGHT,
  TERRAIN_FOLLOW_DATA,
  TERRAIN_FOLLOW,
} from "../utils/constants.js";

// TODO: replace reload-watcher with esm-class-reloading in the following imports:

let { flyLevel } = await watch(
  dirname,
  `fly-level.js`,
  (lib) => (flyLevel = lib.flyLevel)
);

let { autoThrottle } = await watch(
  dirname,
  `auto-throttle.js`,
  (lib) => (autoThrottle = lib.autoThrottle)
);

let { altitudeHold } = await watch(
  dirname,
  `altitude-hold.js`,
  (lib) => (altitudeHold = lib.altitudeHold)
);

let { terrainFollow } = await watch(
  dirname,
  `terrain-follow.js`,
  (lib) => (terrainFollow = lib.terrainFollow)
);

let { WayPointManager } = await watch(
  dirname,
  `waypoints/waypoint-manager.js`,
  (lib) => (WayPointManager = lib.WayPointManager)
);

let autoTakeoff = false;
let { AutoTakeoff } = await watch(dirname, `auto-takeoff.js`, (lib) => {
  AutoTakeoff = lib.AutoTakeoff;
  if (autoTakeoff) {
    Object.setPrototypeOf(autoTakeoff, AutoTakeoff.prototype);
  }
});

let { AutoLanding } = await watch(dirname, `auto-landing.js`);

const AutoPilot = reloading(
  import.meta,
  class AutoPilot {
    constructor(api, onChange = () => {}) {
      this.api = api;
      this.onChange = async (update) => {
        onChange(update ?? (await this.getParameters()));
      };

      this.waypoints = new WayPointManager(this);
      watch(dirname, `./waypoints/waypoint-manager.js`, (lib) => {
        WayPointManager = lib.WayPointManager;
        Object.setPrototypeOf(this.waypoints, WayPointManager.prototype);
      });

      this.autoLanding = false;
      watch(dirname, `auto-landing.js`, (lib) => {
        AutoLanding = lib.AutoLanding;
        if (this.autoLanding) {
          Object.setPrototypeOf(this.autoLanding, AutoLanding.prototype);
        }
      });

      this.reset();
    }

    reset(flightInformation, flightInfoUpdateHandler) {
      console.log(`resetting autopilot`);
      this.AP_INTERVAL = AUTOPILOT_INTERVAL;
      this.flightInformation = flightInformation;
      this.flightInfoUpdateHandler = flightInfoUpdateHandler;
      this.paused = false;
      this.modes = {
        MASTER: false,
        // Our first real autopilot mode!
        [LEVEL_FLIGHT]: false,
        [ALTITUDE_HOLD]: false,
        [HEADING_MODE]: false,
        [HEADING_TARGETS]: false,
        [AUTO_THROTTLE]: false,
        [TERRAIN_FOLLOW]: false,
        [TERRAIN_FOLLOW_DATA]: false,
        [AUTO_TAKEOFF]: false,
        [AUTO_LANDING]: false,
        [AUTO_LANDING_DATA]: false,
      };
      this.resetTrim();
      if (autoTakeoff) {
        autoTakeoff.done = true;
        autoTakeoff = false;
      }
      this.onChange();
    }

    resetTrim() {
      // Figure out a sensible "start value" for working
      // the aileron, based on the plane's weight/wingArea
      const { isAcrobatic, weight, wingArea, title } = this.flightInformation
        ?.model ?? {
        isAcrobatic: true,
        weight: 0,
        wingArea: 1,
        title: `unknown`,
      };
      const wpa = weight / wingArea;
      let initialRollValue = 300;
      if (!isAcrobatic) {
        initialRollValue = constrainMap(wpa, 4, 20, 1500, 5000);
      }
      console.log(
        `initial roll value for ${title}: ${initialRollValue} (${weight}/${wingArea} ≈ ${
          wpa | 0
        } psf)`
      );

      // zero out the trim vector, except for the aileron stick value.
      this.trim = {
        pitch: 0,
        roll: initialRollValue,
        yaw: 0,
      };
    }

    get autoPilotEnabled() {
      return this.modes.MASTER;
    }

    disable() {
      this.setParameters({ MASTER: false });
    }

    setPaused(value) {
      this.paused = value;
    }

    async getParameters() {
      return {
        ...this.modes,
        waypoints: this.waypoints?.getWaypoints(),
        waypointsRepeat: this.waypoints?.repeating,
      };
    }

    async setParameters(params) {
      const { api, modes } = this;
      const wasEnabled = modes.MASTER;
      Object.entries(params).forEach(([key, value]) => {
        this.setTarget(key, value);
      });

      // notify clients of all the changes that just occurred:
      this.onChange();

      // Then, MSFS might not actually be running...
      if (!this.api.connected) return;

      // but if it is, and we just turned our own autopilot on, then we'll
      // want to make sure to turn off the in-game autopilot (if it's on),
      // before we start to run our own code, so that it doesn't interfere:
      if (!wasEnabled && modes.MASTER) {
        const { AUTOPILOT_MASTER: gameAP } = await api.get(`AUTOPILOT_MASTER`);
        if (gameAP === 1) api.trigger(`AP_MASTER`);
        // now we can safely run our own autopilot code.
        this.runAutopilot();
      }
    }

    async setTarget(key, value) {
      // console.log(key, value);
      const { api, modes, trim } = this;

      if (modes[key] !== undefined) {
        const num = parseFloat(value);
        // intentional coercive comparison:
        if (num == value) value = num;
        modes[key] = value;
      }

      // If the switch was for our AP master, log that:
      if (key === `MASTER`) {
        console.log(`${value ? `E` : `Dise`}ngaging autopilot`);
        const oldValue = modes[key];
        if (oldValue === false && value === true) {
          this.reset();
        }
      }

      // When we turn the wing leveler on, make sure to copy the in-game
      // trim setting over into our trim vector. Pretty important!
      if (key === LEVEL_FLIGHT && value === true) {
        // const { AILERON_TRIM_PCT: roll } = await api.get("AILERON_TRIM_PCT");
        // trim.roll = roll;
        // console.log(`Engaging wing leveler. Initial trim:`, trim.roll);
      }

      // And we do the same if altitude hold got turned on.
      if (key === ALTITUDE_HOLD && value !== false) {
        if (value === undefined) {
          console.trace();
        }
        const { ELEVATOR_TRIM_POSITION: pitch } = await api.get(
          "ELEVATOR_TRIM_POSITION"
        );
        trim.pitch = pitch;
      }

      if (key === HEADING_MODE && value !== false) {
        // When we set a heading, update the "heading bug" in-game:
        api.set(`AUTOPILOT_HEADING_LOCK_DIR`, value);
      }

      // Did we turn auto takeoff on or off?
      if (key === AUTO_TAKEOFF) {
        if (!autoTakeoff && value === true) {
          autoTakeoff = new AutoTakeoff(this);
          this.resetTrim();
          this.AP_INTERVAL = FAST_AUTOPILOT_INTERVAL;
        } else if (value === false && autoTakeoff) {
          autoTakeoff = false;
          this.AP_INTERVAL = AUTOPILOT_INTERVAL;
        }
      }

      // Did we turn auto landing on or off?
      if (key === AUTO_LANDING) {
        if (value === true && this.flightInformation?.data) {
          let { lat, long } = this.flightInformation.data;
          const { waypoints } = this;
          if (waypoints.active) {
            const { lat: t, long: g } = waypoints.getWaypoints().at(-1);
            lat = t;
            long = g;
          }

          if (!this.autoLanding) {
            // If we're turning it on, does it need run relative
            // to our position, or the last waypoint?
            this.autoLanding = new AutoLanding(
              this,
              lat,
              long,
              this.flightInformation.model
            );
            this.setTarget(
              AUTO_LANDING_DATA,
              this.autoLanding.approachData ?? {}
            );
          }
          this.autoLanding.reset(this, lat, long, this.flightInformation.model);
        }
      }
    }

    async runAutopilot() {
      const { api, modes, paused } = this;

      // Sanity check: *should* this code run?
      if (!api.connected) return;
      if (!modes.MASTER) return;

      // If the autopilot is enabled, even if there are errors due to
      // MSFS glitching, or the DLL handling glitching, or values somehow
      // having gone missing, or our own code throwing errors that we
      // need to fix, etc. etc: schedule the next call, and hopefully
      // things work by then.
      runLater(() => this.runAutopilot(), this.AP_INTERVAL);

      // If the game is paused, then don't run the autopilot code, but
      // only for "this call". Maybe by the next call the game won't be
      // paused anymore.
      if (paused) return;

      // And remember: *never* allow code to crash the server:
      try {
        await this.run();
        this.onChange();
      } catch (e) {
        console.error(e);
      }
    }

    async run() {
      const { modes, flightInformation, waypoints } = this;
      const { currentWaypoint: waypoint } = waypoints;

      this.flightInfoUpdateHandler(await flightInformation.update());

      if (flightInformation.data.slewMode) return;

      try {
        if (modes[LEVEL_FLIGHT]) await flyLevel(this, flightInformation);
        if (modes[ALTITUDE_HOLD]) await altitudeHold(this, flightInformation);
        if (modes[AUTO_THROTTLE]) await autoThrottle(this, flightInformation);
        if (modes[TERRAIN_FOLLOW]) await terrainFollow(this, flightInformation);
        if (modes[AUTO_TAKEOFF] && autoTakeoff) {
          await autoTakeoff.run(flightInformation);
        } else if (
          waypoint?.landing ||
          (this.autoLanding && !this.autoLanding.done)
        ) {
          // While the landing can be done at the regular interval, once we're
          // in the short final,
          const shortFinal = await this.autoLanding.run(flightInformation);
          this.AP_INTERVAL = shortFinal
            ? FAST_AUTOPILOT_INTERVAL
            : AUTOPILOT_INTERVAL;
        }
      } catch (e) {
        console.warn(e);
      }
    }
  }
);

export { AutoPilot };
