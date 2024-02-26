import dotenv from "dotenv";
dotenv.config({ path: ENV_PATH });

import { ENV_PATH } from "../utils/constants.js";
import { watch } from "../utils/reload-watcher.js";

let alos;
let { ALOSInterface } = await watch(
  import.meta.dirname,
  `../elevation/alos-interface.js`,
  (lib) => {
    ALOSInterface = lib.ALOSInterface;
    if (alos) {
      Object.setPrototypeOf(alos, ALOSInterface.prototype);
    }
  }
);

const { DATA_FOLDER } = process.env;
alos = new ALOSInterface(DATA_FOLDER);

export { alos };
