import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { win32, sep, join } from "node:path";
import {
  ALOS_VOID_VALUE,
  NO_ALOS_DATA_VALUE,
  INDEX_FILE,
} from "./alos-constants.js";
import { ALOSTile } from "./alos-tile.js";

const { DATA_FOLDER } = process.env;
export { DATA_FOLDER, NO_ALOS_DATA_VALUE };

import { traceFunctionCalls } from "../utils/tracer.js";

const { floor, ceil, min, max } = Math;
const cm = 0.0000000001;
const globalTileCache = [];

// JAXA ALOS World 3D (30m) dataset manager
// homepage: https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm
// data format: https://www.eorc.jaxa.jp/ALOS/en/aw3d30/aw3d30v11_format_e.pdf
// license: https://earth.jaxa.jp/en/data/policy/

export class ALOSInterface {
  constructor(tilesFolder) {
    this.tilesFolder = tilesFolder;
    this.loaded = false;
    this.files = [];
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
    const tileName = this.getTileName(lat, long);
    return this.getTileFromCache(tileName);
  }

  /**
   * If there is no cached entry, build it. Otherwise
   * just immediately return that cached value:
   */
  getTileFromCache(tileName) {
    if (globalTileCache[tileName] === undefined) {
      globalTileCache[tileName] = false;
      const tilePath = this.getTilePath(tileName);
      if (tilePath) {
        globalTileCache[tileName] = new ALOSTile(tilePath);
      }
    }
    return globalTileCache[tileName];
  }

  /**
   * Which in turn requires knowing which file we need to
   * work with.
   *
   * ALOS tiles have [0,0] mapped to the upper-left, and
   * (3600,3600) to the lower right, but have a name based on
   * the lower-left corner, so a tile with name N048W124 covers
   * the latitude +48 to +49 and longitude -124 to-123, with:
   *
   *   [0,0] mapping to 49, -124, and
   *   [3599,3599] mapping to 49-1 + 1/3600, -124+1 - 1/3600,
   *               I.e. 48.00028, -123.00028
   *
   * Similarly, a tile with name S038E174 covers the latitude
   * range -37 to -38 and longitude range +174 to +175, with:
   *
   *   [0,0] mapping to -37, 174, and
   *   [3599,3599] mapping to -37-1 + 1/3600, 174+1 - 1/3600.
   *               I.e. -37.99972, 174.99972
   *
   * ALOS tiles are named ALPSMKC30_UyyyVxxx_DSM.tif, where
   * U is either "N" or "S", yyy is the degree of latitude
   * (with leading zeroes if necessary), and V is either "E"
   * or "W", with xxx being the degree of longitude (again,
   * with leading zeroes if necessary).
   */
  getTileName(lat, long) {
    // given the rules above, an integer latitude
    // can be found in the tile "south" of it:
    if ((lat | 0) === lat) lat -= 1;

    // (integer longitudes don't need a rewrite)

    // Form the latitude portions of our path:
    const latDir = lat >= 0 ? "N" : "S";
    let latStr = `` + (latDir == "N" ? floor(lat) : ceil(-lat));
    latStr = latStr.padStart(3, "0");

    // Form the longitude portions of our path:
    const longDir = long >= 0 ? "E" : "W";
    let longStr = `` + (longDir == "E" ? floor(long) : ceil(-long));
    longStr = longStr.padStart(3, "0");

    // Then assemble them into an ALOS path fragment:
    return `ALPSMLC30_${latDir}${latStr}${longDir}${longStr}_DSM.tif`;
  }

  /**
   * ...
   */
  getTilePath(tileName) {
    const fullPath = this.files.find((f) => f.endsWith(tileName));
    if (!fullPath) return false;
    return join(this.tilesFolder, fullPath);
  }

