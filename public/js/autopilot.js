const content = await fetch("autopilot.html").then((res) => res.text());
const autopilot = document.getElementById(`autopilot`);
autopilot.innerHTML = content;

// TODO: make this reactive

export const AP_DEFAULT = {
  MASTER: false,
  LVL: false,
  ALT: false,
  ATT: false,
  TER: false,
  HDG: false,
  ATO: false,
};

export class Autopilot {
  constructor(owner) {
    console.log(`building autopilot`);
    this.owner = owner;
    const server = (this.server = owner.server);
    this.elevation = {};

    Object.keys(AP_DEFAULT).forEach((key) => {
      const e = document.querySelector(`#autopilot .${key}`);
      e.addEventListener(`click`, () => {
        e.classList.toggle(`active`);
        let value = e.classList.contains(`active`);
        if (value) {
          if (key === `ALT`) {
            value =
              document.querySelector(`#autopilot .altitude`).value ?? 1500;
          }
          if (key === `HDG`) {
            value = document.querySelector(`#autopilot .heading`).value ?? 360;
          }
        }
        console.log(`click`, key, value);
        server.autopilot.update({ [key]: value });
      });
    });

    document
      .querySelector(`#autopilot .altitude`)
      .addEventListener(`change`, (evt) => {
        const { value } = evt.target;
        server.autopilot.update({ ALT: value });
        evt.target.blur();
      });

    document
      .querySelector(`#autopilot .heading`)
      .addEventListener(`change`, (evt) => {
        const { value } = evt.target;
        server.autopilot.update({ HDG: value });
        evt.target.blur();
      });

    (async () => this.bootstrap(await this.server.autopilot.getParameters()))();
  }

  bootstrap(params) {
    if (!params) return;
    Object.entries(params).forEach(([key, value]) => {
      if (key === `waypoints`) {
        return this.owner.manageWaypoints(value);
      }

      if (key === `elevation`) {
        return this.owner.setElevationProbe(value);
      }

      const e = document.querySelector(`#autopilot .${key}`);
      if (!e) return;
      const fn = !!value ? `add` : `remove`;
      e.classList[fn](`active`);

      if (value && key === `ALT`) {
        const altitude = document.querySelector(`#autopilot .altitude`);
        if (altitude === document.activeElement) return;
        altitude.value = parseFloat(value).toFixed(1);
      }
      if (value && key === `HDG`) {
        const heading = document.querySelector(`#autopilot .heading`);
        if (heading === document.activeElement) return;
        heading.value = parseFloat(value).toFixed(1);
      }
    });
  }

  setCurrentAltitude(altitude) {
    const ALT = document.querySelector(`.ALT.active`);
    if (!ALT) {
      document.querySelector(`#autopilot .altitude`).value = altitude;
    }
  }

  update(params) {
    console.log(`ap parameters:`, params);
  }
}
