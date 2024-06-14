import {
  getDistanceBetweenPoints,
  getHeadingFromTo,
  getPointAtDistance,
} from "../../utils/utils.js";
import { KM_PER_NM, ENV_PATH } from "../../utils/constants.js";

import dotenv from "dotenv";
dotenv.config({ path: ENV_PATH });
const { DATA_FOLDER, ALOS_PORT: PORT } = process.env;
import { ALOSInterface } from "../../elevation/alos-interface.js";
const alos = new ALOSInterface(DATA_FOLDER);

export class Waypoint {
  // We'll use a silly little id function, because
  // we don't need uuids, we just need something
  // that we can use to order and find waypoints.
  static nextId = (() => {
    let id = 1;
    return () => id++;
  })();

  constructor(lat, long, alt = false, landing = false) {
    this.id = Waypoint.nextId();
    this.reset();
    this.setPosition(lat, long);
    this.setElevation(alt);
    this.markForLanding(landing);
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

  markForLanding(landing) {
    this.landing = landing;
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
    const { lat, long } = this;
    const next = (this.next = nextWaypoint);
    if (next) {
      this.heading = getHeadingFromTo(lat, long, next.lat, next.long);
      next.distance =
        getDistanceBetweenPoints(lat, long, next.lat, next.long) / KM_PER_NM;
      this.findMaxElevation();
    }
  }

  /**
   * ...
   */
  async findMaxElevation() {
    const { lat, long, heading, next } = this;
    this.geoPoly = [
      getPointAtDistance(lat, long, 1, heading - 90),
      getPointAtDistance(next.lat, next.long, 1, heading - 90),
      getPointAtDistance(next.lat, next.long, 1, heading + 90),
      getPointAtDistance(lat, long, 1, heading + 90),
    ].map(({ lat, long }) => [lat, long]);
    this.maxElevation = alos.getMaxElevation(this.geoPoly);
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
