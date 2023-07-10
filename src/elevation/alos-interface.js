import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { mkdir } from "fs/promises";
import { win32, sep, join } from "path";
import {
  getDistanceBetweenPoints,
  constrainMap,
} from "../api/autopilot/utils/utils.js";
import {
  SEA_LEVEL,
  ALOS_VOID_VALUE,
  NO_ALOS_DATA_VALUE,
  INDEX_FILE,
  CACHE_DIR,
} from "./alos-constants.js";
import { ALOSTile } from "./alos-tile.js";
import { colorize } from "./image-js/create-map.js";
import { writePNG } from "./image-js/write-png.js";

const COARSE_LEVEL = 10;
const { abs, floor, ceil, min, max } = Math;
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

  /**
   * form and XYZ tile for use in Leaflet
   * @param {*} imagePath
   * @param {*} lat1
   * @param {*} long1
   * @param {*} lat2
   * @param {*} long2
   * @param {*} x
   * @param {*} y
   * @param {*} z
   * @param {*} DO_NOT_SCALE_TO_256
   * @returns
   */
  async getXYZImage(
    imagePath,
    lat1,
    long1,
    lat2,
    long2,
    x,
    y,
    z,
    DO_NOT_SCALE_TO_256
  ) {
    console.log(
      `cropping for ${z}/${x}/${y} between: ${lat1},${long1} and ${lat2},${long2}`
    );

    // how many tiles do we need, given that each tile is 1x1 degrees?
    const dlong = ceil(long2) - floor(long1); // we run NW-SE, so long2 is the higher value
    const xtiles = dlong;

    const dlat = ceil(lat1) - floor(lat2); // we run NW-SE, so lat1 is the higher value
    const ytiles = dlat;

    if (xtiles > 8 || ytiles > 8)
      throw new Error(`too many tiles required (${xtiles}/${ytiles})`);

    console.log(`dlong=${dlong}, dlat=${dlat}: ${xtiles} x ${ytiles} tiles`);

    // XYZ tiles are 256x256px, but in order to keep things looking good,
    // we'll generate a large master, color it, and then crop/downscale.
    let bounds;
    const dim = 3600;
    const mw = xtiles * dim;
    const mh = ytiles * dim;
    const master = new Int16Array(mw * mh);

    for (let x = 0; x < xtiles; x++) {
      for (let y = 0; y < ytiles; y++) {
        console.log(
          `get tile ${x + 1}/${y + 1}, for GPS position ${lat1 - y},${
            long1 + x
          }`
        );

        const latDir = lat1 - y >= 0 ? "N" : "S";
        const longDir = long1 + x >= 0 ? "E" : "W";
        let blat = latDir == "N" ? ceil(lat1 - y) : ceil(lat1 - y);
        let blong = longDir == "E" ? floor(long1 + x) : floor(long1 + x);

        console.log(
          `boing ${x}/${y} => ${lat1 - y},${long1 + x}`,
          latDir,
          blat,
          longDir,
          blong
        );

        const tile = this.getTileFor(lat1 - y, long1 + x);
        let bbox = [blat, blong, blat - 1 + 1 / 3600, blong + 1 + 1 / 3600];

        console.log(`bbox:`, bbox);

        // track bounding box in GPS coordinates
        if (!bounds) {
          bounds = bbox;
        } else {
          if (bbox[0] > bounds[0]) bounds[0] = bbox[0]; // nw:vertical
          if (bbox[1] < bounds[1]) bounds[1] = bbox[1]; // nw:horizontal
          if (bbox[2] < bounds[2]) bounds[2] = bbox[2]; // se:vertical
          if (bbox[3] > bounds[3]) bounds[3] = bbox[3]; // se:horizontal
        }

        console.log(`updated bounds`, bounds);

        if (!tile) {
          console.log(`- no tile (ocean tile?)`);
          continue;
        }

        const { pixels, tilePath } = tile;
        // console.log(
        //   `tile bbox: ${bbox[0]},${bbox[1]} to ${bbox[2]},${bbox[3]}`
        // );

        console.log(`- ${tile.filename}`);

        // copy pixels in row by row
        for (let i = 0; i < dim; i++) {
          const row = pixels.slice(i * dim, (i + 1) * dim);
          master.set(row, x * dim + y * dim * mw + i * mw);
        }
      }
    }

    if (!bounds) return;

    console.log(
      `bounds: ${bounds[0]},${bounds[1]} to ${bounds[2]},${bounds[3]}`
    );

    const [y1, x1, y2, x2] = bounds;
    const cropBox = [
      constrainMap(lat1, y1, y2, 0, mh) | 0,
      constrainMap(long1, x1, x2, 0, mw) | 0,
      constrainMap(lat2, y1, y2, 0, mh) | 0,
      constrainMap(long2, x1, x2, 0, mw) | 0,
    ];

    console.log(
      `crop box: ${cropBox[0]},${cropBox[1]} to ${cropBox[2]},${cropBox[3]}`
    );

    const cy = cropBox[0];
    const cx = cropBox[1];
    let ch = cropBox[2] - cropBox[0];
    let cw = cropBox[3] - cropBox[1];

    console.log(`crop: y=${cy}, x=${cx}, h=${ch}, w=${cw}`);

    let cropGrid = new Int16Array(cw * ch);
    for (let i = 0; i < ch; i++) {
      const pos = cx + cy * mw + i * mw;
      const row = master.slice(pos, pos + cw);
      cropGrid.set(row, i * cw);
    }

    // collapse the array to something manageable
    const md = min(mw, mh);
    const f = floor(md / 1000);
    if (f > 1) {
      console.log(`collapsing to 1000 on the short side`);
      const p = cropGrid;
      const w = (cw / f) | 0;
      const h = (ch / f) | 0;
      console.log(f, cw, w, ch, h);
      const collapsed = new Int16Array(w * h);
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          const i = x + y * w;
          const j = x * f + y * f * cw;
          collapsed[i] = p[j];
        }
      }
      cropGrid = collapsed;
      cw = w;
      ch = h;
      console.log(`finished collapse`);
    }

    // color, hillshade, etc.
    console.log(`running colorize operation`);

    // const buffer = await colorize(cropGrid, cw, ch);
    // console.log(`writing data to ${imagePath}`);
    // writeFileSync(imagePath, buffer);

    const { pixels, palette } = await colorize(cropGrid, cw, ch, z>=12);
    writePNG(imagePath, pixels, cw, ch);

    return imagePath;
  }
}
