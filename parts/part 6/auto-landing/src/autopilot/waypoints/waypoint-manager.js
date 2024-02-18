import {
  constrain,
  constrainMap,
  getDistanceBetweenPoints,
  getHeadingFromTo,
  getPointAtDistance,
  project,
  getCompassDiff,
} from "../../utils/utils.js";
import { Waypoint } from "./waypoint.js";
import {
  ALTITUDE_HOLD,
  HEADING_MODE,
  HEADING_TARGETS,
  KM_PER_NM,
  ONE_KTS_IN_KMS,
  KNOTS_IN_KM_PER_MINUTE,
  TERRAIN_FOLLOW,
  ENV_PATH,
} from "../../utils/constants.js";

import dotenv from "dotenv";
dotenv.config({ path: ENV_PATH });

const { DATA_FOLDER, ALOS_PORT: PORT } = process.env;
import { ALOS_VOID_VALUE } from "../../elevation/alos-constants.js";
import { ALOSInterface } from "../../elevation/alos-interface.js";
const alos = new ALOSInterface(DATA_FOLDER);

const { abs, max } = Math;
const innerRadiusRatio = 2 / 3;
const MIN_RADIUS_IN_SECONDS = 20;

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

  get active() {
    return !!this.currentWaypoint;
  }

  toggleRepeating() {
    this.repeating = !this.repeating;
    this.resequence();
  }

  setLanding({ airport, runway, approach }) {
    this.landing = { airport, runway, approach };
  }

  getLanding() {
    const { airport, runway, approach } = this.landing ?? {};
    console.log(`getLanding`, !!airport, !!runway, !!approach);
    if (!airport) return;
    return { airport, runway, approach };
  }

  getWaypoints() {
    // Make sure that if someone asks for all waypoints, they
    // don't get a direct reference to the array we're using.
    return this.points.slice();
  }

  add(lat, long, alt, resequence = true, landing = false) {
    const { points } = this;
    const waypoint = new Waypoint(lat, long, alt, landing);
    points.push(waypoint);
    // If we don't have a "current" point, this is now it.
    if (!this.currentWaypoint) {
      this.currentWaypoint = waypoint;
      this.currentWaypoint.activate();
    }
    if (resequence === true) this.resequence();
    return waypoint;
  }

  setFlightPlan(points) {
    this.reset();
    points.forEach(({ lat, long, alt }) => this.add(lat, long, alt, false));
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
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[i + 1];
      a.id = i + 1;
      if (b) b.id = i + 2;
      a.setNext(b);
    }

    if (this.repeating) {
      points.at(-1).setNext(points[0]);
    }

    // push the update to clients
    this.autopilot.onChange();
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

    let target;
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
      // Get our target, but if it's more than 5 minutes away, ignore
      // any projections we might have gotten here and instead target
      // the waypoint itself.
      target = this.getTarget(lat, long, p1, radiusInKM, targets);

      if (target) {
        const d = getDistanceBetweenPoints(lat, long, target.lat, target.long);
        if (d > speed * KNOTS_IN_KM_PER_MINUTE * 5) {
          target = p1;
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
   * ...
   */
  getTarget(lat, long, p1, radiusInKM, targets = []) {
    let p2, p3, target;

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
          // FIXME: TODO: do the reflecty trick?
        }
      }
    }

    return target;
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

    // Auto landing wins; otherwise terrain follow wins.
    if (p1?.landing || modes[TERRAIN_FOLLOW]) {
      return modes[ALTITUDE_HOLD];
    }

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
   * ...
   */
  getMaxElevation(lat, long, probeLength, declination) {
    const { currentWaypoint: c } = this;
    let maxElevation = { elevation: { meter: ALOS_VOID_VALUE } };
    let geoPolies = [];
    let current = c;
    let heading = c.heading;
    let target = current.next;

    if (target) {
      const d1 = getDistanceBetweenPoints(lat, long, target.lat, target.long);
      const d2 = target.distance * KM_PER_NM;

      // If we haven't quite reached the current waypoint yet,
      // we need a "leg" from our plane to the waypoint.
      if (d1 > d2) {
        const h = getHeadingFromTo(lat, long, current.lat, current.long);
        const d = getDistanceBetweenPoints(
          lat,
          long,
          current.lat,
          current.long
        );
        const f = getPointAtDistance(lat, long, probeLength, h);
        const c = d > probeLength ? f : current;
        const geoPoly = [
          getPointAtDistance(lat, long, 1, h - 90),
          getPointAtDistance(c.lat, c.long, 1, h - 90),
          getPointAtDistance(c.lat, c.long, 1, h + 90),
          getPointAtDistance(lat, long, 1, h + 90),
        ].map(({ lat, long }) => [lat, long]);
        const partialMax = alos.getMaxElevation(geoPoly);
        if (maxElevation.elevation.meter < partialMax.elevation.meter) {
          maxElevation = partialMax;
        }
        geoPolies.push(geoPoly);
        probeLength -= d;
      }
    }

    // Then we can check how many segments of this flight path
    // we need in order to cover our probe length
    while (target && probeLength > 0) {
      const d = getDistanceBetweenPoints(lat, long, target.lat, target.long);
      if (d < probeLength) {
        if (target === c.next) {
          // partial coverage (first segment)
          const g = current.geoPoly.slice();
          const r = constrain(d / (target.distance * KM_PER_NM), -1, 1);
          g[0] = [
            r * g[0][0] + (1 - r) * g[1][0],
            r * g[0][1] + (1 - r) * g[1][1],
          ];
          g[3] = [
            r * g[3][0] + (1 - r) * g[2][0],
            r * g[3][1] + (1 - r) * g[2][1],
          ];
          geoPolies.push(g);
          const partialMax = alos.getMaxElevation(g);
          if (maxElevation.elevation.meter < partialMax.elevation.meter) {
            maxElevation = partialMax;
          }
        } else {
          // full segment coverage
          geoPolies.push(current.geoPoly);
          if (
            maxElevation.elevation.meter < current.maxElevation.elevation.meter
          ) {
            maxElevation = current.maxElevation;
          }
        }
      } else {
        // partial coverage (last segment)
        const g = current.geoPoly.slice();
        const r = probeLength / d;
        g[1] = [
          (1 - r) * g[0][0] + r * g[1][0],
          (1 - r) * g[0][1] + r * g[1][1],
        ];
        g[2] = [
          (1 - r) * g[3][0] + r * g[2][0],
          (1 - r) * g[3][1] + r * g[2][1],
        ];
        geoPolies.push(g);
        const partialMax = alos.getMaxElevation(g);
        if (maxElevation.elevation.meter < partialMax.elevation.meter) {
          maxElevation = partialMax;
        }
      }
      probeLength -= d;
      heading = current.heading;
      current = target;
      target = current.next;
    }

    if (probeLength > 0) {
      const geoPoly = [
        getPointAtDistance(current.lat, current.long, 1, heading - 90),
        getPointAtDistance(current.lat, current.long, probeLength, heading),
        getPointAtDistance(current.lat, current.long, 1, heading + 90),
      ].map(({ lat, long }) => [lat, long]);
      geoPolies.push(geoPoly);
      const probeMax = alos.getMaxElevation(geoPoly);
      if (maxElevation.elevation.meter < probeMax) {
        maxElevation = probeMax;
      }
    }

    return { geoPolies, maxElevation };
  }
}
