// - convert ALOS GeoTIFF to "GeoPNG"
// - also down-scale from 3600x3600 to 360x360 (300m resolution)

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
const DOWNSCALE = 4;

for (const location of index) {
  console.log(DATA_FOLDER, location);

  const filePath = path.join(DATA_FOLDER, location);

  const pngPath = filePath
    .replace(DATA_FOLDER, path.join(`.`, LOCAL_DATA_FOLDER))
    .replace(`.tif`, `.${30 * DOWNSCALE}m.png`);
  if (existsSync(pngPath)) continue;

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
  const [w, h] = [width / DOWNSCALE, height / DOWNSCALE];
  const pngPixels = new Int16Array(w * h);

  for (let x = 0; x < width; x += DOWNSCALE) {
    for (let y = 0; y < height; y += DOWNSCALE) {
      // collapse region into its highest elevation
      const region = [];
      for (let i = 0; i < DOWNSCALE; i++) {
        for (let j = 0; j < DOWNSCALE; j++) {
          region.push(getElevation(x + i, y + j));
        }
      }
      const i = x / DOWNSCALE + (y / DOWNSCALE) * w;
      pngPixels[i] = Math.max(...region);
    }
  }

  writePNG(pngPath, pngPixels, w, h, tags);
}

if (false) {
  const src = `c:\\Users\\Mike\\Documents\\git\\projects\\are-we-flying\\src\\elevation\\data\\N045W120_N050W115\\ALPSMLC30_N048W120_DSM.120m.png`;
  const { width, height, pixels, geoTags } = readPNG(src);
  console.log(width, height, pixels, geoTags);

  const src2 = src
    .replace(
      `c:\\Users\\Mike\\Documents\\git\\projects\\are-we-flying\\src\\elevation\\data`,
      DATA_FOLDER
    )
    .replace(`.120m.png`, `.tif`);
  const tdata = readFileSync(src2);
  const tff = tiff.decode(tdata);
  const { width: w, height: h, data } = tff[0];
  console.log(w, h, data);
}
