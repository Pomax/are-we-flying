void ellipse(double a, double b, double c, double d) {
  ellipse((float)a, (float)b, (float)c, (float)d);
}

void line(double a, double b, double c, double d) {
  line((float)a, (float)b, (float)c, (float)d);
}

float dist(double a, double b, double c, double d) {
  return dist((float)a, (float)b, (float)c, (float)d);
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

double lerp(double a, double b, double c) {
  return lerp((float)a, (float)b, (float)c);
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
