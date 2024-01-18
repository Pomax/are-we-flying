export class Waypoint {
  // We'll use a silly little id function, because
  // we don't need uuids, we just need something
  // that we can use to order and find waypoints.
  static nextId = (() => {
    let id = 1;
    return () => id++;
  })();

  constructor(lat, long, alt = false) {
    this.id = Waypoint.nextId();
    this.reset();
    this.setPosition(lat, long);
    this.setElevation(alt);
  }

  reset() {
    this.completed = false;
    this.active = false;
    this.next = undefined;
  }

  setPosition(lat, long) {
    this.lat = lat;
    this.long = long;
  }

  setElevation(alt) {
    alt = parseFloat(alt);
    this.alt = !isNaN(alt) && alt > 0 ? alt : false;
  }

  setNext(nextWaypoint) {
    this.next = nextWaypoint;
  }

  activate() {
    this.active = Date.now();
  }

  deactivate() {
    this.active = false;
  }

  complete() {
    this.completed = true;
    return this.next;
  }
}
