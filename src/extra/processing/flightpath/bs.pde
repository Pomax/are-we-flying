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