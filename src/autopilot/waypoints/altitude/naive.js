/**
 * We use a ridiculously simple policy: if the next waypoint has a higher
 * altitude set than we are currently at, fly up to reach that altitude,
 * no matter how far away the next waypoint is. However, if its altitude
 * is lower than our current altitude, maintain our current altitude until
 * we get to the next waypoint.
 */
export function getAltitude(waypoints, state) {
  const { currentWaypoint: p1 } = waypoints;
  if (!p1) return;
  const { next: p2 } = p1;
  if (p2 && !!p2.alt) {
    if (!p1.alt || p2.alt > p1.alt) return p2.alt;
  }
  return p1.alt;
}
