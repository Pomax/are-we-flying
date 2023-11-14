import fs from "fs";

export function watch(filePath, onChange) {
  // Step 1: don't run file-watching in production. Obviously.
  if (process.env.NODE_ENV === `production`) return;

  // Next, get the current callstack, so we can report on
  // that when a file change warrants an update.
  const callStack = new Error().stack
    .split(`\n`)
    .slice(2)
    .map((v) => v.trim().replace(`at `, `  `))
    .join(`\n`);

  // If we're not running in production, check this file for changes every second:
  fs.watchFile(filePath, { interval: 1000 }, async () => {
    console.log(`RELOADING ${filePath} AT ${Date.now()}`);

    // If there was a change, re-import this file as an ES module, with a "cache busting" URL
    // that includes the current time stamp. Modules are cached based on their exact URL,
    // so adding a query argument that we can vary means we we "reimport" the code:
    const module = await import(`file:///${filePath}?ts=${Date.now()}`);

    // To confirm to ourselves that a module was fully loaded as a "new module" we check
    // whether it has a `LOAD_TIME` constant that it set during load, and log what that
    // value is. Because it should be very close to our reload time.
    if (module.LOAD_TIME) console.log(`  module.LOAD_TIME:${module.LOAD_TIME}`);

    // Then we log the stack so we know where this reload was set up in our code:
    console.log(callStack);

    // And then we run whatever code needs to run now that the module's been reloaded.
    onChange(module);
  });
}
