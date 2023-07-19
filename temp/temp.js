// - convert GeoTIFF to GeoPNG
// - malso convert 3600x3600 ALOS-30m to 360x360 cALOS-300m
// This should turn 26MB tiles into 14kb tiles instead

import path from "path";
import tiff from "tiff";
import { readFileSync, existsSync } from "fs";
import { writePNG } from "./write-png.js";

import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
const { DATA_FOLDER } = process.env;
import { INDEX_FILE } from "../src/elevation/alos-constants.js";

const index = JSON.parse(readFileSync(INDEX_FILE));

(async () => {
  for (const location of index) {
    console.log(DATA_FOLDER, location);

    const filePath = path.join(DATA_FOLDER, location);

    const pngPath = filePath
      .replace(DATA_FOLDER, path.join(`.`, `data`))
      .replace(`.tif`, `.300m.png`);
    if (existsSync(pngPath)) continue;

    const file = readFileSync(filePath);
    const image = tiff.decode(file.buffer);
    const block = image[0];
    const { width, height, fields, data: pixels } = block;

    const GeoTags = {};
    fields.forEach((value, key) => {
      if (parseFloat(key) >= 400) {
        GeoTags[key] = value;
      }
    });

    const getElevation = (x, y) => pixels[x + y * width];
    const [w, h] = [width / 10, height / 10];
    const pngPixels = new Int16Array(w * h);

    for (let x = 0; x < width; x += 10) {
      for (let y = 0; y < height; y += 10) {
        // collapse 10x10 region into its highest elevation
        const region = [];
        for (let i = 0; i < 10; i++) {
          for (let j = 0; j < 10; j++) {
            region.push(getElevation(x + i, y + j));
          }
        }
        const i = x / 10 + (y / 10) * w;
        pngPixels[i] = Math.max(...region);
      }
    }

    writePNG(pngPath, pngPixels, w, h, GeoTags);
  }
})();
