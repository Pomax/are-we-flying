import {
  KMS_PER_KNOT,
  AUTO_TAKEOFF,
  HEADING_MODE,
  AUTO_LAND,
} from "../../../utils/constants.js";
import {
  dist,
  getHeadingFromTo,
  getDistanceBetweenPoints,
  pathIntersection,
} from "../../../utils/utils.js";

export function getHeading(waypoints, heading, cy, cx, speed, declination) {
  const { currentWaypoint: p1, autopilot } = waypoints;
  const { modes } = autopilot;

  // if we're in auto-takeoff, waypoints should not be active yet
  if (modes[AUTO_TAKEOFF]) return;

  heading = modes[HEADING_MODE] || heading;

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
      waypoints.transition();
      return;
    }
    return getHeadingFromTo(cy, cx, p1y, p1x, declination);
  }

  p2.activate();
  const { lat: p2y, long: p2x, next: p3 } = p2;

  // our initial target is simply "the waypoint"
  let target = p1;

  // If there is a next point, How large should our transition area be?
  const transition_time = 30;
  let transitionRadius = 0.01 * speed * KMS_PER_KNOT * transition_time;

  // if we're autolanding, ensure we stick to our flightpath more tightly
  // than during normal flight, because we cannot be off from the runway.
  if (modes[AUTO_LAND]) {
    console.log(`autoland flight path rules`);
    transitionRadius /= 2;
  }

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
    waypoints.transition();
    if (i2) {
      target = i2;
    }
  }

  // Update our heading to align us with our flight path.
  return getHeadingFromTo(cy, cx, target.y, target.x, declination);
}
