const content = await fetch("questions.html").then((res) => res.text());
const questions = document.getElementById(`questions`);
questions.innerHTML = content;

const elements = Object.fromEntries(
  [
    `msfs-running`,
    `in-game`,
    `powered-up`,
    `engines-running`,
    `in-the-air`,
    `using-ap`,
    `plane-crashed`,
    `specific-plane`,
  ].map((e) => {
    console.log(e);
    const propName = e
      .split(`-`)
      .map((s, p) => {
        console.log(s);
        if (p === 0) return s;
        const updated =
          s.substring(0, 1).toUpperCase() + s.substring(1).toLowerCase();
        console.log(updated);
        return updated;
      })
      .join(``);
    return [propName, document.querySelector(`.${e}`)];
  })
);

export const Questions = {
  update(state) {
    elements.msfsRunning.checked = state.MSFS;
    elements.inGame.checked = state.camera?.main < 9;
    elements.poweredUp.checked = state.flightDat?.POWERED_UP;
    elements.enginesRunning.checked = state.flightData?.ENGINES_RUNNING;
    elements.inTheAir.checked = !state.flightData?.SIM_ON_GROUND;
    elements.usingAp.checked = state.flightData?.AUTOPILOT_MASTER;
    elements.planeCrashed.checked = state.crashed;
    this.modelLoaded(state.flightModel?.TITLE);
  },

  modelLoaded(modelName = ``) {
    let model = `...nothing yet?`;
    let article = `a`;
    // let's be linguistically correct:
    if (
      [`a`, `i`, `u`, `e`, `o`].includes(
        modelName.substring(0, 1).toLowerCase()
      )
    )
      article += `n`;
    if (modelName) model = `...Looks like ${article} ${modelName}. Nice!`;
    elements.specificPlane.textContent = model;
  },
};
