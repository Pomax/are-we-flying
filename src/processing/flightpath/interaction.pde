void mousePressed() {
  if (airplane.isIn(mouseX, mouseY)) {
    airplane.activate();
    noLoop();
  }
  redraw();
}

void mouseDragged() {
  if (airplane.active) {
    airplane.move(mouseX, mouseY);
    currentPointIndex = 0;
    redraw();
  }
}

void mouseReleased() {
  if (airplane.active) {
    airplane.deactivate();
  }
  loop();
}

void mouseClicked() {
  placeWayPoint(mouseX, mouseY);
}

void keyPressed() {
  if (key == ' ') {
    if (super.looping == true) {
      noLoop();
    } else {
      loop();
    }
  }
}
