import fs from "fs/promises";
import { execSync } from "child_process";
import { createWriteStream } from "fs";
import path from "path";
import tiff from "tiff";
import * as PImage from "pureimage";
import {
  lerp,
  map,
  constrain,
  constrainMap,
} from "../api/autopilot/utils/utils.js";
import { CACHE_DIR } from "./alos-constants.js";

// plain math
const { abs, sin, cos, atan2, PI, log, sqrt } = Math;

// vector math
const sub = (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z });
const mul = (v, s) => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const dot = (v1, v2) => v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
const mag = (v) => sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
const unit = (v, m = mag(v)) => ({ x: v.x / m, y: v.y / m, z: v.z / m });

const reflect = (ray, normal) => {
  return unit(
    sub(mul(normal, (2 * dot(ray, normal)) / dot(normal, normal)), ray)
  );
};

const light = { x: -1, y: -1, z: 1 };
const flat = { x: 0, y: 0, z: 1 };
const flatReflection = reflect(light, flat);
console.log(flatReflection);
const flatValue = constrainMap(flatReflection.z, 0, 1, 0, 255) | 0;
console.log(`flatValue=${flatValue}`);

const MERGE_HORIZONTALLY = Symbol();
const MERGE_VERTICALLY = Symbol();

function mergeArrays(policy, a, b) {
  if (policy === MERGE_HORIZONTALLY) {
    const { width: w1, height: h, data: adata } = a;
    const { width: w2, data: bdata } = b;
    const w = w1 + w2;
    const data = new Uint16Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w1; x++) {
        const i = x + y * w1;
        const j = x + y * w;
        data[j] = adata[i];
      }

      for (let x = w1; x < w; x++) {
        const i = x - w1 + y * w2;
        const j = x + y * w;
        data[j] = bdata[i];
      }
    }
    return { width: w, height: h, data };
  }

  if (policy === MERGE_VERTICALLY) {
    const { width: w, height: h1, data: adata } = a;
    const { height: h2, data: bdata } = b;
    const h = h2 + h1;

    console.log(`dims:`, w, h1, h2);

    const data = new Uint16Array(w * h);

    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h1; y++) {
        const i = x + y * w;
        data[i] = adata[i];
      }

      for (let y = h1; y < h; y++) {
        const i = x + (y - h1) * w;
        const j = x + y * w;
        data[j] = bdata[i];
      }
    }
    return { width: w, height: h, data };
  }
}

export function mergeCrops(nw, ne, sw, se) {
  if (!!nw && !ne && !sw && !!se) {
    console.log(`there are no tiles to merge`);
    return;
  }

  console.log(`merge crops`, !!nw, !!ne, !!sw, !!se);

  // crop region falls entirely in nw tile
  if (!ne && !sw && !se) {
    console.log(`one tile, ${nw.width} x ${nw.height}`);
    return nw;
  }

  // crop region covers two tiles horizontally:
  else if (ne && !sw && !se) {
    console.log(`merge horizontally`);
    return mergeArrays(MERGE_HORIZONTALLY, nw, ne);
  }

  // crop region covers two tiles vertically:
  else if (!ne && sw && !se) {
    console.log(`merge vertically`);
    return mergeArrays(MERGE_VERTICALLY, nw, sw);
  }

  console.log(`full merge`);
  if (!nw || !ne || !sw || !se) {
    console.log(`what?`);
    return;
  }

  const top = mergeArrays(MERGE_HORIZONTALLY, nw, ne);
  const bottom = mergeArrays(MERGE_HORIZONTALLY, sw, se);
  return mergeArrays(MERGE_VERTICALLY, top, bottom);
}

export async function saveImage(imagePath, width, height, pixels) {
  const baseImage = PImage.make(width, height);
  const normals = PImage.make(width, height);
  const hillShade = PImage.make(width, height);
  const step = 1;

  const getElevation = (x, y, data = pixels) => {
    x = constrain(x, 0, width - 1);
    y = constrain(y, 0, height - 1);
    const i = x + y * width;
    let intensity = 0;
    const value = data[i];
    if (value >= -500 && value < 9000) {
      intensity = map(value, -500, 9000, 1, 10000);
    }
    // discretize
    intensity = ((intensity / step) | 0) * step;
    return intensity;
  };

  // make a PNG out of this
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      // values can be negative, so we scale (-500, 9000) to (1,255) with everything below -500 marked as 0
      const intensity = getElevation(x, y);
      let r = constrainMap(intensity, 0, 10000, 0, 255) | 0;
      let g = constrainMap(intensity, 0, 10000, 0, 255) | 0;
      let b = constrainMap(intensity, 0, 10000, 0, 255) | 0;
      const a = 255;

      const RGBA = (r << 24) + (g << 16) + (b << 8) + a;
      baseImage.setPixelRGBA(x, y, RGBA);
    }
  }

  // create the normal map
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const a = getElevation(x - 1, y);
      const b = getElevation(x + 1, y);
      const c = getElevation(x, y - 1);
      const d = getElevation(x, y + 1);

      // get the surface normal at (x,y)
      const n = unit({ x: a - b, y: c - d, z: 2 });
      const F = (v) => (255 * v) | 0;
      normals.setPixelRGBA(
        x,
        y,
        (F(n.x) << 24) + (F(n.y) << 16) + (F(n.z) << 8) + 0xff
      );

      // and then hillshade the pixel
      const reflection = reflect(light, n);
      const i = constrainMap(reflection.z, 0, 1, 0, 255);

      // don't color flat surfaces:
      const A = i === flatValue ? 0 : 255;
      hillShade.setPixelRGBA(x, y, (i << 24) + (i << 16) + (i << 8) + A);
    }
  }

  try {
    const basePath = imagePath.replace(`.png`, `.base.png`);
    let stream = createWriteStream(basePath);
    await PImage.encodePNGToStream(baseImage, stream);
    console.log(`wrote out the base png file to ${basePath}`);

    const normalPath = imagePath.replace(`.png`, `.normals.png`);
    stream = createWriteStream(normalPath);
    await PImage.encodePNGToStream(normals, stream);
    console.log(`wrote out the normals png file to ${normalPath}`);

    stream = createWriteStream(imagePath);
    await PImage.encodePNGToStream(hillShade, stream);
    console.log(`wrote out the hill-shaded png file to ${imagePath}`);
  } catch (e) {
    console.log(`there was an error writing`);
    console.log(e);
  }

  // try {
  //   console.log(`scaling hill shade down to 256x256 pixels`);
  //   execSync(`ffmpeg -i ${outpath} -vf scale="256:-1" ${imagePath}`, {
  //     stdio: `ignore`,
  //   });
  //   await fs.unlink(outpath);
  //   console.log(`done`);
  // } catch (e) {
  //   // literally irrelevant
  // }

  return true;
}

function average(...numbers) {
  const base = { x: 0, y: 0, z: 0 };
  numbers.forEach((n) => {
    base.x += (n & 0xff000000) >> 24;
    base.y += (n & 0x00ff0000) >> 16;
    base.z += (n & 0x0000ff00) >> 8;
  });
  const n = numbers.length;
  base.x /= n;
  base.y /= n;
  base.z /= n;
  return base;
}
