import { constrain } from "./utils.js";

/**
 * Change the throttle lever position by adding a percentage point delta to its current percentage value.
 * @param {MSFS_API} api Our MSFS_API instance.
 * @param {number} engineCount How many engines we need to control (defaults to 4 if explicitly `undefined`)
 * @param {number} byHowMuch The amount (in percentages) to add to or subtract from the current throttle position.
 * @param {number} ceiling The percentage we are not to exceed when throttling up (defaults to 100).
 * @param {number} floor The percentage we are not to exceed when throttling down (defaults to 0).
 * @returns {number} The updated throttle lever percentage value.
 */
export async function changeThrottle(
  api,
  engineCount = 4,
  byHowMuch,
  floor = 0,
  ceiling = 100
) {
  // FIXME: TODO: add a flag that uses trigger(`THROTTLE_SET`)? Maybe?
  let newThrottle;
  for (let count = 1; count <= engineCount; count++) {
    const simVar = `GENERAL_ENG_THROTTLE_LEVER_POSITION:${count}`;
    const throttle = (await api.get(simVar))[simVar];
    if (
      (byHowMuch < 0 && throttle > floor) ||
      (byHowMuch > 0 && throttle < ceiling)
    ) {
      newThrottle = constrain(throttle + byHowMuch, floor, ceiling);
      api.set(simVar, newThrottle);
    }
  }
  const simVar = `GENERAL_ENG_THROTTLE_LEVER_POSITION:1`;
  newThrottle = (await api.get(simVar))[simVar];
  return newThrottle;
}