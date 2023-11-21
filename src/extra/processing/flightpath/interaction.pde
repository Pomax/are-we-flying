void mousePressed() {
  if (plane.contains(mouseX, mouseY)) {
    plane.activate();
    noLoop();
  }
  redraw();
}

void mouseDragged() {
  if (plane.active) {
    plane.move(mouseX, mouseY);
    current = 0;
    redraw();
  }
}

void mouseReleased() {
  if (plane.active) {
    plane.deactivate();
  }
  loop();
}

void mouseClicked() {
  addPoint(mouseX, mouseY);
}

void addPoint(double x, double y) {
  if (pts.size() == 0) current = 0;
  pts.add(new Point(x, y));
  println("addPoint("+x+","+ y+");");
}

void keyPressed() {
  if (key == 'r') {
    restart();
    return;
  }
  if (key == ' ') {
    playing = !playing;
  }
  if (key == 'd') {
    RADIUS += 1;
  }
  if (key == 'a') {
    RADIUS -= 1;
  }
  if (key == 'w') {
    SPEED += 0.1;
  }
  if (key == 's') {
    SPEED -= 0.1;
  }
  if (key == 'e') {
    TURN_RATE += 0.5;
  }
  if (key == 'q') {
    TURN_RATE -= 0.5;
  }
  if (key == 'm') {
    if (mode == TARGET_MODE) {
      mode = INTERCEPT_MODE;
    } else if (mode == INTERCEPT_MODE) {
      mode = TARGET_MODE;
    }
  }
  if (key == 'n') {
    CLOSE_TARGET = !CLOSE_TARGET;
  }

  RADIUS = constrain(RADIUS, 10, 100);
  plane.setRadius(RADIUS);
  SPEED = constrain(SPEED, 0.1, 5);
  plane.setSpeed(SPEED);
  TURN_RATE = constrain(TURN_RATE, 0.5, 10);
  plane.setTurnRate(TURN_RATE);
}
