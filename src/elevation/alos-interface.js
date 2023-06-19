import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { mkdir } from "fs/promises";
import { win32, sep, join } from "path";
import { getDistanceBetweenPoints } from "../api/autopilot/utils/utils.js";
import {
  SEA_LEVEL,
  ALOS_VOID_VALUE,
  NO_ALOS_DATA_VALUE,
  INDEX_FILE,
  CACHE_DIR,
} from "./alos-constants.js";
import { ALOSTile } from "./alos-tile.js";
import { mergeCrops, saveImage } from "./image-utils.js";
import fs from "fs";
import path from "path";

const COARSE_LEVEL = 10;
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

  loadIndex() {
    if (!existsSync(INDEX_FILE)) {
      console.log(`Indexing dataset...`);
      const mark = Date.now();
      this.findFiles();
      const json = JSON.stringify(
        this.files.map((v) => v.replace(this.tilesFolder, ``))
      );
      writeFileSync(INDEX_FILE, json);
      console.log(
        `Dataset indexed in ${((Date.now() - mark) / 1000).toFixed(2)}s (${
          this.files.length
        } tiles found)`
      );
    }
    this.files = JSON.parse(readFileSync(INDEX_FILE)).map((v) =>
      v.split(win32.sep).join(sep)
    );
  }

  findFiles(dir = this.tilesFolder) {
    // Recursively find all tiles. This will take a bit of time,
    // but crucially we're not *loading* any of these files, so
    // as long as the filesystem is fast, this operation will
    // only take a few seconds to load in around 24k file paths
    // (for the full ALOS World3D (30m) dataset at least).
    readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isFile()) {
        if (fullPath.endsWith(".tif")) {
          this.files.push(fullPath);
        }
      }
      if (entry.isDirectory()) {
        this.findFiles(fullPath);
      }
    });
  }

  // For now, crops can cover at most 1x1 degree of arc
  async getCrop(imagePath, lat1, long1, lat2, long2, x, y, z) {
    console.log(
      `cropping for ${z}/${x}/${y} between: ${lat1},${long1} and ${lat2},${long2}`
    );
    // we may need up to four tiles
    const NW = this.getTileFor(lat1, long1);
    if (!NW) {
      return false;
    }

    let NE = this.getTileFor(lat1, long2);
    let SW = this.getTileFor(lat2, long1);
    let SE = this.getTileFor(lat2, long2);

    // is anything a NW dupe?
    if (NE === NW) {
      console.log(`ne was dupe`);
      NE = undefined;
    }
    if (SW === NW) {
      console.log(`sw was dupe`);
      SW = undefined;
    }
    if (SE === NW) {
      console.log(`se was dupe`);
      SE = undefined;
    }

    // If not, check duals
    if (SE === NE) {
      console.log(`se was dupe`);
      SE = undefined;
    }

    if (SE === SW) {
      console.log(`se was dupe`);
      SE = undefined;
    }

    // ask each tile for its crop
    const cNW = NW.crop(lat1, long1, lat2, long2);
    const cNE = NE?.crop(lat1, long1, lat2, long2);
    const cSW = SW?.crop(lat1, long1, lat2, long2);
    const cSE = SE?.crop(lat1, long1, lat2, long2);

    console.log(
      [`paths:`, cNW.path, cNE?.path, cSW?.path, cSE?.path]
        .filter(Boolean)
        .join(`\n`)
    );

    // glue them together
    let result = cNW;
    if (cNE || cSW || cSE) {
      console.log(`merging...`);
      result = mergeCrops(cNW, cNE, cSW, cSE);
      if (!result) return false;
    }

    // save as 256×256 PNG
    const { width, height, data } = result;
    await saveImage(imagePath, width, height, data);
    return imagePath;
  }

  getTileFor(lat, long) {
    if (!this.loaded) return;

    const [tileName, tilePath] = this.getTileFromFolder(
      this.tilesFolder,
      lat,
      long
    );
    if (!tileName) return;
    this.cache[tilePath] ??= new ALOSTile(tilePath, COARSE_LEVEL);
    return this.cache[tilePath];
  }

  getTileFromFolder(basedir, lat, long) {
    // ALOS tiles are named ALPSMKC30_UyyyWxxx_DSM.tif, where
    // U is either "N" or "S", yyy is the degree of latitude
    // (with leading zeroes if necessary), W is either "E" or
    // "W", and xxx is the degree of longitude (again with
    // leading zeroes if necessary).
    const latDir = lat >= 0 ? "N" : "S";
    const longDir = long >= 0 ? "E" : "W";
    lat = `` + (latDir == "N" ? floor(lat) : ceil(-lat));
    long = `` + (longDir == "E" ? floor(long) : ceil(-long));
    const tileName = `ALPSMLC30_${latDir}${lat.padStart(
      3,
      "0"
    )}${longDir}${long.padStart(3, "0")}_DSM.tif`;

    // find the full path for this file in the list of
    // known files we built in findFiles().
    const fullPath = this.files.find((f) => f.endsWith(tileName));

    if (!fullPath) return [false, false];

    return [tileName, join(basedir, fullPath)];
  }

  lookup(lat, long, coarse = false) {
    if (!this.loaded) return NO_ALOS_DATA_VALUE;

    lat = +lat;
    long = +long;
    const tile = this.getTileFor(lat, long);
    if (!tile) console.warn(`no tile for ${lat},${long}...`);
    const elevation = tile?.lookup(lat, long, coarse) ?? ALOS_VOID_VALUE;
    return elevation === ALOS_VOID_VALUE ? SEA_LEVEL : elevation;
  }

  getHighestPointBetween(lat1, long1, lat2, long2, coarse = false) {
    if (!this.loaded) return { lat: 0, long: 0, elevation: NO_ALOS_DATA_VALUE };

    const distance = getDistanceBetweenPoints(lat1, long1, lat2, long2);
    const s = (coarse ? COARSE_LEVEL * 0.03 : 0.003) / distance;
    let maxValue = { elevation: ALOS_VOID_VALUE, lat: lat2, long: long2 };
    for (let i = s, lat, long, elevation; i <= 1; i += s) {
      lat = (1 - i) * lat1 + i * lat2;
      long = (1 - i) * long1 + i * long2;
      elevation = this.lookup(lat, long, coarse);
      if (elevation > maxValue.elevation) maxValue = { elevation, lat, long };
    }
    return maxValue;
  }
}
