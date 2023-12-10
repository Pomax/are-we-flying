const content = await fetch("autopilot.html").then((res) => res.text());
const autopilot = document.getElementById(`autopilot`);
autopilot.innerHTML = content;

// TODO: make this reactive

export const AP_DEFAULT = {
  MASTER: false,
  LVL: false, // wing level
  ALT: false, // altitude hold
  ATT: false, // auto throttle
  TER: false, // terrain follow
  HDG: false, // heading mode
  ATO: false, // auto takeoff
  ATL: false, // autoland
};

/**
 * ...docs go here...
 */
export class Autopilot {
  /**
   * ...docs go here...
   */
  constructor(owner) {
    console.log(`building autopilot`);
    this.owner = owner;
    const server = (this.server = owner.server);
    this.elevation = {};

    Object.keys(AP_DEFAULT).forEach((key) => {
      const e = document.querySelector(`#autopilot .${key}`);
      e?.addEventListener(`click`, () => {
        e.classList.toggle(`active`);
        let value = e.classList.contains(`active`);
        if (value) {
          if (key === `ALT`) {
            value =
              document.querySelector(`#autopilot .altitude`).value ?? 1500;
          }
          if (key === `TER`) {
            value = document.querySelector(`#autopilot .terrain`).value ?? 500;
          }
          if (key === `HDG`) {
            value = document.querySelector(`#autopilot .heading`).value ?? 360;
          }
        }
        console.log(`sending`, { [key]: value });
        server.autopilot.update({ [key]: value });
      });
    });

    document
      .querySelector(`#autopilot .altitude`)
      ?.addEventListener(`change`, (evt) => {
        const { value } = evt.target;
        server.autopilot.update({ ALT: value });
        evt.target.blur();
      });

    document
      .querySelector(`#autopilot .terrain`)
      ?.addEventListener(`change`, (evt) => {
        const { value } = evt.target;
        server.autopilot.update({ TER: value });
        evt.target.blur();
      });

    document
      .querySelector(`#autopilot .heading`)
      ?.addEventListener(`change`, (evt) => {
        const { value } = evt.target;
        server.autopilot.update({ HDG: value });
        evt.target.blur();
      });
  }

  /**
   * ...docs go here...
   */
  update(params) {
    if (params.MASTER === undefined) params = AP_DEFAULT;
    Object.entries(params).forEach(([key, value]) => {
      document
        .querySelector(`#autopilot .${key}`)
        ?.classList.toggle(`active`, !!value);

      if (value && key === `ALT`) {
        const altitude = document.querySelector(`#autopilot .altitude`);
        if (!altitude || altitude === document.activeElement) return;
        altitude.value = parseFloat(value).toFixed(1);
      }

      if (value && key === `TER`) {
        const terrain = document.querySelector(`#autopilot .terrain`);
        if (!terrain || terrain === document.activeElement) return;
        terrain.value = parseFloat(value).toFixed(1);
      }

      if (value && key === `HDG`) {
        const heading = document.querySelector(`#autopilot .heading`);
        if (!heading || heading === document.activeElement) return;
        heading.value = parseFloat(value).toFixed(1);
      }
    });
  }

  /**
   * ...docs go here...
   */
  setCurrentAltitude(altitude) {
    const ALT = document.querySelector(`.ALT.active`);
    if (!ALT) {
      const e = document.querySelector(`#autopilot .altitude`);
      if (e) e.value = altitude;
    }
  }

  /**
   * ...docs go here...
   */
  setCurrentHeading(heading) {
    const HDG = document.querySelector(`.HDG.active`);
    if (!HDG) {
      const e = document.querySelector(`#autopilot .heading`);
      if (e) e.value = heading;
    }
  }
}
