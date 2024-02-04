import { defaultPlane } from "./airplane-src.js";

const content = await fetch("map-marker.html").then((res) => res.text());
const div = document.createElement(`div`);
div.innerHTML = content;
const MapMarker = div.children[0];
MapMarker.querySelectorAll(`img`).forEach(
  (img) => (img.src = `planes/${defaultPlane}`)
);

MapMarker.getHTML = (initialHeading) => {
  MapMarker.style.setProperty(`--heading`, initialHeading);
  return MapMarker.outerHTML;
};

export { MapMarker };
