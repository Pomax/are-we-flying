import {
  getDistanceBetweenPoints,
  getHeadingFromTo,
} from "../../utils/utils.js";
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

  activate() {
    this.active = Date.now();
  }

  deactivate() {
    this.active = false;
  }

  /**
   * When we complete a waypoint, we automatically
   * return "the next one" so we can keep going.
   */
  complete() {
    this.deactivate();
    this.completed = true;
    return this.next;
  }

  /**
   * When we set a "next" waypoint, we want to set
   * the heading towards that next waypoint, and
   * we want that next waypoint to record how far
   * away from us it is, so that users can see how
   * long a leg will be (in nautical miles).
   */
  setNext(nextWaypoint) {
    this.next = nextWaypoint;
    if (this.next) {
      this.heading = getHeadingFromTo(
        this.lat,
        this.long,
        this.next.lat,
        this.next.long
      );
      this.next.distance =
        getDistanceBetweenPoints(
          this.lat,
          this.long,
          this.next.lat,
          this.next.long
        ) / KM_PER_NM;
    }
  }

  /**
   * When objects are converted to JSON through a
   * JSON.stringify call, this function (if it exists)
   * gets called as a "preprocessing" step, as part of
   * standard JavaScript execution rules.
   */
  toJSON() {
    // this is useful because we need to make sure that our
    // "next" property is just the id for that waypoint,
    // not the actual waypoint.
    const props = Object.assign({}, this);
    props.next = props.next?.id;
    return props;
  }
}
