import { constrainMap } from "../utils.js";

const POSITIVE_TEMPLATE_NAME = `ptn-${Date.now()}-${Math.random()
  .toFixed(8)
  .substring(2)}`;

const BALANCED_TEMPLATE_NAME = `ptn-${Date.now()}-${Math.random()
  .toFixed(8)
  .substring(2)}`;

function exists(v) {
  return v !== undefined && v !== null;
}

/**
 * General graphing object
 */
class Graph {
  constructor(parentId, width = 400, height = 200, opts, template) {
    const parent = (this.parent = document.getElementById(parentId));
    const graph = (this.graph = template.content.cloneNode(true).children[0]);
    parent.append(graph);
    this.style = graph.style;
    this.data = graph.querySelector(`.data`);
    this.label = graph.querySelector(`.graph-label`);
    this.parseOptions(graph, opts);
    graph.querySelector(`.bottom-marker`).textContent = `${this.miny.toFixed(
      this.opts.fixed
    )} ${this.opts.unit}`;
    graph.querySelector(`.top-marker`).textContent = `${this.maxy.toFixed(
      this.opts.fixed
    )} ${this.opts.unit}`;
    this.w = width;
    this.h = height;
    this.updateDimensions();
    this.currentValue = graph.querySelector(`.value-marker`);
  }

  parseOptions(graph, opts = {}) {
    this.opts = Object.assign(
      {
        label: ``,
        units: ``,
        fixed: 0,
      },
      opts
    );
    this.label.textContent = this.opts.label;
    this.miny = opts.min ?? 0;
    this.maxy = opts.max ?? 0;
    if (opts.limits) {
      this.limits = opts.limits;
    }
    if (opts.filled) {
      graph.querySelector(`path.data`).classList.add(`filled`);
    }
  }

  start() {
    this.startTime = Date.now();
  }

  updateDimensions() {
    const { graph, style, w, h } = this;
    style.setProperty(`--svg-graph-width-px`, `${w}px`);
    style.setProperty(`--svg-graph-height-px`, `${h}px`);
    graph.setAttribute(`width`, `${w}px`);
    graph.setAttribute(`height`, `${h}px`);
    graph.setAttribute(`viewBox`, `${-w / 2} ${-h / 2 - 1} ${w} ${h + 2}`);
    this.updateScale();
  }

  updateScale() {
    const { miny, maxy, h, style } = this;
    style.setProperty(`--svg-graph-plot-scale`, h / 2 / Math.max(maxy, -miny));
  }

  updateOffset(x) {
    const { graph, style } = this;
    const diff = parseFloat(graph.getAttribute(`width`)) / 2 - x;
    if (diff < 0) {
      style.setProperty(`--svg-graph-plot-offset`, `${-diff}px`);
    }
  }

  addValue(x, y) {
    // make up an `x` if we were only passed one value
    if (!exists(y)) {
      if (!exists(x)) return;
      y = x;
      x = (Date.now() - this.startTime) / 1000;
    }

    const { data } = this;
    let d = data.getAttribute(`d`).trim();
    const jump =
      Math.abs(y - this.y) > 10 ** -(this.opts.fixed - 2) &&
      this.opts.discontinuous;
    if (this.opts.filled) {
      if (!d) d = `M 0 0`;
      else if (d.includes(`L`)) {
        d = d.substring(0, d.lastIndexOf(`L`) - 1);
      }
    }
    d = d && !jump ? d + `L ${x} ${y} ` : d + `M ${x} ${y} `;
    if (this.opts.filled) {
      d += `L ${x} 0 z`;
    }
    data.setAttribute(`d`, d);
    this.updateBounds(y);
    this.updateOffset(x);
    this.currentValue.textContent = `${y.toFixed(this.opts.fixed)} ${
      this.opts.unit
    }`;
    this.y = y;
  }
}

/**
 * Graph for positive values only.
 */
export class PositiveGraph extends Graph {
  constructor(
    parentId,
    width,
    height,
    opts,
    template = document.getElementById(POSITIVE_TEMPLATE_NAME)
  ) {
    super(parentId, width, height, opts, template);
  }

  updateBounds(y) {
    const { maxy, graph } = this;
    let rescale = false;
    if (y > 0 && y > maxy) {
      rescale = true;
      this.maxy = y;
      graph.querySelector(`.top-marker`).textContent = `${y.toFixed(
        this.opts.fixed
      )} ${this.opts.unit}`;
    }
    if (rescale) this.updateScale();
    return rescale;
  }

  updateScale() {
    const { maxy, h, style } = this;
    style.setProperty(`--svg-graph-plot-scale`, h / maxy);
    this.updateLimits();
  }

