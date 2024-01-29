import {
  constrainMap,
  getDistanceBetweenPoints,
  getHeadingFromTo,
  getPointAtDistance,
  projectCircleOnLine,
  project,
} from "../../utils/utils.js";
import { Waypoint } from "./waypoint.js";
import {
  ALTITUDE_HOLD,
  HEADING_MODE,
  HEADING_TARGETS,
  KM_PER_ARC_DEGREE,
  ONE_KTS_IN_KMS,
} from "../../utils/constants.js";

const { acos, atan2, min, sign } = Math;
const innerRadiusRatio = 2 / 3;

const sub = (v1, v2) => ({ lat: v2.lat - v1.lat, long: v2.long - v1.long });
const dot = (v1, v2) => v1.lat * v2.lat + v1.long * v2.long;
const mag = (v) => (v.lat ** 2 + v.long ** 2) ** 0.5;

export class WayPointManager {
  constructor(autopilot) {
    this.autopilot = autopilot;
    this.reset();
  }

  reset() {
    this.points = [];
    this.currentWaypoint = undefined;
    this.repeating = false;
    this.autopilot.onChange();
  }

  toggleRepeating() {
    this.repeating = !this.repeating;
    this.resequence();
  }

  getWaypoints() {
    // Make sure that if someone asks for all waypoints, they
    // don't get a direct reference to the array we're using.
    return this.points.slice();
  }

  add(lat, long, alt) {
    const { points } = this;
    const waypoint = new Waypoint(lat, long, alt);
    points.push(waypoint);
    // If we don't have a "current" point, this is now it.
    if (!this.currentWaypoint) {
      this.currentWaypoint = waypoint;
      this.currentWaypoint.activate();
    }
    this.resequence();
  }

  setWaypointPosition(id, lat, long) {
    this.points.find((e) => e.id === id)?.setPosition(lat, long);
    this.resequence();
  }

  setWaypointElevation(id, alt) {
    this.points.find((e) => e.id === id)?.setElevation(alt);
    this.resequence();
  }

  /**
   * remove a waypoint and resequence.
   * @param {*} id
   */
  remove(id) {
    const { points } = this;
    const pos = points.findIndex((e) => e.id === id);
    if (pos === -1) return;
    points.splice(pos, 1)[0];
    if (this.currentWaypoint?.id === id) {
      this.currentWaypoint = this.currentWaypoint.next;
      this.currentWaypoint?.activate();
    }
    this.resequence();
  }

  /**
   * Duplicate a waypoint, and put it *after* the one
   * that's being duplicated, so that dragging the
   * duplicate doesn't affect the prior flight path.
   */
  duplicate(id) {
    const { points } = this;
    const pos = points.findIndex((e) => e.id === id);
    if (pos === -1) return;
    // create a copy right next to the original point
    const waypoint = points[pos];
    const { lat, long, alt } = waypoint;
    const copy = new Waypoint(lat, long, alt);
    points.splice(pos, 0, copy);
    this.resequence();
  }

  /**
   * Make this waypoint the current target.
   */
  target(id) {
    const { points } = this;
    const pos = points.findIndex((e) => e.id === id);
    if (pos === -1) return;
    // create a copy right next to the original point
    this.currentWaypoint = points[pos];
    points.forEach((p, i) => {
      p.reset();
      if (i < pos) p.complete();
      else if (i === pos) {
        p.activate();
        this.currentWaypoint = p;
      }
    });
    this.resequence();
  }

  /**
   * Make sure each waypoint knows what "the next waypoint" is.
   */
  resequence() {
    const { points } = this;
    points.forEach((p, i) => {
      p.id = i + 1;
      p.setNext(points[i + 1]);
    });

    if (this.repeating) {
      points.at(-1).setNext(points[0]);
    }

    // push the update to clients
    this.autopilot.onChange();
  }

  /**
   * Remove all active/completed flags from all waypoints
   * and mark the first point as our active point.
   */
  resetWaypoints() {
    this.points.forEach((waypoint) => waypoint.reset());
    this.currentWaypoint = this.points[0];
    this.currentWaypoint?.activate();
    this.resequence();
  }

