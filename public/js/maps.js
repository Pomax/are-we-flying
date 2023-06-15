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

const openStreetMap = L.tileLayer(
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png`,
  {
    maxZoom: 19,
    attribution: `© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>`,
  }
);

const googleStreets = L.tileLayer(
  `http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}`,
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: `© <a href="https://www.google.com/intl/en-GB_ALL/permissions/geoguidelines/">Google Maps</a>`,
  }
);

const googleHybrid = L.tileLayer(
  `http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}`,
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: `© <a href="https://www.google.com/intl/en-GB_ALL/permissions/geoguidelines/">Google Maps</a>`,
  }
);

const googleSat = L.tileLayer(
  `http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}`,
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: `© <a href="https://www.google.com/intl/en-GB_ALL/permissions/geoguidelines/">Google Maps</a>`,
  }
);

const googleTerrain = L.tileLayer(
  `http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}`,
  {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: `© <a href="https://www.google.com/intl/en-GB_ALL/permissions/geoguidelines/">Google Maps</a>`,
  }
);

const mapLayers = {
  openStreetMap,
  googleStreets,
  googleHybrid,
  googleSat,
  googleTerrain,
};

const activeLayers = [openStreetMap, googleTerrain];

// update the applied layers
function update() {
  Object.values(mapLayers).forEach((layer) => layer.removeFrom(map));
  const [base, overlay] = activeLayers;
  base.setOpacity(1);
  base.addTo(map);
  overlay?.setOpacity(0.5);
  overlay?.addTo(map);
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

// And done: make suer our layers get applied, and then export the master "map" object
update();
export { map, centerBtn };
