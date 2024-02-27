let playButton;
let airplane;
let speed = 50;
let radiusFromSpeed = true;
let current = -1;
let showPlaneRadius = false;
const points = [];
const trail = [];

/**
 * Our program entry point.
 */
function setup() {
  setSize(650, 500);
  noGrid();
  playButton = addButton(`play`, (button) => {
    button.textContent = togglePlay() ? `pause` : `play`;
  });

  // Set up an "airplane" and a few points that define its flight path:
  airplane = new Airplane(100, 100, speed);
  addPoint(100, 200);
  addPoint(476, 100);
  addPoint(482, 425);
  addPoint(319, 264);
  addPoint(146, 393);
  current = 0;
}

/**
 * The draw loop entry point.
 */
function draw() {
  clear(`#FFEFB0`);

  noFill();

  // Draw the flight path
  setStroke(`lightgrey`);
  plotData(points, `x`, `y`);

  // And the "where we've been so far" trail
  setStroke(`dodgerblue`);
  plotData(trail, `x`, `y`);

  // And then draw each of the path points on top.
  setStroke(`slate`);
  points.forEach((p) => point(p.x, p.y));

  // Then: figure out which heading to fly our plane:
  let target;

  // we will be adding different "getTarget" functions as we consider flight path policies
  if (typeof getTarget !== `undefined`) {
    target = getTarget(airplane);
  }

  // but for now, it's the same naive "fly a waypoint, transition when we're close"
  // logic that we stubbed out in our actual autopilot code already:
  else {
    target = points[current];
    if (target && dist(airplane.x, airplane.y, target.x, target.y) < 10) {
      current++;
    }
  }

  // Show our flight target, if we have one:
  if (target) {
    setColor(`magenta`);
    line(airplane.x, airplane.y, target.x, target.y);
    circle(target.x, target.y, 3);
    setStroke(`black`);
    if (playing) {
      airplane.update(target);
      trail.push(new Point(airplane.x, airplane.y));
    }
  }

  // And if we don't, we've run out of points, so: pause the graphic.
  else {
    playButton.click();
  }

  // And then finally, draw the airplane in its current location
  noFill();
  setStroke(`black`);
  airplane.draw();
}


/**
 * If we click on the graphic, place a new point.
 */
function pointerDown(x, y) {
  addPoint(x, y);
  redraw();
}

/**
 * Adding a point also means checking to see if
 * we now "have points at all". If so, we mark
 * the first point as our current target.
 */
function addPoint(x, y) {
  if (currentPoint) return;
  const p = new Point(x, y);
  setMovable(p);
  points.push(p);
}
