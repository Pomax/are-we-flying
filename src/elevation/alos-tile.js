import { execSync } from "child_process";
import { existsSync, readFileSync, copyFileSync } from "fs";
import { basename, join } from "path";
import tiff from "tiff";
import { ALOS_VOID_VALUE, CACHE_DIR } from "./alos-constants.js";

const { max } = Math;

export class ALOSTile {
  constructor(tilePath, coarseLevel = 10) {
    this.tilePath = tilePath;
    this.coarseLevel = coarseLevel;
    // copy to cache dir for faster loading
    const filename = join(CACHE_DIR, basename(tilePath));
    if (!existsSync(filename)) {
      try {
        copyFileSync(tilePath, filename);
      } catch (e) {
        execSync(`cp "\\${tilePath}" "${CACHE_DIR}"`);
      }
    }
    this.init(filename);
  }

  init(filename) {
    const file = readFileSync(filename);
    const image = tiff.decode(file.buffer);
    const block = (this.block = image[0]);
    const fields = block.fields;
    let [sx, sy, sz] = fields.get(33550);
    let [px, py, k, gx, gy, gz] = fields.get(33922);
    sy = -sy;
    this.forward = [gx, sx, 0, gy, 0, sy];
    this.reverse = [-gx / sx, 1 / sx, 0, -gy / sy, 0, 1 / sy];
    this.pixels = block.data;
    const params = [sx, sy, gx, gy];
    this.formCoarseTile(block.width, block.height, params);
  }

  formCoarseTile(width, height, [sx, sy, gx, gy]) {
    // form a much smaller, coarse lookup map
    const { coarseLevel, pixels: p } = this;
    this.coarsePixels = [];
    for (let i = 0; i < p.length; i += coarseLevel) {
      this.coarsePixels[i / coarseLevel] = max(...p.slice(i, i + coarseLevel));
    }
    const [w, h] = [width / coarseLevel, height / coarseLevel];
    for (let i = 0; i < w; i += coarseLevel) {
      let list = [];
      for (let j = 0; j < coarseLevel; j++) list.push(p[i + j * w]);
      this.coarsePixels[i / coarseLevel] = max(...list);
    }
    this.coarsePixels = new Uint16Array(this.coarsePixels);
    const [sxC, syC] = [sx * coarseLevel, sy * coarseLevel];
    this.coarseForward = [gx, sxC, 0, gy, 0, syC];
    this.coarseReverse = [-gx / sxC, 1 / sxC, 0, -gy / syC, 0, 1 / syC];
  }

  pixelToGeo(x, y, coarse = false) {
    // returns [lat, long] (it does NOT return [long, lat]!)
    const F = coarse ? this.coarseForward : this.forward;
    return [F[3] + F[4] * x + F[5] * y, F[0] + F[1] * x + F[2] * y];
  }

  geoToPixel(lat, long, coarse = false) {
    // returns [x, y]
    const R = coarse ? this.coarseReverse : this.reverse;
    return [R[0] + R[1] * long + R[2] * lat, R[3] + R[4] * long + R[5] * lat];
  }

  lookup(lat, long, coarse = false) {
    const [x, y] = this.geoToPixel(lat, long, coarse);
    const pos = (x | 0) + (y | 0) * this.block.width;
    let value = (coarse ? this.coarsePixels : this.pixels)[pos];
    // the highest point on earth is 8848m
    if (value === undefined || value > 10000) value = ALOS_VOID_VALUE;
    return value;
  }
}