  /**
   * ...
   */
  getMaxElevation(geoPoly) {
    // console.log(`splitting`);
    const quadrants = splitAsQuadrants(geoPoly);
    let result = {
      lat: 0,
      long: 0,
      elevation: { feet: ALOS_VOID_VALUE, meter: ALOS_VOID_VALUE },
    };
    quadrants.forEach((poly, i) => {
      if (!poly.length) return;
      const tile = this.getTileFor(...poly[0]);
      if (!tile) return;
      const qResult = tile.getMaxElevation(poly) ?? {
        elevation: { meter: ALOS_VOID_VALUE },
      };
      if (qResult && qResult.elevation.meter > result.elevation.meter) {
        result = qResult;
      }
    });
    return result;
  }

  /**
   * check whether there is terrain obstruction between two points
   * on the map.
   */
  isObstructed(p1, p2) {
    // FIXME: TODO: this needs to take degree-splits into account.
    // get the tiles that the p1-p2 line is in
    const tile = this.getTileFor(p1[0], p1[1]);
    if (!tile) return true;
    return tile.isObstructed(p1, p2);
  }
}

// We can use a nice animated graphic here
function splitAsQuadrants(poly) {
  // Figure out which "horizontal" and "vertical"
  // lines we may need to cut our polygon with:
  const lats = [];
  const longs = [];
  // console.log(poly);

  poly.forEach(([lat, long]) => {
    lats.push(floor(lat), ceil(lat));
    longs.push(floor(long), ceil(long));
  });

  const hThreshold = ceil((min(...longs) + max(...longs)) / 2);
  // console.log(min(...longs), max(...longs), hThreshold);

  const vThreshold = ceil((min(...lats) + max(...lats)) / 2);
  // console.log(min(...lats), max(...lats), vThreshold);

  // Then perform a three-way polygon split: first a left/right
  // split across the longitudinal divider, then a top/bottom
  // split for (potentially) both shapes that yields, so that
  // we end up with either 1, 2, or 4 tiles we need to check.
  poly = [...poly, poly[0]];
  const [left, right] = splitAlong(poly, 1, hThreshold);
  // console.log({ hThreshold, left, right });

  const [tl, bl] = splitAlong(left, 0, vThreshold);
  const [tr, br] = splitAlong(right, 0, vThreshold);
  // console.log({ tr, br, bl, tl });
  return [tr, br, bl, tl];
}

function splitAlong(coords, dim, threshold) {
  const le = [];
  const gt = [];
  for (let i = 1, e = coords.length, a = coords[0], b; i < e; i++) {
    b = coords[i];
    // if the first point is less or equal to our divider,
    // add that point to our new "less or equal" shape.
    if (a[dim] <= threshold) {
      le.push(a);
      // If the second point is on the other side of our
      // divider, we split up the edge by generating two new
      // points on either side of the divider, and then adding
      // the one on a's side to the same shape we added a to,
      // and we add the one on b's side to the other shape.
      if (b[dim] > threshold) {
        splitEdge(a, b, dim, threshold, le, gt);
      }
    }
    // And if the first point is greater than our divider, we
    // do the same thing but with the target shapes switched.
    else {
      gt.push(a);
      if (b[dim] <= threshold) {
        splitEdge(a, b, dim, threshold, le, gt);
      }
    }
    a = b;
  }
  if (le.length) le.push(le[0]);
  if (gt.length) gt.push(gt[0]);
  return [le, gt];
}

// create the two points on either side of the divide
function splitEdge(a, b, dim, threshold, le, gt) {
  // console.log(`splitEdge`, { a, b, dim, threshold });
  const r = (threshold - a[dim]) / (b[dim] - a[dim]);
  if (dim === 0) {
    const long = (1 - r) * a[1] + r * b[1];
    // console.log(`splitting [0] with`, [threshold, long]);
    le.push([threshold, long]);
    gt.push([threshold + cm, long]);
  } else {
    const lat = (1 - r) * a[0] + r * b[0];
    // console.log(`splitting [1] with`, [lat, threshold]);
    le.push([lat, threshold]);
    gt.push([lat, threshold + cm]);
  }
}
