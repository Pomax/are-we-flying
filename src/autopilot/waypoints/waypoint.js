import { degrees, getDistanceBetweenPoints } from "../../utils/utils.js";


// a silly little id function, but it's less code than writing a generator.
const nextId = (() => {
  let id = 1;
  return () => id++;
})();

export class Waypoint {
  constructor(owner, lat, long, alt = false, landing, original) {
    if (original) Object.assign(this, original);
    else {
      this.id = nextId();
      this.owner = owner;
      this.reset(landing);
      this.move(lat, long);
      this.elevate(alt);
    }
  }

  reset(landing = false) {
    this.completed = false;
    this.active = false;
    this.landing = landing;
    this.next = undefined;
  }

  // set this waypoint's GPS location
  move(lat, long) {
    this.lat = lat;
    this.long = long;
  }

  setNumber(number) {
    this.number = number;
  }

  setDistancetoPlane(lat, long) {
    lat = degrees(lat);
    long = degrees(long);
    const km = getDistanceBetweenPoints(lat, long, this.lat, this.long);
    const NM = 1.852 * km;
    this.NM = NM | 0;
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
    const { id, number, lat, long, alt, landing, NM, active, completed, next } =
      this;
    return {
      id,
      number: number ?? id,
      lat,
      long,
      alt,
      landing,
      NM,
      active,
      completed,
      next: next?.id,
    };
  }
}
