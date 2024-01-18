import { Waypoint } from "./waypoint.js";

export class WayPointManager {
  constructor(autopilot) {
    this.autopilot = autopilot;
    this.reset();
  }

  reset() {
    this.points = [];
    this.currentWaypoint = undefined;
  }

  // Make sure that if someone asks for all waypoints, they
  // don't get a direct reference to the array we're using.
  getWaypoints() {
    return this.points.slice();
  }

  add(lat, long, alt) {
    const { points } = this;
    const waypoint = new Waypoint(lat, long, alt);
    points.push(waypoint);
    // If we don't have a "current" point, this is now it.
    this.currentWaypoint ??= waypoint;
    this.resequence();
  }

  setWaypointPosition(id, lat, long) {
    this.points.find((e) => e.id === id)?.setPosition(lat, long);
  }

  setWaypointElevation(id, alt) {
    this.points.find((e) => e.id === id)?.setElevation(alt);
  }

  remove(id) {
    const { points } = this;
    const pos = points.findIndex((e) => e.id === id);
    if (pos > -1) {
      points.splice(pos, 1)[0];
      if (this.currentWaypoint?.id === id) {
        this.currentWaypoint = this.currentWaypoint.next;
      }
      this.resequence();
    }
  }

  // Make sure each waypoint knows what "the next waypoint" is.
  resequence() {
    const { points } = this;
    points.forEach((p, i) => p.setNext(points[i + 1]));
  }

  // Remove all active/completed flags from all waypoints
  // and mark the first point as our active point.
  resetWaypoints() {
    this.points.forEach((waypoint) => waypoint.reset());
    this.currentWaypoint = this.points[0];
  }

  // Move the currently active waypoint to "the next"
  // waypoint (which might be undefined).
  transition() {
    this.currentWaypoint = this.currentWaypoint?.complete();
  }
}
