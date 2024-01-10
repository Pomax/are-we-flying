export function runLater(fn, timeoutInMillis) {
  // this is literally just setTimeout, but with a try/catch so
  // that if the function we're running throws an error, we
  // completely ignore that instead of crashing the server.
  setTimeout(() => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }, timeoutInMillis);
}
