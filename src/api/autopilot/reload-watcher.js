import fs from "fs";
import path from "path";

export function addReloadWatcher(dir, filename, loadHandler) {
  const filepath = path.join(dir, filename);
  // check this file for changes every second.
  fs.watchFile(filepath, { interval: 1000 }, () => {
    import(`file:///${filepath}?ts=${Date.now()}`).then((lib) => {
      console.log(`RELOADING ${filepath}`);
      loadHandler(lib);
    });
  });
}
