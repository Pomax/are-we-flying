/**
 * Show a full-page modal for editing waypoint properties.
 */
export function showWaypointModal(server, waypoint) {
  const { id, alt } = waypoint;

  // Our modal HTML:
  const div = document.createElement(`div`);
  div.classList.add(`modal`);
  div.innerHTML = `
      <div class="content">
        <h3>Waypoint ${id}</h3>
        <fieldset>
          <label>elevation:</label>
          <input type="number" class="altitude" value="${
            alt ? alt : ``
          }" placeholder="feet above sea level"/>
        </fieldset>
        <fieldset>
          <label>remove waypoint?</label>
					<button class="remove">remove</button>
        </fieldset>
      </div>
    `;

  // Input handling for our elevation input element:
  const input = div.querySelector(`input.altitude`);
  div.addEventListener(`click`, (evt) => {
    const { target } = evt;
    if (target === div) {
      evt.preventDefault();
      evt.stopPropagation();
      div.remove();
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
        div.remove();
        controller.abort();
      }
      if (key === `Enter`) {
        div.click();
        controller.abort();
      }
    },
    { signal: controller.signal }
  );
  document.body.appendChild(div);
  input.addEventListener(`focus`, ({ target }) => {
    const v = target.value;
    target.value = ``;
    target.value = v;
  });
  input.focus();

  // And finally, our much easier "remove waypoint" button:
  const remove = div.querySelector(`button.remove`);
  remove.addEventListener(`click`, () => {
    if (confirm(`Are you sure you want to remove this waypoint?`)) {
      server.autopilot.removeWaypoint(id);
      div.remove();
    }
  });
}
