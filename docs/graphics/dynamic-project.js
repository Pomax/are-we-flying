function setup() {
  showPlaneRadius = true;
  radiusFromSpeed = false;
  addSlider(`radius`, { min: 10, max: 100, value: 35, step: 1 });
}

/**
 * The meat and potatoes, where we can experiment with targeting algorithms.
 * At its most basic, though (for demo purposes) we just target "the next point".
 */
function getTarget(airplane) {
  if (current < 0) return;

  let p1, p2;

  p1 = points[current];
  if (!p1) return;

  // Are we flying "a leg"?
  p2 = points[current + 1];
  if (!p2) {
    if (dist(airplane.x, airplane.y, p1.x, p1.y) < airplane.r) {
      current++;
    }
    return p1;
  }

  // If so, target the leg's flightpath
  const target = airplane.project(p1.x, p1.y, p2.x, p2.y, airplane.r);

  if (dist(airplane.x, airplane.y, p2.x, p2.y) < airplane.r) {
    current++;
  }

  return target;
}
