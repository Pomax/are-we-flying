/**
 * We'll define a simple sequencer that we can use
 * to step through the various stages of our landing.
 */
export class Sequence {
  constructor(api, steps = []) {
    this.api = api;
    this.__steps = steps;
    this.reset();
  }
  reset() {
    this.steps = this.__steps.slice();
    this.nextStage();
  }
  nextStage() {
    this.step = this.steps.shift();
    return this.step;
  }
  setStage(step) {
    const { steps } = this;
    if (steps.includes(step)) {
      this.step = step;
      while (steps[0] !== step) steps.shift();
      return true;
    }
  }
}
