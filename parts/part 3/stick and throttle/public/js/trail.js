export class Trail {
  // The constructor isn't particularly interesting...
  constructor(map, pair, color, opts = {}) {
    this.coords = [];
    this.map = map;
    if (pair) this.add(...pair);
    this.color = color ?? `blue`;
    this.opts = opts;
    this.line = undefined;
  }

  // but the "add" function is, because it's the code that actually
  // draws our trail onto the map once we have 2 coordinates, and
  // then updates it by adding points to the trail during flight.
  add(lat, long) {
    if (!lat && !long) return;

    const { coords } = this;
    const pair = [lat, long];
    coords.push(pair);

    // If we have fewer than 2 points, we can't draw a trail yet!
    const l = coords.length;
    if (l < 2) return;

    // If we have exactly 2 points, we create the trail polyon
    // and add it to the map:
    if (l === 2) {
      this.line = L.polyline([...coords], {
        className: `flight-trail`,
        color: this.color,
        ...this.opts,
      });
      return this.line.addTo(this.map);
    }

    // And if we have more than 2 points, all we need to do is
    // add the new point to the polygon that Leafet's working with.
    this.line.addLatLng(pair);
  }
}
