// see https://github.com/PowerPan/leaflet.nauticscale/blob/master/dist/leaflet.nauticscale.js
import { waitFor } from "../utils.js";

const L = await waitFor(async () => window.L);

L.Control.ScaleNautical = L.Control.Scale.extend({
  options: { nautical: false },

  _addScales: function (options, className, container) {
    L.Control.Scale.prototype._addScales.call(
      this,
      options,
      className,
      container
    );
    L.setOptions(options);
    if (this.options.nautical) {
      this._nScale = L.DomUtil.create("div", className, container);
    }
  },

  _updateScales: function (maxMeters) {
    L.Control.Scale.prototype._updateScales.call(this, maxMeters);
    if (this.options.nautical && maxMeters) {
      this._updateNautical(maxMeters);
    }
  },

  _updateNautical: function (maxMeters) {
    const scale = this._nScale;
    const maxNauticalMiles = maxMeters / 1852;
    let nauticalMiles;

    if (maxMeters >= 1852) {
      nauticalMiles = L.Control.Scale.prototype._getRoundNum.call(
        this,
        maxNauticalMiles
      );
    } else {
      nauticalMiles = maxNauticalMiles.toFixed(
        maxNauticalMiles > 0.1 ? 1 : 0
      );
    }

    const scaleWidth = (
      this.options.maxWidth *
      (nauticalMiles / maxNauticalMiles)
    ).toFixed(0);
    scale.style.width = `${scaleWidth - 10}px`;
    scale.textContent = `${nauticalMiles} nm`;
  },
});

L.control.scaleNautical = function (options) {
  return new L.Control.ScaleNautical(options);
};

export function setMapScale(map, metric=true, imperial=false, nautical=true) {
  L.control
  .scaleNautical({ metric, imperial, nautical })
  .addTo(map);
}


