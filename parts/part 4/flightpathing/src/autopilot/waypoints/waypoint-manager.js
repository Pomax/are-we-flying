import {
  getDistanceBetweenPoints,
  getHeadingFromTo,
} from "../../utils/utils.js";
import { Waypoint } from "./waypoint.js";
import { HEADING_MODE, ALTITUDE_HOLD } from "../../utils/constants.js";

export class WayPointManager {
  constructor(autopilot) {
    this.autopilot = autopilot;
    this.reset();
  }

  reset() {
    this.points = [];
    this.currentWaypoint = undefined;
    this.repeating = false;
  }

  toggleRepeating() {
    this.repeating = !this.repeating;
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
  }

  setWaypointElevation(id, alt) {
    this.points.find((e) => e.id === id)?.setElevation(alt);
  }

  remove(id) {
    const { points } = this;
    const pos = points.findIndex((e) => e.id === id);
    if (pos > -1) {
      points.splice(pos, 1)[0];
      if (this.currentWaypoint?.id === id) {
        this.currentWaypoint = this.currentWaypoint.next;
        this.currentWaypoint?.activate();
      }
      this.resequence();
    }
  }

  /**
   * Make sure each waypoint knows what "the next waypoint" is.
   */
  resequence() {
    const { points } = this;
    points.forEach((p, i) => p.setNext(points[i + 1]));
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
  getHeading(autopilot, lat, long, declination) {
    const { modes } = autopilot;
    const { currentWaypoint } = this;
    if (currentWaypoint) {
      const { lat: lat2, long: long2 } = currentWaypoint;
      let target = getHeadingFromTo(lat, long, lat2, long2);
      let hdg = parseFloat((target - declination).toFixed(2));
      if (modes[HEADING_MODE] !== hdg) {
        autopilot.setParameters({ [HEADING_MODE]: hdg });
      }
      this.checkTransition(lat, long);
    }
    return modes[HEADING_MODE];
  }

  /**
   * Check whether we should transition to the next waypoint
   * based on the plane's current GPS coordinate. Note that
   * this is not a good transition policy, but we'll revisit
   * this code in the next subsection to make it much better.
   */
  checkTransition(lat, long) {
    const { currentWaypoint } = this;
    const { lat: lat2, long: long2 } = currentWaypoint;
    const thresholdInKm = 1;
    const d = getDistanceBetweenPoints(lat, long, lat2, long2);

    if (d < thresholdInKm) {
      currentWaypoint.deactivate();
      this.currentWaypoint = currentWaypoint?.complete();
      this.currentWaypoint?.activate();
    }

    if (!this.currentWaypoint && this.repeating) {
      this.resetWaypoints();
    }
  }

  /**
   * Check if we need to set the autopilot's altitude hold
   * value to something new, and then return our hold alt:
   */
  getAltitude(autopilot) {
    const { modes } = autopilot;
    const { currentWaypoint } = this;
    if (currentWaypoint) {
      const { alt } = currentWaypoint;
      if (alt && modes[ALTITUDE_HOLD] !== alt) {
        autopilot.setParameters({ [ALTITUDE_HOLD]: alt });
      }
    }
    return modes[ALTITUDE_HOLD];
  }
}
