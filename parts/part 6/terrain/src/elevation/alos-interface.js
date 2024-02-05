import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { win32, sep, join } from "node:path";
import dotenv from "dotenv";
const __dirname = import.meta.dirname;
dotenv.config({ path: `${__dirname}/../../.env` });

const DATA_FOLDER = process.env.DATA_FOLDER;

import {
  ALOS_VOID_VALUE,
  NO_ALOS_DATA_VALUE,
  INDEX_FILE,
  CACHE_DIR,
} from "./alos-constants.js";
import { ALOSTile } from "./alos-tile.js";

export { DATA_FOLDER, NO_ALOS_DATA_VALUE };

const { floor, ceil, max } = Math;
await mkdir(CACHE_DIR, { recursive: true });

// JAXA ALOS World 3D (30m) dataset manager
// homepage: https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm
// data format: https://www.eorc.jaxa.jp/ALOS/en/aw3d30/aw3d30v11_format_e.pdf
// license: https://earth.jaxa.jp/en/data/policy/

export class ALOSInterface {
  constructor(tilesFolder) {
    this.tilesFolder = tilesFolder;
    this.loaded = false;
    this.files = [];
    this.cache = {};
    if (!this.tilesFolder) {
      console.log(
        `No ALOS data folder specified, elevation service will not be available.`
      );
    } else {
      this.loadIndex();
      this.loaded = true;
      console.log(`ALOS loaded, using ${this.files.length} tiles.`);
    }
  }

  /**
   * We don't want to hold up our elevation server to index a directory
   * containing some twenty three thousand files, so we'll build an index
   * instead, and load that when it exists.
   */
  loadIndex() {
    // Build our index if it doesn't exist:
    if (!existsSync(INDEX_FILE)) {
      console.log(`Indexing dataset...`);
      const mark = Date.now();
      this.findFiles();
      const fileCount = this.files.length;
      const json = JSON.stringify(
        this.files.map((v) => v.replace(this.tilesFolder, ``))
      );
      writeFileSync(INDEX_FILE, json);
      console.log(
        `Dataset indexed in ${((Date.now() - mark) / 1000).toFixed(
          2
        )}s (${fileCount} tiles found)`
      );
    }
    // Or, if it does, load in the index instead of trawling the file system:
    else {
      this.files = JSON.parse(readFileSync(INDEX_FILE)).map((v) =>
        v.split(win32.sep).join(sep)
      );
    }
  }

  /**
   * In order to build our index, we recursively read the
   * data directory in order to find all filenames.
   */
  findFiles(dir = this.tilesFolder) {
    readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && fullPath.endsWith(".tif"))
        this.files.push(fullPath);
      if (entry.isDirectory()) this.findFiles(fullPath);
    });
  }

  /**
   * Then, the function we care about the most:
   */
  lookup(lat, long) {
    if (!this.loaded) return NO_ALOS_DATA_VALUE;
    const tile = this.getTileFor(lat, long);
    if (!tile) console.warn(`no tile for ${lat},${long}...`);
    const elevation = tile?.lookup(lat, long) ?? ALOS_VOID_VALUE;
    return elevation;
  }

  /**
   * Which requires a way to get a tile (which is a 1 degree
   * by 1 degree "rectangle" on the map).
   */
  getTileFor(lat, long) {
    const { loaded } = this;
    if (!loaded) return;
    const [tileName, tilePath] = this.getTileFromFolder(lat, long);
    if (!tileName) return;
    return new ALOSTile(tilePath);
  }

  /**
   * Which in turn requires knowing which file we need to
   * "wrap a tile around".
   *
   * ALOS tiles are named ALPSMKC30_UyyyVxxx_DSM.tif, where
   * U is either "N" or "S", yyy is the degree of latitude
   * (with leading zeroes if necessary), and V is either "E"
   * or "W", with xxx being the degree of longitude (again,
   * with leading zeroes if necessary).
   */
  getTileFromFolder(lat, long) {
    // Form the latitude portions of our path:
    const latDir = lat >= 0 ? "N" : "S";
    let latStr = `` + (latDir == "N" ? floor(lat) : ceil(-lat));
    latStr = latStr.padStart(3, "0");

    // Form the longitude portions of our path:
    const longDir = long >= 0 ? "E" : "W";
    let longStr = `` + (longDir == "E" ? floor(long) : ceil(-long));
    longStr = longStr.padStart(3, "0");

    // Then assemble them into an ALOS path fragment:
    const tileName = `ALPSMLC30_${latDir}${latStr}${longDir}${longStr}_DSM.tif`;

    // And finally, find the fully qualified file path
    // given that fragment, by looking at our filename index:
    const fullPath = this.files.find((f) => f.endsWith(tileName));
    if (!fullPath) return [false, false];
    return [tileName, join(this.tilesFolder, fullPath)];
  }

  getMaxElevation(geoPoly) {
    // FIXME: this needs to become "potentially chop up this polygon"
    const tile = this.getTileFor(...geoPoly[0]);
    const elevation = tile?.getMaxElevation(geoPoly) ?? ALOS_VOID_VALUE;
    return elevation;
  }
}
