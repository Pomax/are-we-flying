const content = await fetch("questions.html").then((res) => res.text());
const questions = document.getElementById(`questions`);
questions.innerHTML = content;

export const Questions = {
  update(state) {
    console.log(`updating questions`);
    document.querySelector(`.msfs-running`).checked = state.MSFS;
    document.querySelector(`.in-game`).checked = !!state.flightData;
    if (state.flightModel?.TITLE) {
      this.modelLoaded(state.flightModel.TITLE);
    }
    document.querySelector(`.engines-running`).checked =
      !!state.flightData.ENGINES_RUNNING;
    document.querySelector(`.in-the-air`).checked =
      state.flying && !state.SIM_ON_GROUND;
    document.querySelector(`.using-ap`).checked = state.AUTOPILOT_MASTER;
    document.querySelector(`.plane-crashed`).checked = state.crashed;
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
