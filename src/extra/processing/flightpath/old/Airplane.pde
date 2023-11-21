class Airplane extends Circle {

  double cap = 0.04;
  double heading;

  Airplane(double x, double y, double r, double heading) {
    super(x, y, r);
    this.heading = heading;
  }

  void draw() {
    double dx = cos(heading);
    double dy = sin(heading);
    this.move(x + dx, y + dy);
    super.draw();
    line(x, y, x + 100 * dx, y + 100 * dy);
  }

  void updateHeading(Point target) {
    double dx = (target.x - x);
    double dy = (target.y - y);
    double a = atan2(dy, dx);
    double diff = (10e6 * (a - heading))/10e6;
    if (diff < PI) diff += TAU;
    if (diff > PI) diff -= TAU;
    if (diff < -cap) diff = -cap;
    if (diff > cap) diff = cap;
    heading = (heading + diff) % TAU;
  }
}
