function setup() {
  showPlaneRadius = true;
  addSlider(`V_plane`, {
    min: 10,
    max: 100,
    value: 50,
    step: 1,
    unit: `kts`,
    transform: (v) => {
      return (speed = v);
    },
  });
  addSlider(`ratio_r`, { min: 0.1, max: 1, value: 0.6, step: 0.01 });
}

function checkTransition(p) {
  if (dist(airplane.x, airplane.y, p.x, p.y) < airplane.r) {
    current++;
    return true;
  }
  return false;
}

function getTarget(airplane) {
  if (current < 0) return;

  let target, p1, p2, p3, intersection;

  p1 = points[current];
  if (!p1) return;

  p2 = points[current + 1];
  if (!p2) {
    checkTransition(p1);
    return p1;
  }

  // find our target based on the "inner radius"
  target = airplane.project(p1.x, p1.y, p2.x, p2.y, airplane.r * ratio_r);

  // But now let's also check whether we're close enough to the
  // next leg (if there is one) so that we can transition early:
  p3 = points[current + 2];
  if (p3) {
    intersection = airplane.project(p2.x, p2.y, p3.x, p3.y);
    setColor(`red`);
    point(intersection.x, intersection.y);
    setLineDash(4);
    line(airplane.x, airplane.y, intersection.x, intersection.y);
    noLineDash();

    if (checkTransition(intersection)) {
      target = intersection;
    }
  } else checkTransition(p2);

  return target;
}
