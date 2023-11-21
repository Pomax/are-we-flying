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