  /**
   * Have our waypoint manager update the autopilot's
   * heading mode, if we're not flying in the right
   * direction at the moment, then return our heading.
   */
  getHeading({ autopilot, heading, lat, long, declination }) {
    const { modes } = autopilot;
    let { currentWaypoint: p1 } = this;

    // If we don't have a waypoint, and the autopilot doesn't
    // have anything set, then our current heading becomes our
    // autopilot heading parameter.
    if (!p1) {
      if (!modes[HEADING_MODE]) {
        autopilot.setParameters({
          [HEADING_MODE]: heading,
        });
      }
    }

    // If we do have a waypoint, then set the autopilot to
    // the heading we need to fly in order to fly "through"
    // our waypoint.
    else {
      const newHeading = getHeadingFromTo(lat, long, p1.lat, p1.long);
      // round the heading to 2 decimal places..
      const hdg = parseFloat(
        ((360 + newHeading - declination) % 360).toFixed(2)
      );

      // ...and if that's not the heading we're already flying,
      // update the autopilot!
      if (modes[HEADING_MODE] !== hdg) {
        autopilot.setParameters({
          [HEADING_MODE]: hdg,
        });
      }

      // Also make sure to check whether we're now close enough to
      // our waypoint that we need to transition to the next one:
      this.checkTransition(lat, long, p1);
    }

    return modes[HEADING_MODE];
  }

  /**
   * Check whether we should transition to the next waypoint
   * based on the plane's current GPS coordinate. Note that
   * this is not a good transition policy, but we'll revisit
   * this code in the next subsection to make it much better.
   */
  checkTransition(lat, long, point, radiusInKM = 1) {
    const d = getDistanceBetweenPoints(lat, long, point.lat, point.long);
    if (d < radiusInKM) {
      return this.transition();
    }
  }

  /**
   * do the thing.
   */
  transition() {
    const { points } = this;
    this.currentWaypoint.deactivate();
    this.currentWaypoint = this.currentWaypoint.complete();
    if (this.currentWaypoint === points[0]) this.resetWaypoints();
    this.currentWaypoint?.activate();
    return true;
  }

  /**
   * Check if we need to set the autopilot's altitude hold
   * value to something new, and then return our hold alt:
   */
  getAltitude(autopilot, alt) {
    const { modes } = autopilot;
    const { currentWaypoint: p1 } = this;

    // If we don't have a waypoint, then our current heading
    // becomes our current autopilot heading parameter.
    if (!p1) {
      if (!modes[ALTITUDE_HOLD]) {
        autopilot.setParameters({
          [ALTITUDE_HOLD]: alt,
        });
      }
    }

    // If we do have a waypoint, then set the autopilot to the
    // altitude we need to fly in order to fly at a safe level
    else {
      alt = p1.alt;

      // Do we have a next waypoint? And does it have
      // greater elevation than this one? If so, use that.
      const p2 = p1.next;
      if (p2 && !!p2.alt && p2.alt > p1.alt) {
        alt = p2.alt;
      }

      // Update the autopilot altitude parameter,
      // if we have a different value here.
      if (alt && modes[ALTITUDE_HOLD] !== alt) {
        autopilot.setParameters({ [ALTITUDE_HOLD]: alt });
      }
    }
    return modes[ALTITUDE_HOLD];
  }

  /**
   * revalidate the flight path based on the current plane position,
   * marking the nearest waypoint as "the currently active point", and
   * any points prior to it as already completed.
   */
  revalidate(lat, long) {
    // which point are we closest to?
    const { points } = this;
    let nearest = { pos: 0 };
    if (lat !== undefined && long !== undefined) {
      nearest = { distance: Number.MAX_SAFE_INTEGER, pos: -1 };
      points.forEach((p, pos) => {
        p.reset();
        const d = getDistanceBetweenPoints(lat, long, p.lat, p.long);
        if (d < nearest.distance) {
          nearest.distance = d;
          nearest.pos = pos;
        }
      });
    }

    // Mark all points before the one we're closest to as complete:
    for (let i = 0; i < nearest.pos; i++) points[i].complete();

    // And then make sure every point knows what the next point is,
    // and mark the one that we're closest to as our current waypoint.
    this.currentWaypoint = points[nearest.pos];
    this.currentWaypoint.activate();
    this.resequence();

    // and push the update to clients
    this.autopilot.onChange();
  }
}
