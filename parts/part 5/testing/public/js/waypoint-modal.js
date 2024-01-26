/**
 * Show a full-page modal for editing waypoint properties.
 */
export function showWaypointModal(server, waypoint) {
  const { id, alt } = waypoint;

  // Our modal HTML:
  const modal = document.createElement(`div`);
  modal.close = () => modal.remove();
  modal.classList.add(`modal`);
  modal.innerHTML = `
      <div class="content">
        <h3>Waypoint ${id}</h3>
        <fieldset>
          <label>elevation:</label>
          <input type="number" class="altitude" value="${
            alt ? alt : ``
          }" placeholder="feet above sea level"/>
        </fieldset>
        <fieldset>
          <label>remove waypoint: </label>
					<button class="remove">remove</button>
        </fieldset>
        <fieldset>
          <label>split waypoint: </label>
					<button class="split">split</button>
        </fieldset>
      </div>
    `;

  // Input handling for our elevation input element:
  const input = modal.querySelector(`input.altitude`);
  modal.addEventListener(`click`, (evt) => {
    const { target } = evt;
    if (target === modal) {
      evt.preventDefault();
      evt.stopPropagation();
      modal.close();
      const alt = parseFloat(input.value);
      if (!isNaN(alt) && alt > 0) {
        server.autopilot.setWaypointElevation(id, alt);
      } else if (input.value.trim() === ``) {
        server.autopilot.setWaypointElevation(id, false);
      }
    }
  });

  // With additional event listening for the escape and enter keys:
  const controller = new AbortController();
  document.addEventListener(
    `keydown`,
    ({ key }) => {
      if (key === `Escape`) {
        modal.close();
        controller.abort();
      }
      if (key === `Enter`) {
        modal.click();
        controller.abort();
      }
    },
    { signal: controller.signal }
  );
  document.body.appendChild(modal);
  input.addEventListener(`focus`, ({ target }) => {
    const v = target.value;
    target.value = ``;
    target.value = v;
  });
  input.focus();

  // Then, our much easier "remove waypoint" button:
  const remove = modal.querySelector(`button.remove`);
  remove.addEventListener(`click`, () => {
    server.autopilot.removeWaypoint(id);
    modal.close();
  });

  // And then our "split" button:
  const split = modal.querySelector(`button.split`);
  split.addEventListener(`click`, () => {
    server.autopilot.splitWaypoint(id);
    modal.close();
  });
}