  updateLimits() {
    const { limits } = this.opts;
    if (!limits) return;
    const { graph, maxy } = this;
    const topLimit = limits[0];
    const limitLine = graph.querySelector(`line.limit`);
    limitLine.classList.remove(`hidden`);
    const y = constrainMap(topLimit, 0, maxy, 50, -50) + `%`;
    limitLine.setAttribute(`y1`, y);
    limitLine.setAttribute(`y2`, y);
  }
}

/**
 * Balanced graph for both positive and negative values.
 * (max plot range is always equal to -min plot range)
 */
export class BalancedGraph extends PositiveGraph {
  constructor(
    parentId,
    width,
    height,
    opts,
    template = document.getElementById(BALANCED_TEMPLATE_NAME)
  ) {
    super(parentId, width, height, opts, template);
    if (this.opts.autoscale) {
      this.scaleWindow = [];
    }
  }

  updateBounds(y) {
    const { graph, miny, maxy } = this;

    const rescaled = y > maxy ? super.updateBounds(y) : false;
    if (rescaled) {
      this.miny = -this.maxy;
      graph.querySelector(`.bottom-marker`).textContent = `${this.miny.toFixed(
        this.opts.fixed
      )} ${this.opts.unit}`;
    }

    let rescale = false;
    if (y < 0 && y <= miny) {
      rescale = true;
      this.miny = y;
      if (this.maxy < -this.miny) {
        this.maxy = -this.miny;
        graph.querySelector(
          `.bottom-marker`
        ).textContent = `${this.miny.toFixed(this.opts.fixed)} ${
          this.opts.unit
        }`;
        graph.querySelector(`.top-marker`).textContent = `${this.maxy.toFixed(
          this.opts.fixed
        )} ${this.opts.unit}`;
      }
    }

    if (rescale) this.updateScale();
  }

  updateScale() {
    const { miny, maxy, h, style } = this;
    style.setProperty(`--svg-graph-plot-scale`, h / 2 / Math.max(maxy, -miny));
    this.updateLimits();
  }

  updateLimits() {
    const { limits } = this.opts;
    if (!limits) return;
    const { graph, miny, maxy } = this;
    const lines = graph.querySelectorAll(`line.limit`);
    lines.forEach((line, pos) => {
      line.classList.remove(`hidden`);
      let y;
      if (pos === 0) {
        y = constrainMap(limits[pos], 0, maxy, 0, -50) + `%`;
      } else {
        y = constrainMap(limits[pos], miny, 0, 50, 0) + `%`;
      }
      if (y === `-50%` || y === `50%`) return line.classList.add(`hidden`);
      line.setAttribute(`y1`, y);
      line.setAttribute(`y2`, y);
    });
  }

  addValue(x, y) {
    super.addValue(x, y);
    this.autoScale();
  }

  autoScale() {
    const { scaleWindow } = this;
    if (!scaleWindow) return;

    const { graph } = this;
    const { autoscale } = this.opts;

    scaleWindow.push(this.y);
    if (scaleWindow.length < autoscale) return;
    while (scaleWindow.length > autoscale) scaleWindow.shift();

    const min = Math.min(...scaleWindow);
    const max = Math.max(...scaleWindow);

    if (Math.abs(min) < Math.abs(max)) {
      this.miny = -max;
      this.maxy = max;
    } else {
      this.miny = min;
      this.maxy = -min;
    }
    graph.querySelector(`.bottom-marker`).textContent = `${this.miny.toFixed(
      this.opts.fixed
    )} ${this.opts.unit}`;
    graph.querySelector(`.top-marker`).textContent = `${this.maxy.toFixed(
      this.opts.fixed
    )} ${this.opts.unit}`;
    this.updateScale();
  }
}

// Inject the templates we need into the page

