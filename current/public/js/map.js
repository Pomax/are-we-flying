import { getDistanceBetweenPoints, waitFor } from "./utils.js";
import { setMapScale } from "./leaflet/nautical.js";

export const DUNCAN_AIRPORT = [48.7566, -123.71134];

// Leaflet creates a global "L" object to work with, so use that to tie into the <div id="map"></div> we have sitting
// in our index.html. However, because independent page scripts can't be imported, we need to wait for it to be available:
const L = await waitFor(async () => window.L);

// With our "L" object available, let's make a map, centered on Duncan airport:
export const map = L.map("map", {
  zoomSnap: 0.1,
}).setView(DUNCAN_AIRPORT, 15);

// Let's make our layers a little more "data driven" by first defining a list of sources:
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
];

// and then converting those to map layers:
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

// We'll keep the openstreetmap layer as base layer:
mapLayers.openStreetMap.setOpacity(1);
mapLayers.openStreetMap.addTo(map);

// And then we'll add the terrain layer as 50% opacity overlay:
mapLayers.googleTerrain.setOpacity(0.5);
mapLayers.googleTerrain.addTo(map);

// Add our scale
setMapScale(map);

// Add a marker for showing "
const TextBox = L.Control.extend({
  options: {
    id: ``,
    innerHTML: ``,
  },
  onAdd: function () {
    const textbox = (this.textbox = L.DomUtil.create(`div`, `distance-box`));
    textbox.id = this.options.id;
    textbox.innerHTML = this.options.innerHTML;
    return textbox;
  },
  updateInnerHTML: function (html = ``) {
    this.getContainer().innerHTML = html;
  },
});

export const targetInfo = new TextBox({
  id: `info-text`,
  innerHTML: ``,
  position: `bottomleft`,
});

targetInfo.addTo(map);
