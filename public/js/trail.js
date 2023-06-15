globalThis.trails = [];

export class Trail {
  constructor(map, pair, color, level = undefined, opts = {}) {
    this.map = map;
    this.line = undefined;
    this.color = color ?? `blue`;
    this.label = level;
    this.opts = opts;
    this.coords = [];
    if (pair) this.add(...pair);
  }

  add(lat, long) {
    const pair = [lat, long];
    if (!lat && !long) return;

    const { coords } = this;

    coords.push(pair);
    const l = coords.length;

    if (l < 2) return;

    if (l === 2) {
      this.line = L.polyline([...coords], {
        className: `flight-trail`,
        color: this.color,
        ...this.opts,
      });
      this.line.addTo(this.map);
      if (this.label) {
        const props = {
          icon: L.divIcon({
            html: `<span>${this.label}</span>`,
          }),
        };
        this.line.__marker = L.marker(pair, props).addTo(this.map);
      }
      return;
    }

    this.line.addLatLng(pair);
  }

  remove() {
    this.line?.__marker?.remove();
    this.line?.remove();
  }
}
