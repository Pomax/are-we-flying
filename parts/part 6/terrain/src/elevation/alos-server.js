import http from "node:http";
import { shimResponsePrototype } from "./shim-response-prototype.js";
shimResponsePrototype(http.ServerResponse.prototype);

import dotenv from "dotenv";
import { ENV_PATH } from "../utils/constants.js";
dotenv.config({ path: ENV_PATH });

const { DATA_FOLDER, ALOS_PORT: PORT } = process.env;
import { ALOSInterface } from "./alos-interface.js";
const ALOS = new ALOSInterface(DATA_FOLDER);

// Boilerplate http server:
function processRequest(req, res) {
  const url = new URL(`http://localhost:${PORT}${req.url}`);
  if (url.pathname !== `/`) return res.fail(`unsupported endpoint`);

  const query = new URLSearchParams(url.search);
  const { points, poly } = Object.fromEntries(query.entries());
  if (!points && !poly) {
    return res.fail(`missing "points" or "poly" query argument`);
  }

  const values = (points || poly).split(`,`).map((v) => parseFloat(v));
  if (values.length % 2 !== 0) {
    return res.fail(`Wrong number of "points" values.`);
  }

  const coords = [];
  for (let i = 0, e = values.length; i < e; i += 2) {
    coords.push(values.slice(i, i + 2));
  }

  if (points) {
    console.log(`processing points`);
    const start = Date.now();
    const results = {
      results: coords.map(([lat, long]) => ({
        lat,
        long,
        elevation: ALOS.lookup(lat, long),
      })),
    };
    results.ms = Date.now() - start;
    return res.json(results);
  }

  if (poly) {
    console.log(`processing poly`);
    const start = Date.now();
    const result = {
      poly: coords,
      result: ALOS.getMaxElevation(coords),
    };
    result.ms = Date.now() - start;
    return res.json(result);
  }
}

http.createServer(processRequest).listen(PORT, () => {
  console.log(`Elevation server listening on http://localhost:${PORT}`);
});
