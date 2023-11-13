import { Series } from "./series.js";
import { element } from "./create.js";

/**
 *
 */
class SVGChart {
  constructor(parentElement, width, height, bgcolor) {
    this.width = width;
    this.height = height;
    this.min = Number.MAX_SAFE_INTEGER;
    this.max = -Number.MAX_SAFE_INTEGER;

    const chart = (this.svg = element(`svg`, {
      viewBox: `0 -10 ${width} ${height + 20}`,
      style: `background: ${bgcolor};`,
    }));
    chart.classList.add(`svg-chart`);

    parentElement.appendChild(chart);
    const style = element(`style`);
    style.textContent = `text { font: 16px Arial; }`;
    chart.appendChild(style);

    let legend = (this.legend = element(`g`, { style: `opacity:1` }));
    chart.appendChild(legend);

    this.labels = {};
    this.started = false;
    this.startTime = 0;
  }

  start() {
    this.started = true;
    this.startTime = Date.now();
  }

  stop() {
    this.started = false;
  }

  setProperties(...entries) {
    entries.forEach(({ addLabel, label, labels, ...props }) => {
      if (!labels) {
        labels = label;
      }
      labels.split(`,`).forEach((l) => {
        label = l.trim();
        this.getSeries(label, true).setProperties(props);
      });
      const { fill } = props;
      if (fill) {
        const patch = document.querySelector(`g.${label} rect`);
        patch.setAttribute(`fill`, fill.color);
      }
    });
  }

  getSeries(label, addLabel = false) {
    const { labels } = this;
    if (!labels[label]) {
      const series = (labels[label] = new Series(label, `black`, this.height));
      if (addLabel) this.addLegendEntry(label, series.color);
      this.svg.insertBefore(series.g, this.legend);
    }
    return labels[label];
  }

  addLegendEntry(label, color) {
    const row = element(`g`, { class: label });
    const rows = this.legend.children.length;
    row.setAttribute(
      `transform`,
      `translate(${this.width - 120},${this.height - 10})`
    );

    const patch = element(`rect`, {
      fill: `white`,
      x: 0,
      y: -10,
      width: 200,
      height: 30,
    });
    row.appendChild(patch);

    const text = element(`text`, {
      x: 10,
      y: 10,
    });
    text.setAttribute(`shape-rendering`, `crispEdges`);
    text.textContent = label;
    row.appendChild(text);
    this.legend.appendChild(row);
  }

  setMinMax(label, min, max) {
    const series = this.getSeries(label);
    series.setMinMax(min, max, height);
  }

  addValue(label, value) {
    const { width, height } = this;
    if (value === null || value === undefined || isNaN(value)) value = 0;
    const series = this.getSeries(label);
    const x = (Date.now() - this.startTime) / 1000;
    let y = value;
    series.addValue(x, y.toFixed(5));
    if (x > width) {
      if (x > 3000) {
        this.svg.setAttribute(`viewBox`, `${x - 3000} -10 3000 ${height + 20}`);
      } else {
        this.svg.setAttribute(`viewBox`, `0 -10 ${x} ${height + 20}`);
      }
      this.legend.setAttribute(`transform`, `translate(${x - width}, 0)`);
    }
  }
}

/**
 * ...
 */
export function setupGraph(parentElement, width, height, bgcolor) {
  return new SVGChart(parentElement, width, height, bgcolor);
}