const templateCode = `
<template id="${POSITIVE_TEMPLATE_NAME}">
  <svg class="positive svg-graph">
    <!-- helpers -->
    <line class="y-axis" y1="-100%" y2="100%" x1="-400" x2="-400" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-350" x2="-350" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-300" x2="-300" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-250" x2="-250" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-200" x2="-200" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-150" x2="-150" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-100" x2="-100" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-50" x2="-50" />
    <line class="y-axis" y1="-100%" y2="100%" x1="0" x2="0" />
    <line class="y-axis" y1="-100%" y2="100%" x1 ="50" x2 ="50" />
    <line class="y-axis" y1="-100%" y2="100%" x1="100" x2="100" />
    <line class="y-axis" y1="-100%" y2="100%" x1="150" x2="150" />
    <line class="y-axis" y1="-100%" y2="100%" x1="200" x2="200" />
    <line class="y-axis" y1="-100%" y2="100%" x1="250" x2="250" />
    <line class="y-axis" y1="-100%" y2="100%" x1="300" x2="300" />
    <line class="y-axis" y1="-100%" y2="100%" x1="350" x2="350" />
    <line class="y-axis" y1="-100%" y2="100%" x1="400" x2="400" />
    <!-- axes -->
    <line class="x-axis" x1="-100%" x2="100%" y1="-40%" y2="-40%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="-30%" y2="-30%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="-20%" y2="-20%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="-10%" y2="-10%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="10%" y2="10%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="20%" y2="20%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="30%" y2="30%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="40%" y2="40%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="0%" y2="0%" />
    <-- limit -->
    <!-- extent markers -->
    <line class="top-line" x1="-100%" x2="100%" y1="-49.5%" y2="-49.5%" />
    <line class="hidden limit" x1="-100%" x2="100%" y1="100%" y2="100%" />
    <!-- data plot, scaling handled on the JS side -->
    <g class="plot-region"><path class="data"  vector-effect="non-scaling-stroke" d=""/></g>
    <!-- main axis is on top of everything -->
    <line class="main x-axis" x1="-100%" x2="100%" y1="50%" y2="50%" />
    <!-- labels go on top of everything -->
    <text class="top-marker" x="0" y="0" >+0</text>
    <text class="bottom-marker" x="0" y="0">0</text>
    <text class="graph-label" x="0" y="0"></text>
    <text class="value-marker" x="0" y="0">+0</text>
</svg>
</template>

<template id="${BALANCED_TEMPLATE_NAME}">
  <svg class="balanced svg-graph">
    <!-- helpers -->
    <line class="y-axis" y1="-100%" y2="100%" x1="-400" x2="-400" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-350" x2="-350" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-300" x2="-300" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-250" x2="-250" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-200" x2="-200" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-150" x2="-150" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-100" x2="-100" />
    <line class="y-axis" y1="-100%" y2="100%" x1="-50" x2="-50" />
    <line class="y-axis" y1="-100%" y2="100%" x1="0" x2="0" />
    <line class="y-axis" y1="-100%" y2="100%" x1 ="50" x2 ="50" />
    <line class="y-axis" y1="-100%" y2="100%" x1="100" x2="100" />
    <line class="y-axis" y1="-100%" y2="100%" x1="150" x2="150" />
    <line class="y-axis" y1="-100%" y2="100%" x1="200" x2="200" />
    <line class="y-axis" y1="-100%" y2="100%" x1="250" x2="250" />
    <line class="y-axis" y1="-100%" y2="100%" x1="300" x2="300" />
    <line class="y-axis" y1="-100%" y2="100%" x1="350" x2="350" />
    <line class="y-axis" y1="-100%" y2="100%" x1="400" x2="400" />
    <!-- axes -->
    <line class="x-axis" x1="-100%" x2="100%" y1="-40%" y2="-40%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="-30%" y2="-30%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="-20%" y2="-20%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="-10%" y2="-10%" />
    <line class="main x-axis" x1="-100%" x2="100%" y1="0" y2="0" />
    <line class="x-axis" x1="-100%" x2="100%" y1="10%" y2="10%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="20%" y2="20%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="30%" y2="30%" />
    <line class="x-axis" x1="-100%" x2="100%" y1="40%" y2="40%" />
    <!-- extent markers -->
    <line class="top-line"  x1="-100%" x2="100%" y1="-49.5%" y2="-49.5%" />
    <line class="bottom-line" x1="-100%" x2="100%" y1="50%" y2="50%" />
    <line class="hidden limit" x1="-100%" x2="100%" y1="100%" y2="100%" />
    <line class="hidden limit" x1="-100%" x2="100%" y1="100%" y2="100%" />
    <!-- data plot, scaling handled on the JS side -->
    <g class="plot-region"><path class="data" vector-effect="non-scaling-stroke" d=""/></g>
    <!-- labels go on top of everything -->
    <text class="top-marker" x="0" y="0">+0</text>
    <text class="bottom-marker">-0</text>
    <text class="graph-label" x="0" y="0"></text>
    <text class="value-marker" x="0" y="0">+0</text>
  </svg>
</template>`;

const templateHolder = document.createElement(`template`);
templateHolder.innerHTML = templateCode;
[...templateHolder.content.children].forEach((c) =>
  document.body.append(c.cloneNode(true))
);

const link = document.createElement(`link`);
link.href = `js/dashboard/svg-graph.css`;
link.rel = `stylesheet`;
document.head.append(link);
