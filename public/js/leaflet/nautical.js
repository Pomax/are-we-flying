// https://github.com/PowerPan/leaflet.nauticscale/blob/master/dist/leaflet.nauticscale.js
import { waitFor } from "../utils.js";

(async () => {
  const L = await waitFor(async () => window.L);

  L.Control.ScaleNautic = L.Control.Scale.extend({
    options: { nautic: false },

    _addScales: function (options, className, container) {
      L.Control.Scale.prototype._addScales.call(
        this,
        options,
        className,
        container
      );
      L.setOptions(options);
      if (this.options.nautic) {
        this._nScale = L.DomUtil.create("div", className, container);
      }
    },

    _updateScales: function (maxMeters) {
      L.Control.Scale.prototype._updateScales.call(this, maxMeters);
      if (this.options.nautic && maxMeters) {
        this._updateNautic(maxMeters);
      }
    },

    _updateNautic: function (maxMeters) {
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

  L.control.scalenautic = function (options) {
    return new L.Control.ScaleNautic(options);
  };
})();
