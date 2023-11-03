class Vec2 extends Point {

  Vec2(double x, double y) {
    super(x, y);
  }

  Vec2 normalize() {
    double m = sqrt(this.x * this.x + this.y * this.y);
    return new Vec2(x/m, y/m);
  }

  double dot(Vec2 other) {
    return this.x * other.x + this.y * other.y; 
  }
}
