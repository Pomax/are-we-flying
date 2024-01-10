import { Questions } from "./questions.js";

// We'll be building this out throughout this document, but this
// will be our main entry point when it comes to what the browser
// shows in terms of both visualisation and interactivity.
export class Plane {
  constructor(server) {
    this.server = server;
    this.lastUpdate = {
      lat: 0,
      long: 0,
      flying: false,
      crashed: false,
    };
  }

  async updateState(state) {
    this.state = state;
    const now = Date.now();
    Questions.update(state);
    this.lastUpdate = { time: now, ...state };
  }
}
