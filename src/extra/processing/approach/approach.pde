double RADIUS = 50;
double SPEED = 1;
double TURN_RATE = 5;
boolean playing = false;

int w, h;
float angle;
Point end, start, M, anchor, o1, o2;

void setup() {
  size(800, 800);
  //noLoop();
  h = height/2;
  w = height/2;
  reset();
}

void reset() {
  angle = 0;
  random(-PI, PI);
  M = new Point(w, h);
}

void draw() {
  background(60);

  start = new Point(M.x - 150 * cos(angle), M.y - 150 * sin(angle));
  end = new Point(M.x - 200 * cos(angle), M.y - 200 * sin(angle));
  anchor = new Point(M.x + 150 * cos(angle), M.y + 150 * sin(angle));
  o1 = anchor;
  o2 = anchor;

  int spacing = width/10;
  float r, g, b;
  for (int x = spacing/2; x< width; x+= spacing) {
    for (int y = spacing/2; y< height; y+= spacing) {
      noFill();
      r = x * 255/width;
      g = y * 255/height;
      b = 255- (r + g) / 2;
      stroke(r, g, b);
      strokeWeight(2);
      showConnections(x, y);
    }
  }

  for (int x = spacing/2; x< width; x+= spacing) {
    for (int y = spacing/2; y< height; y+= spacing) {
      fill(0, 180, 255);
      stroke(255);
      circle(x, y, 7);
    }
  }

  strokeWeight(3);
  stroke(0, 0, 200);
  line(end, start);
  strokeWeight(1);
  stroke(0, 200, 0);
  line(start, M);
  stroke(255);
  line(M, anchor);
  line(anchor, o1);
  line(o1, o2);
  end.draw();
  start.draw();
  M.draw();
  anchor.draw();

  angle += 0.005;
}

void showConnections(int x, int y) {
  Point cursor = new Point(x, y);

  double dy = anchor.y - cursor.x;
  double dx = anchor.x - cursor.y;
  double v1 = M.x - anchor.x;
  double v2 = M.y - anchor.y;
  double w1 = cursor.x - anchor.x;
  double w2 = cursor.y - anchor.y;
  double da = atan2(w2*v1 - w1*v2, w1*v1 + w2*v2);
  double db = PI + angle + da;
  double l = dist(anchor, cursor);

  Point p = cursor.project(M, anchor);
  double d = dist(p, cursor);

  if (da > PI/2 || da < - PI /2) {
    o1 = new Point(anchor.x + 50 * cos(angle), anchor.y + 50 * sin(angle));
    o2 = new Point(anchor.x + 50 * cos(angle), anchor.y + 50 * sin(angle));
  } else {
    if (da > 0) {
      o1 = new Point(anchor.x + 50 * cos(angle - PI/2), anchor.y + 50 * sin(angle - PI/2));
      if (d<50) {
        o2 = new Point(anchor.x + 60 * cos(angle - PI/2), anchor.y + 60 * sin(angle - PI/2));
      } else {
        o2 = o1;
      }
    } else {
      o1 = new Point(anchor.x + 50 * cos(angle + PI/2), anchor.y + 50 * sin(angle + PI/2));
      if (d<50) {
        o2 = new Point(anchor.x + 60 * cos(angle + PI/2), anchor.y + 60 * sin(angle + PI/2));
      } else {
        o2 = o1;
      }
    }
  }

  Point p2 = cursor.project(o1, anchor, true);
  if (da > PI/2 || da < - PI /2) {
    if (p2 != null && dist(cursor, p2) < dist(cursor, o1)) {
      line(cursor, p2);
    } else {
      line(cursor, o1);
    }
  } else {
    line(cursor, o1);
  }

  stroke(255);
  strokeWeight(0.5);
  line(anchor, o1);
  o1.draw();
  o2.draw();
}

void mouseMoved() {
  redraw();
}

void keyPressed() {
  reset();
  redraw();
}
