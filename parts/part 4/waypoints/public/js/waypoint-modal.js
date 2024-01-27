/**
 * Show a full-page modal for editing waypoint properties.
 */
export function showWaypointModal(server, waypoint) {
  const { id, alt, lat, long, active, completed } = waypoint;

  // Our modal HTML:
  const modal = document.createElement(`div`);
  modal.close = () => modal.remove();
  modal.classList.add(`modal`);
  modal.innerHTML = `
      <div class="content">
        <h3>Waypoint ${id}</h3>
        <h4>${lat}, ${long}</h4>
        <fieldset>
          <label>Elevation:</label>
          <input type="number" class="altitude" value="${
            alt ? alt : ``
          }" placeholder="feet above sea level"/>
        </fieldset>
        <fieldset>
          <label>Options:</label>
					<button class="duplicate">duplicate</button>
					<button class="remove">remove</button>
					<button class="target">fly</button>
        </fieldset>
      </div>
    `;

  const input = modal.querySelector(`input.altitude`);

  // Dismiss the modal and commit the elevation change
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

  // Also add key-based dismissal. Esc cancels, Enter commits.
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

  // And then our "duplicate" button:
  const duplicate = modal.querySelector(`button.duplicate`);
  duplicate.addEventListener(`click`, () => {
    server.autopilot.duplicateWaypoint(id);
    modal.close();
  });

  // Then, our much easier "remove waypoint" button:
  const remove = modal.querySelector(`button.remove`);
  remove.addEventListener(`click`, () => {
    server.autopilot.removeWaypoint(id);
    modal.close();
  });

  // And our "This is now our target" button:
  const target = modal.querySelector(`button.target`);
  target.addEventListener(`click`, () => {
    server.autopilot.targetWaypoint(id);
    modal.close();
  });

  // Auto-select the elevation text when the modal opens.
  input.addEventListener(`focus`, () => input.select());
  input.focus();
}
