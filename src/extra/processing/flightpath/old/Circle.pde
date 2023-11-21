class Circle extends Point {
  double r;

  Circle(Circle other) {
    this(other.x, other.y, other.r);
  }

  Circle(Point other, double r) {
    this(other.x, other.y, r);
  }

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

  boolean isIn(double x, double y) {
    return dist(x, y, this.x, this.y) <= r;
  }

  Point intersection(Point p1, Point p2) {
    return intersection(p1.x, p1.y, p2.x, p2.y);
  }

  Point intersection(double x1, double y1, double x2, double y2) {
    double dy = y2 - y1;
    double dx = x2 - x1;
    Circle c = this;

    double A = dy*dy + dx*dx;
    double B = 2 * (-c.x*dx - c.y*dy + x1*dx + y1*dy);
    double C = c.x * c.x + c.y * c.y + x1 * x1 + y1 * y1 - 2*c.x * x1 - 2 * c.y * y1 - r * r;
    double D = B*B - 4*A*C;

    double t1 = (-B + sqrt(D))/(2*A);
    double t2 = (-B - sqrt(D))/(2*A);

    if (Double.isNaN(t1) && Double.isNaN(t2)) {
      double cx = x - x1;
      double cy = y - y1;
      double f = (dx*cx + dy*cy) / (dx*dx + dy*dy);
      if (f<0) f = 0;
      if (f>1) f = 1;
      return new Point(x1 + dx*f, y1 + dy*f);
    }

    if (Double.isNaN(t1) || t1 < t2) t1 = t2;
    return fractionalMove(t1, x1, y1, dx, dy);
  }

  String toString() {
    return super.toString() + "/" + r;
  }
}
