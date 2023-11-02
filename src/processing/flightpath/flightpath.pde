Airplane airplane;
ArrayList<Point> waypoints;
ArrayList<Point> flightpath;
int currentPointIndex;
Point target;

double targetRatio = 0.33;
double permissibleOvershoot = 0;

void setup() {
  size(1200, 800);
  waypoints = new ArrayList<Point>();
  flightpath = new ArrayList<Point>();
  currentPointIndex = -1;
  airplane = new Airplane(100, 300, 50, 0);

  placeWayPoint(100, 100);
  placeWayPoint(317, 31);
  placeWayPoint(317, 600);
  placeWayPoint(400, 31);
  placeWayPoint(699, 173);
  placeWayPoint(610, 440);
  placeWayPoint(882, 425);
}

void draw() {
  clear();
  background(200);

  noFill();
  stroke(0, 0, 200);
  if (flightpath.size() > 0) {
    beginShape();
    for (Point p : flightpath) vertex(p.x, p.y);
    endShape();
  }

  noFill();
  stroke(0);
  if (waypoints.size() > 0) {
    beginShape();
    for (Point p : waypoints) vertex(p.x, p.y);
    endShape();
  }
  for (Point p : waypoints)p.draw();

  fill(255, 100);
  airplane.draw();
  {
    Circle c = new Circle(airplane);
    c.r = airplane.r * targetRatio;
    c.draw();
  }
  flightpath.add(new Point(airplane));

  if (currentPointIndex > -1) {
    if (currentPointIndex < waypoints.size() - 1) {
      updateHeading();
    }
  }
}

void updateHeading() {
  // TODO: stop updating heading past last point

  Point p1 = waypoints.get(currentPointIndex);
  Point target = p1;
  Point p2 = waypoints.get(currentPointIndex + 1);
  Point pr = airplane.project(p1.x, p1.y, p2.x, p2.y);
  Point i1 = airplane.intersection(p1.x, p1.y, p2.x, p2.y);

  Point p3 = null;
  Point i2 = null;

  if (currentPointIndex < waypoints.size() - 2) {
    p3 = waypoints.get(currentPointIndex + 2);
    i2 = airplane.intersection(p2.x, p2.y, p3.x, p3.y);
  }

  if (i1 != null) {
    target = i1;
    fill(255, 0, 0);
    i1.draw();
  }

  if (i2 != null) {
    Point pr2 = airplane.project(p2, p3);
    fill(0, 255, 0);
    pr2.draw();
    if (
      (dist(airplane.x, airplane.y, p2.x, p2.y) < airplane.r)
      ||
      (dist(airplane, pr2) <= airplane.r * (1 - permissibleOvershoot))
      ) {
      fill(0, 0, 255);
      i2.draw();
      target = i2;
      currentPointIndex++;
    }
  }

  if (currentPointIndex + 2 == waypoints.size()) {
    if (i1 == null) {
      return;
    }
  }

  fill(255);
  Point m = pr.mix(target, targetRatio);
  m.draw();

  if (dist(p2, m) < dist(p2, p1)) {
    target = m;
  } else {
    target = p1;
  }

  frameRate(100);
  airplane.updateHeading(target);

  // if (i2 != null && dist(airplane.x, airplane.y, p2.x, p2.y) < airplane.r) {
  //   target = i2;
  //   i2.draw();
  //
  //   fill(0, 255, 0);
  //   stroke(0, 255, 0);
  //   target.draw();
  //
  //   currentPointIndex++;
  // }


  //  fill(255, 0, 0);
  //  stroke(255, 0, 0);
  //  i1.draw();
  //  pr.draw();

  //  fill(0, 255, 0);
  //  stroke(0, 255, 0);
  //  Point m = pr.mix(i1, targetRatio);
  //  m.draw();

  //  if (dist(p2, m) < dist(p2, p1)) {
  //    // TODO: accute angles do fun things! we should transition if our circle hits the next segment, to prevent funk
  //    target = m;
  //    fill(0, 255, 255);
  //    stroke(0, 255, 255);
  //    target.draw();
  //  }

  // if (i2 != null && dist(airplane.x, airplane.y, p2.x, p2.y) < airplane.r) {
  //   target = i2;
  //   i2.draw();
  //
  //   fill(0, 255, 0);
  //   stroke(0, 255, 0);
  //   target.draw();
  //
  //   currentPointIndex++;
  // }
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
}
