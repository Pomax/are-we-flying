import tiff from "tiff";

import { readFileSync } from "node:fs";
import { ALOS_VOID_VALUE, NO_ALOS_DATA_VALUE } from "./alos-constants.js";
import { KM_PER_ARC_DEGREE } from "../utils/constants.js";

const { abs, ceil, sign, max } = Math;

const time = (name, fn) => {
  const start = Date.now();
  const result = fn();
  const runtime = Date.now() - start;
  console.log(`${name} took ${runtime}ms`);
  return result;
};

const DEFAULT_COARSE_SCALE = 3;

export class ALOSTile {
  constructor(tilePath, scale = DEFAULT_COARSE_SCALE) {
    this.tilePath = tilePath;
    this.scale = scale;
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
    this.pixels = data;
    this.width = width;
    this.height = height;
    let [sx, sy, _sz] = fields.get(33550);
    let [_px, _py, _k, gx, gy, _gz] = fields.get(33922);
    sy = -sy;
    this.forward = [gx, sx, 0, gy, 0, sy];
    this.reverse = [-gx / sx, 1 / sx, 0, -gy / sy, 0, 1 / sy];
    this.coarse = false;
    setTimeout(
      () =>
        time(`forming coarse image`, () => this.formCoarseTile(width, height)),
      50
    );
  }

  /**
   * Resize the original data by a factor of 2^scale, preserving
   * maximum elevation. If we had four pixels that encoded:
   *
   *    [.. .. .. ..]
   *    [.. 24 38 ..]
   *    [.. 34 57 ..]
   *    [.. .. .. ..]
   *
   * That would become a new, single pixel with value 57.
   */
  formCoarseTile(width, height) {
    const { pixels: p } = this;

    const coarseLevel = 2 ** (this.scale - 1);
    const coarsePixels = [];
    const [w, h] = [width / coarseLevel, height / coarseLevel];

    // We run a relative expensive loop here, but we'll only be
    // running it once, and we're running it "independently" of
    // any actual calls, so it won't cause query slowdowns.
    for (let x = 0; x < width; x += coarseLevel) {
      for (let y = 0; y < width; y += coarseLevel) {
        // find the highest elevation amongst all the pixels
        // that we want to collapse into a single new pixel:
        let maximum = ALOS_VOID_VALUE;
        for (let i = 0; i < coarseLevel; i++) {
          for (let j = 0; j < coarseLevel; j++) {
            const pos = (y + j) * width + (x + i);
            const elevation = p[pos];
            if (maximum < elevation) maximum = elevation;
          }
        }
        // and then set that value in our smaller pixel "grid".
        const pos = ((y / coarseLevel) | 0) * w + ((x / coarseLevel) | 0);
        coarsePixels[pos] = maximum;
      }
    }

    this.coarse = { coarseLevel, width: w, height: h, pixels: coarsePixels };
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
   * and return the elevation in meters that it has encoded
   * as a greyscale intensity value at that coordinate.
   *
   * Note: this might not be a real elevation! There may
   * be gaps in the ALOS data, or the coordinate might
   * simply not exist because it's an ocean coordinate.
   */
  lookup(lat, long, coarse = false) {
    // Since we wrote `this.coarse` to have the same lookup-relevant
    // properties as the tile object itself, they're interchangeable:
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
    const maximum = { lat, long, elevation: { feet, meter } };

    // And for good measure, let's also include what resolution we used:
    maximum.resolution = parseFloat(
      ((KM_PER_ARC_DEGREE * 1000) / ref.width).toFixed(2)
    );
    return maximum;
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
function fillScanLines(x, y, x2, y2, scanLines = []) {
  const dx = x2 - x,
    dy = y2 - y;
  const ax = abs(dx),
    ay = abs(dy);
  const sx = sign(dx),
    sy = sign(dy);
  let threshold = ax - ay;

  while (true) {
    scanLines[y] ??= [];
    scanLines[y].push(x);
    if (x === x2 && y === y2) return scanLines;
    const error = 2 * threshold;
    if (error > -ay) {
      x += sx;
      threshold -= ay;
    }
    if (error <= ax) {
      y += sy;
      threshold += ax;
    }
  }
}
