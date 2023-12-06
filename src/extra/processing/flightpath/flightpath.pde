// This code can be copy-pasted and run using the Processing IDE, https://processing.org/download

int current = -1;
boolean playing = false;

final String TARGET_MODE = "point target";
final String INTERCEPT_MODE = "path intercept";
boolean CLOSE_TARGET = false;

String mode = "";

double RADIUS = 50;
double SPEED = 1;
double TURN_RATE = 5;

double targetRatio = 0.33;
double permissibleOvershoot = 0;

Plane plane;
Point target;

ArrayList<Point> pts = new ArrayList<Point>();
ArrayList<Point> trace = new ArrayList<Point>();

void setup() {
  size(1200, 800);
  restart();
  restart();

  /*
  addPoint(303, 148);
   addPoint(714, 141);
   addPoint(857, 286);
   addPoint(728, 512);
   addPoint(654, 316);
   addPoint(618, 705);
   addPoint(533, 315);
   addPoint(476, 700);
   addPoint(403, 472);
   addPoint(243, 468);
   */

  addPoint(232.0, 180.0);
  addPoint(300.0, 685.0);
  addPoint(322.0, 180.0);
  addPoint(379.0, 661.0);
  addPoint(432.0, 362.0);
  addPoint(906.0, 352.0);
  addPoint(783.0, 596.0);
  addPoint(687.0, 481.0);
}

void restart() {
  double x = 164.0;
  double y = 285.0;
  current = 0;
  if (plane == null || plane.x != x || plane.y != y) {
    plane = new Plane(x, y, 50., PI/4, 1.);
    playing = false;
    mode = INTERCEPT_MODE;
    trace.add(new Point(-1, -1));
  } else {
    trace.clear();
    pts.clear();
  }
}

void draw() {
  color bg = color(250, 234, 190);
  background(bg);

  // draw the flight path
  stroke(127);
  noFill();
  strokeWeight(3);
  if (pts.size() > 0) {
    beginShape();
    for (Point p : pts) vertex(p.x, p.y);
    endShape();
  }

  // draw each waypoint
  strokeWeight(1);
  fill(0);
  for (int i=0, e=pts.size(); i<e; i++) {
    pts.get(i).draw(""+(i+1));
  }

  // draw the plane
  fill(255, 150);
  plane.draw();
  trace.add(new Point(plane));

  // draw the plane's path so far
  noFill();
  stroke(0, 0, 200);
  if (trace.size() > 0) {
    beginShape();
    for (Point p : trace) {
      if (p.x == -1) {
        endShape();
        beginShape();
        continue;
      }
      vertex(p.x, p.y);
    }
    endShape();
  }

  // figure out where to fly to
  Point target = getTarget();
  if (target != null) {
    stroke(0, 200, 0);
    line(plane, target);
    stroke(0);
    plane.target(target);
  }

  // draw our control visualization last, on top of everything.
  drawSliders(10, 10);
  text("mode: " + mode + (CLOSE_TARGET ? " (close target)": ""), 10, 80);
}


/**
 * The meat and potatoes
 */
Point getTarget() {
  if (current < 0) return null;

  Point target = null;
  Point p1 = null;
  Point p2 = null;
  Point p3 = null;
  Point i1 = null;
  Point i2 = null;

  if (pts.size() > 0 && current < pts.size()) p1 = pts.get(current);
  if (pts.size() > 1 && current + 1 < pts.size()) p2 = pts.get(current + 1);
  if (pts.size() > 2 && current + 2 < pts.size()) p3 = pts.get(current + 2);
  if (p1 != null && p2 != null) i1 = plane.intersection(p1, p2);
  if (p2 != null && p3 != null) i2 = plane.intersection(p2, p3);

  if (p1 == null) return null;

  // ===============================
  //  naive "point at the waypoint"
  // ===============================

  if (mode == TARGET_MODE && p1 != null) {
    if (dist(plane, p1) < plane.r/10) {
      current++;
    }
    return p1;
  }

  // ===============================
  //        path interception
  // ===============================

  if (mode == INTERCEPT_MODE) {
    target = p1;

    // if there is no next point, target the only point.
    if (p2 == null) {
      // Of course, once we reach that, we're "done":
      if (dist(plane, p1) < plane.r) {
        current++;
        target = null;
      }
      return target;
    }

    Point pr = plane.project(p1, p2);

    // have we reached the end of this segment?
    if (dist(plane, p2) < plane.r) {
      current++;
      return i2;
    }

    // main target on flightpath
    if (i1 != null) {
      target = i1;
      color RED = color(255, 0, 0);
      fill(RED);
      stroke(RED);
      i1.draw();
      line(plane, i1);
    }

    // projection onto the next segment, used to etermine if we're
    // close enough to the next segment and need to transition. This
    // will initiate a transition before we reach p2, except when we
    // approach at a right angle.
    if (i2 != null) {
      Point pr2 = plane.project(p2, p3);
      color GREEN = color(0, 255, 0);
      fill(GREEN);
      stroke(GREEN);
      line(p2, pr2);
      pr2.draw();
      
      if (i1 != null && dist(plane, pr2) < plane.r/2) {
        current++;
        return i2;
      }

      if (i1 != null && dist(plane, pr2) <= plane.r) {
        // push us out of the way
        double dx = pr2.x - i1.x;
        double dy = pr2.y - i1.y;
        target = new Point(
          pr2.x - 2 * dx,
          pr2.y - 2 * dy
          );
        target.draw();
        target.lock();
        //current++;
        //return i2;
      }
    }

    // ===============================
    //     target closer radius
    // ===============================

    if (CLOSE_TARGET && !target.locked) {
      // If we get here, we want to target a point on the "current
      // flightpath segment" that is only a little bit ahead of us,
      // so that we get onto the path itself nice and cleanly.
      Point m = pr.mix(target, targetRatio);
      fill(255, 0, 255); // target is MAGENTA
      m.draw();
      target = m;
      // if we transition, there may be a short period where "m"
      // does not lie on the new segment yet. For as long as that's
      // the case, we'll target p1, since "m" will automatically
      // end up on the segment once we get close enough.
      if (dist(p2, m) > dist(p2, p1)) target = p1;
    }
  }

  return target;
}

void drawSliders(double x, double y) {
  drawSlider("radius", x, y, 1, RADIUS);
  drawSlider("speed", x, y, 2, 100. / 5. * SPEED);
  drawSlider("turn rate", x, y, 3, 100. / 10. * TURN_RATE);
}

void drawSlider(String label, double x, double y, int i, double value) {
  int oy = (i-1) * 20;
  noStroke();
  fill(120, 140, 255);
  rect(x, y + oy, value, 10);
  stroke(0);
  noFill();
  rect(x, y + oy, 100, 10);
  fill(0);
  text(label, 115, 20 + oy);
}
