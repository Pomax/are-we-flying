import url from "url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import { watch } from "../../utils/reload-watcher.js";
import { Waypoint as wp } from "./waypoint.js";
import { TransitionModes } from "./transitions/index.js";
import { AltitudeModes } from "./altitude/index.js";
import {
  ALTITUDE_HOLD,
  HEADING_MODE,
  TERRAIN_FOLLOW,
} from "../../utils/constants.js";
import { ALLOW_SELF_SIGNED_CERTS } from "socketless";

export const LOAD_TIME = Date.now();
const { abs } = Math;

let Waypoint = wp;

/**
 * ...docs go here...
 */
export class WayPoints {
  points = [];
  currentWaypoint = undefined;

  constructor(autopilot, original) {
    this.autopilot = autopilot;
    this.reset();
    if (original) Object.assign(this, original);
    watch(`${__dirname}waypoint.js`, (lib) => {
      Waypoint = lib.Waypoint;
      const { points } = this;
      points.forEach((p) => Object.setPrototypeOf(p, Waypoint.prototype));
    });
  }

  get length() {
    return this.points.length;
  }

  reset() {
    this.points = [];
    this.currentWaypoint = undefined;
  }

  hasActive() {
    if (this.points.length === 0) return false;
    if (!this.currentWaypoint) return false;
    return true;
  }

  // make sure that if someone asks for all waypoints, they don't get a reference to the actual array.
  getWaypoints(lat, long) {
    const points = this.points.slice();
    points.forEach((p, pos) => {
      p.setDistancetoPlane(lat, long);
      p.setNumber(pos + 1);
    });
    return points;
  }

  // add a waypoint for a specific GPS coordinate
  add(lat, long, alt, landing) {
    const { points } = this;
    const waypoint = new Waypoint(this, lat, long, alt, landing);
    points.push(waypoint);
    // if we don't have a "current" point, this is now it.
    this.currentWaypoint ??= waypoint;
    this.resequence();
    return waypoint;
  }

  // Move a waypoint around
  move(id, lat, long) {
    this.points.find((e) => e.id === id)?.move(lat, long);
  }

  // Change waypoint elevation
  elevate(id, alt) {
    this.points.find((e) => e.id === id)?.elevate(alt);
  }

  // Remove a waypoint from the flight path
  remove(id) {
    const { points } = this;
    const pos = points.findIndex((e) => e.id === id);
    if (pos > -1) {
      points.splice(pos, 1)[0];
      if (this.currentWaypoint?.id === id) {
        this.currentWaypoint = this.currentWaypoint.next;
      }
      this.resequence();
    }
  }

  // make sure all waypoints point to the next one in the flight path.
  resequence() {
    const { points } = this;
    for (let i = points.length - 1; i >= 0; i--) {
      points[i].setNext(points[i + 1]);
    }
  }

  // revalidate the flight path based on the current plane position,
  // marking the nearest waypoint as "the currently active point", and
  // any points prior to it as already completed.
  revalidate(lat, long) {
    const { points } = this;
    const nearest = { distance: Number.MAX_SAFE_INTEGER, pos: -1 };
    points.forEach((p, pos) => {
      p.reset();
      const d = getDistanceBetweenPoints(lat, long, p.lat, p.long);
      if (abs(d) < nearest.distance) {
        nearest.distance = d;
        nearest.pos = pos;
      }
    });
    for (let i = 0; i < nearest.pos; i++) points[i].complete();
    this.resequence();
    this.currentWaypoint = points[nearest.pos];
  }

  // remove all active/completed flags from all waypoints and mark the first point as our active point.
  resetWaypoints() {
    this.points.forEach((waypoint) => waypoint.reset());
    this.resequence();
    this.currentWaypoint = this.points[0];
  }

  // move the currently active waypoint to "the next" waypoint. Which might be nothing.
  transition() {
    const { currentWaypoint: c } = this;
    c.complete();
    this.currentWaypoint = this.currentWaypoint.next;
  }

  // ...docs go here...
  getHeading(heading, lat, long, speed, declination) {
    return TransitionModes.getProjectiveHeading(
      this,
      heading,
      lat,
      long,
      speed,
      declination
    );
  }

  // ...docs go here...
  getAltitude() {
    if (this.autopilot.modes[TERRAIN_FOLLOW]) return;
    return AltitudeModes.getNaiveAltitude(this);
  }
}
