const content = await fetch("questions.html").then((res) => res.text());
const questions = document.getElementById(`questions`);
questions.innerHTML = content;

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

const elements = Object.fromEntries(
  qss.map((e) => {
    const propName = reCase(e);
    return [propName, document.querySelector(`.${e}`)];
  })
);

export const Questions = {
  update(state) {
    elements.serverOnline.checked = !!state.serverConnection;
    elements.msfsRunning.checked = state.MSFS;
    elements.inGame.checked = state.camera?.main < 9;
    elements.poweredUp.checked = state.flightData?.POWERED_UP;
    elements.enginesRunning.checked = state.flightData?.ENGINES_RUNNING;
    elements.inTheAir.checked =
      state.flightData && !state.flightData.SIM_ON_GROUND;
    elements.usingAp.checked = state.flightData?.AUTOPILOT_MASTER;
    elements.planeCrashed.checked = state.crashed;
    this.whereAreWeFlying(state);
    // And we'll do this one separately because it's a more than just a checkmark:
    this.modelLoaded(state.flightModel?.TITLE);
  },

  whereAreWeFlying(state) {
    const lat = state.flightData?.PLANE_LATITUDE?.toFixed(6);
    const long = state.flightData?.PLANE_LONGITUDE?.toFixed(6);
    elements.gmapsLink.href = `https://www.google.com/maps/place/${lat}+${long}/@${lat},${long},13z`;
    elements.latitude.textContent = lat ?? `-`;
    elements.longitude.textContent = long ?? `-`;
  },

  modelLoaded(modelName) {
    let model = `(...nothing yet?)`;
    if (modelName) {
      let article = `a`;
      if (vowels.includes(modelName.substring(0, 1))) article += `n`;
      model = `...Looks like ${article} ${modelName}. Nice!`;
    }
    elements.specificPlane.textContent = model;
  },
};
