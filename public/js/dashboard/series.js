const XMLNS = "http://www.w3.org/2000/svg";
export const element = (tag, attributes = []) => {
  const e = document.createElementNS(XMLNS, tag);
  Object.entries(attributes).forEach(([key, value]) => set(e, key, value));
  return e;
};
const set = (e, key, value) => e.setAttribute(key, value);

const colors = [`#D00`, `#0D0`, `#00D`, `#0DD`, `#000`, `#DD0`, `#D0D`];
const nextColor = () => {
  const color = colors.shift();
  colors.push(color);
  return color;
};


/**
 * ...
 */
export class Series {
  constructor(name, color = nextColor(), height = 200) {
    this.name = name;
    this.color = color;
    this.height = height;
    this.g = element(`g`, {
      title: name,
      transform: `translate(0,400) scale(1,-1)`,
    });
    this.pathGroup = element(`g`);
    this.path = element(`path`, {
      stroke: this.color,
      "stroke-width": 1,
      fill: `none`,
      "vector-effect": `non-scaling-stroke`,
    });
    this.pathGroup.append(this.path);
    this.g.append(this.pathGroup);
    this.min = 99999999;
    this.max = -99999999;
    this.axes = { minor: { interval: 1 }, major: { interval: 10 } };
    this.colors = {
      plot: this.color,
      minor: `#333`,
      major: `#999`,
      axis: `#F00`,
    };
  }

  setProperties({
    fill = false,
    limit = false,
    min,
    max,
    startMax,
    axes,
    colors,
  }) {
    if (fill !== false) {
      const { baseline, color } = fill;
      this.baseline = baseline;
      this.filled = color === `none` || color === `transparent` ? false : true;
      set(this.path, `fill`, color);
      if (this.filled) set(this.path, `stroke`, color);
      this.color = color;
    }

    // vertically centered graph?
    if (limit !== false) {
      min = -limit;
      max = limit;
      this.g.setAttribute(`transform`, `translate(0, ${this.height / 2})`);
    }

    if (!max) {
      max = startMax ?? min + 20;
    }

    this.min = min ?? this.min;
    this.max = max ?? this.max;

    if (colors) {
      this.colors = colors;
      this.path.setAttribute(`stroke`, colors.plot);
    }

    // Test: altitude specific
    if (axes) {
      this.axes = axes;
      [`minor`, `major`].forEach((name) => {
        const data = axes[name];
        for (
          let y = this.min;
          y <= (this.max > this.min ? this.max : 5000);
          y += data.interval
        ) {
          this.addGraphLine(name, data, y);
        }
      });

      if (limit) {
        this.addGraphLine(`axis`, {}, 0);
      }
    }
  }

  addGraphLine(name, data, y) {
    this.pathGroup.append(
      element(`path`, {
        d: `M -${Number.MAX_SAFE_INTEGER} ${y} H ${Number.MAX_SAFE_INTEGER}`,
        class: `grid`,
        stroke: this.colors[name],
        "stroke-width": data.strokeWidth ?? 1,
        opacity: data.opacity || 1,
      })
    );
  }

  addValue(x, y) {
    const { axes } = this;

    if (y < this.min) {
      const oldmin = this.min;
      this.min = parseFloat(y);
      if (axes) {
        [`minor`, `major`].forEach((name) => {
          const data = axes[name];
          const { interval } = data;
          let s = ((oldmin / interval) | 0) * interval;
          for (; s >= this.min; s -= interval) {
            this.addGraphLine(name, data, s);
          }
        });
      }
    }

    if (y > this.max) {
      const oldmax = this.max;
      this.max = parseFloat(y);
      if (axes) {
        [`minor`, `major`].forEach((name) => {
          const data = axes[name];
          const { interval } = data;
          let s = Math.ceil(oldmax / interval) * interval;
          for (; s <= this.max; s += interval) {
            this.addGraphLine(name, data, s);
          }
        });
      }
    }

    let d = this.path.getAttribute(`d`);
    if (!d) {
      if (this.filled) d = `M ${x} 0 L ${x} ${y} L ${x} 0 Z`;
      else d = `M ${x} ${y}`;
    } else {
      if (this.filled) {
        if (!d.match(/M \S+ \S+ Z/)) {
          d = d.replace(/[ML] \S+ \S+ Z/, ``);
        }
      }
      d = `${d} L ${x} ${y}${this.filled ? ` L ${x} ${this.baseline} Z` : ``}`;
    }
    this.path.setAttribute(`data-min`, this.min);
    this.path.setAttribute(`data-max`, this.max);

    let scale = this.height / (this.max - this.min);
    let scalesign = this.min === -this.max ? -1 : 1;
    this.pathGroup.setAttribute(`transform`, `scale(1, ${scalesign * scale})`);
    this.pathGroup
      .querySelectorAll(`.grid`)
      .forEach((e) => e.setAttribute(`stroke-width`, 1 / scale));
    this.path.setAttribute(`d`, d);
  }
}
