/**

 // TODO: rewrite the waypoints
 
 Point c1 = new Point(plane);
 c1.draw("1");
 
 Point c4 = lerpd(p2, p3, dist(p2, c1));
 c4.draw("4");
 line(plane, c4);
 Point m = lerp(plane, c4, 0.5);
 m.draw("m");
 line(m, p2);
 double l = dist(c1, c4) / 1.5;
 double dx = p2.x - m.x;
 double dy = p2.y - m.y;
 double a = atan2(dy, dx);
 Point c2 = new Point(
 p2.x + l * cos(a - PI/2),
 p2.y + l * sin(a - PI/2)
 );
 Point c3 = new Point(
 p2.x + l * cos(a + PI/2),
 p2.y + l * sin(a + PI/2)
 );
 if (a > 0) {
 Point __ = c2;
 c2 = c3;
 c3 = __;
 }
 c2.draw("2");
 c3.draw("3");
 
 // replace p2 in the point list with all four of these points
 pts.add(current + 1, c3);
 pts.add(current + 1, c2);
 pts.remove(current + 1 + 2);

**/
