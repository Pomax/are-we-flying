import { watchFile } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname } from "node:path";
import { root } from "./constants.js";
import { rootRelative } from "./utils.js";

const hotReloadInstances = {};

/**
 * Watch a module for changes and trigger the onChange handler when it does.
 * @param {*} basePath
 * @param {*} modulePath
 * @param {*} onChange
 * @returns
 */
export async function watch(basePath, modulePath, onChange) {
  const filePath = basePath + `/` + modulePath;
  let moduleURL = `file:///${filePath}`;

  // Step 1: don't run file-watching in production. Obviously.
  if (process.env.NODE_ENV === `production`) {
    return import(moduleURL);
  }

  // Next, get the current callstack, so we can report on
  // that when a file change warrants an update.
  const callStack = new Error().stack
    .split(`\n`)
    .slice(2)
    .map((v) => {
      return v
        .trim()
        .replace(`file:///${root}`, `./`)
        .replace(/^at /, `  in `)
        .replace(/new (\S+)/, `$1.constructor`);
    })
    .join(`\n`)
    .replace(/\.constructor \(([^)]+)\)(.|[\n\r])*/, `.constructor ($1)`);

  // If we're not running in production, check this file for changes every second:
  watchFile(filePath, { interval: 1000 }, async () => {
    console.log(`Reloading module ${rootRelative(filePath)} at ${Date.now()}`);

    try {
      // If there was a change, re-import this file as an ES module, with a "cache busting" URL
      // that includes the current time stamp. Modules are cached based on their exact URL,
      // so adding a query argument that we can vary means we can "reimport" the code:
      const module = await import(`${moduleURL}?ts=${Date.now()}`);

      // Then we log the stack so we know where this reload was set up in our code:
      console.log(callStack);

      // To confirm to ourselves that a module was fully loaded as a "new module" we check
      // whether it has a `LOAD_TIME` constant that it set during load, and log what that
      // value is. Because it should be very close to our reload time.
      if (module.LOAD_TIME)
        console.log(`  Module-indicated load time is ${module.LOAD_TIME}`);

      // And then we run whatever code needs to run now that the module's been reloaded.
      onChange?.(module);
    } catch (e) {
      // Never crash the server just because someone saved a file with a typo.
      console.error(`\nWatcher could not load module: ${filePath}`);
      console.error(callStack);
      console.error(e);
    }
  });

  // Then, as part of the call, run an immediate load
  // with a timestamp, so we're always cache-busting.
  return import(`${moduleURL}?ts=${Date.now()}`);
}

/**
 * A Class "decorator" for turning regular classes into
 * hot-reloadable classes.
 *
 * @param {*} ClassObject
 * @param {*} meta
 * @returns
 */
export function reloading(meta, ClassObject) {
  const className = ClassObject.name;
  const id = meta.url.replace(/\?ts=.+/, ``) + `:` + className;

  if (!hotReloadInstances[id]) {
    console.log(`adding hot reload for ${id}`);
    hotReloadInstances[id] = [];
    const modulePath = fileURLToPath(meta.url);
    watch(dirname(modulePath), basename(modulePath), async (module) => {
      hotReloadInstances[id].forEach((instance) => {
        console.log(`reloading instance of ${className}`);
        Object.setPrototypeOf(instance, module[className].prototype);
      });
    });
  }

  return new Proxy(ClassObject, {
    construct(target, args) {
      const instance = Reflect.construct(target, args);
      hotReloadInstances[id].push(instance);
      return instance;
    },
  });
}
