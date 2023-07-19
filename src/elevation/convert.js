// - convert ALOS GeoTIFF to "GeoPNG"
// - also down-scale from 3600x3600 to 360x360 (300m resolution)

import fs from "fs";
import path from "path";
import tiff from "tiff";
import { readFileSync, existsSync } from "fs";
import { writePNG, readPNG } from "./write-png.js";
import { GeoTags } from "./geo-tags.js";

import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const { DATA_FOLDER } = process.env;
const LOCAL_DATA_FOLDER = `data`;
import { INDEX_FILE } from "./alos-constants.js";

const index = JSON.parse(readFileSync(INDEX_FILE));
const DOWNSCALE = 1;

export function processFile(filePath, scale = DOWNSCALE) {
  const pngPath = filePath
    .replace(DATA_FOLDER, path.join(`.`, LOCAL_DATA_FOLDER))
    .replace(`.tif`, `.${30 * scale}m.png`);
  if (existsSync(pngPath)) return pngPath;

  const file = readFileSync(filePath);
  const image = tiff.decode(file.buffer);
  const block = image[0];
  const { width, height, fields, data: pixels } = block;

  const tags = {};
  fields.forEach((value, key) => {
    const name = GeoTags[key];
    if (name) {
      tags[name] = value;
    }
    // TODO: we should probably update the transform matrix?
    // SEE: https://gis.stackexchange.com/a/452575/219296
  });

  const getElevation = (x, y) => pixels[x + y * width];
  const [w, h] = [width / scale, height / scale];
  const pngPixels = new Int16Array(w * h);

  for (let x = 0; x < width; x += scale) {
    for (let y = 0; y < height; y += scale) {
      // collapse region into its highest elevation
      const region = [];
      for (let i = 0; i < scale; i++) {
        for (let j = 0; j < scale; j++) {
          region.push(getElevation(x + i, y + j));
        }
      }
      const i = x / scale + (y / scale) * w;
      pngPixels[i] = Math.max(...region);
    }
  }

  writePNG(pngPath, pngPixels, w, h, tags);

  return pngPath;
}

/*
const RUN_STAND_ALONE = false;
if (RUN_STAND_ALONE) {
  const src = `c:\\Users\\Mike\\Documents\\git\\projects\\are-we-flying\\temp\\ALPSMLC30_N048W124_DSM.tif`;
  processFile(src);
} else {
  for (const location of index) {
    console.log(DATA_FOLDER, location);
    const filePath = path.join(DATA_FOLDER, location);
    processFile(filePath);
  }
}
*/
