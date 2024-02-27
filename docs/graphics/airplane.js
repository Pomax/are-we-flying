/**
 * Create a little airplane class that looks barely
 * like an airplane, but *acts* like one by having a
 * speed and turn rate that determine how fast it can
 * change heading when told to.
 */
class Airplane extends Circle {
  heading = -0.9;
  bank = 0;

  constructor(x, y, r) {
    super(x, y, r);
  }

  // update the plane's position
  update({ x, y }, delta = frameDelta) {
    this.r = radiusFromSpeed ? speed : radius;
    if (delta > 50) return;
    const timeInSeconds = delta / 1000;
    const angle = atan2(y - this.y, x - this.x);
    this.setHeading(angle, timeInSeconds);
    const { heading } = this;
    // Move us based on "speed per second", corrected
    // for how many (milli)seconds actually passed.
    this.x += speed * timeInSeconds * cos(heading);
    this.y += speed * timeInSeconds * sin(heading);
  }

  // update the plane's heading based on a target point
  setHeading(target, timeInSeconds) {
    const { heading, r } = this;
    const turnRate = radians(2 * r);
    let diff = (target - heading + TAU) % TAU;
    if (diff > PI) diff -= TAU;
    // Update the heading based on only being able to
    // adjust heading by X degrees per second at most,
    // corrected for how many (milli)seconds actually
    // passed.
    const maxChange = timeInSeconds * turnRate;
    const update = constrain(diff, -maxChange, maxChange);
    this.heading = (this.heading + TAU + update) % TAU;
  }

  // draw a little "stick figure" airplane
  draw() {
    const { x, y, r, heading: a } = this;
    noFill();
    setStroke(`black`);
    if (showPlaneRadius) {
      circle(x, y, r);
      if (typeof innerRadius !== `undefined`) {
        circle(x, y, innerRadius);
      }
      if (typeof ratio_r !== `undefined`) {
        circle(x, y, r * ratio_r);
      }
    }
    // by far the easiest way to draw a little stick figure
    // is to change the coordinate system instead of trying
    // to rotated every individual line, so: save the current
    // drawing context, and then change things:
    save();
    {
      translate(x, y);
      rotate(a);
      setColor(`black`);
      setLineWidth(3);
      line(-10, 0, 10, 0);
      line(-10, -5, -10, 5);
      const wingLength = 12;
      save();
      {
        rotate(PI / 2);
        line(0, 0, wingLength, 0);
        rotate(PI);
        line(0, 0, wingLength, 0);
      }
      restore();
      setColor(`blue`);
      setLineWidth(1);
      line(0, 0, speed, 0);
    }
    // And once we're done, we restore the grahpics context
    // to what it was before we started drawing:
    restore();
  }

  // Determine where on the line p1--p2 this airplane should
  // be projected, based on the shorted projection distance.
  project(x1, y1, x2, y2, r = this.r) {
    const { x, y } = this;
    const dx = x2 - x1;
    const dy = y2 - y1;

    const A = dy ** 2 + dx ** 2;
    const B = 2 * (-x * dx - y * dy + x1 * dx + y1 * dy);
    const C =
      x ** 2 + y ** 2 + x1 ** 2 + y1 ** 2 - 2 * x * x1 - 2 * y * y1 - r ** 2;
    const D = B * B - 4 * A * C;

    const t1 = (-B + sqrt(D)) / (2 * A);
    const t2 = (-B - sqrt(D)) / (2 * A);

    if (isNaN(t1) && isNaN(t2)) {
      // If we're too far from p1--p2, compute the
      // direct projection instead:
      const acx = x - x1;
      const acy = y - y1;
      const f = (dx * acx + dy * acy) / (dx ** 2 + dy ** 2);
      const t = constrain(f, 0, 1);
      const p = new Point(x1 + dx * t, y1 + dy * t);
      return p;
    }

    if (isNaN(t1) || t1 < t2) t1 = t2;

    const t = constrain(t1, 0, 1);
    return { x: x1 + dx * t, y: y1 + dy * t };
  }
}
