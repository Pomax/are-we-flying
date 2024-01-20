function setup() {
  showPlaneRadius = true;
}

/**
 * The meat and potatoes, where we can experiment with targeting algorithms.
 * At its most basic, though (for demo purposes) we just target "the next point".
 */
function getTarget(airplane) {
  if (current < 0) return;

  // Get our current waypoint
  const p1 = points[current];
  if (!p1) return;

  // Are we flying "a leg"?
  const p2 = points[current + 1];

  // If we're not...
  if (!p2) {
    // ...and we're close enough to p1 to "transtion" (to nothing,
    // since there's no next waypoint), switch...
    if (dist(airplane.x, airplane.y, p1.x, p1.y) < airplane.r) {
      current++;
    }
    // ...and return p1 as "this is our target"
    return p1;
  }

  // If we *are*, project our plane onto the flightpath and
  // target that, or if our "circle" overlaps the flight path,
  // target the intersection of those two:
  const target = airplane.project(p1.x, p1.y, p2.x, p2.y, airplane.r);

  // And of course, if we're close enough to p2, transition.
  if (dist(airplane.x, airplane.y, p2.x, p2.y) < airplane.r) {
    current++;
  }

  return target;
}
