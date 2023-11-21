class Plane extends Circle {
  double heading;
  double speed;
  double turnRate;

  Plane(double x, double y, double r, double heading) {
    this(x, y, r, heading, SPEED);
  }

  Plane(double x, double y, double r, double heading, double speed) {
    this(x, y, r, heading, speed, TURN_RATE);
  }

  Plane(double x, double y, double r, double heading, double speed, double turnRate) {
    super(x, y, r);
    this.heading = heading;
    this.speed = speed;
    this.turnRate = turnRate;
  }

  void setRadius(double r) {
    this.r = r;
  }

  void setSpeed(double s) {
    this.speed = s;
  }

  void setTurnRate(double turnRate) {
    this.turnRate = turnRate;
  }

  void draw() {
    double dx = speed * cos(heading);
    double dy = speed * sin(heading);
    double m = sqrt(dx*dx + dy*dy);
    double rx = (r * dx)/m;
    double ry = (r * dy)/m;
    if (playing) {
      if (x-r>0 && x+r<width &&y-r>0 && y+r<height) {
        this.move(x + dx, y + dy);
      }
    }
    super.draw();
    ellipse(x + rx + dx, y + ry + dx, 5, 5);
  }

  void target(Point target) {
    if (!playing) return;
    double dx = (target.x - x);
    double dy = (target.y - y);
    double a = atan2(dy, dx);
    double diff = a - heading;
    if (diff > PI) diff -= 2 * PI;
    if (diff < -PI) diff += 2 * PI;

    double cap = 0.0174533 * this.turnRate/2.;
    diff = constrain(diff, -cap, cap);
    heading += diff;
  }
}
