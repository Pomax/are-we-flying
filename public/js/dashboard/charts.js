import { setupGraph } from "./svg-graph.js";

class Chart {
  constructor(chartables, colors) {
    this.charts = Object.fromEntries(
      Object.entries(chartables).map(([label, props]) => {
        const chart = setupGraph(document.body, 600, 400, colors.background);
        chart.setProperties({ label, ...props });
        chart.start();
        return [label, (value) => chart.addValue(label, value)];
      })
    );
  }

  update(data) {
    const { charts } = this;
    Object.entries(data).forEach(([name, value]) => {
      charts[name]?.(value);
    });
  }
}

export function initCharts() {
  const colors = {
    background: `#444`,
    plot: `#0F0F`,
    minor: `#9994`,
    major: `#EEE4`,
    axis: `#FF0F`,
  };

  const chartables = {
    ground: {
      addLabel: true,
      min: 0,
      startMax: 500,
      colors,
      axes: {
        minor: {
          interval: 100,
        },
        major: {
          interval: 1000,
          strokeWidth: 2,
        },
      },
    },
    altitude: {
      min: 0,
      startMax: 500,
      colors,
      axes: {
        minor: {
          interval: 100,
        },
        major: {
          interval: 1000,
          strokeWidth: 2,
        },
      },
    },
    vspeed: {
      limit: 100,
      colors,
      axes: {
        minor: {
          interval: 1,
        },
        major: {
          interval: 10,
          strokeWidth: 2,
        },
      },
    },
    trim: {
      limit: 50,
      colors,
      axes: {
        minor: {
          interval: 5,
        },
        major: {
          interval: 10,
          strokeWidth: 2,
        },
      },
    },
    heading: {
      limit: 180,
      colors,
      axes: {
        minor: {
          interval: 10,
        },
        major: {
          interval: 30,
          strokeWidth: 2,
        },
      },
    },
    bank: {
      limit: 40,
      colors,
      axes: {
        minor: {
          interval: 5,
        },
        major: {
          interval: 20,
          strokeWidth: 2,
        },
      },
    },
    "aileron trim": {
      limit: 18,
      colors,
      axes: {
        minor: {
          interval: 1,
        },
        major: {
          interval: 3,
        },
      },
    },
    dvs: {
      limit: 2,
      colors,
      axes: {
        minor: {
          interval: 0.5,
        },
        major: {
          interval: 2,
        },
      },
    },
    speed: {
      min: -10,
      startMax: 150,
      colors,
      axes: {
        minor: {
          interval: 5,
        },
        major: {
          interval: 25,
        },
      },
    },
    pitch: {
      limit: 90,
      colors,
      axes: {
        minor: {
          interval: 10,
        },
        major: {
          interval: 30,
          strokeWidth: 2,
        },
      },
    },
    dbank: {
      limit: 10,
      colors,
      axes: {
        minor: {
          interval: 1,
        },
        major: {
          interval: 5,
          strokeWidth: 2,
        },
      },
    },
    "turn rate": {
      limit: 6,
      colors,
      axes: {
        minor: {
          interval: 1,
        },
        major: {
          interval: 3,
        },
      },
    },
  };

  return new Chart(chartables, colors);
}
