import { waitFor } from "./utils.js";
import { Duncan } from "./locations.js";

const L = await waitFor(async () => window.L);

const map = L.map("map").setView(Duncan, 15);

(async () => {
  await waitFor(() => !!L.control.scalenautic);
  L.control
    .scalenautic({
      metric: true,
      imperial: false,
      nautic: true,
    })
    .addTo(map);
})();

const openStreetMap = [
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png`,
  {
    maxZoom: 19,
    attribution: `© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>`,
  },
];

const googleStreets = [
  `http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}`,
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: `© <a href="https://www.google.com/intl/en-GB_ALL/permissions/geoguidelines/">Google Maps</a>`,
  },
];

const googleHybrid = [
  `http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}`,
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: `© <a href="https://www.google.com/intl/en-GB_ALL/permissions/geoguidelines/">Google Maps</a>`,
  },
];

const googleSat = [
  `http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}`,
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: `© <a href="https://www.google.com/intl/en-GB_ALL/permissions/geoguidelines/">Google Maps</a>`,
  },
];

const googleTerrain = [
  `http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}`,
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: `© <a href="https://www.google.com/intl/en-GB_ALL/permissions/geoguidelines/">Google Maps</a>`,
  },
];

const mapLayers = {
  openStreetMap,
  googleStreets,
  googleHybrid,
  googleSat,
  googleTerrain,
  ALOSTerrain: [`/tiles/{z}/{x}/{y}`],
};

const selectedLayers = [openStreetMap, googleTerrain];
const currentLayers = [];

// update the applied layers
function update() {
  currentLayers.forEach((layer) => layer.removeFrom(map));
  let [base, overlay] = selectedLayers;

  base = L.tileLayer(...base);
  base.setOpacity(1);
  base.addTo(map);
  currentLayers.push(base);

  if (overlay) {
    overlay = L.tileLayer(...overlay);
    overlay.setOpacity(0.5);
    overlay.addTo(map);
    currentLayers.push(overlay);
  }
}

// if we drag the map itself, turn off "center"
map.on("dragstart", function (e) {
  document.getElementById(`center-map`).checked = false;
});

// "center map on plane" checkbox
const centerBtn = document.getElementById(`center-map`);
centerBtn.checked = true;

// Hook our layer options into our HTML <select> elements
[1, 2].forEach((layer) => {
  const select = document.querySelector(`.map-layer-${layer}`);
  const none = document.createElement(`option`);
  none.textContent = `None`;
  none.value = `None`;
  select.appendChild(none);

  Object.entries(mapLayers).forEach(([name, map]) => {
    const opt = document.createElement(`option`);
    opt.textContent = name;
    opt.value = name;
    if (layer === 1 && name === `openStreetMap`) opt.selected = `selected`;
    if (layer === 2 && name === `googleTerrain`) opt.selected = `selected`;
    select.append(opt);
  });

  select.addEventListener(`change`, (evt) => {
    const layerName = evt.target.value;
    if (layerName === `None`) {
      selectedLayers[layer - 1] = undefined;
    } else {
      selectedLayers[layer - 1] = mapLayers[layerName];
    }
    update();
  });
});

// And done: make suer our layers get applied, and then export the master "map" object
update();
export { map, centerBtn };
