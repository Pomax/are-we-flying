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
    return project(p1.x, p1.y, p2.x, p2.y);
  }

  Point project(double x1, double y1, double x2, double y2) {
    double abx = x2 - x1;
    double aby = y2 - y1;
    double acx = this.x - x1;
    double acy = this.y - y1;
    double coeff = (abx * acx + aby * acy) / (abx * abx + aby * aby);
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
