import { getDistanceBetweenPoints } from "../../utils/utils.js";
import { KM_PER_NM } from "../../utils/constants.js";

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
    this.first = false;
    this.active = false;
    this.completed = false;
    this.distance = 0;
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
    if (this.next) {
      this.next.distance =
        getDistanceBetweenPoints(
          this.lat,
          this.long,
          this.next.lat,
          this.next.long
        ) / KM_PER_NM;
    }
  }

  activate() {
    this.active = Date.now();
  }

  deactivate() {
    this.active = false;
  }

  complete() {
    this.deactivate();
    this.completed = true;
    return this.next;
  }

  toJSON() {
    const props = Object.assign({}, this);
    props.next = props.next?.id;
    return props;
  }
}
