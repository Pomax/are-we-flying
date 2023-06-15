<!-- this is getting uncomfortably a lot of JS -->
<script src="js/leaflet/georaster.js" defer async></script>
<script src="js/leaflet/georaster-leaflet.js" defer async></script>


// Why not create our own tile map, too?
const ALOSLayer = L.TileLayer.extend({
  getTileUrl: function (coords) {
    const c = map.getCenter();
    const { _northEast: ne, _southWest: sw } = map.getBounds();
    const url = `${ne.lat}/${ne.lng}/${sw.lat}/${sw.lng}/${c.lat}/${c.lng}`;
    return L.TileLayer.prototype.getTileUrl.call(this, { x: url });
  },
});
const ALOSTilesFrom = (templateUrl, options) =>
  new ALOSLayer(templateUrl, options);
const ALOSTerrain = ALOSTilesFrom(`/alos/{x}`);

const mapLayers = {
  openStreetMap,
  googleStreets,
  googleHybrid,
  googleSat,
  googleTerrain,
  ALOSTerrain,
};





function loadGeoRaster(lat, long) {
  // test: which geotiff do we need?
  const latDir = lat >= 0 ? "N" : "S";
  const longDir = long >= 0 ? "E" : "W";
  lat = `` + (latDir == "N" ? floor(lat) : ceil(-lat));
  long = `` + (longDir == "E" ? floor(long) : ceil(-long));
  const tileName = `ALPSMLC30_${latDir}${lat.padStart(
    3,
    "0"
  )}${longDir}${long.padStart(3, "0")}_DSM.tif`;

  if (!overlayTile) {
    overlayTile = true;
    const entry = jsonIndex
      .find((e) => e.endsWith(tileName))
      .replaceAll(`\\`, `/`);
    console.log(entry);
    fetch(`http://localhost:3000/geotiff${entry}`)
      .then((r) => r.arrayBuffer())
      .then((data) => parseGeoraster(data))
      .then((georaster) => {
        console.log(georaster);
        overlayTile = new GeoRasterLayer({
          georaster,
          resolution: 32,
          pixelValuesToColorFn: (values) => {
            const a = constrainMap(values[0], 0, 2000, 0, 1);
            return `rgba(0,0,0,${a})`;
          },
        });
        overlayTile.addTo(map);
      });
  }
  // try to overlay this
}
