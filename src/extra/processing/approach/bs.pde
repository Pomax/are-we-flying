double sign(double a) {
  return a < 0 ? -1 : 1;
}
void ellipse(double a, double b, double c, double d) {
  ellipse((float)a, (float)b, (float)c, (float)d);
}

void line(Point p1, Point p2) {
  line(p1.x, p1.y, p2.x, p2.y);
}

void line(double a, double b, double c, double d) {
  line((float)a, (float)b, (float)c, (float)d);
}

float dist(double a, double b, double c, double d) {
  return dist((float)a, (float)b, (float)c, (float)d);
}

void rect(double a, double b, double c, double d) {
  rect((float)a, (float)b, (float)c, (float)d);
}

double sqrt(double x) {
  return Math.sqrt(x);
}

void vertex(double x, double y) {
  vertex((float)x, (float)y);
}

double abs(double v) {
  return Math.abs(v);
}

double sin(double v) {
  return Math.sin(v);
}

double cos(double v) {
  return Math.cos(v);
}

double acos(double v) {
  return Math.acos(v);
}

double atan2(double y, double x) {
  return Math.atan2(y, x);
}

double lerp(double a, double b, double r) {
  return lerp((float)a, (float)b, (float)r);
}

Point lerp(Point p1, Point p2, double r) {
  return new Point(
    lerp(p1.x, p2.x, r),
    lerp(p1.y, p2.y, r)
    );
}

Point lerpd(Point p1, Point p2, double d) {
  double dx = p2.x - p1.x;
  double dy = p2.y - p1.y;
  double m = sqrt(dx*dx + dy*dy);
  double ndx = d * dx/m;
  double ndy = d * dy/m;
  return new Point(p1.x + ndx, p1.y + ndy);
}

double min(double y, double x) {
  return Math.min(y, x);
}

double max(double y, double x) {
  return Math.max(y, x);
}

double dist(Point a, Point b) {
  return dist((float)a.x, (float)a.y, (float)b.x, (float)b.y);
}

double constrain(double v, double min, double max) {
  return v < min ? min : v > max ? max : v;
}

void text(String s, double a, double b) {
  text(s, (float) a, (float) b);
}

double radians(double v) {
  return v/360.0 * TAU;
}


class Point {

  boolean locked = false;
  double x, y;
  boolean active = false;

  Point(double x, double y) {
    this.x = x;
    this.y = y;
  }

  Point(Point other) {
    this.x = other.x;
    this.y = other.y;
  }

  void draw(String label) {
    draw();
    text(label, x+15, y-8);
  }
  
  void lock() {
    locked = true;
  }
  
  void unlock() {
    locked = false;
  }

  void draw() {
    ellipse(x, y, 11, 11);
  }

  void move(double x, double y) {
    this.x = x;
    this.y = y;
  }

  void activate() {
    active = true;
  }

  void deactivate() {
    active = false;
  }

  Point project(Point p1, Point p2) {
    return project(p1.x, p1.y, p2.x, p2.y, false);
  }
  Point project(Point p1, Point p2, boolean constrain) {
    return project(p1.x, p1.y, p2.x, p2.y, constrain);
  }

  Point project(double x1, double y1, double x2, double y2, boolean constrain) {
    double abx = x2 - x1;
    double aby = y2 - y1;
    double acx = this.x - x1;
    double acy = this.y - y1;
    double coeff = (abx * acx + aby * acy) / (abx * abx + aby * aby);
    if (constrain) {
      if (coeff < 0 || coeff > 1) return null;
    }
    return new Point(x1 + abx * coeff, y1 + aby * coeff);
  }

  Point mix(Point other, double v) {
    double x = lerp(this.x, other.x, v);
    double y = lerp(this.y, other.y, v);
    return new Point(x, y);
  }

  Vec2 to(Point other) {
    return new Vec2(other.x - x, other.y - y);
  }

  String toString() {
    return x + "," + y;
  }
}


Point fractionalMove(double t, double x, double y, double dx, double dy) {
  if (t<0 || t>1) return null;
  return new Point(x + dx*t, y + dy*t);
}


class Vec2 extends Point {
  Vec2(double x, double y) {
    super(x, y);
  }
}

class Point3D extends Point {
  double z;
  Point3D(double x, double y, double z) {
    super(x, y);
    this.z = z;
  }
}

class Vec3 extends Point3D {
  Vec3(double x, double y, double z) {
    super(x, y, z);
  }
}

class Circle extends Point {
  double r;
  Circle(double x, double y, double r) {
    super(x, y);
    this.r = r;
  }
  void draw() {
    if (active) {
      stroke(255, 0, 0);
    } else {
      stroke(0);
    }
    ellipse(x, y, 2*r, 2*r);
    super.draw();
  }
  boolean contains(Point p) {
    if (p == null) return false;
    return contains(p.x, p.y);
  }
  boolean contains(double x, double y) {
    return dist(x, y, this.x, this.y) <= r;
  }
  Point intersection(Point p1, Point p2) {
    return intersection(p1.x, p1.y, p2.x, p2.y);
  }
  Point intersection(double x1, double y1, double x2, double y2) {
    //println(x1, y1);
    //println(x2, y2);

    double dy = y2 - y1;
    //println("dy:", dy);
    double dx = x2 - x1;
    //println("dx:", dx);
    Point c = new Point(this);

    double A = dy*dy + dx*dx;
    //println("A:", A);
    double B = 2 * (-c.x*dx - c.y*dy + x1*dx + y1*dy);
    //println("B:", B);
    double C = c.x * c.x + c.y * c.y + x1 * x1 + y1 * y1 - 2*c.x * x1 - 2 * c.y * y1 - r * r;
    //println("C:", C);
    double D = B*B - 4*A*C;
    //println("D:", D);

    double t1 = (-B + sqrt(D))/(2*A);
    //println("t1:", t1);
    double t2 = (-B - sqrt(D))/(2*A);
    //println("t2:", t2);

    if (Double.isNaN(t1) && Double.isNaN(t2)) {
      double cx = x - x1;
      double cy = y - y1;
      double f = constrain((dx*cx + dy*cy) / (dx*dx + dy*dy), 0, 1);
      return new Point(x1 + dx*f, y1 + dy*f);
    }

    if (Double.isNaN(t1) || t1 < t2) t1 = t2;
    double t = constrain(t1, 0, 1);
    return new Point(x1 + dx*t, y1 + dy*t);
  }

  String toString() {
    return super.toString() + "/" + r;
  }
}


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
