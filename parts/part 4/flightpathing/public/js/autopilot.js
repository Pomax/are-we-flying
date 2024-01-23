// We've seen this pattern before:
const content = await fetch("autopilot.html").then((res) => res.text());
const autopilot = document.getElementById(`autopilot`);
autopilot.innerHTML = content;

const { round } = Math;

// just in case we start a client before we start a server,
// make sure that we have default value to work with:
export const AP_OPTIONS = {
  MASTER: false,
  LVL: false,
  ALT: false,
  HDG: false,
  ATT: false,
};

export class Autopilot {
  constructor(owner) {
    console.log(`Hooking up the autopilot controls`);
    this.owner = owner;
    const server = (this.server = owner.server);
    Object.keys(AP_OPTIONS).forEach((key) => {
      const e = document.querySelector(`#autopilot .${key}`);
      e.addEventListener(`click`, () => {
        let value = !e.classList.contains(`active`);
        // Special handling for our altitude mode: instead of a
        // boolean, let's make this our desired altitude in feet:
        if (value) {
          if (key === `ALT`) {
            value =
              document.querySelector(`#autopilot .altitude`).value ?? 1500;
          }
          // Just like we did for ALT, we turn HDG from a boolean into a number:
          if (key === `HDG`) {
            value = document.querySelector(`#autopilot .heading`).value ?? 360;
          }
        }
        server.autopilot.update({ [key]: value });
      });
    });

    const domAP = document.getElementById(`autopilot`);

    // And then we also add an onchange handler to our number
    // field so that if that changes, we let the server know:
    domAP.querySelector(`.altitude`)?.addEventListener(`change`, (evt) => {
      server.autopilot.update({ ALT: evt.target.value });
      evt.target.blur();
    });

    // And then again just like for altitude, we add an onchange handler for heading.
    domAP.querySelector(`.heading`)?.addEventListener(`change`, (evt) => {
      const { value } = evt.target;
      server.autopilot.update({ HDG: value });
      evt.target.blur();
    });

    domAP.querySelector(`.arm-all`).addEventListener(`click`, () => {
      Object.entries(AP_OPTIONS).forEach(([key, value]) => {
        if (key === `MASTER`) return;
        if (!value) {
          domAP.querySelector(`.${key}`).click();
        }
      });
    });
  }

  // And then we also add some ALT-specific code to our update function:
  update(flightData, params) {
    if (!params) return;

    const altitude = document.querySelector(`#autopilot .altitude`);
    const heading = document.querySelector(`#autopilot .heading`);

    Object.entries(params).forEach(([key, value]) => {
      const e = document.querySelector(`#autopilot .${key}`);
      e?.classList.toggle(`active`, !!value);

      // If the autopilot's altitude changes, we want to make sure
      // that the page in our browser reflects that new value:
      if (value && key === `ALT`) {
        // With one caveat: if our cursor is in the number field, then it's
        // safe to say we're trying to set a (new) number and they autopilot
        // update should not suddenly change the input field value.
        if (!altitude || altitude === document.activeElement) return;
        altitude.value = parseFloat(value).toFixed(1);
      }

      // and then we also add the same input field update logic
      if (value && key === `HDG`) {
        if (!heading || heading === document.activeElement) return;
        heading.value = parseFloat(value).toFixed(1);
      }
    });

    // If we're not locked into flying a specific altitude or heading,
    // copy over the current values so that when we click the buttons,
    // we're just telling the plane to "keep going" instead of immediately
    // pushing a course or altitude change through.
    if (!params[`ALT`]) altitude.value = round(flightData.alt);
    if (!params[`HDG`]) heading.value = round(flightData.heading);
  }
}
