import { readFileSync } from "node:fs";
import tiff from "tiff";
import { ALOS_VOID_VALUE, NO_ALOS_DATA_VALUE } from "./alos-constants.js";
import { KM_PER_ARC_DEGREE } from "../utils/constants.js";

const { abs, ceil, sign, min, max } = Math;
const DEFAULT_COARSE_SCALE = 4;

export class ALOSTile {
  constructor(tilePath) {
    this.tilePath = tilePath;
    this.load(tilePath);
  }

  /**
   * Load in a GeoTIFF and parse the metadata so we can set
   * up our matrix transforms for geo-to-pixel and pixel-to-geo
   * coordinate conversions.
   *
   * See https://stackoverflow.com/questions/47951513#75647596
   * if you want the full details on how that works.
   */
  load(filename) {
    const file = readFileSync(filename);
    const image = tiff.decode(file.buffer);
    const { data, fields, width, height } = image[0];
    let [sx, sy, sz] = fields.get(33550);
    let [px, py, k, gx, gy, gz] = fields.get(33922);
    sy = -sy;
    this.forward = [gx, sx, 0, gy, 0, sy];
    this.reverse = [-gx / sx, 1 / sx, 0, -gy / sy, 0, 1 / sy];
    this.pixels = data;
    this.width = width;
    this.height = height;
    this.coarse = false;
    const scale = DEFAULT_COARSE_SCALE;
    setTimeout(() => this.formCoarseTile(width, height, scale), 50);
  }

  // form a much smaller, coarse lookup map
  formCoarseTile(width, height, scale) {
    const { pixels: p } = this;

    const coarseLevel = 2 ** (scale - 1);
    const coarsePixels = [];
    const [w, h] = [width / coarseLevel, height / coarseLevel];
    this.coarse = { coarseLevel, width: w, height: h, pixels: false };

    for (let x = 0; x < width; x += coarseLevel) {
      for (let y = 0; y < width; y += coarseLevel) {
        // get all pixels
        const list = [];
        for (let i = 0; i < coarseLevel; i++) {
          for (let j = 0; j < coarseLevel; j++) {
            const pos = (y + j) * width + (x + i);
            list.push(p[pos]);
          }
        }
        const pos = ((y / coarseLevel) | 0) * w + ((x / coarseLevel) | 0);
        coarsePixels[pos] = max(...list);
      }
    }

    this.coarse.pixels = new Uint16Array(coarsePixels.slice(0, w * h));
  }

  /**
   * convert a pixel (x,y) coordinate to a [lat, long] value.
   * Note that it does NOT return [long, lat], even though
   * the (x,y) ordering generally maps to (long,lat) values.
   */
  pixelToGeo(x, y, coarse = false, F = this.forward) {
    if (coarse) {
      const { coarseLevel } = this.coarse;
      x = x * coarseLevel;
      y = y * coarseLevel;
    }
    return [F[3] + F[4] * x + F[5] * y, F[0] + F[1] * x + F[2] * y];
  }

  /**
   * convert a geo (lat,long) coordinate to an [x,y] value.
   */
  geoToPixel(lat, long, coarse = false, R = this.reverse) {
    let [x, y] = [
      // remember: there are no fractional pixels
      (R[0] + R[1] * long + R[2] * lat) | 0,
      (R[3] + R[4] * long + R[5] * lat) | 0,
    ];
    if (coarse) {
      const { coarseLevel } = this.coarse;
      x = (x / coarseLevel) | 0;
      y = (y / coarseLevel) | 0;
    }
    return [x, y];
  }

  /**
   * Find the pixel that maps to a given lat/long coordinate,
   * and return its greyscalevalue as the elevation in meters
   * at that coordinate on the planet.
   *
   * Note: this might not be a real elevation!
   */
  lookup(lat, long, coarse = false) {
    const ref = coarse ? this.coarse : this;
    const [x, y] = this.geoToPixel(lat, long, coarse);
    const pos = x + y * ref.width;
    let value = ref.pixels[pos];
    if (value === undefined || value > NO_ALOS_DATA_VALUE)
      value = ALOS_VOID_VALUE;
    return value;
  }

  /**
   * Find the maximum elevation inside a polygon by converting it
   * from geo-poly to pixel-poly, converting that to a set of scan lines,
   * and then finding the maximum elevation across all scan lines.
   *
   * This means we're technically working with a slightly concave poly
   * since we're not taking great circles into account, but at the scale
   * that we need this, around 25km tops, that shouldn't cause too much
   * problems (if we're flying near the poles, different story, but you
   * can't generally trust your instruments near the poles anyway)
   */
  getMaxElevation(geoPoly) {
    const coarse = !!this.coarse;
    const ref = coarse ? this.coarse : this;
    const pixelPoly = geoPoly.map((pair) => this.geoToPixel(...pair, coarse));
    const scanLines = formScanLines(pixelPoly);

    const result = { elevation: ALOS_VOID_VALUE };
    scanLines.forEach(([start, end], y) => {
      if (start === end) return;

      const line = ref.pixels.slice(ref.width * y + start, ref.width * y + end);

      line.forEach((elevation, i) => {
        if (elevation >= NO_ALOS_DATA_VALUE) return;
        let x = i + start;
        if (elevation > result.elevation) {
          result.x = x;
          result.y = y;
          result.elevation = elevation;
        }
      });
    });

    const { elevation: meter, x, y } = result;
    const [lat, long] = this.pixelToGeo(x, y, coarse);
    const feet = meter === ALOS_VOID_VALUE ? meter : ceil(meter * 3.28084);
    return {
      lat,
      long,
      elevation: { feet, meter },
      resolution: parseFloat(
        ((KM_PER_ARC_DEGREE * 1000) / ref.width).toFixed(2)
      ),
    };
  }
}

/**
 * convert a polygon into a set of scan lines, then find the
 * maximum elevation across those scan lines. This is similar
 * to the work we'd do if we wanted to "flood fill" a shape
 * without cutouts, https://en.wikipedia.org/wiki/Flood_fill
 */
function formScanLines(poly) {
  poly = [...poly, poly[0]];
  const scanLines = [];

  // console.log(`running fillScanLines`);
  for (let i = 1, e = poly.length, a = poly[0], b; i < e; i++) {
    const b = poly[i];
    fillScanLines(a[0], a[1], b[0], b[1], scanLines);
    a = b;
  }

  // console.log(`reducing scanlines to start/end`);
  scanLines.forEach((line) => {
    line.sort((a, b) => a - b);
    const n = line.length;
    if (n > 2) line.splice(1, n - 2);
  });
  return scanLines;
}

/**
 * This is Bresenham's Line Algorithm,
 * https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm
 */
function fillScanLines(x0, y0, x1, y1, scanLines) {
  const dx = abs(x1 - x0);
  const dy = abs(y1 - y0);
  const sx = sign(x1 - x0);
  const sy = sign(y1 - y0);
  let err = dx - dy;

  while (true) {
    scanLines[y0] ??= [];
    scanLines[y0].push(x0);

    if (x0 === x1 && y0 === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}
