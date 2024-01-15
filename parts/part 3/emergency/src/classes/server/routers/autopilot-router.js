// clients will be able to access functions in this router, so we
// want to make sure the autopilot is not directly accessible:
let autopilot;

export class AutopilotRouter {
  constructor(_autopilot) {
    autopilot = _autopilot;
  }

  // This is the only thing we want to expose to clients:
  // a way for them to change AP settings.
  async update(client, params) {
    autopilot.setParameters(params);
  }
}
