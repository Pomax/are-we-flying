const { atan2, sin, cos } = Math;
const points = [];
const trail = [];
let airplane;

class Point extends Vector {
  constructor(api, x, y) {
    super(x, y);
    this.api = api;
  }
  draw() {
    this.api.circle(this.x, this.y, 3);
  }
}

class Circle extends Point {
  constructor(api, x, y, r = 3) {
    super(api, x, y);
    this.r = r;
  }
  draw() {
    const { api } = this;
    api.setStroke(`black`);
    api.setFill(`#FFF3`);
    api.circle(this.x, this.y, this.r);
    api.circle(this.x, this.y, 3);
  }
}

class Airplane extends Circle {
  speed = 1;
  heading = -0.9;
  turnRate = (3 / 180) * 3.1415;
  update(target) {
    this.setHeading(this.api, target);
    this.x += this.speed * cos(this.heading);
    this.y += this.speed * sin(this.heading);
  }
  setHeading(api, target) {
    const { PI, TAU } = api;
    const { heading, turnRate } = this;
    let diff = (target - heading + TAU) % TAU;
    if (diff > PI) diff -= TAU;
    this.heading += api.constrain(diff, -turnRate, turnRate);
  }
  draw() {
    super.draw();
    const { x, y, r, api, heading: a } = this;
    api.line(x, y, x + r * cos(a), y + r * sin(a));
  }
}

function setup() {
  noGrid();
  setMovable(points);
  airplane = new Airplane(this, 100, 100, 40);
  find(`button`).addEventListener(
    `click`,
    (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      evt.target.textContent = togglePlay() ? `pause` : `play`;
    },
    { passive: false }
  );
}

function draw() {
  clear(`#FFEFB0`);

  noFill();

  setStroke(`lightgrey`);
  start();
  points.forEach((p) => vertex(p.x, p.y));
  end();

  setStroke(`blue`);
  start();
  trail.forEach((p) => vertex(p.x, p.y));
  end();

  setStroke(`black`);
  points.forEach((p) => p.draw());

  setFill(`black`);
  text(`${this.cursor.x}/${this.cursor.y}`, 10, 10);

  const { [0]: p } = points;
  if (p) {
    const a = atan2(p.y - airplane.y, p.x - airplane.x);
    airplane.update(a);
  }

  airplane.draw();
  trail.push(new Point(this, airplane.x, airplane.y));
}

function onMouseDown() {
  if (this.currentPoint) return;
  const { x, y } = this.cursor;
  points.push(new Point(this, x, y));
  redraw();
}

function onMouseMove() {
  redraw();
}
