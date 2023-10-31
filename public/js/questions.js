const content = await fetch("questions.html").then((res) => res.text());
const questions = document.getElementById(`questions`);
questions.innerHTML = content;

export const Questions = {
  update(state) {
    document.querySelector(`.msfs-running`).checked = state.MSFS;
    document.querySelector(`.in-game`).checked = state.camera?.main < 9;
    document.querySelector(`.powered-up`).checked = state.flightData.POWERED_UP;
    document.querySelector(`.engines-running`).checked =
      state.flightData.ENGINES_RUNNING;
    document.querySelector(`.in-the-air`).checked =
      !state.flightData.SIM_ON_GROUND;
    document.querySelector(`.using-ap`).checked =
      state.flightData.AUTOPILOT_MASTER;
    document.querySelector(`.plane-crashed`).checked = state.crashed;

    // A little more work than a checkbox:
    if (state.flightModel?.TITLE) this.modelLoaded(state.flightModel.TITLE);
  },

  modelLoaded(modelName) {
    let model = `...nothing yet?`;
    let article = `a`;
    if (
      [`a`, `i`, `u`, `e`, `o`].includes(
        modelName.substring(0, 1).toLowerCase()
      )
    ) {
      article += `n`;
    }
    if (modelName) model = `...Looks like ${article} ${modelName}. Nice!`;
    questions.querySelector(`.specific-plane`).textContent = model;
  },
};
