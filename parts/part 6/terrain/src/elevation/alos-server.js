import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const { DATA_FOLDER, ALOS_PORT: PORT } = process.env;
import { ALOSInterface } from "./alos-interface.js";
const ALOS = new ALOSInterface(DATA_FOLDER);

// Boilerplate express server:
const app = express();
app.disable("view cache");
app.set("etag", false);
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors());

// And then we define one route, which we can call with
// a `?locations=lat1,long1,lat2,long2,...` query argument
// and responds with a JSON object that gives the elevation
// for each coordinate in the list.
app.get(`/`, async (req, res) => {
  // Did we get a bad request?
  const { locations } = req.query;
  if (!locations) {
    return res
      .status(400)
      .json({ reason: `Missing "locations" query parameter.` });
  }

  // What about the wrong number of values?
  const values = locations.split(`,`).map((v) => parseFloat(v));
  if (values.length % 2 !== 0) {
    return res
      .status(400)
      .json({ reason: `Wrong number of "locations" values.` });
  }

  // Or the wrong type?
  if (values.some((v) => isNaN(v))) {
    return res
      .status(400)
      .json({ reason: `Bad "locations" values (something's not a number).` });
  }

  console.log(values);

  // If we're good, look up each coordinate's elevation
  const results = [];
  for (let i = 0, e = values.length; i < e; i += 2) {
    const [lat, long] = values.slice(i, i + 2);
    console.log(lat, long);
    const elevation = ALOS.lookup(lat, long);
    results.push({ lat, long, elevation });
  }
  res.json(results);
});

app.listen(PORT, () => {
  console.log(`Elevation server listening on http://localhost:${PORT}`);
});
