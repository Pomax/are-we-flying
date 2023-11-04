import { waitFor } from "./utils.js";
import { Duncan } from "./locations.js";
import { setMapScale } from "./leaflet/nautical.js";

// Wait for leaflet to be available
const L = await waitFor(async () => window.L);

// set our default location to Duncan, BC.
const map = L.map("map").setView(Duncan, 15);

// Since we're flying, we want distances in kilometers, and nautical miles
setMapScale(map);

// Viz control: if we drag the map itself, turn off auto-centering
const centerBtn = document.getElementById(`center-map`);
centerBtn.checked = true;
map.on("dragstart", (e) => (centerBtn.checked = false));

// We'll be loading OSM, as well as gmaps' street view, satellite view, and elevation maps:
const sources = [
  {
    name: `openStreetMap`,
    url: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`,
    maxZoom: 19,
    attribution: {
      url: `http://www.openstreetmap.org/copyright`,
      label: `OpenStreetMap`,
    },
  },
  // {
  //   name: `googleStreets`,
  //   url: `http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}`,
  //   subdomains: ["mt0", "mt1", "mt2", "mt3"],
  //   maxZoom: 20,
  //   attribution: {
  //     url: `https://www.google.com/permissions/geoguidelines`,
  //     label: `Google Maps`,
  //   },
  // },
  {
    name: `googleTerrain`,
    url: `http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}`,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    maxZoom: 20,
    attribution: {
      url: `https://www.google.com/permissions/geoguidelines`,
      label: `Google Maps`,
    },
  },
  // {
  //   name: `googleSat`,
  //   url: `http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}`,
  //   subdomains: ["mt0", "mt1", "mt2", "mt3"],
  //   maxZoom: 20,
  //   attribution: {
  //     url: `https://www.google.com/permissions/geoguidelines`,
  //     label: `Google Maps`,
  //   },
  // },
];

// Turn that into an easy-to-use object instead:
const mapLayers = Object.fromEntries(
  sources.map((e) => [
    e.name,
    L.tileLayer(e.url, {
      subdomains: e.subdomains ?? [],
      maxZoom: e.maxZoom,
      attribution: `© <a href="${e.attribution.url}">${e.attribution.label}</a>`,
    }),
  ])
);

// And use the OSM + elevation views as default pair.
const activeLayers = [mapLayers.openStreetMap, mapLayers.googleTerrain];

// update the applied layers
function update() {
  Object.values(mapLayers).forEach((layer) => layer.removeFrom(map));
  const [base, overlay] = activeLayers;
  base.setOpacity(1);
  base.addTo(map);
  overlay?.setOpacity(0.5);
  overlay?.addTo(map);
}

// Hook our layer options into our HTML <select> elements
[1, 2].forEach((layer) => {
  const select = document.querySelector(`.map-layer-${layer}`);

  Object.entries(mapLayers).forEach(([name, map]) => {
    const opt = document.createElement(`option`);
    opt.textContent = name;
    opt.value = name;
    if (layer === 1 && name === `openStreetMap`) opt.selected = `selected`;
    if (layer === 2 && name === `googleTerrain`) opt.selected = `selected`;
    select.append(opt);
  });

  select.addEventListener(`change`, (evt) => {
    activeLayers[layer - 1] = mapLayers[evt.target.value];
    update();
  });
});

// And done: make sure our layers get applied, and then export the
// master "map" object as well as the "are we centering?" button.
update();

export { map, centerBtn };
