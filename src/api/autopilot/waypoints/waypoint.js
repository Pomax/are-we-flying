// a silly little id function, but it's less code than writing a generator.
const nextId = (() => {
  let id = 1;
  return () => id++;
})();

export class Waypoint {
  constructor(owner, lat, long, alt = false, original) {
    if (original) Object.assign(this, original);
    else {
      this.id = nextId();
      this.owner = owner;
      this.reset();
      this.move(lat, long);
      this.elevate(alt);
    }
  }

  reset() {
    this.completed = false;
    this.active = false;
    this.next = undefined;
  }

  // set this waypoint's GPS location
  move(lat, long) {
    this.lat = lat;
    this.long = long;
  }

  // set this waypoint's altitude
  elevate(alt) {
    // are we removing the elevation information?
    if (!alt || alt === "0" || alt === "false") {
      return (this.alt = false);
    }

    // We are not, so much sure the value we got is a sensible number.
    alt = parseFloat(alt);
    if (!isNaN(alt) && alt > 0) this.alt = alt;
  }

  // since waypoints define a flight path, it's useful to have a reference to "the next waypoint" (if there is one):
  setNext(next) {
    this.next = next;
  }

  // waypoints can be (de)activated and completed.
  activate() {
    this.active = Date.now();
  }
  deactivate() {
    this.active = false;
  }
  complete() {
    this.completed = true;
  }

  // And since we need to send them to the client, make sure that when this gets turned into JSON,
  // we do *not* include the owner object. The toJSON() function is really useful for that.
  toJSON() {
    const { id, lat, long, alt, active, completed, next } = this;
    return { id, lat, long, alt, active, completed, next: next?.id };
  }
}
