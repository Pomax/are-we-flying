import {
  KMS_PER_KNOT,
  AUTO_TAKEOFF,
  HEADING_MODE,
} from "../utils/constants.js";

import {
  dist,
  getHeadingFromTo,
  getDistanceBetweenPoints,
  pathIntersection,
} from "../utils/utils.js";

import url from "url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import { addReloadWatcher } from "../reload-watcher.js";
import { Waypoint as wp } from "./waypoint.js";
let Waypoint = wp;

const { abs } = Math;

export class WayPoints {
  constructor(autopilot, original) {
    this.autopilot = autopilot;
    this.reset();
    if (original) Object.assign(this, original);
    addReloadWatcher(__dirname, `waypoint.js`, (lib) => {
      Waypoint = lib.Waypoint;
      const { points } = this;
      points.forEach(
        (p, pos) => (points[pos] = new Waypoint(0, 0, 0, 0, 0, p))
      );
    });
  }

  reset() {
    this.points = [];
    this.currentWaypoint = undefined;
  }

  get length() {
    return this.points.length;
  }

  // make sure that if someone asks for all waypoints, they don't get a reference to the actual array.
  getWaypoints() {
    return this.points.slice();
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
  getHeading(state) {
    const { modes } = this.autopilot;
    // if we're in auto-takeoff, waypoints should not be active yet
    if (modes[AUTO_TAKEOFF]) return;

    let heading = modes[HEADING_MODE] || state.heading;

    const { latitude: cy, longitude: cx, speed, declination } = state;
    const { currentWaypoint: p1 } = this;

    // Do we even have a waypoint to work with?
    if (!p1) return heading;

    // We do. Is there a next waypoint to work with?
    const { lat: p1y, long: p1x } = p1;
    const p2 = p1.next;
    p1.activate();

    if (!p2) {
      const d1 = getDistanceBetweenPoints(cy, cx, p1y, p1x);
      if (d1 < 0.5) {
        // resolve the last point
        this.transition();
        return;
      }
      heading = getHeadingFromTo(cy, cx, p1y, p1x);
      return (heading - declination + 360) % 360;
    }

    p2.activate();
    const { lat: p2y, long: p2x, next: p3 } = p2;

    // our initial target is simply "the waypoint"
    let target = p1;

    // If there is a next point, How large should our transition area be?
    const transition_time = 30;
    const transitionRadius = 0.01 * speed * KMS_PER_KNOT * transition_time;

    //
    const i1 = pathIntersection(p1x, p1y, p2x, p2y, cx, cy, transitionRadius);
    let i2 = undefined;

    // console.log({ p1x, p1y, p2x, p2y, cx, cy, transitionRadius, i1 });

    if (p3) {
      const { lat: p3y, long: p3x } = p3;
      i2 = pathIntersection(p2x, p2y, p3x, p3y, cx, cy, transitionRadius);
    }

    if (i1) target = i1;

    const d2 = dist(cx, cy, p2x, p2y);

    const contained = (p) => {
      if (!p) return false;
      const { x, y } = p;
      return dist(p1.x, p1.y, x, y) <= transitionRadius;
    };

    if (d2 < transitionRadius || (contained(i1) && contained(i2))) {
      // move to the next point
      this.transition();
      if (i2) {
        target = i2;
      }
    }

    // Update our heading to align us with our flight path.
    heading = getHeadingFromTo(cy, cx, target.y, target.x);
    return (heading - declination + 360) % 360;
  }

  getAltitude(state) {
    const { currentWaypoint: p1 } = this;
    if (!p1) return;
    const { next: p2 } = p1;
    if (p2 && !!p2.alt) {
      // We use a ridiculously simple policy: if the next waypoint has a higher altitude set than we are currently at,
      // fly up to reach that altitude, no matter how far away the next waypoint is. However, if its altitude is lower
      // than our current altitude, maintain our current altitude until we get to the next waypoint.
      if (!p1.alt || p2.alt > p1.alt) return p2.alt;
    }
    return p1.alt;
  }
}
