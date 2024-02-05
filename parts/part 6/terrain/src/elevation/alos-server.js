import http from "node:http";
import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const { DATA_FOLDER, ALOS_PORT: PORT } = process.env;
import { ALOSInterface } from "./alos-interface.js";
const ALOS = new ALOSInterface(DATA_FOLDER);

http.ServerResponse.prototype.status = function (num, type = `text/plain`) {
  this.writeHead(num, {
    "Content-Type": type,
    "Cache-Control": `no-store`,
    "Access-Control-Allow-Origin": `*`,
  });
  return this;
};

http.ServerResponse.prototype.text = function (data) {
  this.status(200).write(data);
  this.end();
};

http.ServerResponse.prototype.json = function (data) {
  this.status(200, `application/json`).write(JSON.stringify(data));
  this.end();
};

http.ServerResponse.prototype.fail = function (reason) {
  this.status(400).text(reason);
};

// Boilerplate http server:
function processRequest(req, res) {
  const url = new URL(`http://localhost:${PORT}${req.url}`);

  if (url.pathname !== `/`) return fail(res, `bad url`);

  const query = new URLSearchParams(url.search);
  const { locations, poly } = Object.fromEntries(query.entries());
  if (!locations && !poly) {
    return res.fail(`missing "locations" or "poly" query argument`);
  }

  const values = (locations || poly).split(`,`).map((v) => parseFloat(v));
  if (values.length % 2 !== 0) {
    return res.fail(`Wrong number of "locations" values.`);
  }

  const coords = [];
  for (let i = 0, e = values.length; i < e; i += 2) {
    coords.push(values.slice(i, i + 2));
  }

  if (locations) {
    console.log(`processing locations`)
    return res.json(
      coords.map(([lat, long]) => ({
        lat,
        long,
        elevation: ALOS.lookup(lat, long),
      }))
    );
  }

  if (poly) {
    console.log(`processing poly`)
    return res.json({
      maxElevation: ALOS.getMaxElevation(coords),
    });
  }
}

http.createServer(processRequest).listen(PORT, () => {
  console.log(`Elevation server listening on http://localhost:${PORT}`);
});
