import {
  constrainMap,
  getDistanceBetweenPoints,
  getHeadingFromTo,
  getPointAtDistance,
  projectCircleOnLine,
  project,
  getCompassDiff,
} from "../../utils/utils.js";
import { Waypoint } from "./waypoint.js";
import {
  ALTITUDE_HOLD,
  HEADING_MODE,
  HEADING_TARGETS,
  KM_PER_ARC_DEGREE,
  ONE_KTS_IN_KMS,
} from "../../utils/constants.js";

const { abs, max } = Math;
const innerRadiusRatio = 2 / 3;
const MIN_RADIUS_IN_SECONDS = 20;

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
   * how many seconds will we need for the upcoming transition?
   */
  getTransitionRadius(lat, long, speed, vs1, cruiseSpeed, p1) {
    const { points } = this;
    const minRadiusInKM = MIN_RADIUS_IN_SECONDS * speed * ONE_KTS_IN_KMS;
    let p2 = p1?.next;

    // Are we closer to p1 than p2?
    if (!p2) return minRadiusInKM;
    const d1 = getDistanceBetweenPoints(lat, long, p1.lat, p1.long);
    const d2 = getDistanceBetweenPoints(lat, long, p2.lat, p2.long);
    if (d1 < d2) {
      const prevPos = points.findIndex((e) => e === p1) - 1;
      if (prevPos > -1) {
        p1 = points[prevPos];
        p2 = p1.next;
      }
    }

    // Once we've figured that out, see if we have three
    // waypoints to work with, or there won't be a "transition":
    const p3 = p2?.next;
    if (!p1 || !p2 || !p3) return minRadiusInKM;

    // If we have three points, see what the heading difference is,
    // and then turn that into a second amount based on a turn rate
    // of 3 degrees per second, then turn that into an actual distance
    // value based on our current air speed:
    const aHeadingDiff = abs(getCompassDiff(p1.heading, p2.heading));
    let seconds = aHeadingDiff / 3;
    seconds = constrainMap(speed, vs1, cruiseSpeed, seconds / 10, seconds);
    const radiusInKM = seconds * speed * ONE_KTS_IN_KMS;
    return max(minRadiusInKM, radiusInKM);
  }

  /**
   * Have our waypoint manager update the autopilot's
   * heading mode, if we're not flying in the right
   * direction at the moment, then return our heading.
   */
  getHeading({
    autopilot,
    heading,
    lat,
    long,
    declination,
    speed,
    vs1,
    cruiseSpeed,
  }) {
    const { modes } = autopilot;
    let { currentWaypoint: p1 } = this;
    const radiusInKM = this.getTransitionRadius(
      lat,
      long,
      speed,
      vs1,
      cruiseSpeed,
      p1
    );

    let p2, p3, target;
    let targets = [];

    // Do we even need to do anything?
    if (!p1) {
      if (!modes[HEADING_MODE]) {
        autopilot.setParameters({
          [HEADING_MODE]: heading,
        });
      }
    }

    // We'll go with a radius based on X seconds at our current speed,
    // where X is a full minute if we're near stall speed, or only 30
    // seconds if we're going at cruise speed.
    else {
      // Do we only have a single point?
      p2 = p1.next;
      if (!p2) {
        this.checkTransition(lat, long, p1, radiusInKM);
      }

      // If we have at least two points, let's do some projective planning.
      else if (p2 && !this.checkTransition(lat, long, p2, radiusInKM)) {
        // project the plane
        const { x, y } = project(p1.long, p1.lat, p2.long, p2.lat, long, lat);
        const fp = { lat: y, long: x };
        targets.push(fp);
        target = fp;

        // if we're close enough, project forward by radial distance
        const a = getDistanceBetweenPoints(lat, long, fp.lat, fp.long);
        const h = radiusInKM;
        if (a < h) {
          0;
          const b = (h ** 2 - a ** 2) ** 0.5;
          target = getPointAtDistance(
            fp.lat,
            fp.long,
            b * innerRadiusRatio,
            p1.heading
          );
          targets.push(target);
        }

        // Second check: are we close enough to the next leg? If so,
        // transition early.
        p3 = p2.next;
        if (p3) {
          const { x, y } = project(p2.long, p2.lat, p3.long, p3.lat, long, lat);
          const fp = { lat: y, long: x };
          targets.push(fp);
          if (this.checkTransition(lat, long, fp)) {
            target = fp;
          } else {
          }
        }
      }

      if (target) {
        // We now know which GPS coordinate to target, so let's
        // determine what heading that equates to:
        const newHeading = getHeadingFromTo(lat, long, target.lat, target.long);

        const hdg = parseFloat(
          ((360 + newHeading - declination) % 360).toFixed(2)
        );

        // And if that's not the heading we're already flying, update the autopilot!
        if (modes[HEADING_MODE] !== hdg) {
          autopilot.setParameters({
            [HEADING_MODE]: hdg,
          });
        }
      }
    }

    // For visualization purposes, update the targets involved in this code:
    autopilot.setParameters({
      [HEADING_TARGETS]: {
        radius: radiusInKM,
        targets,
      },
    });

    return modes[HEADING_MODE];
  }

  /**
   * Check whether we should transition to the next waypoint
   * based on the plane's current GPS coordinate. Note that
   * this is not a good transition policy, but we'll revisit
   * this code in the next subsection to make it much better.
   */
  checkTransition(lat, long, point, radiusInKM) {
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
