import fs from "fs";

export function watch(filePath, onChange) {
  if (process.env.NODE_ENV === `production`) return;

  const callStack = new Error().stack
    .split(`\n`)
    .slice(2)
    .map((v) => v.trim().replace(`at `, `  `))
    .join(`\n`);

  fs.watchFile(filePath, { interval: 1000 }, async () => {
    console.log(`RELOADING ${filePath}`);
    const module = await import(`file:///${filePath}?ts=${Date.now()}`);
    if (module.LOAD_TIME) console.log(`  module.LOAD_TIME:${module.LOAD_TIME}`);
    console.log(callStack);
    onChange(module);
  });
}
