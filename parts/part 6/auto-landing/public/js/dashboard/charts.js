import { PositiveGraph, BalancedGraph } from "./svg-graph.js";

const CHART_WIDTH = 600;
const CHART_HEIGHT = 100;

/**
 * ...docs go here...
 * @param {*} container
 * @returns
 */
export function initCharts() {
  const autoscale = { autoscale: 600 };
  const config = {
    // basics
    ground: { unit: `feet`, positive: true, fixed: 1, max: 1500, filled: true },
    altitude: { unit: `feet`, positive: true, fixed: 1 },
    throttle: { unit: `percent`, positive: true, fixed: 2 },
    speed: { unit: `knots`, positive: true, fixed: 2 },
    // elevator
    VS: { unit: `fpm`, fixed: 1, ...autoscale, limits: [1000, -1000] },
    dVS: { unit: `fpm/s`, fixed: 2, ...autoscale },
    pitch: { unit: `degrees`, fixed: 1, ...autoscale },
    dPitch: { unit: `deg/s`, fixed: 2, limits: [1, -1], ...autoscale },
    // aileron
    heading: {
      unit: `degrees`,
      positive: true,
      min: 0,
      max: 360,
      discontinuous: true,
      fixed: 0,
    },
    bank: { unit: `degrees`, fixed: 2, limits: [30, -30], ...autoscale },
    dBank: { unit: `deg/s`, fixed: 4, ...autoscale },
    turnRate: { label: `turn rate`, unit: `deg/s`, fixed: 2 },
    rudder: { label: `rudder`, unit: `%`, fixed: 2 },
    // trim settings
    pitchTrim: { label: `pitch trim`, unit: `%`, fixed: 3 },
    aileronTrim: { label: `aileron trim`, unit: `%`, fixed: 3 },
    rudderTrim: { label: `rudder trim`, unit: `%`, fixed: 3 },
  };

  return new Chart(config);
}

/**
 * ...docs go here...
 */
class Chart {
  constructor(config) {
    const elements = (this.elements = {});
    const charts = (this.charts = {});
    Object.entries(config).map(([label, props]) => {
      const { positive, ...rest } = props;
      const GraphType = positive ? PositiveGraph : BalancedGraph;
      const chart = new GraphType(`science`, CHART_WIDTH, CHART_HEIGHT, {
        label,
        ...rest,
      });
      elements[label] = chart;
      charts[label] = (value, options) => chart.addValue(value, options);
      chart.start();
    });
  }

  update(data) {
    Object.entries(data).forEach(([name, value]) => {
      this.updateChart(name, value);
    });
  }

  updateChart(name, value, options) {
    this.charts[name]?.(value, options);
  }
}
