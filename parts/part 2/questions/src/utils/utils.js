import { __root } from "./constants.js";
import { win32, posix } from "node:path";

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

// Get a file's path relative to the project root directory
export function rootRelative(filepath) {
  return filepath.split(win32.sep).join(posix.sep).replace(__root, `./`);
}

// Check whether something "is a value"
export function exists(v) {
  return v !== undefined && v !== null;
}
