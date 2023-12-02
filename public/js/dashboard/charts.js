import { PositiveGraph, BalancedGraph } from "./svg-graph.js";

const CHART_WIDTH = 600;
const CHART_HEIGHT = 100;

/**
 * ...docs go here...
 * @param {*} container
 * @returns
 */
export function initCharts(container) {
  const colors = {
    background: `#444`,
    plot: `#0F0F`,
    minor: `#9994`,
    major: `#EEE4`,
    axis: `#FF0F`,
  };

  const chartables = {
    // basics
    ground: { unit: `feet`, positive: true, fixed: 1, max: 1500, filled: true },
    altitude: { unit: `feet`, positive: true, fixed: 1 },
    speed: { unit: `knots`, positive: true, fixed: 2 },
    // elevator
    VS: { unit: `fpm`, fixed: 1, /*autoscale: 60,*/ limits: [1000, -1000] },
    dVS: { unit: `fpm/s`, fixed: 2 /*autoscale: 60*/ },
    pitch: { unit: `degrees`, fixed: 1 },
    dPitch: { unit: `deg/s`, fixed: 2, limits: [1, -1] },
    // aileron
    heading: {
      unit: `degrees`,
      positive: true,
      min: 0,
      max: 360,
      discontinuous: true,
      fixed: 0,
    },
    bank: { unit: `degrees`, fixed: 2, limits: [30, -30] },
    dBank: { unit: `deg/s`, fixed: 4 },
    turnRate: { label: `turn rate`, unit: `deg/s`, fixed: 2 },
    rudder: { label: `rudder`, unit: `%`, fixed: 2 },
    // trim settings
    pitchTrim: { label: `pitch trim`, unit: `%`, fixed: 3 },
    aileronTrim: { label: `aileron trim`, unit: `%`, fixed: 3 },
    rudderTrim: { label: `rudder trim`, unit: `%`, fixed: 3 },
  };

  return new Chart(chartables, colors, container);
}

/**
 * ...docs go here...
 */
class Chart {
  constructor(chartables, container = document.body) {
    const elements = (this.elements = {});
    const charts = (this.charts = {});
    Object.entries(chartables).map(([label, props]) => {
      const { positive, ...rest } = props;
      const GraphType = positive ? PositiveGraph : BalancedGraph;
      const chart = new GraphType(`science`, CHART_WIDTH, CHART_HEIGHT, {
        label,
        ...rest,
      });
      elements[label] = chart;
      charts[label] = (value) => chart.addValue(value);
      chart.start();
    });
  }

  update(data) {
    const { charts } = this;
    Object.entries(data).forEach(([name, value]) => {
      const chart = charts[name];
      chart?.(value);
    });
  }
}
