import { getDistanceBetweenPoints } from "./utils.js";
const airports = {};
const { max } = Math;

class Airport {
  current = true;

  constructor(server, map, airport) {
    const { latitude: lat, longitude: long, runways } = airport;
    const radius =
      max(
        ...runways.map((runway) => {
          const { start, end } = runway;
          return max(
            getDistanceBetweenPoints(lat, long, start[0], start[1]),
            getDistanceBetweenPoints(lat, long, end[0], end[1])
          );
        })
      ) * 1000;
    this.layer = L.featureGroup(
      [
        L.circle([lat, long], radius, { color: `red`, fill: true }),
        ...runways.map((runway) => {
          const { bbox } = runway;
          return L.polyline([...bbox, bbox[0]], {
            color: `black`,
            fill: true,
            fillColor: "white",
            fillOpacity: 1.0,
            stroke: true,
            weight: 1,
          });
        }),
      ],
      { bubblingMouseEvents: false }
    );
    this.layer.addTo(map);

    this.layer.on(`click`, (e) => {
      L.DomEvent.stopPropagation(e);
      const land = confirm("land at this airport?");
      if (land) {
        console.log(`server.autopilot.update({ ATL: ${airport.icao} });`);
        server.autopilot.update({ ATL: airport.icao });
      }
    });
  }

  remove() {
    this.layer.remove();
  }
}

export function drawAirports(server, map, airportData) {
  if (!airportData) return;
  if (!airportData.airports) return;
  Object.values(airports).forEach((a) => (a.current = false));

  // add newly-in-range airports
  airportData.airports.forEach((airport) => {
    const cacheKey = airport.icao;
    if (airports[cacheKey]) {
      airports[cacheKey].current = true;
      return;
    }
    airports[cacheKey] = new Airport(server, map, airport);
  });

  // remove no-longer-in-range airports
  Object.entries(airports).forEach(([key, value]) => {
    if (value.current) return;
    value.remove();
    delete airports[key];
  });
}
