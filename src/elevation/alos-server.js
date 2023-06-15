import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ALOSInterface } from "./alos-interface.js";

import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
const { DATA_FOLDER, ALOS_PORT: PORT } = process.env;

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
