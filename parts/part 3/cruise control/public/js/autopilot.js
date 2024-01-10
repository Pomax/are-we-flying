// We've seen this pattern before:
const content = await fetch("autopilot.html").then((res) => res.text());
const autopilot = document.getElementById(`autopilot`);
autopilot.innerHTML = content;

// just in case we start a client before we start a server,
// make sure that we have default value to work with:
export const AP_OPTIONS = {
  MASTER: false,
  LVL: false,
  ALT: false,
};

export class Autopilot {
  constructor(owner) {
    console.log(`Hooking up the autopilot controls`);
    this.owner = owner;
    const server = (this.server = owner.server);
    // We're going to add more buttons later, so we'll write some code
    // that "does that for us" sp we add options to AP_OPTIONS without
    // having to write new code for every option we add.
    Object.keys(AP_OPTIONS).forEach((key) => {
      const e = document.querySelector(`#autopilot .${key}`);
      e.addEventListener(`click`, () => {
        // We check to see if "this button" is active. If it is, then we
        // want to turn it off, and if it isn't, we want to turn it on.
        const value = e.classList.contains(`active`);
        server.autopilot.update({ [key]: !value });
      });
    });
  }

  // And we'll need a function that, when we're passed the server's
  // current autopilot settings, makes sure all the buttons (all one of
  // them right now) are shown correctly:
  update(params) {
    if (!params) return;
    // Again, we do this with code that "does that for us":
    Object.entries(params).forEach(([key, value]) => {
      const e = document.querySelector(`#autopilot .${key}`);
      e?.classList.toggle(`active`, !!value);
    });
  }
}
