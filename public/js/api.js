let socket, connected, eventHandlers, messageHandlers;

function reset() {
  connected = false;
  eventHandlers = {};
  messageHandlers = [];
}

reset();

const noop = () => {};
const uuid = () => `${Date.now()}-${`${Math.random()}`.substring(2)}`;

let currentAutopilotParameters = false;

export function haveAPI() {
  return connected;
}

export function authenticate(flight_owner_key) {
  console.log(flight_owner_key);
  if (flight_owner_key) socket.json(`authenticate`, { flight_owner_key });
}

export function callAutopilot(action, params = false) {
  socket.json(`autopilot`, { action, params });
}

export async function connectAPI(
  url,
  {
    onOpen = noop,
    onError = noop,
    onClose = noop,
    onMessage = noop,
    onConnect = noop,
    onDisconnect = noop,
  }
) {
  try {
    await fetch(url.replace(`ws`, `http`));
  } catch (e) {
    return onError?.();
  }

  socket = new WebSocket(url);
  socket.onopen = onOpen;
  socket.onclose = function () {
    socket = { send: noop, json: noop };
    onClose?.();
  };
  socket.onmessage = (evt) => {
    const evtData = evt.data;
    if (evtData === `connected`) {
      connected = true;
      return onConnect?.();
    } else if (evtData === `disconnected`) {
      connected = false;
      return onDisconnect?.();
    }

    try {
      // console.log(`evtData:`, evtData);
      const { action, data } = JSON.parse(evtData);
      // console.log(`action=${action}, data:`, data);
      try {
        // event handling
        if (action === `event`) {
          const { eventName, result } = data;
          // console.log(`event name: ${eventName}, result:`, result);
          eventHandlers[eventName]?.forEach((fn) => fn(result));
        }

        // autopilot-specific event handling
        else if (action === `autopilot`) {
          currentAutopilotParameters = data;
        }

        // general message handling
        else {
          messageHandlers.forEach(({ handler }) => handler(action, data));
        }
      } catch (e) {
        console.error(e);
      }
    } catch (e) {
      console.error(`JSON parse error for`, evt.data);
    }
  };
  if (onMessage) messageHandlers.push({ requestID: 1, handler: onMessage });
  socket.json = (action, data) => socket.send(JSON.stringify({ action, data }));
}

export function getAPI(...simvars) {
  return new Promise((resolve) => {
    const requestID = uuid();
    const handler = (action, data) => {
      if (action === `update`) {
        if (data.requestID === requestID) {
          const pos = messageHandlers.findIndex(
            (e) => e.requestID === requestID
          );
          messageHandlers.splice(pos, 1);
          resolve(data.simvars);
        }
      }
    };
    messageHandlers.push({ requestID, handler });
    socket.json(`get`, { requestID, simvars });
    socket.json(`autopilot`, { action: `get` });
  });
}

export function getSpecialAPI(simvar) {
  return new Promise((resolve) => {
    const requestID = uuid();
    const handler = (action, data) => {
      if (action === `update`) {
        if (data.requestID === requestID) {
          const pos = messageHandlers.findIndex(
            (e) => e.requestID === requestID
          );
          messageHandlers.splice(pos, 1);
          resolve(data.simvars);
        }
      }
    };
    messageHandlers.push({ requestID, handler });
    socket.json(`getSpecial`, { requestID, simvar });
  });
}

export function setAPI(propName, value) {
  socket.json(`set`, { simvars: { [propName]: value } });
}

export function triggerEvent(eventName, value) {
  socket.json(`trigger`, { eventName, value });
}

export function addEventListenerAPI(eventName, handler) {
  eventHandlers[eventName] ??= [];
  eventHandlers[eventName].push(handler);
  socket.json(`register`, { eventName });
}

export function removeEventListenerAPI(eventName, handler) {
  if (!eventHandlers[eventName]) return;
  const pos = eventHandlers[eventName]?.indexOf(handler);
  if (pos === -1) return;
  eventHandlers[eventName].splice(pos, 1);
  if (eventHandlers[eventName].length === 0) {
    socket.json(`forget`, { eventName });
  }
}

// If the API disappears, we want to clear all our event listeners.
// We'll simply re-register them when the API comes back online.
export function clearEventListenersAPI() {
  reset();
}

export function getAutoPilotParameters() {
  return new Promise((resolve) => {
    if (currentAutopilotParameters !== false)
      resolve(currentAutopilotParameters);
    else {
      const timer = setInterval(() => {
        if (currentAutopilotParameters !== false) {
          resolve(currentAutopilotParameters);
          clearInterval(timer);
        }
      }, 100);
    }
  });
}
