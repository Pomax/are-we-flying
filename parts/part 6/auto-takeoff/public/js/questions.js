const content = await fetch("questions.html").then((res) => res.text());
const questions = document.getElementById(`questions`);
questions.innerHTML = content;

// The query selectors for our elements:
const qss = [
  `server-online`,
  `msfs-running`,
  `in-game`,
  `powered-up`,
  `engines-running`,
  `in-the-air`,
  `using-ap`,
  `plane-crashed`,
  `specific-plane`,
  `gmaps-link`,
  `latitude`,
  `longitude`,
];

// A bit of house-keeping
const vowels = [`a`, `i`, `u`, `e`, `o`, `A`, `I`, `U`, `E`, `O`];

function titleCase(s) {
  return s.substring(0, 1).toUpperCase() + s.substring(1).toLowerCase();
}

function reCase(e) {
  return e
    .split(`-`)
    .map((s, p) => (p === 0 ? s : titleCase(s)))
    .join(``);
}

// Let's create an object that's { serverOnline: span, msfsRunning: span, ... }
// because that'll make it easier to set text and check checkboxes:
const elements = Object.fromEntries(
  qss.map((e) => {
    const propName = reCase(e);
    return [propName, document.querySelector(`.${e}`)];
  })
);

// And then our questions helper: we're simply going to set every checkbox
// based on what's in the current state, only spending a little more time
// on the plane model, and mostly because we want the right "a" vs. "an"
// depending on whether the title starts with a vowel or not:
export const Questions = {
  update(state) {
    const {
      general,
      model: flightModel,
      data: flightData,
    } = state.flightInformation;
    elements.serverOnline.checked = !!state.serverConnection;
    elements.msfsRunning.checked = state.MSFS;
    elements.inGame.checked = general?.inGame;
    elements.poweredUp.checked = flightData?.hasPower;
    elements.enginesRunning.checked = flightData?.enginesRunning;
    elements.inTheAir.checked = general?.flying;
    elements.usingAp.checked = flightData?.MASTER;
    elements.planeCrashed.checked = state.crashed;
    // And we'll do these two separately because they're a bit more than just a check mark:
    this.whereAreWeFlying(flightData);
    this.modelLoaded(flightModel);
  },

  whereAreWeFlying(flightData) {
    const lat = flightData?.lat?.toFixed(6);
    const long = flightData?.long?.toFixed(6);
    elements.gmapsLink.href = `https://www.google.com/maps/place/${lat}+${long}/@${lat},${long},13z`;
    elements.latitude.textContent = lat ?? `-`;
    elements.longitude.textContent = long ?? `-`;
  },

  modelLoaded({ title, weight }) {
    let model = `(...nothing yet?)`;
    if (title) {
      let article = `a`;
      if (vowels.includes(title.substring(0, 1))) article += `n`;
      model = `...Looks like ${article} (${weight | 0}lbs) ${title}. Nice!`;
    }
    elements.specificPlane.textContent = model;
  },
};
