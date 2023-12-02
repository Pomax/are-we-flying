import { join, resolve } from "path";
import url from "node:url";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

export const SEA_LEVEL = 0;
export const ALOS_VOID_VALUE = -9999;
export const NO_ALOS_DATA_VALUE = 9999;
export const INDEX_FILE = resolve(join(__dirname, `alos-index.json`));
export const CACHE_DIR = resolve(join(__dirname, `cache`));