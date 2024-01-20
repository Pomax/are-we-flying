import {
  getDistanceBetweenPoints,
  getHeadingFromTo,
  lerp,
  projectCircleOnLine,
} from "../../utils/utils.js";
import { Waypoint } from "./waypoint.js";
import {
  ALTITUDE_HOLD,
  HEADING_MODE,
  KM_PER_ARC_DEGREE,
  ONE_KTS_IN_KMS,
} from "../../utils/constants.js";

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
  getHeading(autopilot, lat, long, declination, speed) {
    const { modes } = autopilot;
    const { points, currentWaypoint } = this;
    const p1 = currentWaypoint;
    let target;

    // Do we need to do anything?
    if (!p1) return;

    // we'll go with a radius based on X seconds at our current speed:
    const seconds = 60;
    const radiusInKM = speed * ONE_KTS_IN_KMS * seconds;

    // Do we only have a single point?
    const p2 = p1.next;
    if (!p2) {
      this.checkTransition(lat, long, p1.lat, p1.long, radiusInKM);
      target = p1;
    }

    // We have two or more points, so let's keep going!
    else {
      target = projectCircleOnLine(
        long,
        lat,
        radiusInKM * KM_PER_ARC_DEGREE,
        p1.long,
        p1.lat,
        p2.long,
        p2.lat
      );
      const { constrained } = target;

      target = { lat: target.y, long: target.x };

      if (!constrained) {
        let fp = projectCircleOnLine(
          long,
          lat,
          0,
          p1.long,
          p1.lat,
          p2.long,
          p2.lat
        );
        fp = { lat: fp.y, long: fp.x };
        target.lat += fp.lat - lat;
        target.long += fp.long - long;
      }

      // Do we have three or more points?
      const p3 = p2.next;
      if (!p3) {
        this.checkTransition(lat, long, p2.lat, p2.long, radiusInKM);
      }

      // We do: let's keep going!
      else {
        const intersection = projectCircleOnLine(
          long,
          lat,
          radiusInKM * KM_PER_ARC_DEGREE,
          p2.long,
          p2.lat,
          p3.long,
          p3.lat
        );
        if (
          this.checkTransition(
            lat,
            long,
            intersection.y,
            intersection.x,
            radiusInKM
          )
        ) {
          target = { lat: intersection.y, long: intersection.x };
        }
      }
    }

    // We now know which GPS coordinate to target, so let's
    // determine what heading that equates to:
    const newHeading = getHeadingFromTo(lat, long, target.lat, target.long);
    const hdg = parseFloat(((360 + newHeading - declination) % 360).toFixed(2));

    // And if that's not the heading we're already flying, update the autopilot!
    if (modes[HEADING_MODE] !== hdg) {
      autopilot.setParameters({
        [HEADING_MODE]: hdg,
      });
    }

    return modes[HEADING_MODE];
  }

  /**
   * Check whether we should transition to the next waypoint
   * based on the plane's current GPS coordinate. Note that
   * this is not a good transition policy, but we'll revisit
   * this code in the next subsection to make it much better.
   */
  /**
   * And our updated "check transition" function, based on radial distance:
   */
  checkTransition(lat, long, lat2, long2, radiusInKM) {
    const { currentWaypoint } = this;
    const d = getDistanceBetweenPoints(lat, long, lat2, long2);
    // Are we close enough to transition to the next point?
    if (d < radiusInKM) {
      currentWaypoint.deactivate();
      this.currentWaypoint = currentWaypoint?.complete();
      // Do we need to wrap-around after transitioning?
      if (!this.currentWaypoint && this.repeating) {
        this.resetWaypoints();
      }
      this.currentWaypoint?.activate();
      return true;
    }
    return false;
  }

  /**
   * Check if we need to set the autopilot's altitude hold
   * value to something new, and then return our hold alt:
   */
  getAltitude(autopilot) {
    const { modes } = autopilot;
    const { currentWaypoint: p1 } = this;
    if (p1) {
      let { alt } = p1;

      // Do we have a next waypoint?
      const p2 = p1.next;
      if (p2 && !!p2.alt && p2.alt > p1.alt) {
        alt = p2.alt;
      }

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
    this.resequence();
    this.currentWaypoint = points[nearest.pos];
    this.currentWaypoint.activate();
  }
}
