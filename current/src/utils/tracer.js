const exists = (e) => e !== undefined && e !== null;
const noop = async () => {};
const AsyncFunction = noop.__proto__.constructor;

// TODO: fix the indents.
let globalDepth = -1;

/**
 * This function takes an object instance, and shadows all methods with
 * instance methods that log function call entry and exits.
 *
 * By default we log to the console, but if the instance has a
 * `this.options.logger`, then we'll use that, too.
 *
 * Additionally, if any function call receives a first argument
 * that supports logging, we use that instead of the main logger
 * (if there is one).
 *
 * @param {any} An instance of any class
 * @returns The same instance, for chaining convenience.
 */
export function traceFunctionCalls(instance, options = {}) {
  const proto = instance.__proto__;
  const className = proto.constructor.name;

  const indent = () => globalDepth++;
  const dedent = () => globalDepth--;

  const tracePrefix = () => (globalDepth === 0 ? `╭┈┈` : false);
  const getCallPrexif = () => `│ —> ` + ` `.repeat(globalDepth * 2);
  const getReturnPrexif = () => `│ <— ` + ` `.repeat(globalDepth * 2);
  const traceAffix = () => (globalDepth === 0 ? `╰┈┈\n` : false);

  // do we log to console, a custom console-log-alike, or just not at all.
  let consoleTarget = console;
  if (options.console) {
    consoleTarget = options.console.log ? options.console : { log: noop };
  }

  Object.getOwnPropertyNames(proto).forEach((name) => {
    // We leave the constructor alone. Too much deep JS magic is
    // involved in properly hooking up an overwritten constructor.
    if (name === `constructor`) return;

    // Do we have a logger available through this instance?
    const logger = instance.options && instance.options.logger;

    // For each function on the prototype, we first get the original,
    // and check whether it's an async function or not:
    const isAsync = proto[name] instanceof AsyncFunction;
    const originalFn = proto[name].bind(instance);

    // We then shadow this function appropriately (since async functions
    // need different return handling compared to regular functions):
    if (isAsync) {
      instance[name] = async function (...args) {
        // Do we have an arg-passed logger that we should use?
        let log = logger;
        if (!log) {
          const argWithLogger = args.find((e) =>
            exists(e) ? e.logger !== undefined : false
          );
          if (argWithLogger) {
            log = argWithLogger.logger;
          }
        }

        // Create the entry point log message:
        indent();
        const callPrefix = getCallPrexif();
        const callMessage = `${callPrefix}async call: ${className}.${String(
          name
        )}(${dataAsString(args)})`;

        // indent our message for console logging
        if (tracePrefix()) consoleTarget.log(tracePrefix());
        consoleTarget.log(callMessage);

        // istanbul ignore next
        if (log && log.info) {
          // is there a smart way to add context vars here?
          log.info(callMessage);
        }

        // Run the function, and capture the return
        const start = Date.now();
        const result = await originalFn(...args);
        let runtime = Date.now() - start;
        if (runtime > 1000) {
          runtime = `${(runtime / 1000).toFixed(1)}s`;
        } else {
          runtime += `ms`;
        }

        // istanbul ignore next
        const resultData =
          result === undefined
            ? `, no return value.`
            : `, return value: ${dataAsString(result)}`;

        // Create the exit log message:
        const returnPrefix = getReturnPrexif();
        const callEndMessage = `${returnPrefix}finished async ${className}.${String(
          name
        )}()${resultData}, runtime: ${runtime}`;

        // istanbul ignore next
        if (log && log.info) {
          log.info(callEndMessage);
        }

        consoleTarget.log(callEndMessage);
        if (traceAffix()) consoleTarget.log(traceAffix());
        dedent();

        // Send the result on wrapped as a promise, since we "unwrapped" it earlier.
        return new Promise((resolve) => resolve(result));
      };
    }

    // If this is a regular function, the procedure is similar, but return handling is easier.
    else {
      instance[name] = function (...args) {
        // Do we have an arg-passed logger that we should use?
        let log = logger;
        if (!log) {
          const argWithLogger = args.find((e) =>
            exists(e) ? e.logger !== undefined : false
          );
          if (argWithLogger) {
            log = argWithLogger.logger;
          }
        }

        // Create the entry point log message:
        indent();
        const callPrefix = getCallPrexif();
        const callMessage = `${callPrefix}call: ${className}.${String(
          name
        )}(${dataAsString(args)})`;

        // indent our message for console logging
        if (tracePrefix()) consoleTarget.log(tracePrefix());
        consoleTarget.log(callMessage);

        // istanbul ignore next
        if (log && log.info) {
          // is there a smart way to add context vars here?
          log.info(callMessage);
        }

        // Run the function, and capture the return
        const start = Date.now();
        const result = originalFn(...args);
        let runtime = Date.now() - start;
        if (runtime > 1000) {
          runtime = `${(runtime / 1000).toFixed(1)}s`;
        } else {
          runtime += `ms`;
        }

        // istanbul ignore next
        const resultData =
          result === undefined
            ? `, no return value.`
            : `, return value: ${dataAsString(result)}`;

        // Create the exit log message:
        const returnPrefix = getReturnPrexif();
        const callEndMessage = `${returnPrefix}finished ${className}.${String(
          name
        )}()${resultData}, runtime: ${runtime}`;

        // istanbul ignore next
        if (log && log.info) {
          log.info(callEndMessage);
        }

        consoleTarget.log(callEndMessage);
        if (traceAffix()) consoleTarget.log(traceAffix());
        dedent();

        // Send the result on to the caller
        return result;
      };
    }
  });

  return instance;
}

/**
 * Convert abitrary data into something that we can maybe make sense of in a log.
 * @param {any} Input. It could literally be anything.
 * @returns {string} a (hopefully) human readable summary of that input.
 */
function dataAsString(something, recursive = true) {
  const type = typeof something;
  if (type === `undefined`) {
    return `undefined`;
  }
  if (something === null) {
    return `null`;
  }
  if (type === `number`) {
    return something;
  }
  if (type === `string`) {
    return `"${something}"`;
  }
  if (type === `boolean`) {
    return something ? `true` : `false`;
  }
  if (type === `function`) {
    return `<function>`;
  }
  if (type === `symbol`) {
    return `<symbol${
      something.description ? `:` + something.description : ``
    }>`;
  }
  if (something instanceof Array) {
    return (
      `[` + something.map((e) => dataAsString(e, recursive)).join(`,`) + `]`
    );
  }
  const { name } = something.__proto__.constructor;
  const str = objectAsString(something);
  return `${name && name !== `Object` ? name + ":" : ``}${str}`;
}

/**
 * Convert an object into something that we can maybe make sense of in a log.
 * @param {object} an object containing literally anything.
 * @returns {string} a (hopefully) human readable summary of that object.
 */
function objectAsString(something) {
  let str = `{${Object.entries(something)
    .map(([key, value]) => {
      if (typeof value === `function`) return false;
      if (value instanceof Array)
        return `${key}: ${dataAsString(value, false)}`;
      if (typeof value === `object`) return `${key}: {...}`;
      return `${key}: ${dataAsString(value, false)}`;
    })
    .filter(Boolean)}}`;
  return str;
}
