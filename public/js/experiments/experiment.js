export class Runner {
  constructor(plane, interval = 1000) {
    this.plane = plane;
    this.interval = interval;
    this.reset();
  }

  reset() {
    this.stop();
    this.stopped = false;
  }

  stop() {
    this.timers?.forEach((timerId) => clearInterval(timerId));
    this.timers = [];
    this.stopped = true;
  }

  /**
   * This function will run `fn` (which must take exactly one argument, `resolve`)
   * repeatedly until it triggers its resolver.
   */
  async run(fn) {
    if (this.stopped) return;

    let timerId;

    return new Promise((resolve) => {
      const plane = this.plane;
      const start = Date.now();

      const resolveAndClear = (...result) => {
        clearInterval(timerId);
        const pos = this.timers.indexOf(timerId);
        if (pos !== -1) this.timers.splice(pos, 1);
        resolve({ duration: Date.now() - start, result });
      };

      timerId = setInterval(() => {
        const { lastUpdate, paused } = plane;
        if (paused) return;
        const { lat, long } = lastUpdate;
        if (lat === undefined || long === undefined) return;
        fn(resolveAndClear);
      }, this.interval);

      this.timers.push(timerId);
    });
  }
}
