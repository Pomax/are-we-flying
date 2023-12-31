let airplane;

class Airplane extends Circle {
  speed = 0.5;
  heading = -0.9;
  turnRate = (this.speed / 100) * 3.1415;

  update({ x, y }) {
    const angle = atan2(y - this.y, x - this.x);
    this.setHeading(angle);
    const { speed, heading } = this;
    this.x += speed * cos(heading);
    this.y += speed * sin(heading);
  }

  setHeading(target) {
    const { heading, turnRate } = this;
    let diff = (target - heading + TAU) % TAU;
    if (diff > PI) diff -= TAU;
    this.heading += constrain(diff, -turnRate, turnRate);
  }

  intersection(x1, y1, x2, y2) {
    const { x, y, r } = this;
    const dy = y2 - y1;
    const dx = x2 - x1;
    const c = new Point(this);

    const A = dy * dy + dx * dx;
    const B = 2 * (-c.x * dx - c.y * dy + x1 * dx + y1 * dy);
    const C =
      c.x * c.x +
      c.y * c.y +
      x1 * x1 +
      y1 * y1 -
      2 * c.x * x1 -
      2 * c.y * y1 -
      r * r;
    const D = B * B - 4 * A * C;

    const t1 = (-B + sqrt(D)) / (2 * A);
    const t2 = (-B - sqrt(D)) / (2 * A);

    if (isNaN(t1) && isNaN(t2)) {
      const cx = x - x1;
      const cy = y - y1;
      const f = constrain((dx * cx + dy * cy) / (dx * dx + dy * dy), 0, 1);
      return new Point(x1 + dx * f, y1 + dy * f);
    }

    if (isNaN(t1) || t1 < t2) t1 = t2;
    const t = constrain(t1, 0, 1);
    return new Point(x1 + dx * t, y1 + dy * t);
  }

  draw() {
    const { x, y, r, heading: a } = this;
    circle(x, y, r);
    line(x, y, x + r * cos(a), y + r * sin(a));
  }
}

let current = -1;
const points = [];
const trail = [];

function addPoint(x, y) {
  if (currentPoint) return;
  const p = new Point(x, y);
  setMovable(p);
  points.push(p);
  if (current === -1 && points.length === 1) {
    current = 0;
  }
}

function setup() {
  setSize(650, 500);
  addButton(`play`, (button) => {
    button.textContent = togglePlay() ? `pause` : `play`;
  });
  addButton(`reset`, (button) => {
    points.splice(0, points.length);
    trail.splice(0, trail.length);
    reset();
  });
  noGrid();
  airplane = new Airplane(100, 100, 40);
  addPoint(476, 100);
  addPoint(482, 425);
  addPoint(319, 264);
  addPoint(146, 393);
}

function draw() {
  clear(`#FFEFB0`);

  noFill();
  setStroke(`lightgrey`);
  plotData(points, `x`, `y`);

  setStroke(`blue`);
  plotData(trail, `x`, `y`);

  setStroke(`black`);
  points.forEach((p) => point(p.x, p.y));

  // figure out where to fly to
  const target = getTarget();
  if (target) {
    setStroke(`green`);
    line(airplane.x, airplane.y, target.x, target.y);
    setStroke(`black`);
    airplane.update(target);
  }

  trail.push(new Point(airplane.x, airplane.y));

  noFill();
  setStroke(`black`);
  airplane.draw();
}

/**
 * The meat and potatoes
 */
function getTarget() {
  if (current < 0) return;

  let target = points[current];
  if (!target) return;

  if (dist(airplane.x, airplane.y, target.x, target.y) < airplane.r / 10) {
    current++;
  }

  return target;
}

function pointerDown(x, y) {
  addPoint(x, y);
  if (current === -1 && points.length === 1) {
    current = 0;
  }
  redraw();
}
