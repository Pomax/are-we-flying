Airplane airplane;
ArrayList<Point> waypoints;
ArrayList<Point> pathpoints;
ArrayList<Point> flightpath;
int currentPointIndex;
Point target;

double targetRatio = 0.33;
double permissibleOvershoot = 0;

void setup() {
  frameRate(144);
  size(1200, 900);
  waypoints = new ArrayList<Point>();
  flightpath = new ArrayList<Point>();
  reset();
  //placeWayPoint(200, 200);
  placeWayPoint(533, 166);
  placeWayPoint(530, 264);
  placeWayPoint(150, 354);
  placeWayPoint(1070, 589);
  placeWayPoint(218, 481);
  placeWayPoint(950, 654);
  placeWayPoint(348, 578);
  placeWayPoint(658, 688);
  placeWayPoint(490, 684);
  placeWayPoint(770, 108);
  placeWayPoint(1068, 115);
  placeWayPoint(1071, 757);
  placeWayPoint(795, 791);
  placeWayPoint(86, 676);
}

void reset() {
  currentPointIndex = 0;
  airplane = new Airplane(200, 300, 50, 0);
}

void safifyWaypoints() {
  pathpoints = new ArrayList<Point>(waypoints);
  // move waypoints that are too close together
  // TODO: code goes here

  // then resolve turns that are too tight:
  for (int i=0; i<pathpoints.size()-2; i++) {
    Point p1 = pathpoints.get(i);
    Point p2 = pathpoints.get(i+1);
    Point p3 = pathpoints.get(i+2);

    double a = atan2(p1.y - p2.y, p1.x - p2.x);
    double b = atan2(p3.y - p2.y, p3.x - p2.x);
    double r1 = (a - b + TAU) % TAU;
    double r2 = r1 - TAU;

    double c = (a + b)/2 - PI/2;
    double d = r1;
    if (abs(r1) > abs(r2)) d = r2;
    if (a<b) c+= PI;

    // is this angle too steep?
    if (abs(d) < PI/4) {
      println("turn " + (i+1) + " is too steep");
      // replace it with two points that are spaced "safely"
      double r = (airplane.r / 2) + 5;
      Vec2 dd = new Vec2(r * cos(c), r * sin(c)).normalize();
      Point n1 = new Point(p2.x - dd.x * r, p2.y - dd.y * r);
      Point n2 = new Point(p2.x + dd.x * r, p2.y + dd.y * r);
      // replace p2 with n1
      pathpoints.set(i+1, n1);
      // and then add n2 after n1
      pathpoints.add(i+2, n2);
    }
  }
}

void draw() {
  background(250, 235, 210);

  noFill();

  // what we'll fly
  stroke(0, 0, 100, 40);
  if (pathpoints.size() > 0) {
    beginShape();
    for (Point p : pathpoints) vertex(p.x, p.y);
    endShape();
  }
  for (Point p : pathpoints)p.draw();

  // what we placed
  stroke(0);
  if (waypoints.size() > 0) {
    beginShape();
    for (Point p : waypoints) vertex(p.x, p.y);
    endShape();
  }
  for (Point p : waypoints)p.draw();

  // we we flew so far
  stroke(0, 0, 200);
  if (flightpath.size() > 0) {
    beginShape();
    for (Point p : flightpath) vertex(p.x, p.y);
    endShape();
  }


  fill(255, 100);
  airplane.draw();
  {
    Circle c = new Circle(airplane);
    c.r = airplane.r * targetRatio;
    c.draw();
  }
  flightpath.add(new Point(airplane));

  if (currentPointIndex > -1) {
    if (currentPointIndex < pathpoints.size() - 1) {
      updateHeading();
    }
  }
}

void updateHeading() {
  // TODO: stop updating heading past last point

  Point p1 = pathpoints.get(currentPointIndex);
  Point target = p1;
  Point p2 = pathpoints.get(currentPointIndex + 1);
  Point pr = airplane.project(p1.x, p1.y, p2.x, p2.y);
  Point i1 = airplane.intersection(p1.x, p1.y, p2.x, p2.y);

  Point p3 = null;
  Point i2 = null;

  if (currentPointIndex < pathpoints.size() - 2) {
    p3 = pathpoints.get(currentPointIndex + 2);
    i2 = airplane.intersection(p2.x, p2.y, p3.x, p3.y);
  }

  if (i1 != null) {
    target = i1;
    // leading intersection = RED
    color RED = color(255, 0, 0);
    fill(RED);
    stroke(RED);
    i1.draw();
    line(airplane, i1);
  }

  if (i2 != null) {
    Point pr2 = airplane.project(p2, p3);
    // projection onto the next segment = GREEN
    color GREEN = color(0, 255, 0);
    fill(GREEN);
    stroke(GREEN);
    line(airplane, pr2);
    pr2.draw();
    boolean tooCloseToP2 = dist(airplane.x, airplane.y, p2.x, p2.y) < airplane.r;
    boolean tooCloseToSegment = dist(airplane, pr2) <= airplane.r * (1 - permissibleOvershoot);
    if (tooCloseToP2 || tooCloseToSegment) {
      target = i2;
      currentPointIndex++;
    }
  }

  if (currentPointIndex + 2 >= pathpoints.size()) {
    // arriving at the last point should set the heading
    // based on real waypoints, not virtual waypoints:
    if (i1 == null && i2 == null) {
      p1 = waypoints.get(waypoints.size()-2);
      p2 = waypoints.get(waypoints.size()-1);
      // no. this needs to be a target.
      airplane.heading = atan2(p2.y - p1.y, p2.x - p1.x);
      currentPointIndex++;
      return;
    }
  }

  // If we get here, fly along the flightpath
  Point m = pr.mix(target, targetRatio);
  fill(255, 0, 255); // target is MAGENTA
  m.draw();
  target = m;
  if (dist(p2, m) > dist(p2, p1)) {
    target = p1;
  }
  airplane.updateHeading(target);
}

boolean contained(Point p1, Point p, double transitionRadius) {
  if (p == null) return false;
  return dist(p1.x, p1.y, p.x, p.y) <= transitionRadius;
}

void placeWayPoint(int x, int y) {
  println("placeWayPoint("+x+","+y+");");
  if (waypoints.size() == 0) {
    currentPointIndex = 0;
    waypoints.add(new Point(airplane.x, airplane.y ));
  }
  waypoints.add(new Point(x, y));
  safifyWaypoints();
}
