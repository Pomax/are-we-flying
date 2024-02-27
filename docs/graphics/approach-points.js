let airplane;
let speed = 40;
let radiusFromSpeed = true;
let showPlaneRadius = true;
const points = [];

let addPA = false;
let addF1 = false;
let addF2 = false;

const s = 50;

/**
 * Our program entry point.
 */
function setup() {
  setSize(650, 400);
  noGrid();

  airplane = new Airplane(550, 170, speed);
  setMovable(airplane);
  setupPoints();

  addSlider(`heading`, {
    min: 0,
    max: 360,
    step: 1,
    value: 270,
    transform: (v) => {
      airplane.heading = ((v - 90) / 180) * PI;
      return (v / PI) * 180;
    },
  });
}

function setupPoints(h2 = height / 2) {
  points.length = 0;
  addPoint(s, h2);
  addPoint(s + 50, h2);
  addPoint(s + 100, h2);
  addPoint(s + 300, h2);
  addPoint(s + 400, h2);
  setupExtraPoints();
}

function addPoint(x, y) {
  const p = new Point(x, y);
  points.push(p);
  return p;
}

function setupExtraPoints(h2 = height / 2) {
  const { x, y } = airplane;
  if (addPA) {
    addPoint(s + 480, h2);
    if (addF1 && x < s + 480) {
      const offset = y < h2 ? -100 : 100;
      addPoint(s + 480, h2 + offset);
      if (addF2 && abs(y - h2) < 100) {
        addPoint(s + 380, h2 + offset);
      }
    }
  }
}

function drawRect(x, y, w, h) {
  start();
  vertex(x, y);
  vertex(x + w, y);
  vertex(x + w, y + h);
  vertex(x, y + h);
  end();
}

/**
 * The draw loop entry point.
 */
function draw() {
  setupPoints();

  const [p5, p4, p3, p2, p1, pA, f1, f2] = points;
  clear(`#FFEFB0`);

  if (addPA) {
    if (addF1) {
      setColor(`#999`);
      line(pA.x, 0, pA.x, height);
    }
    if (addF2) {
      noFill();
      drawRect(0, height / 2 - 100, pA.x, 200);
    }
    setColor(`black`);
    text(`Pa`, pA.x - 8, 15 + pA.y);
  }

  // Draw the flight path
  setStroke(`lightgrey`);
  noFill();
  plotData(points, `x`, `y`);
  setLineWidth(10);
  line(p5.x, p5.y, p4.x, p4.y);
  setLineWidth(1);

  setColor(`black`);
  points.forEach((p) => point(p.x, p.y));
  text("runway", s + 10, height / 2 - 10);
  for (let i = 1, p; i <= 5; i++) {
    p = points[5 - i];
    text(`p${i}`, p.x - 8, 15 + p.y);
  }

  // draw the plane...
  noFill();
  setStroke(`black`);
  airplane.draw();

  // and then draw the path the plane would fly
  const shadow = new Airplane(airplane.x, airplane.y, airplane.r);
  shadow.heading = airplane.heading;

  setLineWidth(1);
  noFill();
  setStroke(`blue`);

  start();
  let i = 0;
  const targets = points.slice().reverse();
  while (i++ < 10000) {
    const target = getTarget(shadow, targets);
    if (!target) break;
    shadow.update(target, 16);
    vertex(shadow.x, shadow.y);
  }
  end();
}

// --------------------

function getTarget(airplane, targets) {
  const [p1, p2, p3] = targets;
  if (!p1) return;

  let target = p1;

  if (!p2) {
    checkTransition(airplane, p1, targets);
  } else {
    const fp = airplane.project(p1.x, p1.y, p2.x, p2.y);
    target = fp;

    if (p3) {
      const fp = airplane.project(p2.x, p2.y, p3.x, p3.y);
      if (checkTransition(airplane, fp, targets)) {
        target = fp;
      }
    }

    checkTransition(airplane, p2, targets);
  }

  return target;
}

function checkTransition(airplane, p, targets, r = airplane.r * 0.66) {
  if (dist(airplane.x, airplane.y, p.x, p.y) < r) {
    return targets.shift();
  }
}
