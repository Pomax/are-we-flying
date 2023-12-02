import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import { watch } from "../../../utils/reload-watcher.js";
import { getHeading as getNaiveHeading } from "./naive.js";
import { getHeading as getProjectiveHeading } from "./projective.js";
import { getHeading as getDoubleProjectiveHeading } from "./double-projective.js";

const TransitionModes = {
  getNaiveHeading,
  getProjectiveHeading,
  getDoubleProjectiveHeading,
};

watch(
  `${__dirname}naive.js`,
  (lib) => (TransitionModes.getNaiveHeading = lib.getHeading)
);
watch(
  `${__dirname}projective.js`,
  (lib) => (TransitionModes.getProjectiveHeading = lib.getHeading)
);
watch(
  `${__dirname}double-projective.js`,
  (lib) => (TransitionModes.getDoubleProjectiveHeading = lib.getHeading)
);

export { TransitionModes };
