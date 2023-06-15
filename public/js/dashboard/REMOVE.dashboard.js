import { Series } from "./series.js";
import { element as createSVGelement } from "./create.js";

class Panel {
  constructor(name) {
    const div = (this.div = document.createElement(`div`));
    div.classList.add(`panel`);
    const svg = (this.svg = createSVGelement(`svg`));
    svg.setAttribute(`transform`, `scale(1,-1)`);
    this.series = new Series(name, `#000`);
    svg.appendChild(this.series.g);
    div.appendChild(svg);
    const label = document.createElement(`p`);
    label.textContent = name;
    div.appendChild(label);
    this.mark = Date.now();
  }
  setBehaviour(definition) {
    const { fill, limit, min, max } = definition;
    this.series.setProperties({ fill, limit, min, max });
  }
  addValue(value) {
    this.series.addValue((Date.now() - this.mark) / 1000, value);
  }
  asHTML() {
    return this.div;
  }
}

// create an X by Y dashboard for plotting data
export class Dashboard {
  panels = {};

  constructor(container, panels, perRow = 4) {
    const div = (this.div = document.createElement(`div`));
    div.classList.add(`dashboard`);
    container.appendChild(div);
    panels.forEach((name) => this.addPanel(name));
  }

  addPanel(name) {
    const panel = new Panel(name);
    this.div.appendChild(panel.asHTML());
    this.panels[name] = panel;
  }

  setPlotBehaviour(name, definition) {
    this.panels[name].setBehaviour(definition);
  }

  update(data) {
    Object.entries(data).forEach(([label, value]) => {
      this.panels[label].addValue(value);
    });
  }
}
