const content = await fetch("questions.html").then((res) => res.text());
const questions = document.getElementById(`questions`);
questions.innerHTML = content;

function setCheckbox(qs, val) {
  const checkbox = questions.querySelector(qs);
  if (val) checkbox.setAttribute(`checked`, `checked`);
  else checkbox.removeAttribute(`checked`);
}

export const Questions = {
  serverUp(val) {
    setCheckbox(`.server-up`, val);
  },
  msfsRunning(val) {
    setCheckbox(`.msfs-running`, val);
  },
  inGame(val) {
    setCheckbox(`.in-game`, val);
  },
  modelLoaded(modelName) {
    let model = `...nothing yet?`;
    let article = `a`;
    if ([`a`, `i`, `u`, `e`, `o`].includes(modelName.substring(0, 1).toLowerCase())) {
      article += `n`;
    }
    if (modelName) model = `...Looks like ${article} ${modelName}. Nice!`;
    questions.querySelector(`.specific-plane`).textContent = model;
  },
  enginesRunning(val) {
    setCheckbox(`.engines-running`, val);
  },
  inTheAir(val) {
    setCheckbox(`.in-the-air`, val);
  },
  usingAutoPilot(val) {
    setCheckbox(`.using-ap`, val);
  },
  planeCrashed(val) {
    setCheckbox(`.plane-crashed`, val);
  },
  resetPlayer() {
    this.inGame(false);
    // don't reset the model, we'll get a new one if the player picks one
    this.enginesRunning(false);
    this.inTheAir(false);
    this.usingAutoPilot(false);
    this.planeCrashed(false);
  },
};
