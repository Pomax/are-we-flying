import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ALOSInterface } from "./alos-interface.js";

import { degrees } from "../api/autopilot/utils/utils.js";
const { atan, sinh } = Math;

import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
const { DATA_FOLDER, ALOS_PORT: PORT } = process.env;
import { CACHE_DIR } from "./alos-constants.js";

const app = express();
app.disable("view cache");
app.set("etag", false);
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors());

const ALOS = new ALOSInterface(DATA_FOLDER);

const ltln = (x, y, z) => {
  const n = 2 ** z;
  const a = Math.PI * (1 - (2 * y) / n);
  const lat = degrees(atan(sinh(a)));
  const long = (360 * x) / n - 180;
  console.log(x, y, z, lat, long);
  return { lat, long };
};

const xyzCache = {};

app.get(`/tiles/:z/:x/:y`, async (req, res) => {
  // We need x, y, and z as numbers
  let { x, y, z } = req.params;
  x = parseFloat(x);
  y = parseFloat(y);
  z = parseFloat(z);

  // Convert to lat/long
  const { lat: lat1, long: long1 } = ltln(x, y, z);
  const { lat: lat2, long: long2 } = ltln(x + 1, y + 1, z);

  // Get our crop
  const imagePath = path.join(CACHE_DIR, `${z}-${x}-${y}.png`);

  if (!xyzCache[imagePath]) {
    if (!fs.existsSync(imagePath)) {
      console.log(`building image promise for ${imagePath}`);
      xyzCache[imagePath] = new Promise(async (resolve) => {
        const result = await ALOS.getCrop(
          imagePath,
          lat1,
          long1,
          lat2,
          long2,
          x,
          y,
          z
        );
        resolve(result);
      });
    } else {
      console.log(`file exist already`);
      xyzCache[imagePath] = new Promise((resolve) => resolve(imagePath));
    }
  }
  let result = await xyzCache[imagePath];
  if (!result) return res.status(400).send(`bad request`);
  res.sendFile(result);
});

app.get(`/`, async (req, res) => {
  const { locations } = req.query;
  if (!locations) {
    return res
      .status(400)
      .json({ reason: `There was no "locations" query parameter.` });
  }

  try {
    const coords = locations.split(`|`).map((s) => s.split(`,`));
    await handleSingleLookup(res, coords);
  } catch (err) {
    console.error(`Caught`, err);
    res.status(500).json({ reason: `lookup error` });
  }
});

async function handleSingleLookup(res, coords) {
  const s = performance.now();
  const data = coords.map(([lat, long]) => {
    const elevation = ALOS.lookup(lat, long);
    return {
      latitude: +lat,
      longitude: +long,
      elevation,
    };
  });
  const e = performance.now() - s;
  console.log(`Serviced query in ${e}ms`);
  res.status(200).json(data);
}

app.listen(PORT, () => {
  console.log(`Elevation server listening on http://localhost:${PORT}`);
});
