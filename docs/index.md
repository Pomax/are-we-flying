<!-- there's going to be interactive graphics here -->

<script  type="module" src="./graphics/graphics-element/graphics-element.js" async></script>
<link rel="stylesheet" href="./graphics/graphics-element/graphics-element.css" async>

<style>
  html, body {
    width: 800px;
    margin: 0 auto;
  }
  img {
    margin: 0;
    border: 1px solid black;
  }
  figure {
    & img {
      margin-bottom: -1.5em;
    }
    & figcaption {
      margin: 0;
      padding: 0;
      size: 80%;
      font-style: italic;
      text-align: right;
    }
  }
</style>

# Flying planes with JavaScript

![masthead image of a cockpit with browsers loaded in the cockpit screens](./images/masthead.png)

To allay any concerns: this is not about running JavaScript software to control an actual aircraft.

**_That would kill people_**.

Instead, we're writing a web page that can control an autopilot running in JS that, in turn, controls a little virtual aeroplane. And by "little" I actually mean "most aeroplanes in [Microsoft Flight Simulator 2020](https://www.flightsimulator.com/)" because as it turns out, MSFS comes with an API that can be used to both query _*and set*_ values ranging from anything as simple as cockpit lights to something as complex as spawning a fleet of aircraft and making them fly in formation while making their smoke pattern spell out the works of Chaucer in its original middle English.

While we're not doing that (...today?), we _*are*_ going to write an autopilot for planes that don't have one, as well as planes that do have one but that are just a 1950's chore to work with, while also tacking on some functionality that just straight up doesn't exist in modern autopilots. The thing that lets us perform this trick is that MSFS comes with something called [SimConnect](https://docs.flightsimulator.com/html/Programming_Tools/SimConnect/SimConnect_SDK.htm), which is an SDK that lets people write addons for the game using C, C++, or languages with .NET support... and so, of course, folks have been writing connectors to "port" the SimConnect function calls to officially unsupported languages like Go, Node, Python, etc.

Which means that we could, say, write a web page that allows us to see what's going on in the game. And toggle in-game settings. And --and this is the one that's the most fun-- _fly the plane_ from a web page. And once we're done "it'll be that easy" but the road to get there is going to take a little bit of prep work... some of it tedious, some of it weird, but all of it's going to set us up for just doing absolutely ridiculous things and at the end of it, we'll have a fully functional autopilot _with auto-takeoff and flight planning that's as easy as using google maps_ and whatever's missing, you can probably bolt on yourself!

Before we get there though, let's start at the start. If the idea is to interface with MSFS from a webpage, and webpages use JS, then your first thought might be "Cool, can I write an [express](https://expressjs.com/) server that connects to MSFS?" to which the answer is: yes! There is the [node-simconnect](https://www.npmjs.com/package/node-simconnect) package for [Node](https://nodejs.org), which implements full access to the SimConnect DLL file, but it's very true to the original C++ SDK, meaning it's a bit like "programming C++ in JavaScript". Now, you might like that (I don't know your background) but JS has its own set of conventions that don't really line up with the C++ way of doing things, and because I know my way around programming and I like writing JS, I created a somewhat more "JavaScripty" API on top of node-simconnect called [msfs-simconnect-api-wrapper](https://www.npmjs.com/package/msfs-simconnect-api-wrapper) (I am _*great*_ at naming things) which lets me (and you!) write code that can talk to MSFS in a way that looks and feels much more like standard JavaScript, so... let's use that!

Also, because we want to talk "from the browser to a game", we don't really want to have to rely on HTML GET and POST requests, because they're both slow, and unidirectional: the game will never be able to talk to us unless it's to answer a question we sent it. That's not great, especially not if we want to register event handlers, so instead we'll use [web sockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API), which let us set up a persistent bidirectional data connection And to make that a trivial task, we're going to use a library called ["socketless"](https://github.com/Pomax/socketless), which lets us write client/server code as if everything is just local code, and it magically makes things work over the network.

If that sounds cool: you can check out the complete project over on the ["Are we flying?"](https://github.com/Pomax/are-we-flying) Github repository, and you can just clone that and run the project with a simple `run.bat`, but if you want to actually learn something... let's dive in!

## The structure of this "tutorial"

We'll be tackling this whole thing in four parts:

1. In the first part we'll cover the prep work we need to do in order to set up a working combination of MSFS, a SimConnect API server for communicating to and from MSFS, and a web server that hosts a webpage and takes care of communicating to and from the API server.
2. In the the second part we'll cover the "web page pages", where we're going to visualize everything we can visualize relating to our flights in MSFS, including graphs that plot the various control values over time (altitude, speed, heading, trim values, etc.) to get a better insight into how our aeroplane(s) responds to control inputs.
3. In the third part we'll cover the thing you came here for: writing our own autopilot (in several stages of complexity) and making our computer fly planes all on its own!
4. In the fourth part, we're going to cover the thing you didn't even realize you came here for: taking everything we've done and turning it into a google maps style autopilot, where we just tap a few places we want to pass over in the browser, and then with the plane still sitting on the runway, click "take off" in the browser and have the plane just... start flying in MSFS with us along for the ride, not having to do anything. And then clicking "auto land" to make the game pick an airport near the last waypoint we placed and just have it land there. _Because we can_.

And along the way we're going to learn a few developer tricks like hot reloading ES modules, mocking SimConnect, and other such fun things.

By the time we're done, we'll have a web page that looks a little bit like this:

![sim view on the map](./images/sim-view-on-map.png)

While the in game view looking like this:

![in-game sim view](./images/in-game-sim-view.png)

or this:

![in-game sim view outside](./images/in-game-sim-view-outside.png)

If that sounds (and looks) good to you, then read on!

# Table of Contents

{{ ToC }}

# Part one: The prep work

As mentioned, we're going to have to do a bit of prep work before we can start writing the fun stuff, so let's get this done. We're going to implement three things:

1. An API server that talks directly to MSFS, and accepts web socket connections that can be used by API clients to interact with MSFS,
2. a web server that serves a webpage, and accepts web socket connections from the webpage, which it can forward to the API server, and
3. a web page with some code that connects it to the API (as far as it knows) using a web socket and can show the various aspects of a flight.

In high fidelity image media, we'll be implementing this:

<img src="./images/server/server-diagram.png" style="display: inline-block; zoom: 80%;" />

And as mentioned, to make our lives a little easier we're going to be using the [socketless](https://www.npmjs.com/package/socketless) library to take care of the actual client/server management, so we can just focus on writing the code that's going to let us show a user interface based on talking to MSFS. The nice thing about this library is that it does some magic that lets clients and servers call functions on each other "without knowing there's a network". If the server has a function called `test` then the client can just call `const testResult = await this.server.test()` and done, as far as the client knows, the server is just a local variable. Similarly, if the client has a function called `test` then server can call that with a `const testResult = await this.clients[...].test()` and again, as far as the server knows it's just working with a local variable.

## Setting up our project

Let's start by creating a new dir somewher called `are-we-flying` and initialising it as a Node project:

```bash
> mkdir are-we-flying
> cd are-we-flying
are-we-flying> npm init -y
```

after which we can install the dependencies that we'll need: [dotenv](https://www.npmjs.com/package/dotenv), [open](https://www.npmjs.com/package/open), [socketless](https://www.npmjs.com/package/socketless), and [msfs-simconnect-api-wrapper](https://www.npmjs.com/package/msfs-simconnect-api-wrapper).

```bash
> npm i dotenv open socketless msfs-simconnect-api-wrapper
```

Then, we want to make sure to tell Node that we we'll be writing normal, modern JS with JS modules, rather than Node's legacy module system: open `package.json` and add the key/value pair `"type": "module"` .

## An .env file

Next up, we'll create a file called `.env` that will house a few variables that we want to be using across all our code:

```env
WEB_PORT=3000
API_PORT=8080
```

Nothing fancy, just two port numbers for now.

## A "socketless" API, and web servers

Before we look at the "real" code we want to write, let's quickly run through the "boilerplate" code we need to run our API server, which we'll put in `api-server.js`:

```js
// First we load our .env file:
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/.env` });

// And get our API server's port from that environment:
const { API_PORT } = process.env;

// Then we set up socketless so it can do its thing:
import { createServer } from "socketless";
import { ServerClass } from "./src/classes/index.js";

// Where "its thing" is creating an API server instance:
const { webserver } = createServer(ServerClass);

// Which we then run like you would any other Node server.
webserver.listen(API_PORT, () => {
  console.log(`Server listening on http://localhost:${API_PORT}`);
});
```

And that's all the code we need to set up a server (ignoring the actualy `ServerClass`, which we'll look at in a bit). So next up is the code required to run the "web server" part of our above diagram, which we'll put in `web-server.js`:

```js
// We start the same was as above:
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/.env` });

// Instead of "just a server" our web server will act as a client
// to our API server, but as web server for browsers that try to
// connect. As such we need to know both the port for our API server
// as well as what port we should use for our own server:
const { API_PORT, WEB_PORT } = process.env;

// Then we set up a socketless client with "browser connection" functionality:
import { ClientClass } from "./src/classes/index.js";
import { createWebClient } from "socketless";

// Clients need to know which URL to find the server at:
const serverURL = `http://localhost:${API_PORT}`;

// And web clients need to know which directory/folder to serve static content from:
const dir = `${__dirname}/public`;

// Which means we can now create our "web-enabled client":
const { clientWebServer } = createWebClient(ClientClass, serverURL, dir);

// And then we run its web server the same way we ran the API server:
clientWebServer.listen(WEB_PORT, () => {
  console.log(`Server listening on http://localhost:${WEB_PORT}`);

  // With an extra bit that automatically opens a browser for us:
  if (process.argv.includes(`--browser`)) {
    import("open").then(({ default: open }) => {
      open(`http://localhost:${WEB_PORT}`);
    });
  }
});
```

So a tiny bit more code, but that's all we need to do in terms of setting up our "API server ↔ client ↔ browser" constellation. The `socketless` library takes care of all of that so we can focus on actually implementing the code we _care_ about. And on that note, let's look at that code because we have two classes to implement:

1. the server class, which will be our interface between MSFS and our clients, and
1. the client class, which will be our interface between the server and the browser.

### But first, some testing!

Before we implement those though, let's verify that the code we wrote even works by implementing some tiny client and server classes with just enough code to show connections and function calls to work. Let's create a `src/classes/index.js` with "dummy" client and server classes:

```js
// Our client class will announce its own connection, as well as browser connections:
export class ClientClass {
  // nothing special going on here, just a console log
  onConnect() {
    console.log(`[client] We connected to the server!`);
  }
  // and nothing special going on here either, just more console log
  onBrowserConnect() {
    console.log(`[client] A browser connected!`);
  }
}

// Our server class will also announce that it got client connections:
export class ServerClass {
  // still nothing special going on here...
  onConnect(client) {
    console.log(`[server] A client connected!`);
  }
  // ...but we do add a little test function that clients can call:
  async test() {
    console.log(`[server] test!`);
    return "success!";
  }
}
```

Then, to add the browser into the mix, we'll also create a quick `public/index.html` file:

```html
<!DOCTYPE html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <title>Let's test our connections!</title>
    <script src="js/index.js" type="module" async></script>
  </head>
  <body>
    <!-- we only need to look at the developer tools "console" tab for now -->
  </body>
</html>
```

And then a bare minimum amount of browser JS in `public/js/index.js`:

```javascript
// We don't need to put a "socketless.js" in our public dir,
// this is a "magic import" that works when we're connected
// to a socketless web server:
import { createBrowserClient } from "../socketless.js";

// Then we set up our browser client to announce its connections:
class BrowserClient {
  async init() {
    console.log(`[browser] We're connected to our web client!`);

    // And then as part of startup, we'll call the server's
    // test function, just to confirm that works:
    console.log(`Calling test:`, await this.server.test());
  }
}

// Then the only thing left to do in the browser is to create a browser client instance:
createBrowserClient(BrowserClient);
```

And that's it, we just implemented a full server + client + browser constellation!

So let's run `node api-server.js` in a terminal, and `node web-server.js --browser` in another. Doing so will show us the following text in the server terminal:

```
...> node api-server.js
Server listening on http://localhost:8080
[server] A client connected!
[server] test!
```

And will show us the following in the client terminal:

```
...> node web-server.js --browser
Server listening on http://localhost:3000
Opening a browser...
[client] We connected to the server!
[client] A browser connected!
```

And, because the `--browser` flag opened a browser, if we look at the browser's developer tools' `console` tab, we see:

```
[browser] We're connected to our web client!                            index.js:9:17
Calling test: success!
```

Awesome, we have a complete API server + web server + browser thin client and "things just work™", we didn't have to write a single line of websocket or remote function calling code!

## Our API server

Let's finish up the basics.

Our server is where we "talk to MSFS", and any functions that we expose on the server class will end up being a function that, as far as clients know, is just part of their local `this.server` object, so we'll want to make sure to keep things that should not be directly accessible to clients either out of the serverclass (i.e. declare and initialize them in module scope instead) or mark them as private using the `#` character, so that they can't be called by anyone else.

With that in mind, let's write a _real_ server clas, in its own `src/classes/server/server.js` file instead, so we're not mixing client and server code:

```js
// Load the environment:
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../../.env` });

// And get the "how frequentlu to poll" from theÏ environment.
const POLLING_INTERVAL = process.env.POLLING_INTERVAL ?? 2500;

// Then, an import for a setTimeout that ignores throws:
import { runLater } from "../../utils/utils.js";

// And two helper functions for setting up the API connection:
import { connectServerToAPI, registerWithAPI } from "./helpers.js";

// Plus a helper that we can expose as `this.api` for clients to work with:
import { APIRouter } from "./routers/api-router.js";

// And then the most important import: the MSFS connector
import { MSFS_API } from "msfs-simconnect-api-wrapper";

// In order to prevent clients from directly accessing the MSFS
// connector, we're going to make it a global (to our module):
let api = false;

// Next up, our server class:
export class ServerClass {
  async init() {
    const { clients } = this;

    // set up the API variable - note that because this is a global,
    // clients can't directly access the API. However, we'll be setting
    // up some API routing to make that a non-issue in a bit.
    api = new MSFS_API();

    // Set up call handling for API calls: this will be explained after we
    // finish writing this class. We bind it as `this.api` so that any
    // client will be able to call `this.server.api...` and have things work.
    this.api = new APIRouter(api);

    // Then wait for MSFS to come online
    connectServerToAPI(api, async () => {
      console.log(`Connected to MSFS.`);

      registerWithAPI(clients, api);
      clients.forEach((client) => client.onMSFS(true));

      // And when it's online and we're connected, start polling for when we're "in game".
      (async function poll() {
        // We'll look at what actually goes here once we have everything in place.
        // For now, we just schedule a poll 
        runLater(poll, POLLING_INTERVAL);
      })();
    });
  }

  /**
   * Then a minimum amount of code for When a client connects to us,
   * and MSFS is already connected.
   */
  async onConnect(client) {
    if (api?.connected) client.onMSFS(true);
  }
}
```

So let's look at those secondary imports: first, the simplest one, in `src/utils/utils.js`:

```js
export function runLater(fn, timeoutInMillis) {
  // this is literally just setTimeout, but with a try/catch so
  // that if the function we're running throws an error, we
  // completely ignore that instead of crashing the server.
  setTimeout(() => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }, timeoutInMillis);
}
```

Then those helper functions for working with the API in `src/classes/server/helpers.js`

```javascript
// We'll grab the list of system events from the MSFS connector, so we can register for a few events:
import { SystemEvents } from "msfs-simconnect-api-wrapper";

// Then mostly for organizational purposes ("to keep the code clean")
// we house the actually MSFS API connection properties here.
export function connectServerToAPI(api, onConnect) {
  api.connect({
    autoReconnect: true,
    retries: Infinity,
    retryInterval: 5,
    onConnect,
    onRetry: (_, s) =>
      console.log(`Can't connect to MSFS, retrying in ${s} seconds`),
  });
}

// And since this is basically a "run once" thing we also house the code
// that registers for pause and crash events here.
export function registerWithAPI(clients, api) {
  console.log(`Registering API server to the general sim events.`);

  api.on(SystemEvents.PAUSED, () => {
    clients.forEach((client) => client.pause());
  });

  api.on(SystemEvents.UNPAUSED, () => {
    clients.forEach((client) => client.unpause());
  });

  api.on(SystemEvents.CRASHED, () => {
    clients.forEach((client) => client.crashed());
  });

  api.on(SystemEvents.CRASH_RESET, () => {
    clients.forEach((client) => client.crashReset());
  });
}
```

Which leaves the code that lets clients call API functions through the server

### The API Router 

The `APIRouter` code lets clients interface "directly" with MSFS through the SimConnect driver, with five main functions that we can expose to clients:

- register: register as event listener for one of the (few) "subscription" based MSFS event.
- forget: the opposite of register.
- get: a way to get the current value(s) for SimConnect variable(s).
- set: a way to set variable(s) to specific value(s).
- trigger: a way to trigger one of the (_many_) sim events.

So let's look at how we expose those to the client in a file that we'll call `src/classes/routes/api-router.js`:

```js
// Obviously we'll need to load the list of events if we're going to let clients register for events:
import { SystemEvents } from "msfs-simconnect-api-wrapper";

const eventTracker = {};

// And in order to cache GET requests, we're going to hash requests based on
// the varname collection we get passed, which we'll do by hashing.
import { createHash } from "node:crypto";

const resultCache = {};

// Since there is only one API instance, we can cache that 
// at the module level, just like in the server class.
let api;

export class APIRouter {
  // And then we bind that variable using the constructor:
  constructor(_api) {
    api = _api;
  }

  // Then, when clients call this.server.register(...), we:
  async register(client, ...eventNames) {
    if (!api.connected) return;
    eventNames.forEach((eventName) => this.#registerEvent(client, eventName));
  }

  // With a private function for registering events on the API:
  #registerEvent(client, eventName) {
    const tracker = (eventTracker[eventName] ??= { listeners: [] });

    // One that can response to custom "api server only" event requests:
    if (eventName === `MSFS`) {
      return client.onMSFS(api.connected);
    }

    // And has additional logic for making sure a client doesn't "double-register":
    if (tracker.listeners.includes(client)) {
      console.log(
        `Ignoring ${eventName} registration: client already registered. Current value: ${tracker.value}`
      );
      return false;
    }

    // When a client registers for a sim event like "SIM" or "FLIGHT_LOADED",
    // we assume we can call them back with event information on function
    // names like onSim and onFlightLoaded:
    const eventHandlerName =
      `on` +
      eventName
        .split(`_`)
        .map((v) => v[0].toUpperCase() + v.substring(1).toLowerCase())
        .join(``);
  
    // So: ask the API to register for this event, with an appropriate
    // bit of code to handle "what to do when SimConnect flags this event".
    if (!tracker.off) {
      tracker.off = api.on(SystemEvents[eventName], (...result) => {
        tracker.value = result;
        tracker.listeners.forEach((client) =>
          client[eventHandlerName](tracker.value)
        );
      });
    }
  }

  // And when clients call this.server.forget(...), we do the opposite:
  async forget(client, eventName) {
    if (!api.connected) return;
    const pos = eventTracker[eventName].listeners.findIndex(
      (c) => c === client
    );
    if (pos === -1) return;
    eventTracker[eventName].listeners.splice(pos, 1);
    if (eventTracker[eventName].listeners.length === 0) {
      eventTracker[eventName].off();
    }
  }

  // And when clients call this.server.get(...), we cache the set of simvars
  // that are being requested, so we don't ask SimConnect for the same data
  // several times, if several clients want the same information at the same time.
  async get(client, ...simVarNames) {
    if (!api.connected) return {};
    const now = Date.now();
    const key = createHash("sha1").update(simVarNames.join(`,`)).digest("hex");
    // assign a new expiry, if there is no cached entry already:
    resultCache[key] ??= { expires: now };
    // did our cached entry "expire"? (which, if we just made it, won't be the case of course)
    if (resultCache[key]?.expires <= now === true) {
      resultCache[key].expires = now + 100; // ms
      // we cache a promise, rather than data, so we can "await"
      resultCache[key].data = new Promise(async (resolve) => {
        try {
          resolve(await api.get(...simVarNames));
        } catch (e) {
          // Also make sure to never crash the server if there's a problem with a simvar:
          console.warn(e);
          resolve({});
        }
      });
    }
    // And then we await the cache entry's data before responding. If this is a 
    // request for data that was previously cached already, then this will pretty
    // much resolve instantly. Otherwise, it'll resolve once we get data from the API.
    return await resultCache[key].data;
  }

  // when clients call this.server.set(...), we forward that to the API:
  async set(client, simVars) {
    if (!api.connected) return false;

    if (typeof simVars !== `object`)
      throw new Error(`api.set input must be an object.`);

    // But we make sure to handle each setter separately, so we can
    // report any and all errors, without breaking the entire call.
    const errors = [];
    const entries = Object.entries(simVars);
    entries.forEach(([key, value]) => {
      try {
        api.set(key, value);
      } catch (e) {
        errors.push(e.message);
      }
    });
    return errors.length ? errors : true;
  }

  // And for triggers, we forward those too, but we only allow single triggers per call.Ï
  async trigger(client, eventName, value) {
    if (!api.connected) return false;
    api.trigger(eventName, value);
  }
}
```

Phew. That was a lot of code! But hopefully, it all made sense. Because we still have to look at our client class... which is going to be a _lot_ less code =)

## Our browser-connection-accepting client

In addition to our API server, we're going to need a client that is also a web server, so that we can connect a browser and actually, you know, _use_ all of this. This means we'll have to define a client class such that `socketless` can take care of the rest. Thankfully, this is super easy: our client doesn't need to "do" anything other than make sure that values make it from the server to the browser, and vice versa, so we're going to essentially be writing a state-manager, where the client takes signals from the server and turns them into updates to its `this.state` variable, and then `socketless` will take care of the tedious "making sure the browser gets that" parts. So: client class time! (which we put in its own `src/classes/client.js`)

```js
import { runLater } from "../../utils/utils.js";

// when we lose the connection to the server, this will be our reconnection interval:
const RECONNECT_TIMEOUT_IN_MS = 5000;

// A timeer variable for when we need to (re)try (re)connecting.
let reconnection;

/**
 * Our client class
 */
export class ClientClass {
  /**
   * When our client starts up, start a "reconnect 5 seconds
   * from now" attempt, cleaned up when we connect.
   */
  init() {
    this.#resetState();
    runLater(() => this.#tryReconnect(), RECONNECT_TIMEOUT_IN_MS);
  }

  /**
   * A private function that sets our state to a "starting default" state.
   */
  async #resetState() {
    // "setState" is a magic function that comes with socketless, and will
    // automatically lead to a browser sync, if there's a browser connected.
    this.setState({
      crashed: false,
      flying: false,
      MSFS: false,
      serverConnection: false,
      paused: true,
    });
  }

  /**
   * A private function that lets us reconnect to the server
   * in case it disappears and comes back online.
   */
  async #tryReconnect() {
    if (this.server) {
      clearTimeout(reconnection);
      return console.log(`reconnected`);
    }
    console.log(`trying to reconnect to the server...`);
    this.#resetState();
    this.reconnect(); // <- this is also a magic socketless function
    reconnection = setTimeout(
      () => this.#tryReconnect(),
      RECONNECT_TIMEOUT_IN_MS
    );
  }


  /**
   * The main role of our client is to encode a state that can be
   * automatically communicated to the browser. As such, really
   * the only thing we're doing si setting up a state, and then
   * updating that based on server signals.
   */
  async onConnect() {
    clearTimeout(reconnection);
    console.log(`client connected to server`);
    this.setState({
      serverConnection: true,
    });
    await this.server.api.register(`MSFS`);
  }

  /**
   * If we become disconnected from the server, go into a
   * "holding pattern" where we check whether the server
   * is back every few seconds.
   */
  async onDisconnect() {
    // First, since we obviously don't have a server anymore,
    // we won't be informed about whether or not we're still
    // flying, or really anything about the flight at all, so
    // record that we're not flying (anymore).
    this.setState({
      flying: false,
      MSFS: false,
      serverConnection: false,
    });
    // Then start the reconnect cycle
    this.#tryReconnect();
  }

  // Record that a connection has been established. Since the state
  // gets automatically synced at the browser, this means the browser
  // can also see that `this.state.connected` is true.
  async onBrowserConnect(browser) {
    this.setState({ browserConnected: true });
  }

  // And the opposite when the browser disconnects, of course:
  async onBrowserDisconnect(browser) {
    this.setState({ browserConnected: false });
  }

  // Then a set of self-explanatory functions based on events:
  async onMSFS(value) { this.setState({ MSFS: value }); }
  async pause() { this.setState({ paused: true }); }
  async unpause() { this.setState({ paused: false }); }
  async crashed() { this.setState({ crashed: true }); }
  async crashReset() { this.setState({ crashed: false }); }
}
```

With that, let's move on to the browser.

## The browser code

In order for the browser to be able to "do something", we'll use the `index.html` we made earlier without any modifications, but we'll update `index.js`:

```js
import { createBrowserClient } from "../socketless.js";

// Let's import a class that's *actually* going to do all the work...
import { Plane } from "./js/plane.js";

// And then we update our browser client, whose sole responsibility
// is to hand off state updates to our new "Plane" object:
class BrowserClient {
  async init() {
    this.plane = new Plane(this.server);
  }

  async update(prevState) {
    // set a class on the HTML body based on our connection state...
    document.body.classList.toggle(`connected`, this.state.serverConnection);
    
    // And then, ather than "doing anything" here, we just pass the current
    // state on to the Plane. All we do in this file is wait for the next update.
    this.plane.updateState(this.state);
  }
}

createBrowserClient(BrowserClient);
```

So that just leaves looking at our `Plane` code, which will minimal for now, andwe'll put in `public/js/plane.js`:

```js
// We'll be building this out throughout this document, but this
// will be our main entry point when it comes to what the browser
// shows in terms of both visualisation and interactivity.
export class Plane {
  constructor(server) {
    this.server = server;
    this.lastUpdate = {
      lat: 0,
      long: 0,
      flying: false,
      crashed: false,
    };
  }

  async updateState(state) {
    this.state = state;
    const now = Date.now();

    // ...nothing here yet, but we'll be filling this out in soon enough!
    
    this.lastUpdate = { time: now, ...state };
  }
}
```

And that's it. There's nothing "meaningful" in our plane class yet, but for the moment we're done: we've set up a complete API server, web server, and browser system.

## Adding "permission control"

That just leaves one last thing: making sure that only "we" get to talk to MSFS directly. We don't want people to just spam MSFS with API requests or even set values or trigger MSFS event and mess with our flight, or worse!

In order to do that, we first add three new keys to our `.env` file to act as a security key:

```sh
export API_PORT=8080
export WEB_PORT=3000
export FLIGHT_OWNER_KEY="dXNlcm5hbWVwYXNzd29yZA=="
export FLIGHT_OWNER_USERNAME=username
export FLIGHT_OWNER_PASSWORD=passwerd
```

Just a [base64](https://en.wikipedia.org/wiki/Base64) conversion of the string concatenation `"username" + "password"`... super secure! Of course, when we make our web page available, we'll want to make triple-sure that we change this key to something a little more secret-appropriate =)

Then, let's update our `server.js` class with a function that clients can call in order to authenticate:

```js
...

const { FLIGHT_OWNER_KEY } = process.env;

...

export class ServerClass {
  #authenticatedClients = [];
  
  async init() {
    const { clients } = this;

    api = new MSFS_API();

    // Set up call routing so that clients can call this.server.api.[...]
    // in order to talk directly to the API, but only allow this for
    // authenticated clients, rather than everyone:
    this.api = this.lock(
      new APIRouter(api),
      (client) => this.#authenticatedClients.includes(client)
    );

    connectServerToAPI(api, async () => {
      ...
    });
  }
                       
  ..

  /**
   * An almost trivially simple authentication function:
   */
  async authenticate(client, username, password) {
    // This should go without saying, but: don't do this in real
    // code. Use a proper, secure login solution, instead =)
    const hash = btoa(username + password);
    if (hash !== FLIGHT_OWNER_KEY) return false;
    console.log(`authenticated client ${client.id}`);
    this.#authenticatedClients.push(client);
    return true;
  }
}

```

With that, we can now make clients (and by extension, browsers) authenticate by having them call `this.server.authenticate(...)`, so let's make that work by updating our `client.js` so it loads that key (if it has access to it) and calls the authentication function:

```js
// Load in our environment variables now we have 
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: `${__dirname}/../../../.env` });

// Do we have a flight owner key that we need to authenticate with?
let username, password;
if (process.argv.includes(`--owner`)) {
  username = process.env.FLIGHT_OWNER_USERNAME;
  password = process.env.FLIGHT_OWNER_PASSWORD;
}

...

export class ClientClass {
  ...

  // The only update will be to our "onConnect", where we're
  // going to immediately try to authenticate with the server:
  async onConnect() {
    clearTimeout(reconnection);
    console.log(`client connected to server`);
    this.setState({
      // authenticate with the server, using our stored username and password:
      authenticated: await this.server.authenticate(username, password),
      serverConnection: true,
    });
    
    // Since API access is now restricted, make sure we only call it
    // when we know (or think we know) that we won't be rejected.
    if (this.state.authenticated) {
      await this.server.api.register(`MSFS`);
    }
  }

  ...
}
```

And that's our "authentication" added, so we have all the parts in place:

1. we can start up MSFS,
2. we can start up our API server using `node api-server.js`,
3. we can start up our web server using `node web-server.js --owner --browser`
4. we can have the browser open http://localhost:3000, and then
5. we can use a UI that's based on the current client state, with the option to get values from MSFS as well as set values and trigger events in MSFS as needed using the developer tools console.

## Testing our code

So, let's run this code and _actually_ talk to MSFS. First, let's make sure we have direct access to our browser client by updating our `index.js`:

```js
...

// Let's get a direct reference to our client so we can do some testing using our developer tools:
window.browserClient = createBrowserClient(BrowserClient);
```

As you can see the `createBrowserClient` returns the actual instance it builds. There's rarely a reason to capture that, but it can be _very_ useful for testing, like now!

Let's fire up MSFS and load up a plane on on a runway somewhere, run our API server, run our client with the `--browser` flag, and then let's open the developer tools in the browser and get to the "console" tab. While there, let's ask MSFS for some things:

```javascript
» await browserClient.server.api.get(
  `CATEGORY`,
  `DESIGN_CRUISE_ALT`,
  `DESIGN_TAKEOFF_SPEED`,
  `ENGINE_TYPE`,
  `IS_TAIL_DRAGGER`,
  `NUMBER_OF_ENGINES`,
  `TITLE`,
  `TOTAL_WEIGHT`,
  `TYPICAL_DESCENT_RATE`,
  `WING_SPAN`,
);
```

If we had loaded up a De Havilland DHC-2 "Beaver", we might get the following response:

```javascript
« ▼ Object {
  "CATEGORY": "Airplane",
  "DESIGN_CRUISE_ALT": 5000,
  "DESIGN_TAKEOFF_SPEED": 65,
  "ENGINE_TYPE": 0,
  "IS_TAIL_DRAGGER": 1,
  "NUMBER_OF_ENGINES": 1,
  "TITLE": "Blackbird Simulations DHC-2 Beaver Wheels N93E",
  "TOTAL_WEIGHT": 3954.932373046875,
  "TYPICAL_DESCENT_RATE": 16.66666666666665,
  "WING_SPAN": 48
}
```

Of course, none of these things have units, but that's what the [SimConnect documentation](https://docs.flightsimulator.com/html/Programming_Tools/SimVars/Simulation_Variables.htm) is for: the Beaver is designed to cruise at 5000 feet, take off at 65 knots, it has a two wheels up front and a little wibble wheel at the back (i.e. it's a "tail dragger"), it has one engine, which is a piston propeller (which we know by looking up the enum for engine type); it weighs 3955 pounds, has a wing span of 48 feet, and has a typical descent rate of 16.667 feet per second.

And of course, we can also ask for information that's relevant to our flight _right now_ rather than just asking about the plane in general. Say we actually took off and are cruising along, we can run:

```javascript
» await browserClient.server.api.get(
  `AIRSPEED_INDICATED`,
  `ELEVATOR_TRIM_PCT`,
  `PLANE_ALT_ABOVE_GROUND`,
  `PLANE_ALTITUDE`,
  `PLANE_BANK_DEGREES`,
  `PLANE_HEADING_DEGREES_MAGNETIC`,
  `PLANE_LONGITUDE`,
  `PLANE_LATITUDE`,
  `VERTICAL_SPEED`,
);
```

And this might give us something like:

```javascript
« ▼ Object {
  "AIRSPEED_INDICATED": 139.7057647705078,
  "ELEVATOR_TRIM_PCT": -0.33069596466810336,
  "PLANE_ALT_ABOVE_GROUND": 573.1917558285606,
  "PLANE_ALTITUDE": 996.7162778193412,
  "PLANE_BANK_DEGREES": -0.001284847042605199,
  "PLANE_HEADING_DEGREES_MAGNETIC": 4.539803629684118,
  "PLANE_LONGITUDE": -2.1609759665698802,
  "PLANE_LATITUDE": 0.8514234731618152,
  "VERTICAL_SPEED": 0.3496674597263333
}
```

This tells us our plane is flying over Vancouver Island at GPS coordinates -123.814803 longitude, 48.782971 latitude (both values reported in degrees radians by MSFS, not decimal degrees), with an air speed of about 140 knots (which is around 260kmh/161mph), flying at an altitude of almost 1000 feet (305m) above sea level, but really only about 573 feet (174m) above the ground. We can see that we're flying fairly straight (our "bank" angle is basically 0), with a heading of 260 degrees on the compass (given in radians again), and we can see that we're flying fairly straight in the vertical sense, too: the plane is currently moving up at about a third of a foot per second (so about 4", or 10cm, per second), which is well within "flying straight" limits.

We can trigger events, too:

```javascript
» await browserClient.server.api.get(`TAILWHEEL_LOCK_ON`);
» browserClient.server.api.trigger(`TOGGLE_TAILWHEEL_LOCK`);
» await browserClient.server.api.get(`TAILWHEEL_LOCK_ON`);
```

Which should result in:

```javascript
« ▼ Object {
  "TAILWHEEL_LOCK_ON": 0
}
« undefined
« ▼ Object {
  "TAILWHEEL_LOCK_ON": 1
}
```

And of course, we can listen for events. For example, we can write this:

```javascript
» browserClient.server.api.on(`CRASHED`, () => console.log(`...we crashed!`))
```

And now if we point our plane towards the ground and just let gravity do the rest (don't worry, it's just pixels, it's perfectly safe), eventually our flight will come to an abrupt stop, the MSFS screen will go black, and we'll get a little dialog telling us that we crashed... but if we look at the dev tools console for our web page, we'll also see this little gem:

```javascript
...we crashed!
```

Which means our crash event listener worked. So this is promising, we have a full loop!

## Hot-reloading to make our dev lives easier

Now, being able to write code is all well and good, but we're going to be _working on that code_ a lot, so it'd be nice if we don't constantly have to stop and restart the server for every line we change, and instead just have code changes kick in automatically when we save files. And while there isn't anything baked into JS to make that happen, with a bit of smart programming we can take advantage of filesystem watching, as we well as how `import` works, to make this happen for us. Anyway

We can, for instance, write a function that will selectively watch a single file for changes, and if it sees any, load the new code in, and then trigger an event handler for "whoever might need it" with the newly loaded code:

```javascript
// We'll be using Node's own file watch mechanism for this:
import { watchFile } from "node:fs";

// With some helpers for making sure we know where our files and modules live:
import { __root } from "./constants.js";
import { rootRelative } from "./utils.js";

export async function watch(basePath, modulePath, onChange) {
  const filePath = basePath + modulePath;
  const moduleURL = `file:///${filePath}`;

  // Step 1: don't run file-watching in production. Obviously.
  if (process.env.NODE_ENV === `production`) {
    return import(moduleURL);
  }

  // Next, get the current callstack, so we can report on
  // that when a file change warrants an update.
  const callStack = new Error().stack
    .split(`\n`)
    .slice(2)
    .map((v) => {
      return v
        .trim()
        .replace(`file:///${__root}`, `./`)
        .replace(/^at /, `  in `)
        .replace(/new (\S+)/, `$1.constructor`);
    })
    .join(`\n`)
    .replace(/\.constructor \(([^)]+)\)(.|[\n\r])*/, `.constructor ($1)`);

  // If we're not running in production, check this file for changes every second:
  watchFile(filePath, { interval: 1000 }, async () => {
    console.log(`Reloading module ${rootRelative(filePath)} at ${Date.now()}`);

    try {
      // If there was a change, re-import this file as an ES module, with a "cache busting" URL
      // that includes the current time stamp. Modules are cached based on their exact URL,
      // so adding a query argument that we can vary means we can "reimport" the code:
      const module = await import(`${moduleURL}?ts=${Date.now()}`);

      // Then we log the stack so we know where this reload was set up in our code:
      console.log(callStack);

      // To confirm to ourselves that a module was fully loaded as a "new module" we check
      // whether it has a `LOAD_TIME` constant that it set during load, and log what that
      // value is. Because it should be very close to our reload time.
      if (module.LOAD_TIME)
        console.log(`  Module-indicated load time is ${module.LOAD_TIME}`);

      // And then we run whatever code needs to run now that the module's been reloaded.
      onChange(module);
    } catch (e) {
      // Never crash the server just because someone saved a file with a typo.
      console.error(`\nWatcher could not load module: ${filePath}`);
      console.error(callStack);
      console.error(e);
    }
  });

  // then as part of the call, run an immediate load.
  return import(moduleURL);
}
```

With the extra imported bits, from `src/utils/constants.js`:

```javascript
// Get the directory that this file lives in:
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

// And then use that to figure out what the project root dir is:
import { join, resolve, sep, win32, posix } from "node:path";
export const __root = (resolve(join(__dirname, `..`, `..`)) + sep).split(win32.sep).join(posix.sep);
```

and `src/utils/utils.js`:

```javascript
import { win32, posix } from "node:path";

// Get a file's path relative to the project root directory
export function rootRelative(filepath) {
  return filepath.split(win32.sep).join(posix.sep).replace(__root, `./`);
}
```

The thing that makes this work is usually considered a memory leak: modules are cached based on their URL, and URL query arguments count towards URL "uniqueness", so by loading the module using a URL ending in `...?ts=${Date.now()}` we effectively load a separate, new module (this is known as "cache busting").

That sounds great, but because there is no mechanism for "unloading" modules is modern JS, every save-and-reload will effectively cause a new file to be loaded in, without the old file getting unloaded, so we're going to slowly fill up our memory... which would be a problem if our files weren't tiny compared to how much memory modern computers (or even cell phones for that matter), have. So this is going to be a non-issue, but it's still good to know about, and an _excellent_ idea to make sure it doesn't kick in for production code.

A more practical problem, though, is that we can no longer "just import something from a module", because imports are considered constants, with `import { x } from Y` being equivalent to declarig a `const x = ...`, so we can't "reimport" onto the same variable name. That would be a runtime error.

Instead, we need to be a little more clever about how we import code: we can use a top-level `await` to make the watcher load the module we want, and assign that to a mutable variable:

```javascript
// Get the url for "this script", since that's what relative imports will be relative to:
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

// Then import our watcher:
import { watch } from "./reload-watcher.js";

// Then, as mentioned above, we load our import as a mutable variable instead of "as an import":
let { Something } = await watch(__dirname, `some-module.js`, (lib) => {
  Something = lib.Something;
});
```

And while that's a bit more code, and requires an `await` (which is easy to forget!) now every time we edit `some-module.js` and save it, the watcher will reload that code for us and our `Something` variable will get updated. So that solved half of the reloading problem. The other half is making sure that if our module exports a class, that _instances_ of that class get updated, too, by taking advantage of how prototype inheritance works in JS.

Since objects don't have their type "baked in", but simply follow a chain of prototype objects, we can change one of those prototype objects and basically change the identity of the object itself. Normally, this would be a bad idea(tm) but in this specific case, it's exactly what we need to make sure that instances of any hot-reloadable classes we use get updated as part of the reload process:

```javascript
// We can set up our reload watcher to update not just the 
// variable for our class, but also instances of that class:
let { Something } = await watch(__dirname, `some-module.js`, (lib) => {
  // Update our class binding:
  Something = lib.Something;

  // And then update our class instance's prototype. This only works because
  // by the time this code runs, the "instance" variable will exist.
  if (instance) {
    Object.setPrototypeOf(instance, Something.prototype);
    // This swaps the old prototype for the new code, while leaving any
    // of the instance's own properties unaffected. Something that will be
    // particularly useful for changing autopilot code *while* we're flying!
  }
});

let instance = new Something();
```

# Part two: visualizing flights

Before we try to automate flight by writing an autopilot, it helps if we can know what "a flight" is. I mean, you and I know what a flight is, but computers not so much, especially when they can't even see your game, so let's figure out what information we need our code to know about before we can ask it to do the things we might want it to do.

## Checking the game data: what do we want to know?

There are two kinds of information that we'll want our code to know about: "static" information like the name of the plane we're flying, whether it has a tail wheel, how much it weighs, etc. and "dynamic information" like what lat/long the plane is current at, how fast it's going, what its current pitch angle is, etc. 

We can compile a list of properties that we're likely going to need in order to write our autopilot, and then request all those values from MSFS at a regular interval using SimConnect, so that we can then forward that information to our autopilot code, as well as all clients, and consequently, any connected browser.

### Getting game state data

So let's write some code that lets us relatively easily work with flight models and flight data. We'll create a `src/utils/flight-values.js` file, and then start with the list flight model values we'll want:

```js
export const FLIGHT_MODEL = [
  `CATEGORY`,
  `DESIGN_CRUISE_ALT`,
  `DESIGN_SPEED_CLIMB`,
  `DESIGN_SPEED_MIN_ROTATION`,
  `DESIGN_SPEED_VC`,
  `DESIGN_SPEED_VS0`,
  `DESIGN_SPEED_VS1`,
  `DESIGN_TAKEOFF_SPEED`,
  `ELEVATOR_TRIM_DOWN_LIMIT`,
  `ELEVATOR_TRIM_UP_LIMIT`,
  `ENGINE_TYPE`,
  `INCIDENCE_ALPHA`,
  `IS_GEAR_FLOATS`,
  `IS_GEAR_RETRACTABLE`,
  `IS_TAIL_DRAGGER`,
  `NUMBER_OF_ENGINES`,
  `PLANE_LATITUDE`,
  `PLANE_LONGITUDE`,
  `STALL_ALPHA`,
  `STATIC_CG_TO_GROUND`,
  `TITLE`,
  `TOTAL_WEIGHT`,
  `TYPICAL_DESCENT_RATE`,
  `WING_AREA`,
  `WING_SPAN`,
];

export const ENGINE_TYPES = [
  `piston`,
  `jet`,
  `none`,
  `helo(Bell) turbine`,
  `unsupported`,
  `turboprop`,
];
```

Do we need all that data? Surprisingly: yes! Almost all of these will let us either bootstrap our autopilot parameters, or will let us show things we're interested in on our web page.

Next up, our "things we want to know while we're actually flying" data:

```js
export const FLIGHT_DATA = [
  `AILERON_POSITION`,
  `AILERON_TRIM_PCT`,
  `AIRSPEED_INDICATED`,
  `AIRSPEED_TRUE`,
  `AUTOPILOT_HEADING_LOCK_DIR`,
  `AUTOPILOT_MASTER`,
  `CAMERA_STATE`,
  `CAMERA_SUBSTATE`,
  `CRASH_FLAG`,
  `CRASH_SEQUENCE`,
  `ELECTRICAL_AVIONICS_BUS_VOLTAGE`,
  `ELECTRICAL_TOTAL_LOAD_AMPS`,
  `ELEVATOR_POSITION`,
  `ELEVATOR_TRIM_PCT`,
  `ELEVATOR_TRIM_POSITION`,
  `ENG_COMBUSTION:1`,
  `ENG_COMBUSTION:2`,
  `ENG_COMBUSTION:3`,
  `ENG_COMBUSTION:4`,
  `GEAR_POSITION:1`,
  `GEAR_SPEED_EXCEEDED`,
  `GROUND_ALTITUDE`,
  `INDICATED_ALTITUDE`,
  `OVERSPEED_WARNING`,
  `PLANE_ALT_ABOVE_GROUND_MINUS_CG`,
  `PLANE_ALT_ABOVE_GROUND`,
  `PLANE_BANK_DEGREES`,
  `PLANE_HEADING_DEGREES_MAGNETIC`,
  `PLANE_HEADING_DEGREES_TRUE`,
  `PLANE_LATITUDE`,
  `PLANE_LONGITUDE`,
  `PLANE_PITCH_DEGREES`,
  `RUDDER_POSITION`,
  `RUDDER_TRIM_PCT`,
  `SIM_ON_GROUND`,
  `TURN_INDICATOR_RATE`,
  `VERTICAL_SPEED`,
];
```

This also looks like a lot of data, but we really do need every single one of these values if we're going to implement an autopilot.

### Converting SimConnect values

But: this does leave us with a problem: SimConnect isn't really all that fussy about making sure every single value uses a unit that makes sense, or that collections of variables all use the same unit, so we're in a situation where something like `PLANE_BANK_DEGREES`, which you would expect to be a number in degrees, is actually a number in radians. And `AIRSPEED_TRUE` is in knots, so surely `DESIGN_SPEED_CLIMB` is in knots, too, right? Nope, that's in feet per second. Which means `DESIGN_SPEED_VS1` is in feet per second, too? Haha, no, that one _is_ in knots, but "knots indicated", so not a real speed, but what the dial in the cockpit shows on the speed gauge. Oh, and: boolean values aren't true or false, they're 1 or 0.

It's all a bit of a mess, so let's write some code to take of all this nonsense and make sure values are in units we can rely on, because if we don't it's just going to be a huge headache:

```js
// These are all degree values that are actually stored as radians.
export const DEGREE_VALUES = [
  `PLANE_LATITUDE`,
  `PLANE_LONGITUDE`,
  `PLANE_BANK_DEGREES`,
  `PLANE_HEADING_DEGREES_MAGNETIC`,
  `PLANE_HEADING_DEGREES_TRUE`,
  `PLANE_PITCH_DEGREES`,
  `STALL_ALPHA`,
  `TURN_INDICATOR_RATE`,
];

// These are all boolean values that are stored as a number.
export const BOOLEAN_VALUES = [
  `AUTOPILOT_MASTER`,
  `ENG_COMBUSTION:1`,
  `ENG_COMBUSTION:2`,
  `ENG_COMBUSTION:3`,
  `ENG_COMBUSTION:4`,
  `IS_GEAR_FLOATS`,
  `IS_GEAR_RETRACTABLE`,
  `IS_TAIL_DRAGGER`,
  `GEAR_POSITION:1`,
  `GEAR_SPEED_EXCEEDED`,
  `OVERSPEED_WARNING`,
  `SIM_ON_GROUND`,
];

// These are percentages, but stored as "percent divided by 100"
export const PERCENT_VALUES = [
  `AILERON_POSITION`,
  `AILERON_TRIM_PCT`,
  `ELEVATOR_POSITION`,
  `ELEVATOR_TRIM_PCT`,
  `RUDDER_POSITION`,
  `RUDDER_TRIM_PCT`,
];

// In game, vertical speed is shown feet per minute,
// but SimConnect reports it as feet per second...
export const FPM_VALUES = [`VERTICAL_SPEED`];

// Plane altitude is in feet, so why is ground altitude in meters?
export const MTF_VALUES = [`GROUND_ALTITUDE`];

// And finally, please just turn all of these into
// values in knots instead of feet per second...
export const KNOT_VALUES = [
  `DESIGN_SPEED_MIN_ROTATION`,
  `DESIGN_SPEED_CLIMB`,
  `DESIGN_SPEED_VC`,
];
```

We can pair this with a function that runs through a bunch of rewrites for each of the categories, to give us values to work with that actually make sense:

```js
import { FEET_PER_METER, FPS_IN_KNOTS } from "./constants.js";
import { exists } from "./utils.js";

const noop = () => {};

export function convertValues(data) {
  // Convert values to the units they're supposed to be:
  BOOLEAN_VALUES.forEach((p) => exists(data[p]) ? (data[p] = !!data[p]) : noop);
  DEGREE_VALUES.forEach((p) => exists(data[p]) ? (data[p] *= 180 / Math.PI) : noop);
  PERCENT_VALUES.forEach((p) => (exists(data[p]) ? (data[p] *= 100) : noop));
  FPM_VALUES.forEach((p) => exists(data[p]) ? (data[p] *= 60) : noop);
  KNOT_VALUES.forEach((p) => exists(data[p]) ? (data[p] *= FPS_IN_KNOTS) : noop);
  MTF_VALUES.forEach((p) => exists(data[p]) ? (data[p] *= FEET_PER_METER) : noop);
  if (exists(data.ENGINE_TYPE)) data.ENGINE_TYPE = ENGINE_TYPES[data.ENGINE_TYPE];
}
```

In this code, the contants that we import have the values 364000, 3.28084, and 1/1.68781, respectively, and the `exists` function is just a tiny function that checks whether a value is either `undefined` or `null`, because we want to overwrite a value if it exist, rather than if it doesn't exist, and there is no opposite of the `??=` operator.

Which leaves one more thing: calming all those words down a little, because working with `PLANE_ALT_ABOVE_GROUND_MINUS_CG` or `AUTOPILOT_HEADING_LOCK_DIR` is something we _could_ do, but it would be a heck of a lot nicer if those things had normal names that followed standard JS naming conventions.

So let's write _even more utility code_ to take care of that for us:

```js
export const NAME_MAPPING = {
  AILERON_POSITION: `aileron`,
  AILERON_TRIM_PCT: `aileronTrim`,
  AIRSPEED_INDICATED: `speed`,
  AIRSPEED_TRUE: `trueSpeed`,
  AUTOPILOT_HEADING_LOCK_DIR: `headingBug`,
  AUTOPILOT_MASTER: `MASTER`,
  CAMERA_STATE: `camera`,
  CAMERA_SUBSTATE: `cameraSub`,
  CATEGORY: `category`,
  CRASH_FLAG: `crashed`,
  CRASH_SEQUENCE: `crashSequence`,
  DESIGN_CRUISE_ALT: `cruiseAlt`,
  DESIGN_SPEED_CLIMB: `climbSpeed`,
  DESIGN_SPEED_MIN_ROTATION: `minRotation`,
  DESIGN_SPEED_VC: `cruiseSpeed`,
  DESIGN_SPEED_VS0: `vs0`,
  DESIGN_SPEED_VS1: `vs1`,
  DESIGN_TAKEOFF_SPEED: `takeoffSpeed`,
  ELECTRICAL_AVIONICS_BUS_VOLTAGE: `busVoltage`,
  ELECTRICAL_TOTAL_LOAD_AMPS: `ampLoad`,
  ELEVATOR_POSITION: `elevator`,
  ELEVATOR_TRIM_DOWN_LIMIT: `trimDownLimit`,
  ELEVATOR_TRIM_PCT: `pitchTrim`,
  ELEVATOR_TRIM_POSITION: `trimPosition`,
  ELEVATOR_TRIM_UP_LIMIT: `trimUpLimit`,
  ENGINE_TYPE: `engineType`,
  "GEAR_POSITION:1": `isGearDown`,
  GEAR_SPEED_EXCEEDED: `gearSpeedExceeded`,
  GROUND_ALTITUDE: `groundAlt`,
  INDICATED_ALTITUDE: `alt`,
  IS_GEAR_FLOATS: `isFloatPlane`,
  IS_GEAR_RETRACTABLE: `hasRetractibleGear`,
  IS_TAIL_DRAGGER: `isTailDragger`,
  NUMBER_OF_ENGINES: `engineCount`,
  OVERSPEED_WARNING: `overSpeed`,
  PLANE_ALT_ABOVE_GROUND_MINUS_CG: `lift`,
  PLANE_ALT_ABOVE_GROUND: `altAboveGround`,
  PLANE_BANK_DEGREES: `bank`,
  PLANE_HEADING_DEGREES_MAGNETIC: `heading`,
  PLANE_HEADING_DEGREES_TRUE: `trueHeading`,
  PLANE_LATITUDE: `lat`,
  PLANE_LONGITUDE: `long`,
  PLANE_PITCH_DEGREES: `pitch`,
  RUDDER_POSITION: `rudder`,
  RUDDER_TRIM_PCT: `rudderTrim`,
  SIM_ON_GROUND: `onGround`,
  STATIC_CG_TO_GROUND: `cg`,
  STALL_ALPHA: `stallAlpha`,
  TITLE: `title`,
  TOTAL_WEIGHT: `weight`,
  TURN_INDICATOR_RATE: `turnRate`,
  TYPICAL_DESCENT_RATE: `descentRate`,
  VERTICAL_SPEED: `VS`,
  WING_AREA: `wingArea`,
  WING_SPAN: `wingSpan`,
};

export function renameData(data) {
  Object.entries(data).forEach(([simName, value]) => {
    const jsName = NAME_MAPPING[simName];

    if (jsName === undefined) return;
    if (!exists(data[simName])) return;

    data[jsName] = value;
    delete data[simName];
  });
}
```

And that's us nearly here. However, SimConnect typically only serves up "values" and if we're going to write an autopilot, we generally also care the _change_ in certain values over time. For instance, just knowing our current vertical speed doesn't tell us whether we're ascending or descending, and just knowing that we're turning at 3 degrees per second  _right now_ doesn't tell us anything about whether we're about to spiral out of control or whether we're about to stop turning entirely. 

So we need a little bit of extra code to track the "delta" values for some of the flight properties we listed earlier:

```js
// Our list of "first derivatives", i.e. our deltas
export const DERIVATIVES = [
  `bank`,
  `heading`,
  `lift`,
  `pitch`,
  `speed`,
  `trueHeading`,
  `trueSpeed`,
  `turnRate`,
  `VS`,
];

// And our single "second derivative":
export const SECOND_DERIVATIVES = [`VS`];

// And then an update to the `rebind` function:
export function renameData(data, previousValues) {
  // Whether or not we have previous values for delta computation,
  // just preallocate the values we _might_ need for that.
  const d = {};
  const now = Date.now();
  const before = previousValues?.__date_time ?? now;
  const dt = (now - before) / 1000; // delta per second seconds

  // Then perform the name mapping, but with extra code for getting
  // our "delta" values, which we'll add into a `.d` property.
  Object.entries(data).forEach(([simName, value]) => {
    const jsName = NAME_MAPPING[simName];

    if (jsName === undefined) return;
    if (!exists(data[simName])) return;

    data[jsName] = value;
    delete data[simName];

    // Do we need to compute derivatives?
    if (previousValues && DERIVATIVES.includes(jsName)) {
      const previous = previousValues[jsName];
      if (typeof previous !== `number`) return;
      const current = data[jsName];
      d[jsName] = (current - previous) / dt;

      // ...do we need to compute *second* derivatives?
      if (SECOND_DERIVATIVES.includes(jsName)) {
        d.d ??= {};
        const previousDelta = previousValues.d?.[jsName] ?? 0;
        d.d[jsName] = d[jsName] - previousDelta;
      }
    }
  });

  // If we did delta computation work, save the result:
  if (previousValues) {
    data.__date_time = now;
    data.d = d;
  }
}
```

Well that only took forever...

### Our `FlightInformation` object

And we still need to write the actual code that actually pulls this data from SimConnect to keep us up to date. Thankfully, with all the above work completed, that part is nowhere near as much work. First, we write a `FlightInformation` object to wrap all those values and functions:

```js
import {
  FLIGHT_MODEL,
  FLIGHT_DATA,
  convertValues,
  renameData,
} from "./flight-values.js";

let api;

export class FlightInformation {
  constructor(_api) {
    api = _api;
    this.reset();
  }

  reset() {
    this.model = false;
    this.data = false;
    this.general = {
      flying: false,
      inGame: false,
      moving: false,
      planeActive: false,
    };
  }

  // We'll have three update functions. Two for the two types
  // of data, and then this one, which is a unified "call both":
  async update() {
    try {
      if (!api.connected) throw new Error(`API not connected`);
      await Promise.all([this.updateModel(), this.updateFlight()]);
    } catch (e) {
      console.warn(e);
    }
    return this;
  }

  // Then our "update the model" code:
  async updateModel() {
    const data = await api.get(...FLIGHT_MODEL);
    if (!data) return (this.flightModel = false);

    // Make sure to run our quality-of-life functions:
    convertValues(data);
    renameData(data);

    // Create a convenience value for trimming
    data.pitchTrimLimit = [data.trimUpLimit ?? 10, data.trimDownLimit ?? -10];
    return (this.model = data);
  }

  // And our "update the current flight information" code:
  async updateFlight() {
    const data = await api.get(...FLIGHT_DATA);
    if (!data) return (this.data = false);
    // Make sure to run our quality-of-life functions here, too:
    convertValues(data);
    renameData(data, this.data);

    // Create a convenience value for "are any engines running?",
    // which would otherwise require checking four separate variables:
    data.enginesRunning = [1, 2, 3, 4].reduce(
      (t, num) => t || data[`ENG_COMBUSTION:${num}`],
      false
    );

    // Create a convenience value for "is the plane powered on?",
    // which would otherwise require checking two variables:
    data.hasPower = data.ampLoad !== 0 || data.busVoltage !== 0;

    // And create a convenience value for compass correction:
    data.declination = data.trueHeading - data.heading;

    // Then update our general flight values and return;
    this.setGeneralProperties(data);
    return (this.data = data);
  }

  // The general properties are mostly there so we don't have to
  // constantly derive them on the client side:
  setGeneralProperties(data) {
    const { onGround, hasPower, enginesRunning, speed, camera } = data;
    const inGame = 2 <= camera && camera < 9;
    const flying = inGame ? !onGround : false;
    const moving = inGame ? speed > 0 : false;
    const planeActive = inGame ? hasPower || enginesRunning : false;
    Object.assign(this.general, { flying, inGame, planeActive, moving });
  }
}
```

And then, as last step, we now need to make the server actually use this object, and make sure that clients can receive it. So, on the server side:

```js
...

// Import our hot-reloader
import { watch } from "../../utils/reload-watcher.js";

// Import our fancy new class, in a way that lets us hot-reload it:
let flightInformation;
let { FlightInformation } = await watch(
  __dirname,
  `../../utils/flight-information.js`,
  (module) => {
    FlightInformation = module.FlightInformation;
    if (flightInformation) {
      Object.setPrototypeOf(flightInformation, FlightInformation.prototype);
    }
  }
);

class Server {
  ...

  async init() {
    ...
    connectServerToAPI(api, async () => {
      console.log(`Connected to MSFS.`);

      // Set up a flight information object for pulling
      // model and flight data from SimConnect:
      flightInformation = new FlightInformation(api);

      registerWithAPI(clients, api, autopilot);
      clients.forEach((client) => client.onMSFS(true));

      (async function poll() {
        // And make sure to pass this into our game check.
        checkGameState(clients, flightInformation);
        runLater(poll, POLLING_INTERVAL);
      })();
    });
  }


  async onConnect(client) {
    if (api?.connected) client.onMSFS(true);
    // When clients connect, immediately send them the most up to date
    // flight information, if the flightInformation object has been
    // initialized, of course.    
    if (flightInformation) {
      client.setFlightInformation(flightInformation);
    }
  }
}
```

With the `flightInformation` added to the `checkGameState` function we created earlier in the helpers file:

```javascript
// get the most up to date game state and send that over to our clients:
export async function checkGameState(clients, flightInformation) {
  await flightInformation.update();
  clients.forEach((client) => client.setFlightInformation(flightInformation));
}
```

And then we add the `setFlightInformation` function to the client class, to close the loop:

```js
...

export class ClientClass {
  ...

  // our base state now includes the flightinformation properties:
  #resetState() {
    this.setState({
      ...
      flightInformation: {}
    });
  }

  ...

  async setFlightInformation(flightInformation) {
    // Just straight-up copy all the flight information state
    // values, which will then automatically update any browser
    // that's connected, as well.
    this.setState({ flightInformation });
  }
}
```

Well that only took forever, but we can finally get back to _&lt;checks notes&gt;_ ticking a few HTML checkboxes?

## Showing the game data

We know when we're connected to MSFS, so let's write a few functions that let us cascade through the various stages of the game before we get to "actually controlling a plane". Let's start with what we want that to look like:

![so many questions](./images/page/questions.png)

Nothing particularly fancy (although we can pretty much use any amount of CSS to turn it _into_ something fancy), but it lets us see where in the process of firing up MSFS, clicking through to the world map, and starting a flight we are. So let's update our HTML file to include these questions, and then we can update our JS to start answering them:

```html
<link rel="stylesheet" href="css/questions.css" />
<li>
  Is our API server running? <input type="checkbox" disabled class="server-online" />
</li>
<li>
  Is MSFS running? <input type="checkbox" disabled class="msfs-running" />
</li>
<li>
  Which plane did we pick? <span class="specific-plane">... nothing yet?</span>
</li>
<li>
  Are we actually "in a game"? <input type="checkbox" disabled class="in-game" />
</li>
<li>
  Do we have power? <input type="checkbox" disabled class="powered-up" />
</li>
<li>
  Are the engines running? <input type="checkbox" disabled class="engines-running" />
</li>
<li>
  Are we flying?? <input type="checkbox" disabled class="in-the-air" />
</li>
<li>
  <em>Where</em> are we flying?
  <a href="." class="gmaps-link">
    <span class="latitude">-</span>,
    <span class="longitude">-</span>
  </a>
</li>
<li>
  Are we on the in-game autopilot? <input type="checkbox" disabled class="using-ap" />
</li>
<li>
  (... did we crash? <input type="checkbox" disabled class="plane-crashed" />)
</li>
```

Excellent: boring, but serviceable, so let's add a parent for that in our `index.html`:

```html
<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <title>Let's test our connections!</title>
    <script src="js/index.js" type="module" async></script>
  </head>
  <body>
    <h1>Are we flying?</h1>
    <p>
      Let's see if we're currently flying around in Microsoft Flight Simulator 2020...
    </p>
    <ul>    
    <ul id="questions" data-description="Templated from questions.html"></ul>
  </body>
</html>
```

And create a little CSS file in `public/css/questions/css`:

```css
#questions {
  list-style: none;
  margin: 1em;
  padding: 0;
  text-indent: 0;
}
#questions li { display: block; }
#questions li:before { content: "-"; }
```

Then let's move on to the JS side! First let's write a little convenience file called `questions.js` that we're going to use to (un)check these questions, based on the fact that we have access to the web client's state:

```javascript
const content = await fetch("questions.html").then((res) => res.text());
const questions = document.getElementById(`questions`);
questions.innerHTML = content;

// The query selectors for our elements:
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

// A bit of house-keeping
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

// Let's create an object that's { serverOnline: span, msfsRunning: span, ... }
// because that'll make it easier to set text and check checkboxes:
const elements = Object.fromEntries(
  qss.map((e) => {
    const propName = reCase(e);
    return [propName, document.querySelector(`.${e}`)];
  })
);

// And then our questions helper: we're simply going to set every checkbox
// based on what's in the current state, only spending a little more time
// on the plane model, and mostly because we want the right "a" vs. "an"
// depending on whether the title starts with a vowel or not:
export const Questions = {
  update(state) {
    const {
      general,
      model: flightModel,
      data: flightData,
    } = state.flightInformation;
    elements.serverOnline.checked = !!state.serverConnection;
    elements.msfsRunning.checked = state.MSFS;
    elements.inGame.checked = general?.inGame;
    elements.poweredUp.checked = flightData?.hasPower;
    elements.enginesRunning.checked = flightData?.enginesRunning;
    elements.inTheAir.checked = general?.flying;
    elements.usingAp.checked = flightData?.MASTER;
    elements.planeCrashed.checked = state.crashed;
    // And we'll do these two separately because they're a bit more than just a check mark:
    this.whereAreWeFlying(flightData);
    this.modelLoaded(flightModel?.title);
  },

  whereAreWeFlying(flightData) {
    const lat = flightData?.lat?.toFixed(6);
    const long = flightData?.long?.toFixed(6);
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
```

Cool! Of course, this does nothing yet, so let's plug it into our `plane.js` so that we can run through our sequence of "where in the game we are" as part of the update call:

```javascript
...
import { Questions } from "./questions.js";

export class Plane {
  ...

  async updateState(state) {
    this.state = state;
    const now = Date.now();

    // Update our questions:
    Questions.update(state);

    this.lastUpdate = { time: now, ...state };
  }
}
```

And that's the "game state" read-back sorted out! Easy-peasy!

### Trying our question list out

So: let's tick some HTML checkboxes!

- Start MSFS,
- then up the server with `node api-server.js` and our client with `node web-server.js --browser` ,
- then look at what happens in the browser as MSFS finished starting up.
- Load up a plane on a runway somewhere, and see what happens.
- Load up a plane mid-flight and see what the checkboxes do! And of course,
- look at what happens when you shut down MSFS, and what happens when you shut down the API server _before_ you shut down the web client.

So, on the one hand: _that was a LOT of work just to check some boxes_! But the upside is that with all of that work out of the way, we're done in terms of "making sure we have up to date information to work with": all we need to do is call our flight information `update` function on the server side, and hook into our Plane's `updateState` function on the browser side from now on, and that's going to make things like running autopilot code and showing flight visualizations a lot easier.

And speaking of visualizations...

## Putting our plane on the map

Even with all that work done, we've still only implemented page code that lets us answer a bunch of questions, but that's hardly the only thing we'll want to see on our page. Let's add something that let's us actually see something _cool_ on our webpage: let's set up a [Leaflet](https://leafletjs.com/) map that we can put our plane on, so we can see ourselves flying around on a map.

Step one: update our `index.html` to make that work, including downloading Leaflet and putting it in `public/js/leaflet`. We _could_ run it from CDN, using something like this:

```html
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" async />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js" defer async></script>
```

And I encourage you to give that a try, but if we do, Leaflet takes "forever" to load, as opposed to loading near instantly if we save and use a local copy, so: download the .js and .css files from the above CDN links, and put them in our own leaflet dir, and then lets add them to our `index.html` as:

```html
<!DOCTYPE html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <title>Let's test our connections!</title>
    <!-- we'll load Leaflet from CDN -->
    <link rel="stylesheet" href="js/leaflet/leaflet.min.css" async />
    <script src="js/leaflet/leaflet.min.js" defer async></script>
    <!-- and then our own script -->
    <script src="js/index.js" type="module" async></script>
  </head>
  <body>
    <h1>Are we flying?</h1>
    <p>
      Let's see if we're currently flying around in Microsoft Flight Simulator
      2020...
    </p>
    <ul id="questions" data-description="Templated from questions.html"></ul>
    <div id="visualization">
      <!-- Then we'll hook Leaflet into the following div: -->
      <div id="map" style="width: 1200px; height: 800px"></div>
    </div>
  </body>
</html>
```

And then let's write a `public/js/map.js` that we can import to take care of the map for us:

```javascript
import { waitFor } from "./utils.js";

export const DUNCAN_AIRPORT = [48.7566, -123.71134];

// Leaflet creates a global "L" object to work with, so use that to tie into the <div id="map"></div> we have sitting
// in our index.html. However, because independent page scripts can't be imported, we need to wait for it to be available:
const L = await waitFor(async () => window.L);

// With our "L" object available, let's make a map, centered on Duncan airport:
export const map = L.map("map").setView(DUNCAN_AIRPORT, 15);

// Of course, this won't *show* anything: we still need an actual map tile layer:
L.tileLayer(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, {
  maxZoom: 19,
  attribution: `© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>`,
}).addTo(map);
```

With a quick look at that `waitFor` function in `public/js/utils.js`:

```javascript
// Return a promise that doesn't resolve until `fn()` returns a truthy value, or we run out of retries.
export function waitFor(fn, timeout = 5000, retries = 100) {
  return new Promise((resolve, reject) => {
    (async function run() {
      if (--retries === 0) reject(new Error(`max retries reached`));
      try {
        const data = await fn();
        if (!data) return setTimeout(run, timeout, retries);
        resolve(data);
      } catch (e) {
        reject(e);
      }
    })();
  });
}
```

We use this because we don't want to do any map work until Leaflet's been loaded in, and as an external third party library, we have no idea when that might be, and the HTML stack does not have anything simple built in to check whether non-import scripts have finished loading. So this will have to do.

With that, though, we can update our `plane.js` to load our map code:

```javascript
import { map as defaultMap } from "./map.js"

...

export class Plane {
  constructor(server, map = defaultMap) {
    this.server = server;
    this.map = map;
    ...
  }
}
```

And presto! Now our browser page actually has more than just text:

![A basic page overview with questions and map](./images/page/page-overview.png)

Which is pretty good, but it's lacking something... our plane!



Let's make a quick little plane icon and put that on the map, at the correct latitude and longitude, pointing in the right direction. We'll start by making a `public/map-marker.html` file and putting some code in there:

```html
<div id="plane-icon">
  <div class="bounds">
    <link rel="stylesheet" href="css/map-marker.css" />

    <div class="basics">
      <!-- One normal plane: -->
      <img src="/planes/plane.png" class="plane" />
      <!-- And a plane shadow, because seeing a shadow on a map makes a *huge* difference: -->
      <img src="/planes/plane.png" class="shadow" />
    </div>
  </div>
</div>
```

With that `plane.png` being a simple little non-existent plane silhouette:

<img src="../public/planes/plane.png" style="width: 72px; height: 50px" />

And then we add a bit of CSS here, because while we _could_ rotate our plane and shadow using JavaScript, that's a bit silly when CSS comes with `tranform: rotate(...)` built in. All we need to do is make sure that the CSS variable `--heading` is some plain number in degrees (which we can, because that's one of our flight data values), and then CSS can do the rest. So:

```css
#plane-icon {
  /* --heading will be unitless, with a corresponding --degrees that's a "real" value */
  --heading: 0;
  --degrees: calc(1deg * var(--heading));

  /* --altitude will be unitless, with a corresponding --alt-em that's a "real" value */
  --altitude: 0;
  --alt-em: calc(sqrt(var(--altitude)) / 20);
}

#plane-icon .basics {
  /*
    we want to overlay the plane and its shadow, so mark this element relative
    and then mark the contained plane and shadow as absolute, so they end up on
    top of each other.
  */
  position: relative;
}

#plane-icon .basics img {
  position: absolute;
  transform-origin: center center;
}

#plane-icon .basics img.shadow {
  /* the higher we're flying, the more blurred our shadow should be: */
  --shadow-blur-size: calc(1px * var(--alt-em) / 2);
  filter: blur(var(--shadow-blur-size)) opacity(0.3);
  /* we only need to rotate the shadow, so it's pointing in the right direction: */
  transform: rotate(var(--degrees));
}

#plane-icon .basics img.plane {
  /* but we rotate *and* move the real plane icon up, based on how high it's flying: */
  --elevation-offset: calc(-1em * var(--alt-em)) position: absolute;
  /* and transforms are applied right-to-left, so this rotates first, then translates: */
  transform: translate(0, var(--elevation-offset)) rotate(var(--degrees));
}
```

Which just leaves adding this icon to our map. First, a little map helper file in `public/js/map-marker.js`:

```javascript
// Load our .html "partial"
const content = await fetch("map-marker.html").then((res) => res.text());
const div = document.createElement(`div`);
div.innerHTML = content;
const MapMarker = div.children[0];

// Then create a little helper function that gets the HTML we need to
// feed to Leaflet in order for it to put our icon on the map "as an
// icon that it can move", with some initial heading:
MapMarker.getHTML = (initialHeading = 0) => {
  MapMarker.style.setProperty(`--heading`, initialHeading);
  return MapMarker.outerHTML;
};

// And then just export that.
export { MapMarker };
```

And then we can update our `plane.js`:

```js
import { Questions } from "./questions.js";
import { map as defaultMap, DUNCAN_AIRPORT } from "./map.js";
import { MapMarker } from "./map-marker.js";

const { abs } = Math;

export class Plane {
  constructor(server, map = defaultMap, location = DUNCAN_AIRPORT, heading = 135) {
    ...
    this.addPlaneIconToMap(map, location, heading);
  }

  /**
   * We'll use Leaflet's "icon" functionality to add our plane:
   */
  async addPlaneIconToMap(map, location, heading) {
    const props = {
      icon: L.divIcon({
        iconSize: [36, 25],
        iconAnchor: [36 / 2, 25 / 2],
        className: `map-pin`,
        // We our little plane icon's HTML, with the initial heading baked in:
        html: MapMarker.getHTML(heading),
      }),
    };
    // Then we turn that into a Leaflet map marker:
    this.marker = L.marker(location, props).addTo(map);
    // And then we cache the resulting page element so we can use it later, too:
    this.planeIcon = document.querySelector(`#plane-icon`);
  }

  /**
   * We've seen this function before!
   */
  async updateState(state) {
    this.state = state;
    const now = Date.now();
    Questions.update(state);

    // Keep our map up to date:
    this.updateMap(state.flightInformation);

    this.lastUpdate = { time: now, ...state };
  }

  /**
   * A dedicated function for updating the map!
   */
  async updateMap({ data: flightData }) {
    if (!flightData) return;

    const { map, marker, planeIcon } = this;
    const { lat, long } = flightData;

    // Do we have a GPS coordinate? (And not the 0,0 off the West coast
    // of Africa that you get while you're not in game?)
    if (lat === undefined || long === undefined) return;
    if (abs(lat) < 0.1 && abs(long) < 0.1) return;

    // Update our plane's position on the Leaflet map:
    marker.setLatLng([lat, long]);

    // And make sure the map stays centered on our plane,
    // so we don't "fly off the screen":
    map.setView([lat, long]);

    // And then set our CSS variables so that the browser "does the rest":
    this.updateMarker(planeIcon.style, flightData);
  }

  /**
   * A dedicated function for updating the marker, which right now means
   * updating the CSS variables we're using to show our plane and shadow.
   */
  updateMarker(css, { heading, lift }) {
    // Point the plane and shadow in the right direction:
    css.setProperty(`--heading`, heading);

    // And then also place the plane itself higher than
    // the shadow on the ground (if we're in the air):
    css.setProperty(`--altitude`, max(lift, 0));
  }
}
```

And through the magic of "the original web stack" we suddenly have a visualization that shows our plane somewhere in the air, and its shadow on the ground:

![A basic map with plane icon](./images/page/basic-map.png)

Nice!

That is to say, it's nicer than not having a plane on the map, but this doesn't really tell us much, does it? How high are we flying? What's our airspeed? Which actual heading in degrees are we flying? I think we're going to need some more HTML. And some SVG. And probably some CSS variables. And a smattering of JS.

### Improving our visualization

Let's start by considering what we might want to visualize. We basically want all the information you'd get in a cockpit, but presented in marker form, so let's go for the traditional navigation marker: a compass, with information arranged in and around that. What if we had a nice compass ring around our plane, with heading indication, current speed, and current altitude (both above the ground and "as far as the barometer can tell"). What about something like... this?

![our map icon](./images/page/plane-marker.png)

Oh yeah: we're getting fancy. We're not using a simple little pin with a text bubble, we're cramming as much MSFS information into our marker as we can:

- Up top we have the current altitude above the ground in feet, with the altitude relative to sea level in parentheses.
- Down below, the speed in knots.
- In the center, we have the plane itself, offset vertically based on its altitude, with a picture that looks like the in-game plane.
- Below it, on the ground, we have the same plane but blurred and made translucent so it looks like a ground shadow.
- Also below the plane we have an altitude line connecting the plane to its GPS position on the map,
- as well as a line indicating both the current heading and speed of the plane.
- The outer compass ring represents the magnetic compass as we see it inside the plane,
- and the an inner compass ring represents the "true" north, based on GPS.
- The outer ring has a red "heading bug" that points in the direction that the plane should be going according to the autopilot,
- as well a green "current heading" marker so we don't have to guess our heading based on the speed line.

How do we build that? With HTML and SVG:

```html
<div id="plane-icon">
  <div class="bounds">
    <link rel="stylesheet" href="css/map-marker.css" />

    <div class="basics">
      <img src="/planes/plane.png" class="plane" />
      <img src="/planes/plane.png" class="shadow" />
      <hr class="alt-line" />
      <hr class="speedo" />
      <hr class="speedarrow" />
      <div class="speed label">0kts</div>
      <div class="alt label">0' (500')</div>
    </div>

    <svg class="compass" viewBox="0 0 200 200">
      <g transform="scale(0.9)">
        <g class="box">
          <path d="M0 100 L 200 100" />
          <path d="M100 0 L 100 200" />
          <rect
            x="0"
            y="0"
            width="200"
            height="200"
            stroke="black"
            fill="none"
          />
        </g>

        <g transform="translate(0,0) scale(0.92)">
          <g class="inner ring">
            <!-- and then a whoooole bunch of SVG path and text elements -->
          </g>
          <g class="outer ring">
            <!-- and then even more SVG path and text elements -->
          </g>
          <!-- and even more SVG O_o! -->
        </g>
    </svg>
  </div>
</div>
```

Now, I'm skipping over the SVG code here mostly because it's just a _lot_ of SVG for all those little lines in the compass rings, and really all you need is to copy-paste the code [here](https://github.com/Pomax/are-we-flying/blob/main/public/map-marker.html) to keep following along. What's more important is the updates we make to our CSS:

```css
#plane-icon {
  --speed: 120;       /* our airspeed in knots, without a unit */
  --altitude: 1500;   /* our altitude in feet, without a unit */
  --heading: 150;     /* our magnetic compass heading in degrees, without a unit */
  --heading-bug: 220; /* our "heading bug" compass indicator angle in degrees, without a unit */
  --north: 15.8;      /* the compass deviation from true north in degrees, without a unit */

  --degrees: calc(1deg * var(--heading));
  --alt-em: calc(sqrt(var(--altitude)) / 20);

  /* and a bit of value magic that scales the text based on the size of the marker */
  --f: 250;
  --dim: calc(var(--f) * 1px);
  --font-size: calc(var(--dim) / 17);

  /* And we definitely want a sans-serif font for immediate legibility */
  font-family: Arial;
  font-size: var(--font-size);
}

/*
 And then a whole bunch of CSS that makes use of those variables
*/
```

Again, if you want to follow along grab the CSS [here](https://github.com/Pomax/are-we-flying/blob/main/public/css/map-marker.css), but the important part is those new CSS variables, which we can update on the JS side based on the values we get from MSFS:

```javascript
...

import { getAirplaneSrc } from "./airplane-src.js";
const { abs, sqrt } = Math;

export class Plane {

  ...

  /**
   * Our map update function is a little bigger now:
   */
  async updateMap({ model: flightModel, data: flightData, general }) {
    if (!flightData) return;
    ...
    map.setView([lat, long]);

    // And set some classes that let us show pause/crash states:
    const { paused, crashed } = general;
    planeIcon.classList.toggle(`paused`, !!paused);
    planeIcon.classList.toggle(`crashed`, !!crashed);

    // Also, make sure we're using the right silhouette image:
    const pic = getAirplaneSrc(flightModel.title);
    [...planeIcon.querySelectorAll(`img`)].forEach(
      (img) => (img.src = `planes/${pic}`)
    );

    // Then update the marker's CSS variables and various text bits:
    this.updateMarker(planeIcon, flightData);
  }

  /**
   * Our marker update function is also little bigger now:
   */
  updateMarker(planeIcon, flightData) {
    const css = planeIcon.style;

    const { alt, headingBug, groundAlt, lift } = flightData;
    const { heading, speed, trueHeading } = flightData;

    css.setProperty(`--altitude`, lift | 0);
    css.setProperty(`--sqrt-alt`, sqrt(lift) | 0);
    css.setProperty(`--speed`, speed | 0);
    css.setProperty(`--north`, trueHeading - heading);
    css.setProperty(`--heading`, heading);
    css.setProperty(`--heading-bug`, headingBug);

    const altitudeText = (groundAlt | 0) === 0 ? `${alt | 0}'` : `${lift | 0}' (${alt | 0}')`;
    planeIcon.querySelector(`.alt`).textContent = altitudeText;
    planeIcon.querySelector(`.speed`).textContent = `${speed | 0}kts`;
  }
}
```

And the final bit of the puzzle, `airplane-src.js`, for which we're going to want to create a directory called `public/planes` so that we can fill it with plane icons, like these:

![so many planes!](./images/plane-icons.png)

And then we can swap the correct icon in, based on the plane we're flying:

```javascript
export const defaultPlane = `plane.png`;

export function getAirplaneSrc(title = ``) {
  let pic = defaultPlane;
  let plane = title.toLowerCase();

  // let's find our plane!
  if (plane.includes(` 152`)) pic = `152.png`;
  else if (plane.includes(` 310`)) pic = `310.png`;
  else if (plane.includes(` beaver`)) pic = `beaver.png`;
  else if (plane.includes(` kodiak`)) pic = `kodiak.png`;
  else if .....you get the idea...

  // And a quick check: is this the float plane variant?
  if (plane.includes(`amphibian`) || plane.includes(`float`)) {
    pic = pic.replace(`.png`, `-float.png`);
  }

  // Done, return the appropriate icon. Or just `plane.png` if we don't have this plane in our list.
  return pic;
}
```

And that'll do it. Let's fire up MSFS, load a plane into the world, and let's see what that looks like!

![A map with our marker on it](./images/page/marker-on-map.png)

That's looking pretty good!

**“Oh, yeah that looks cool! But hold up... why are there _two_ compasses?”** —you, hopefully (again)

Yeah, so, here's a fun thing about our planet: you'd think magnetic lines run north to south, like those pictures of metal filings around a magnet... which they would, if the Earth was a bar-magnet-sized magnet. Instead, it's an _absolutely huge_ and highly imperfect magnet, so if we look at a picture of "how wrong a magnet wrt true north/south anywhere on the planet", things look like this:

<figure style="width: 80%; margin: auto;">
    <a href="https://en.wikipedia.org/wiki/File:World_Magnetic_Declination_2015.pdf">
      <img src="./images/page/declination.png">
    </a>
    <figcaption style="text-align:center">A map of the magnetic declination on planet Earth</figcaption>
</figure>


The green lines are where a compass will _actually_ point north, but everywhere else on the planet your compass will be off by various degrees. For example, it's only a tiny bit off if you're in Belgium, but at the south tip of the border between Alaska and Canada, your compass will be a pointing a whopping 20 degrees away from true north. When you're flying a plane, you'd better be aware of that, and you better know which of your instruments use compass heading, and which of them use true heading, or you might not get to where you thought you were going.

### Seeing the terrain

So... this looks good, but we're missing one thing: terrain. Maps might be flat, but the world isn't, and when we're flying we'd like to know where the hills and mountains are so we can either avoid them, or plan accordingly. So let's add a terrain layer to our map by updating our `maps.js`:

```javascript
import { waitFor } from "./utils.js";

export const DUNCAN_AIRPORT = [48.7566, -123.71134];

// Leaflet creates a global "L" object to work with, so use that to tie into the <div id="map"></div> we have sitting
// in our index.html. However, because independent page scripts can't be imported, we need to wait for it to be available:
const L = await waitFor(async () => window.L);

// With our "L" object available, let's make a map, centered on Duncan airport:
export const map = L.map("map").setView(DUNCAN_AIRPORT, 15);

// Let's make our layers a little more "data driven" by first defining a list of sources:
const sources = [
  {
    name: `openStreetMap`,
    url: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`,
    maxZoom: 19,
    attribution: {
      url: `http://www.openstreetmap.org/copyright`,
      label: `OpenStreetMap`,
    },
  },
  {
    name: `googleTerrain`,
    url: `http://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}`,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    maxZoom: 20,
    attribution: {
      url: `https://www.google.com/permissions/geoguidelines`,
      label: `Google Maps`,
    },
  },
];

// and then converting those to map layers:
const mapLayers = Object.fromEntries(
  sources.map((e) => [
    e.name,
    L.tileLayer(e.url, {
      subdomains: e.subdomains ?? [],
      maxZoom: e.maxZoom,
      attribution: `© <a href="${e.attribution.url}">${e.attribution.label}</a>`,
    }),
  ])
);

// We'll keep the openstreetmap layer as base layer:
mapLayers.openStreetMap.setOpacity(1);
mapLayers.openStreetMap.addTo(map);

// And then we'll add the terrain layer as 50% opacity overlay:
mapLayers.googleTerrain.setOpacity(0.5);
mapLayers.googleTerrain.addTo(map);
```

And now our map looks **_amazing_**:

![Our map, now with terrain!](./images/page/map-with-terrain.png)

### Adding scale to our map

One last thing: we have no idea what the scale of this map is, so normally that involves telling Leaflet to add the standard scale legend, but Leaflet only knows about standard miles, and kilometers, which is not super useful when you're flying and everything's measured in nautical miles. So I guess we're writing our own scale code by creating a little Leaflet plugin called `public/js/leaflet/nautical.js`:

```javascript
// Based on https://github.com/PowerPan/leaflet.nauticscale/blob/master/dist/leaflet.nauticscale.js
import { waitFor } from "../utils.js";

// We first need to wait for Leaflet...
const L = await waitFor(async () => window.L);

// Then we can define a new Leaflet control that extends the base Leaflet scale visualization:
L.Control.ScaleNautical = L.Control.Scale.extend({
  options: { nautical: false },
  _addScales: function (options, className, container) {
    L.Control.Scale.prototype._addScales.call(
      this,
      options,
      className,
      container
    );
    L.setOptions(options);
    if (this.options.nautical)
      this._nScale = L.DomUtil.create("div", className, container);
  },
  _updateScales: function (maxMeters) {
    L.Control.Scale.prototype._updateScales.call(this, maxMeters);
    if (this.options.nautical && maxMeters) {
      this._updateNautical(maxMeters);
    }
  },
  _updateNautical: function (maxMeters) {
    const scale = this._nScale;
    const maxNauticalMiles = maxMeters / 1852;
    let nauticalMiles;
    if (maxMeters >= 1852) {
      nauticalMiles = L.Control.Scale.prototype._getRoundNum.call(
        this,
        maxNauticalMiles
      );
    } else {
      nauticalMiles = maxNauticalMiles.toFixed(maxNauticalMiles > 0.1 ? 1 : 0);
    }
    const scaleWidth = (
      this.options.maxWidth *
      (nauticalMiles / maxNauticalMiles)
    ).toFixed(0);
    scale.style.width = `${scaleWidth - 10}px`;
    scale.textContent = `${nauticalMiles} nm`;
  },
});

L.control.scaleNautical = (options) => new L.Control.ScaleNautical(options);

export function setMapScale(
  map,
  metric = true,
  imperial = false,
  nautical = true
) {
  L.control.scaleNautical({ metric, imperial, nautical }).addTo(map);
}
```

How this code works isn't super important, but what it does when we use it, is: if we update our `maps.js` file as follows:

```javascript
import { waitFor } from "./utils.js";
import { setMapScale } from "./leaflet/nautical.js";

...

// add our scale
setMapScale(map);
```

And we refresh our browser, we now have a handy-dandy scale marker in the lower left corner:

![now with scale](./images/page/map-with-scale.png)

And now we know how long it'll take us to get places, because as dumb as knots and miles may seem, their relation is extremely simple: a speed of 1 knot means you're going 1 nautical mile per hour. If we're going at 120 knots, then we'll cover 120 nautical miles an hour, or 1 nautical mile every thirty seconds.

## Recording our flight path

Seeing ourselves flying around on the map is pretty great, but right now we can only see "where we are", instead of seeing where we've come from. As it turns out, Leaflet supports drawing polygons, so let's also add some "flight tracking" to our web page (not in the least because it's something that will be pretty important for debugging autopilot code later!).

First, we create a little `public/js/trail.js` class because you know how this works by now, new code gets its own file:

```javascript
export class Trail {
  // The constructor isn't particularly interesting...
  constructor(map, pair, color, opts = {}) {
    this.coords = [];
    this.map = map;
    if (pair) this.add(...pair);
    this.color = color ?? `blue`;
    this.opts = opts;
    this.line = undefined;
  }

  // but the "add" function is, because it's the code that actually
  // draws our trail onto the map once we have 2 coordinates, and
  // then updates it by adding points to the trail during flight.
  add(lat, long) {
    if (!lat && !long) return;

    const { coords } = this;
    const pair = [lat, long];
    coords.push(pair);

    // If we have fewer than 2 points, we can't draw a trail yet!
    const l = coords.length;
    if (l < 2) return;

    // If we have exactly 2 points, we create the trail polyon
    // and add it to the map:
    if (l === 2) {
      this.line = L.polyline([...coords], {
        className: `flight-trail`,
        color: this.color,
        ...this.opts,
      });
      return this.line.addTo(this.map);
    }

    // And if we have more than 2 points, all we need to do is
    // add the new point to the polygon that Leafet's working with.
    this.line.addLatLng(pair);
  }
}
```

Really all this does is wrap some of the administrative functionality for tracking position over time, so that we can just create a `Trail` instance, and add points to it and it'll do the right thing. For instance, it's not going to do anything until there are two points to draw a line with. That's not code we want to constantly have to remember we need to write.

So with that class set up, let's update `plane.js` some more:

```javascript
import { Trail } from "./trail.js";

...

export class Plane {
  ...

  /**
   * A little helper function for tracking "the current trail", because we
   * can restart flights as much as we want (voluntarily, or because we
   * crashed) and those new flights should all get their own trail:
   */
  startNewTrail(location) {
    this.trail = new Trail(this.map, location);
  }

  /**
   * We're well-acquainted with this function by now:
   */
  async updateState(state) {
    this.state = state;
    const now = Date.now();
    Questions.update(state);
    
    // Check if we started a new flight because that requires
    // immediately building a new flight trail:
    try {
       const { flying: wasFlying } = this.lastUpdate.flightInformation.general;
      const { flying } = this.state.flightInformation.general;
      const startedFlying = !wasFlying && flying;
      if (startedFlying) this.startNewTrail();
    } catch (e) {
      // this will fail if we don't have lastUpdate yet, and that's fine.
    }

    // And then update our map.
    this.updateMap(state.flightInformation);

    this.lastUpdate = { time: now, ...state };
  }

  async updateMap({ model: flightModel, data: flightData, general }) {
    if (!flightData) return;
    
    const { map, marker, planeIcon } = this;
    const { lat, long } = flightData;
    if (lat === undefined || long === undefined) return;
    if (abs(lat) < 0.1 && abs(long) < 0.1) return;

    try {
      // First off: did we teleport? E.g. did the plane's position change
      // impossibly fast, due to restarting a flight, or by using the
      // "teleport" function in Parallel 42's "Flow" add-on, etc? Because
      // if so, we need to start a new trail.
      const { lat: lat2, long: long2 } = this.lastUpdate.flightInformation.data;
      const d = getDistanceBetweenPoints(lat, long, lat2, long2);
      const kmps = (speed ?? 0) / 1944;

      // We'll call ourselves "teleported" if we moved at a speed of over
      // 5 kilometers per second (3.1 miles per second), which is roughly
      // equivalent to mach 14.5, which is a little over half the orbital
      // speed of the international space station.
      const teleported = this.lastUpdate.flightData && d > 5 * kmps;
      if (teleported) this.startNewTrail([lat, long]);
    } catch (e) {
      // this will als fail if we don't have lastUpdate yet, and that's still fine.
    }

    // With all that done, we can add the current position to our current trail:
    if (!this.trail) this.startNewTrail([lat, long]);
    this.trail.add(lat, long);

    ...
  }

   ...
}
```

A reasonably small bit of extra code, for a profound improvement:

![Now we know where we came from](./images/page/map-with-flightpath.png)

Now we don't just know where we are, also also where we've been!

## Planes with attitude

There's one thing our fancy marker isn't showing though, which is the current roll and pitch, which would be really nice to be able to see. So... let's build an [attitude indicator](https://en.wikipedia.org/wiki/Attitude_indicator), also sometimes called an "artificial horizon":

![now with attitude](./images/page/attitude.png)

This is a way to visualize whether the plane is pitching up, down, or is flying level, as well as showing whether we're turning left, right, or flying straight. It's a critical part of the cockpit, and it would be very nice if we could see one at all times, too. So just like before, let's whip up a bit of HTML, SVG, CSS, and JS to make that happen.

First an update to `index.html` so that there's a place for the attitude indictor:

```html
<div id="visualization">
  <div id="map" style="width: 1200px; height: 800px"></div>
  <div id="attitude" data-description="Templated from attitude.html"></div>
</div>
```

And then the attitude indicator itself. Thankfully, this will be considerably less code than the airplane marker, so let's create a `public/attitude.html`:

```html
<div id="attitude">
  <div class="frame">
    <link rel="stylesheet" href="/css/attitude.css" />

    <div class="inner-shadow"></div>
    <div class="sky"></div>
    <div class="ground"></div>

    <div class="scales">
      <hr />
      <hr class="minor small" />
      <hr class="minor small" />
      <hr />
      <hr class="small" />
      <hr class="small" />
      <hr />
      <hr class="small" />
      <hr class="small" />
      <hr />
      <hr class="minor small" />
      <hr class="minor small" />
      <hr />
      <hr />
      <div class="center-mark"></div>
      <div class="sky"></div>
      <div class="ground"></div>
    </div>

    <div class="box">
      <div class="bug"></div>
      <div class="gyro">
        <div class="sky">
          <hr class="pitch-marker small" />
          <hr class="pitch-marker" />
          <hr class="pitch-marker small" />
          <hr class="pitch-marker" />
        </div>
        <div class="ground">
          <hr class="pitch-marker small" />
          <hr class="pitch-marker" />
          <hr class="pitch-marker small" />
          <hr class="pitch-marker" />
        </div>
        <div class="box-shadow"></div>
      </div>
    </div>

    <div class="bird">
      <hr/><hr/><hr/><hr/><hr/>
    </div>
  </div>
</div>
```

With... okay, quite a _lot_ of CSS, so have a look [here](https://github.com/Pomax/are-we-flying/blob/main/public/css/attitude.css) if you're following along, I'll just highlight the important part here, which is (of course) the CSS variables section:

```css
#attitude {
  --bank: 0;
  --pitch: 0;
  --safety-pad: -5%;
  --frame-pad: 7%;
  --box-pad: 5%;
  --active-pad: 10%;
  --dial-space: 3px;
  ...
}

...

#attitude .box .gyro .sky {
  position: absolute;
  top: 0;
  bottom: calc(48% + calc(1% * var(--pitch)));
  left: 0;
  right: 0;
}

...
```

And then we create a little `public/js/attitude.js` file to help us inject and update that:

```javascript
const content = await fetch("attitude.html").then((res) => res.text());
const attitude = document.getElementById(`attitude`);
attitude.innerHTML = content;

export const Attitude = {
  setPitchBank(pitch, bank) {
    attitude.style.setProperty(`--pitch`, pitch);
    attitude.style.setProperty(`--bank`, bank);
  },
};
```

Barely anything to it. Now we just import that and then call the `setPitchBank` function during the update cycle in our `plane.js`:

```javascript
import { Attitude } from "./attitude.js";
...
export class Plane {
  ...
  /**
   * Yet again, we're back in updateState
   */
  async updateState(state) {
    ...

    // Update the attitude indicator:
    if (state.flightInformation.data) {
      const { pitch, bank } = state.flightInformation.data;
      Attitude.setPitchBank(pitch, bank);
    }

    this.lastUpdate = { time: now, ...state };
  }
}
```

And done, that's our attitude indicator hooked up.

## Doing science: plotting our flight telemetry

Before we consider our page work done, though, let's add one more thing: science.

<figure>
  <img src="./images/page/science/overview.png">
  <figcaption>Look at all that science!</figcaption>
</figure>
If we want to understand what our plane is doing, especially if we want to understand what our plane is doing in response to input changes (whether those are by a human or auto pilot), we need some way to see what happens over time. Which means we want graphs. Lots of graphs. And if we need graphs, we need some code that'll do that graphing for us!

There's quite a few ways to get some nice charts on a page, so instead of running you through the code that this project uses, let's just say that you are spoiled for choice and the choice of whether to use an off-the-shelf library or rolling your own code is entirely up to you. In this specific case, I rolled us some custom code that you can find on the repo under `public/js/dashboard/`, mostly because I wanted something that generates plain SVG that I can just copy-paste from dev tools into a new file, save that as `.svg` and then be able to load it into any SVG viewer/editor. Something that's particularly useful for autopilot debugging.

What matters most is that we can tell the code that we want to plot several graphs, and that each graph has some initial x and y interval that we can grow as needed (`x` representing time and `y` representing "whatever makes sense for the value we're plotting", since heading angle, speed in knots, altitude in feet, etc. all have rather different ranges), which we do with an initial setup:

```javascript
export function initCharts() {
  const config = {
    // the basics
    ground: { unit: `feet`, positive: true, fixed: 1, max: 1500, filled: true },
    altitude: { unit: `feet`, positive: true, fixed: 1 },
    speed: { unit: `knots`, positive: true, fixed: 2 },
    dV: { unit: `knots/s`, fixed: 2 },

    // elevator related values
    VS: { unit: `fpm`, fixed: 1, limits: [1000, -1000] },
    dVS: { unit: `fpm/s`, fixed: 2 },
    pitch: { unit: `degrees`, fixed: 1 },
    dPitch: { unit: `deg/s`, fixed: 2, limits: [1, -1] },

    // aileron related values
    heading: {
      unit: `degrees`,
      positive: true,
      min: 0,
      max: 360,
      discontinuous: true,
      fixed: 0,
    },
    bank: { unit: `degrees`, fixed: 2, limits: [30, -30] },
    dBank: { unit: `deg/s`, fixed: 4 },
    turnRate: { label: `turn rate`, unit: `deg/s`, fixed: 2 },
    rudder: { label: `rudder`, unit: `%`, fixed: 2 },

    // trim settings
    pitchTrim: { label: `pitch trim`, unit: `%`, fixed: 3 },
    aileronTrim: { label: `aileron trim`, unit: `%`, fixed: 3 },
    rudderTrim: { label: `rudder trim`, unit: `%`, fixed: 3 },
  };

  return new Chart(config);
}
```

After which we update our `plane.js` to use this charting solution:

```javascript
import { initCharts } from "./dashboard/charts.js";

...

export class Plane {
  constructor(server, map = defaultMap, location = Duncan, heading = 135) {
    ...
    // Set up our chart solution, which will inject some elements
    // into the page that will do the relevant drawing for us:
    this.charts = initCharts();
  }

  async updateState(state) {
    this.state = state;
    const now = Date.now();

    ...
    
    const flightData = state.flightInformation.data;
    if (flightData) {
      // Update the attitude indicator:
      const { pitch, bank } = state.flightInformation.data;
      Attitude.setPitchBank(pitch, bank);
    
      // Update our science
      this.updateChart(flightData);
    }

    this.lastUpdate = { time: now, ...state };
  }


  /**
   * And then in the updateChart function we simply pick our
   * values, and tell the charting solution to plot them.
   */
  updateChart(flightData) {
    const { alt, bank, groundAlt, pitch, speed, heading, rudder } = flightData;
    const { VS, pitchTrim, aileronTrim, turnRate, rudderTrim } = flightData;
    const nullDelta = { VS: 0, pitch: 0, bank: 0 };
    const { VS: dVS, pitch: dPitch, bank: dBank, speed: dV } = flightData.d ?? nullDelta;
    this.charts.update({
      ground: groundAlt, altitude: alt, speed, dV, // basics
      VS, dVS, pitch, dPitch,                      // elevator
      heading, bank, dBank, turnRate, rudder,      // ailleron
      pitchTrim, aileronTrim, rudderTrim,          // trim
    });
  }
}
```

With an update to `index.html` so that there's a science div to put all our graphs into:

```html
    ...
    <div id="visualization">
      <div id="map" style="width: 1200px; height: 800px"></div>
      <div id="attitude" data-description="Templated from attitude.html"></div>
    </div>
    <div id="science" class="pane">
      <!-- all the data!  -->
    </div>
  </body>
</html>
```

And now we can see what our plane is doing over time, which means we're ready to get down to what you started reading this page for!

<figure>
  <img src="./images/page/big-science.png">
  <figcaption>That's some big science...</figcaption>
</figure>

...Now that we're some 15,000 words down the page...

_So let's finally do this._

# Part three: writing an autopilot

It's time. Let's write that autopilot you came here for.

And while we could do this in the browser, we're going to be adding the main code to our API server, rather than our web page. Don't get me wrong: we _totally could_ write our autopilot in client-side JS, but we'd much rather not have to deal with the delay of network requests from the webpage (even if web sockets are must faster than GET/POST requests), and we definitely don't want to accidentally turn off the autopilot just because we closed a tab... we might be flying a virtual plane, but it'd be nice to keep it in the air instead of just plummeting out of the sky when we accidentally close our browser!

## The code basics

In order to run an auto pilot, we're going to need to set up some code that actually "runs" the auto pilot, and then expose some of that functionality over the network, which requires (unsurprisingly) some new files, and some updates to old files.

### The server side of our autopilot

Let's start with the autopilot code itself, but without any specific piloting logic implemented quite yet, since we'll be doing that in stages as we run through this chapter. We'll start by creating a  `src/autopilot/autopilot.js`, which will be something that we'll never expose to clients directly, so we can write "normal" code:

```javascript
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

const AUTOPILOT_INTERVAL = 500;

export class AutoPilot {
  constructor(api, onChange = () => {}) {
    this.api = api;
    this.onChange = async (update) => {
      onChange(update ?? (await this.getParameters()));
    };
    this.reset();
  }

  reset(flightInformation, flightInfoUpdateHandler) {
    console.log(`resetting autopilot`);
    this.flightInformation = flightInformation;
    this.flightInfoUpdateHandler = flightInfoUpdateHandler;
    this.paused = false;
    this.modes = {
      // This is going to be our "switch panel", where
      // we say which modes are on or off, and for modes
      // with numerical values, what those values are.

      // For now, we're only adding a single switch:
      // the master switch.
      MASTER: false,
    };
    this.onChange(this.getParameters);
  }

  get autoPilotEnabled() {
    return this.modes.MASTER;
  }
  
  disable() {
    this.setParameters({ MASTER: false });
  }

  setPaused(value) {
    this.paused = value;
  }

  async getParameters() {
    return { ...this.modes };
  }

  async setParameters(params) {
    const { api, modes } = this;
    const wasEnabled = modes.MASTER;
		Object.entries(params).forEach(([key, value]) => {
      this.setTarget(key, value);
    });

    // notify clients of all the changes that just occurred:
    this.onChange();

    // Then, MSFS might not actually be running...
    if (!this.api.connected) return;
    
    // but if it is, and we just turned our own autopilot on, then we'll
    // want to make sure to turn off the in-game autopilot (if it's on),
    // before we start to run our own code, so that it doesn't interfere:
    if (!wasEnabled && modes.MASTER) {
      const { AUTOPILOT_MASTER: gameAP } = await api.get(`AUTOPILOT_MASTER`);
      if (gameAP === 1) api.trigger(`AP_MASTER`);
      // now we can safely run our own autopilot code.
      this.runAutopilot();
    }
  }
  
  async setTarget(key, value) {
    const { modes } = this;
    // We'll be building this out as we implement more and
    // more autopilot features, but for now we just "blindly"
    // update values. But, only if they exist in our list of
    // modes: we're not going to let clients just set arbitrary
    // key/value pairs!
    if (modes[key] !== undefined) {
			modes[key] = value;
    }
  }

  async runAutopilot() {
    const { api, modes, paused } = this;

    // Sanity check: *should* this code run?
    if (!api.connected) return;
    if (!modes.MASTER) return;

    // If the autopilot is enabled, even if there are errors due to
    // MSFS glitching, or the DLL handling glitching, or values somehow
    // having gone missing, or our own code throwing errors that we
    // need to fix, etc. etc: schedule the next call, and hopefully
    // things work by then.
    runLater(() => this.runAutopilot(), this.AP_INTERVAL);

    // If the game is paused, then don't run the autopilot code, but 
    // only for "this call". Maybe by the next call the game won't be
    // paused anymore.
    if (paused) return;

    // And remember: *never* allow code to crash the server:
    try {
      await this.run();
      this.onChange();
    } catch (e) {
      console.error(e);
    }
  }

  async run() {
    // This is where things will actually happen, rather than
    // putting that code inside `runAutopilot`, because this will
    // eventually be a substantial amount of code.
    
    // For now, all we do is update the flight information. And
    // you might be thinking "well why not just update only the
    // flight data, the model isn't going to change mid-flight?"
    // but if so: you never turned on the MSFS developer tools,
    // which comes with an aircraft selector so you *can* change
    // the model mid-flight =)
    this.flightInfoUpdateHandler(await this.flightInformation.update());
  }
}
```

So this does nothing yet, except run the autopilot loop when the autopilot gets enabled, but it's enough code that want to at least test this to see if we can turn the AP on and off, which means we'll need to update a few more files before we can do our testing, starting with our `server.js`:

```javascript
...

// we'll make the autopilot hot-reloadable:
let autopilot = false;
let { AutoPilot } = await watch(
  __dirname,
  `../../autopilot/autopilot.js`,
  (module) => {
    AutoPilot = module.AutoPilot;
    if (autopilot) Object.setPrototypeOf(autopilot, AutoPilot.prototype);
  }
);

// And we're not going to expose the autopilot itself to clients,
// instead we're wrapping it so we can control who gets to call it,
// similar to what we did with the API:
import { AutopilotRouter } from "./routers/autopilot-router.js";

...

export class ServerClass {
  init() {
    const { clients } = this;

    // Set up the off-class autopilot instance, with a callback that
    // lets the autopilot broadcast its settings whenever they change.
    autopilot = new AutoPilot(api, (params) =>
      clients.forEach((client) => client.onAutoPilot(params));
    );

    // And set up call routing for the autopilot in the same way as we
    // did for the API: only authenticated clients are allowed to mess
    // with the AP settings =)
    this.autopilot = this.lock(
      new AutopilotRouter(autopilot),
      (client) => this.#authenticatedClients.includes(client)
    );

    connectServerToAPI(api, async () => {
      console.log(`Connected to MSFS.`);
      flightInformation = new FlightInformation(api);

      // Since we want to pause the autopilot when the game pauses,
      // we add the autopilot to our event registration:
      registerWithAPI(clients, api, autopilot);

      clients.forEach((client) => client.onMSFS(true));
      (async function poll() {
        // And we add the autopilot to our game state check, because
        // when the autopilot kicks in, it becomes responsible for polling
        // the game for data (much) faster than the regular server poll.
        checkGameState(autopilot, clients, flightInformation);
        runLater(poll, POLLING_INTERVAL);
      })();
    });
  }
  
  // When clients connect, we immediately send them the current autopilot
  // state. If the autopilot's been initialized, of course.
  async onConnect(client) {
    ...
    if (autopilot) {
      client.onAutoPilot(await autopilot.getParameters());
    }
  }
}
```

With the associated (tiny) autopilot router in `src/classes/server/routers/autopilot-router.js`:

```javascript
// clients will be able to access functions in this router, so we
// want to make sure the autopilot is not directly accessible:
let autopilot;

export class AutopilotRouter {
  constructor(_autopilot) {
    autopilot = _autopilot;
  }

  // This is the only thing we want to expose to clients:
  // a way for them to change AP settings.
  async update(client, params) {
    autopilot.setParameters(params);
  }
}
```

With a change to `checkGameState` now that we have an autopilot:

```js
export async function checkGameState(autopilot, clients, flightInformation) {
  // If the autopilot is running, it will be updating the flight
  // information more frequently than the server would otherwise do,
  // so don't update it here if the AP code is running.
  if (!autopilot || !autopilot.autoPilotEnabled) {
    await flightInformation.update();
    clients.forEach((client) => client.setFlightInformation(flightInformation));
  }

  // Is there's a state change from "not in game" to "in game"?
  const wasInGame = inGame;
  inGame = flightInformation.general.inGame;

  if (wasInGame && !inGame) {
    console.log(`left the game, disabling autopilot`);
    autopilot.disable();
  } else if (!wasInGame && inGame) {
    console.log(`new game started, resetting autopilot`);
    autopilot.reset(flightInformation, (data) =>
      clients.forEach((client) => client.setFlightInformation(data))
    );
  }
}
```

And of course, since our server code is calling `client.onAutoPilot(params)` we better make sure that exists in our `client.js`:

```javascript
...
export class ClientClass {
  ...
  async onAutoPilot(params) {
    this.setState({ autopilot: params });
  }
  ...
}
```

And `socketless` will do the rest to make sure that the browser get that state update, too.

### The client-side of our autopilot

Of course, we want to be able to control this autopilot from the browser, so we'll need an update to our browser code so that we can actually turn the autopilot on and off (even if that, right now, does nothing other than toggle a boolean value).

First, let's create a little `public/autopilot.html` file:

```html
<div class="controls">
  <link rel="stylesheet" href="/css/autopilot.css" />
  <button class="MASTER">AP</button>
  <!-- we're going to add *so* many options here, later on! -->
</div>
```

Which we'll tie into our `index.html`:

```html
<!doctype html>
<html lang="en-GB">
  <head>
    ...
  </head>
  <body>
    ...
    <div id="autopilot" data-description="Templated from autopilot.html"></div>
  </body>
</html>
```

Then we'll create a `public/css/autopilot.css` so we can see when our button has been pressed or not:

```css
#autopilot button.active {
  background: red;
  color: white;
}
```

And then, we'll create a `public/js/autopilot.js` to load in this "partial" and hook up all the buttons... err... button. All the button.

```javascript
// We've seen this pattern before:
const content = await fetch("autopilot.html").then((res) => res.text());
const autopilot = document.getElementById(`autopilot`);
autopilot.innerHTML = content;

// just in case we start a client before we start a server,
// make sure that we have default value to work with:
export const AP_OPTIONS = {
  MASTER: false,
};

export class Autopilot {
  constructor(owner) {
    console.log(`Hooking up the autopilot controls`);
    this.owner = owner;
    const server = (this.server = owner.server);
    // We're going to add more buttons later, so we'll write some code
    // that "does that for us" sp we add options to AP_OPTIONS without
    // having to write new code for every option we add.
    Object.keys(AP_OPTIONS).forEach((key) => {
      const e = document.querySelector(`#autopilot .${key}`);
      e.addEventListener(`click`, () => {
        // We check to see if "this button" is active. If it is, then we
        // want to turn it off, and if it isn't, we want to turn it on.
        const value = e.classList.contains(`active`);
        server.autopilot.update({ [key]: !value });
      });
    });
  }

  // And we'll need a function that, when we're passed the server's
  // current autopilot settings, makes sure all the buttons (all one of
  // them right now) are shown correctly:
  update(flightData, params) {
    if (!params) return;
		// Again, we do this with code that "does that for us":
    Object.entries(params).forEach(([key, value]) => {
      const e = document.querySelector(`#autopilot .${key}`);
      e?.classList.toggle(`active`, !!value);
    });
  }
}
```

And then finally, of course, we load that in with the rest of our code in `plane.js`:

```javascript
import { Autopilot } from "./autopilot.js";

...

export class Plane {
  constructor(server, map = defaultMap, location = Duncan, heading = 135) {
    ...
    this.autopilot = new Autopilot(this);
  }

  // Another bit of code for our updateState: updating the autopilot UI.
  async updateState(state) {
    this.state = state;
    const now = Date.now();

    ...
    const flightData = state.flightInformation.data;
    ...
    
    // Super straight-forward:
    const { autopilot: params } = state;
    this.autopilot.update(flightData, params);

    this.lastUpdate = { time: now, ...state };
  }
}
```

Which means, we should now be able to test that we have a working "click button, enable/disable autopilot" setup.

### Testing our "autopilot" code

Let's confirm everything works.

- start our API server with `node api-server`,
- start our client web server with `node web-server --owner --browser`,
- we won't need to start MSFS for this one, as nothing we're doing relies on having the game running (yet!)
- our browser should open and we should see our page with the new autopilot button:<br>![our AP button off...](./images/page/ap-button-off.png)

- and if we click it, we should see it turn red, because it now has an `active` class:<br>![And our AP button on](./images/page/ap-button-on.png)

The important thing to realize is that the button doesn't turn red "when we clicked it" because we didn't write any code that adds an `active` class when we click a button. Instead _a lot more_ happens:

1. we press the AP master button,
2. _that does not update anything on the page_ and instead calls `server.autopilot.update({ MASTER: true })`,
3. which makes the server-side autopilot code update its `MASTER` value,
4. which then triggers an autopilot "settings have changed" broadcast,
5. which calls our client's `onAutoPilot` with the new settings,
6. which we use to update our client's `state.autopilot` value,
7. which automatically gets copied over to the browser,
8. which forwards the state to our `Plane` code
9. which passes it on to the `autopilot.update()` function,
10. and _that_, finally, sets an `active` class on the button we pressed because it sees a `MASTER` property with value `true`.

And that all happened so fast that as far as you can tell, you just clicked a button and it changed color to show that it's active: that's a good sign! It looks like we'll be able to control our autopilot through the browser without things feeling sluggish or laggy.

So let's start adding some buttons that actually control our airplane. Which of course requires also writing the server-side code that does the controlling. Which requires knowing a bit about how an autopilot makes a plane do the things it needs to do.

## So how does an autopilot actually work?

At its core, an autopilot is a system that lets a plane fly "where we want it to fly", with the most basic form of automated flight being making the plane fly in a straight line. However, there are two kinds of "straight line" we need to think about, because we're not driving a car on a road, or gliding a boat through water, we're flying through the air:

1. we can fly in a straight line without turning left or right, and
2. we can fly in a straight line without moving up or down.

The first of these is achieved using, in autopilot parlance, a **wing leveler**, often found as the label `LVL` on autopilot controls, and the second of these is achieved using **altitude hold**, often found as `ALT` on autopilot controls. You can see where the names come from: the first keeps the plane's wings level, keeping us pointing in (roughly) one compass direction, while the second keeps the plane (roughly) at some fixed altitude.

More fully featured autopilots extend these two modes by adding **heading mode**, which effectively runs the wing leveler such that we fly "a _*specific*_ compass direction", with additional logic to get us from pointing in one direction to pointing in another, and by adding **altitude set and hold**, which runs altitude hold "at a _*specific*_ altitude", with additional logic to get us from one altitude to another.

We start by observing that we _*could*_ try to take all our aeroplane's flight data, then run a bunch of maths on the numbers we get in order to predict when we need to perform which operations in order to make sure that our plane does the right thing in the future, but this will be a losing proposition: the weather, air density changes, random updrafts, terrain-induced wind, the tendency to "pull" in some direction, etc. are all going to interfere with any predictions we'd make.

So instead, we're going to implement our autopilot as a _*reactionary*_ system: it looks at what the current flight data is, what the flight data _should_ be if we were already flying the way the AP is set, and then puts in single, small corrections that'll push us away from the wrong direction. We repeat that process over and over and over, every time looking at the new flight data, and then saying which corrections to make. The trick to getting an autopilot working based on this approach is that if we can do this in a way that makes the corrections smaller and smaller every time we run, we will converge on the desired flight path, barely having to correct anything after a while. The plane will just be flying the way we want it to.

Of course, a real autopilot does this kind of monitoring and correcting on a near-continuous basis. Something we don't really have the luxury of doing by using JavaScript: in order not to overload both Node.js and MSFS, and in order for us to be able to look at the flight log when we need to do console log debugging, we're going to run our autopilot only twice per second. And that may sound dangerously low, but it's actually plenty fast.

So how do we determine the size of corrections we need to put in? Enter the constrained mapping function:

### The backbone of our autopilot code: constrain-mapping

Before we do anything else, let's first look at what is probably _the_ single most important function in our autopilot: `constrainMap`. This function takes a value, relative to some interval `[a,b]`, and maps it to the corresponding value in a different interval `[c,d]`, such that `a` maps to `c`, `b` maps to `d`, and anything in between `a` and `b` is some new value between `c` and `d`. This is nothing special, that's just numerical mapping, but the critical part here is that in addition to the standard mapping, we also make sure that any value less than `a` _still maps to `c`_ and any value greater than `b` _still maps to `d`_:

<figure style="width: 80%; margin: auto; margin-bottom: 1em;">
  <img src="images/constrain_map.png" alt="Constrained mapping"/>
  <figcaption style="font-style: italic; text-align: center;">Mapping interval [a,b] to [c,d]<br></figcaption>
</figure>


That last part is critically important: if we're going to write an autopilot, we want to be able to effect proportional changes, but we want to "cap" those changes to some minimum and maximum value because just yanking the plane in some direction so hard that it stalls is the opposite of useful.

As such, let's implement `map` and `constrain` functions (unfortunately missing from the standard Math library), and then compose them as `constrainMap` in our `src/utils/utils.js` file:

```javascript
// map a value relative to some range [a,b] to a new range [c,d]
function map(v, a, b, c, d) {
  const sourceInterval = b - a;
  if (sourceInterval === 0) return (c + d) / 2;
  const targetInterval = d - c;
  return c + ((v - a) * targetInterval) / sourceInterval;
}

// cap a number so that it's always in the range [min, max]
function constrain(v, min, max) {
  if (min > max) return constrain(v, max, min);
  return v > max ? max : v < min ? min : v;
}

// map a value from some range [a,b] to a new range [c,d], constrained to that new range [c,d]
function constrainMap(v, a, b, c, d) {
  return constrain(map(v, a, b, c, d), c, d);
}
```

We're going to rely on this function _a lot_, so now that we know what it does, and how it does it, let's move on to actual autopilot code.

## Implementing cruise control

Let's start with the simplest bit of the autopilot: "cruise control", which consists of just a wing leveler so we don't turn left or right, and an altitude hold so we don't fly up or down.

### LVL: level mode

<img src="./images/fly-level/left-bank.png" alt="left bank" style="height:10em" /><img src="./images/fly-level/level-flight.png" alt="flying straight" style="height:10em;" /><img src="./images/fly-level/right-bank.png" alt="right bank" style="height:10em;" />

Implementing level mode is probably the easiest of all autopilot functions: we're going to simply check "is the plane tilting left or right?" and if so, we move the **aileron trim**—a value that "biases" the plane to tilt left or right by adjusting the wing surfaces that tilt the plane—in the opposite direction. As long we do that a little bit at a time, and we do that for long enough, we'll eventually have the plane flying level.

Let's create an `api/autopilot/fly-level.js` file with some scaffolding:

```javascript
import { radians, constrainMap } from "../utils/utils.js";

// Some initial constants: we want to level the wings, so we
// want a bank angle of zero degrees:
const DEFAULT_TARGET_BANK = 0;

// And we want to make sure not to turn more than 30 degrees (the
// universal "safe bank angle") when we're correcting the plane.
const DEFAULT_MAX_BANK = 30;

// And, importantly, we also don't want our bank to change by
// more than 3 degrees per second, or we might accellerate past
// zero or our max bank angle too fast.
const DEFAULT_MAX_TURN_RATE = 3;

// Now, we have no "additional features" yet, since this is going
// to be our first pass at writing the wing leveler, but we'll be
// adding a bunch of refinements later on, as we revisit this code,
// so we're going to tie those to "feature flags" that we can easily
// turn on or off to see the difference in-flight.
const FEATURES = {};

// Then, our actual "fly level" function, which  we're going to keep very "dumb":
// each time we call it, it gets to make a recommendation, without any kind of
// history tracking or future predictions. This keeps the code simple, and allows
// us to hot-reload the code without ever messing up some kind of "data tracking".
export async function flyLevel(autopilot, state) {
  // in order to make this work, we'll extend the autopilot with a "trim vector"
  // that lets us update pitch, roll, and yaw trim values on an ongoing basis.
  const { trim, api } = autopilot;

  // Get our current bank/roll information:
  const { data: flightData, model: flightModel } = state;
  const { bank, speed } = flightData;
  const { bank: dBank } = flightData.d ?? { bank: 0 };

  // Then, since we're running this over and over, how big should
  // our corrections be at most this iteration? The faster we're going,
  // the bigger a correction we're going to allow:
  const step = constrainMap(speed, 50, 150, radians(1), radians(5));

  // Then, let's figure out "how much are we off by". Right now our
  // target bank angle is zero, but eventually that value is going to
  // be a number that may change every iteration.
  const targetBank = DEFAULT_TARGET_BANK;
  const diff = targetBank - bank;

  // Then, we determine a trim update, based on how much we're off by.
  // Negative updates will correct us to the left, positive updates
  // will correct us to the right.
  let update = 0;

  // As our main correction, we're looking directly at our bank difference:
  // the more we're banking, the more we correct, although if we're banking
  // more than "max bank", correct based off the max bank value instead.
  // Also, we'll restrict how much that max bank is based on how fast we're
  // going. Because a hard bank at low speeds is a good way to crash a plane.
  const maxBank = constrainMap(speed, 50, 200, 10, DEFAULT_MAX_BANK);  
  update -= constrainMap(diff, -maxBank, maxBank, -step, step);

  // With our main correction determined, we may want to "undo" some of that
  // correction in order not to jerk the plane around. We are, after all,
  // technically still in that plane and we'd like to not get sick =)
  const maxDBank = DEFAULT_MAX_TURN_RATE;
  update += constrainMap(dBank, -4 * maxDBank, 4 * maxDBank, -2 * step, 2 * step);

  // Then add our update to our trim value, and set the trim in MSFS:
  trim.roll += update;
  api.set(`AILERON_TRIM_PCT`, trim.roll);
}
```

If we remove all the comments, we just implemented a wing leveler in about 20 lines of code. That's pretty good! ...but let's run through it in text rather than just code anyway, so we understand what's happening here:

We implement our wing leveling code by solving two problems at the same time:

1. we want to get to a situation where our **bank angle** (the angle of the wings with respect to level flight) is zero, and
2. we want to get to a situation where our **bank acceleration** (how fast the bank angle changes per second) is also zero.

Those two are at odds with each other, and so we want to prioritize getting the bank angle to zero over getting the bank acceleration to zero, so we start by getting our current bank and bank acceleration values, and defining our maximum allowed values for those. Then:

1. We correct our bank in our first `update -= ...`: if we're banking a lot, we want to correct a lot, and if we're banking a little, we want to correct just a little, and if we're perfectly level, we don't want to correct at all. Which is exactly what we wrote `constrainMap` to do for us.
2. Then, we correct our bank acceleration in the next `update += ...`, by trimming in the opposite direction of our bank acceleration. This will undo some of our bank correction, but as long as we use a smaller step size for acceleration than for the main bank correction, the code will "prioritize" zeroing our bank angle over our bank acceleration. We do, however, allow for a much larger correction that would normally be necessary, in order to deal with momentary "way too much" values caused by wind, bumping the yoke/stick, etc.
3. Finally, we update our trim (both in our code and in MSFS) and then we wait for the autopilot to retrigger this function during the next run, letting us run through the same procedure, but with (hopefully!) slightly less wrong values. Provided that this function runs enough times, we'll converge on level flight, and that's exactly what we want.

Of course, this does require that `radians` exists, so let's quickly add that to our `utils.js`:

```javascript
export function radians(deg) {
  return (deg / 180) * PI;
}

export function degrees(rad) {
  return (rad / PI) * 180;
}
```

#### Adding a LVL switch

Of course, we do still need to update the autopilot code so that we can turn this feature on and off. First, we'll define a constants file for housing things like autopilot modes in `autopilot/utils/constants.js`:

```javascript
export const LEVEL_FLIGHT = `LVL`;
```

Big change, very exiting.

Then, we update the `autopilot.js` code to make use of this new constant, and we'll add that `trim` vector for tracking how much we need to trim in each direction:

```javascript
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
import { watch } from "./reload-watcher.js";

// Import our new constant...
import { LEVEL_FLIGHT } from "../utils/constants.js";

// and import the "fly level" code using our hot-reloading technique
let { flyLevel } = await watch(__dirname, `fly-level.js`, (lib) => (flyLevel = lib.flyLevel));

export class Autopilot {
  ...
  async reset(flightInformation, flightInfoUpdateHandler) {
    ...
    this.modes = {
      MASTER: false,
      [LEVEL_FLIGHT]: false,
    };
    this.resetTrim();    
    ...
  }
    
  resetTrim() {
    this.trim = {
      pitch: 0,
      roll: 0,
      yaw: 0,
    };      
  }
    
  async setTarget(key, value) {
    ...

    // Now that we can turn the wing leveler on and off,
    // we'll want to make sure that when we turn it on,
    // we copy over the in-game trim setting into our
    // trim vector. Pretty important!
    if (key === LEVEL_FLIGHT && value === true) {
      trim.roll = this.flightInformation?.data.aileronTrim ?? 0;
      console.log(`Engaging wing leveler. Initial trim:`, trim.roll);
    }
  }

  // Finally, actual autopilot functionality!
  async run() {
    const { modes, flightInformation } = this;

    // Get the most up to date flight information:
    this.flightInfoUpdateHandler(await flightInformation.update());

    // Then run a single iteration of the wing leveler:
    if (modes[LEVEL_FLIGHT]) flyLevel(this, flightInformation);
  }  
}
```

Then, let's make sure the browser can flip that switch, too, in our `public/js/autopilot.js`:

```javascript
// This is the only thing we need to change:
export const AP_OPTIONS = {
  MASTER: false,
  LVL: false,
};
```

And in our HTML "partial":

```html
<div class="controls">
  <link rel="stylesheet" href="/css/autopilot.css" />
  <button class="MASTER">AP</button>
  <button class="LVL">LVL</button>
</div>
```

And that's it, we have a switch for turning our wing leveler on and off!

Now, we could test this immediately, but we've only implemented half of a minimal autopilot solution, and it's going to be hard to test a wing leveler if the plane is flying to the moon, or dropping into the ocean, so let's first implement the other half before we do some actual, honest to goodness, in-game testing.

### ALT: altitude hold

<img src="./images/alt-hold/holding-altitude.png" style="zoom:67%;" />

Next up: making the plane hold its vertical position. This requires updating the "pitch trim" (also known as elevator trim) rather than our aileron trim, by looking at the plane's vertical speed and trying to keep it at zero. That is, we're going to look at how fast the plane is moving up or down through the air, and then we're going to try to get that value down to zero by pitching the plane a little in whichever direction counteracts the vertical movement.

Let's add a new constant to our `constants.js` file:

```javascript
export const LEVEL_FLIGHT = `LVL`;
export const ALTITUDE_HOLD = `ALT`;
```

And then let's add this new mode to our autopilot, too:

```javascript
import { LEVEL_FLIGHT, ALTITUDE_HOLD } from "./utils/constants.js";

...

// We'll be doing some hot-reload-watching here too:
let { altitudeHold } = await watch(__dirname, `altitude-hold.js`, (lib) => (altitudeHold = lib.altitudeHold));

export class Autopilot {
  ...

  async reset(flightInformation, flightInfoUpdateHandler) {
    ...
    this.modes = {
      MASTER: false,
      [LEVEL_FLIGHT]: false,
      [ALTITUDE_HOLD]: false,
    };
    ...
  }

  setTarget(key, value) {
    ...
    // Again, we copy over the existing trim.
    if (key === ALTITUDE_HOLD && value === true) {
      trim.pitch = this.flightInformation?.data.pitchTrim ?? 0;
      console.log(`Engaging altitude hold. Initial trim:`, trim.pitch);
    }
  }

    
  // Now with two functions!
  async run() {
    const { modes, flightInformation } = this;
		this.flightInfoUpdateHandler(await flightInformation.update());
    // Then run a single iteration of the wing leveler and altitude holder:
    if (modes[LEVEL_FLIGHT]) flyLevel(this, flightInformation);
    if (modes[ALTITUDE_HOLD]) altitudeHold(this, flightInformation);
  }
}
```

And then of course the `altitudeHold` function itself, which we'll put in  `autopilot/altitude-hold.js`:

```javascript
import { constrainMap } from "../utils/utils.js";
const { abs } = Math;

// Our default vertical speed target, if we want to hold our current
// altitude, is obviously zero.
const DEFAULT_TARGET_VS = 0;

// Also, we don't want our vertical speed to exceed 1000 feet per
// minute, although depending on what's happening that might change.
const DEFAULT_MAX_VS = 1000;

// And in order to make sure that in trying to reach that target
// from whatever our current vertical speed is, we limit by
// how much the vertical speed's allowed to change per iteration.
const DEFAULT_MAX_dVS = 100;

// Similar to the flyLevel code, we have no features yet, but we'll
// be adding those as we go, so we can quickly and easily compare
// how our code behaves when we turn a feature on or off.
const FEATURES = {};

// Then, our actual "hold altitude" function, which we're going to
// keep as dumb" as the "fly level" code: each time we call it, it
// gets to make a recommendation, without any kind of history tracking
// or future predictions. This keeps the code simple, and allows us
// to hot-reload the code.
export async function altitudeHold(autopilot, flightInformation) {
  // Each plane has different min/max pitch trim values, so
  // let's find out what our current plane's values are:
  const { api, trim } = autopilot;
  const { data: flightData, model: flightModel } = flightInformation;

  // What are our vertical speed values?
  const { VS } = flightData;
  const { VS: dVS } = flightData.d ?? { VS: 0 };
  const { pitchTrimLimit } = flightModel;

  // How big should our trim steps be?
  let trimLimit = pitchTrimLimit[0];
  trimLimit = trimLimit === 0 ? 10 : trimLimit;
  let trimStep = trimLimit / 10_000;

  // And what should those parameters be instead, if want to maintain our altitude?
  const { targetVS } = getTargetVS();
  const diff = targetVS - VS;

  // Just like in the flyLevel code, we first determine an update
  // to our trim, and then apply that only once we're done figuring out
  // all the increments and decrements that should involve:
  let update = 0;

  // Set our update to trim towards the correct vertical speed:
  const maxVS = DEFAULT_MAX_VS;
  update += constrainMap(diff, -maxVS, maxVS, -trimStep, trimStep);

  // And if we're accelerating too much, counter-act that a little:
  const maxdVS = constrainMap(abs(diff), 0, 100, 0, DEFAULT_MAX_dVS);
  update -= constrainMap(dVS, -4 * maxdVS, 4 * maxdVS, -2 * trimStep, 2 * trimStep);

  // Finally, apply the new trim value:
  trim.pitch += update;
  api.set(`ELEVATOR_TRIM_POSITION`, trim.pitch);
}

// This function determines what our target vertical speed should
// be in order to reach our desired stable flight. For now, this
// function simply sets the target VS to zero, but that's going to
// change almost immediate after we test this code, because we'll
// discover that you can't really "hold an altitude" if you don't
// actually write down what altitude you should be holding =)
function getTargetVS() {
  // So: we'll be putting some more code here *very* soon.
  return { targetVS: DEFAULT_TARGET_VS };
}
```

So that's a little more code than `flyLevel`, but not much more, still being less than 30 lines of code if we remove comments. So, let's go over this code, too.

- Again, because we added a trim vector to our autopilot, we can use its `pitch` component for our up/down trimming.
- And again, because some planes have explicit aileron trim controls, we want to make sure we don't "overwrite" any existing trim setting when we engage the autopilot, so we make sure to copy over the trim value into `trim.pitch` when the user turns altitude hold on.
- Again, we implement our altitude hold as solving two problems at the same time :
  1. We want to get to a situation where our **vertical speed** (how much we're flying up or down) is zero, and
  2. we want to get to a situation where our **vertical acceleration** is also zero.

Just like before we prioritize the former by giving the latter a smaller step, and we're good to go, and just like before we'll allow for a much larger correction based on vertical acceleration than we'd normally need, because even during regular flight a pocket of low density air will do a number on our altitude hold.

### Testing our code

Now that we have a working "fly level" and "hold altitude" implementation, let's see how we're doing! And spoilers: we're going to discover we forgot something pretty important that'll impact both how level we're flying, and how well we're holding our altitude. We're going to write some more code, but first let's do some science and actually see what happens with the code we wrote above in place.

We'll update our `public/js/autopilot.js` to include the new mode:

```javascript
// This is the only thing we need to change:
export const AP_OPTIONS = {
  MASTER: false,
  LVL: false,
  ALT: false,
};
```

And we'll update our HTML partial to include the ALT switch:

```html
<div class="controls">
  <link rel="stylesheet" href="/css/autopilot.css" />
  <button class="MASTER">AP</button>
  <button class="LVL">LVL</button>
  <button class="ALT">ALT</button>  
</div>
```

Then, in order to see how well our code works, we'll be flying around a bit in The [De Havilland DHC-2 "Beaver"](https://en.wikipedia.org/wiki/De%5FHavilland%5FCanada%5FDHC-2%5FBeaver), a fun little piston engine bush plane:

![The DeHavilland DHC-2 "Beaver"](./images/planes/beaver-shot.png)

And our order of operations will be to spawn the plane at cruise altitude in above the middle of the pacific ocean in fair weather, have it stabilize itself on the in-game autopilot as a substitute for manually trimming the plane, and then switch to our own autopilot (which will turn off the in-game one) to see how well that holds up. And then we're going to compare our "before" and "after" graphs to see what we can learn.

See if you can tell when we switched from the in-game autopilot to our own autopilot in the following science:

![Initial test](./images/combined/initial-test.png)

So yeah, this should be relatively obvious: our autopilot is more aggressive than the in-game one, which means it won't be as smooth of a ride, but the more important thing to notice is that our VS is not centered around zero, and our bank angle isn't either, even if it's hard to tell. We've left our in-game autopilot altitude of 1500 and ended up at about 1560 feet over the course of our own autopilot being active in these graphs, and we've also drifted to the left, starting at a heading of 341 degrees but slowly turning towards 338 by the end of the graph.

## Improving our code

If you look at the graph, our vertical speed is now perpetually "not actually zero"... it's not off by a lot, but we're definitely drifting, which isn't _quite_ the same as holding altitude. And the same is true for our wing leveler: we're flying very nearly straight, but not _quite_ straight. The obvious reason for this is that we can't actually guarantee "straight" without some reference points: we don't know what heading to fly, or which specific altitude to hold, so if there's persistent wind, we're going to get blown off course and we won't even know.

This also has an extremely obvious solution: let's make our autopilot capable of flying in a specific direction, at a specific altitude. And that's going to be surprisingly easy!

Let's start with our altitude hold: if we could just tell it _which_ altitude to hold, that'd solve half the problem. And as it turns out, we can do this pretty easily with some pretty simple math: check the difference between the altitude we're at, and the one we're supposed to _be_ at, and then pick a target VS that will help us cross that vertical distance. And while we're at it, let's also fix that aggressive trimming by reducing the amount we update by when we get close to our target:

```javascript
...

// Two feature flags!
const FEATURES = {
  DAMPEN_CLOSE_TO_ZERO: true,
  TARGET_TO_HOLD: true,
};

const { abs } = Math;

export async function altitudeHold(autopilot, flightInformation) {
  ...
  const { VS, alt } = flightData;
  ... 
  // we'll move this value up
  const maxVS = DEFAULT_MAX_VS;  
  const { targetVS } = await getTargetVS(maxVS, alt);

  ...
  
  // And our first new feature! If we're close to our target, dampen
  // the corrections, so we don't over/undershoot the target too much.
  if (FEATURES.DAMPEN_CLOSE_TO_ZERO) {
    const aDiff = abs(diff);
    if (aDiff < 100) update /= 2;
    if (aDiff < 20) update /= 2;
  }

  // And then we apply the new trim value:
  trim.pitch += update;
  api.set(`ELEVATOR_TRIM_POSITION`, trim.pitch);
}

// Then for our second feature...
async function getTargetVS(maxVS, alt) {
  let targetVS = DEFAULT_TARGET_VS;
  let altDiff = undefined;

  if (TARGET_TO_HOLD) {
    // Get our hold-altitude from our autopilot mode:
    const targetAltitude = autopilot.modes[ALTITUDE_HOLD];
    if (targetAltitude) {
      // And then if we're above that altitude, set a target VS that's negative,
      // and if we're below that altitude, set a target VS that's positive:
      altDiff = targetAltitude - state.altitude;
      targetVS = constrainMap(altDiff, -200, 200, -maxVS, maxVS);
    }
  }

  return { targetVS, altDiff };
}
```

This will require us to massage our browser code a little, so that we can actually set an altitude in our `autopilot.html` rather than only having an on/off button:

```html
<div class="controls">
  ...
  <label>Target altitude: </label>
  <input
    class="altitude"
    type="number"
    min="0"
    max="40000"
    value="4500"
    step="100"
  />
  <button title="altitude hold" class="ALT">ALT</button>
</div>
```

And then we can update our browser's `autopilot.js` to work with that input field:

```javascript
...

export class Autopilot {
  constructor(owner) {
    ...

    Object.keys(AP_DEFAULT).forEach((key) => {
      const e = document.querySelector(`#autopilot .${key}`);
      e?.addEventListener(`click`, () => {
        e.classList.toggle(`active`);
        let value = !e.classList.contains(`active`);
        // Special handling for our altitude mode: instead of a
        // boolean, let's make this our desired altitude in feet:
        if (value) {
          if (key === `ALT`) {
            value = document.querySelector(`#autopilot .altitude`).value ?? 1500;
          }
        }
        server.autopilot.update({ [key]: value });
      });
    });

    // We'll also add a change handler to our number field
    // so that if that changes, we can let the server know:
    document
      .querySelector(`#autopilot .altitude`)
      ?.addEventListener(`change`, (evt) => {
        server.autopilot.update({ ALT: evt.target.value });
        evt.target.blur();
      });
  }

  // And then we also add some ALT-specific code to our update function:
  update(flightData, params) {
    if (!params) params;

    const altitude = document.querySelector(`#autopilot .altitude`);

    Object.entries(params).forEach(([key, value]) => {
      const e = document.querySelector(`#autopilot .${key}`);
      e?.classList.toggle(`active`, !!value);

      // Because if the autopilot's altitude value changes without us having
      // done so, (e.g. the autopilot is running an automated flight) then we
      // want to make sure that the browser reflects that new value:
      if (value && key === `ALT`) {
        // With one caveat: if our cursor is in the number field, then it's
        // safe to say we're trying to set a (new) number, and the autopilot
        // update should not suddenly change the input field value.
        if (!altitude || altitude === document.activeElement) return;
        altitude.value = parseFloat(value).toFixed(1);
      }
    });

    // And if we're not locked into flying a specific altitude, copy over
    // the current values so that when we click the button, we're just
    // telling the plane to "keep going" instead of immediately pushing
    // an altitude change through:
    if (!params[`ALT`]) altitude.value = round(flightData.alt);
  }
}
```

So let's save all that and then first set both our new `DAMPEN_CLOSE_TO_ZERO` and `TARGET_TO_HOLD` features to `false`,  so that we're still flying "the same way we did before". Then, after we've established that we're autopiloting just as aggressively (because nothing changed in terms of the code running yet), we change them to `true`, and save, to see the immediately result... 

![With target altitude](./images/alt-hold/target-altitude.png)

We see that our VS is now actually centered around zero, so we're _actually_ holding altitude, with a calmer moment-to-moment dVS, too, meaning that when we do change VS, it's less abrupt and we're less likely to get airsick.

And for the eagle eyed: we're also no longer drifting left, our bank angle has a slight bias to the right to keep us going steady and the aileron trimming is _far_ calmer. Because I ran this with the `fly-level.js` file updated in the same way as our altitude hold code: let's add `DAMPEN_CLOSE_TO_ZERO` and `FLY_SPECIFIC_HEADING` to our wing leveler:

### Flying straight, not just level

We'll start with the browser, adding a heading field and button in `autopilot.html`

```html
<div class="controls">
  ...
  <label>Target heading: </label>
  <input class="heading" type="number" min="1" max="360" value="360" step="1" />
  <button title="heading mode" class="HDG">HDG</button>
</div>
```

And the associated update to the browser's `autopilot.js`:

```javascript
...

const { round } = Math;

export const AP_DEFAULT = {
  MASTER: false,
  LVL: false,
  ALT: false,
  HDG: false,
};

export class Autopilot {
  constructor(owner) {
    ...
    if (value) {
      ...
      // Just like we did for ALT, we turn HDG from a boolean into a number:
      if (key === `HDG`) {
        value = document.querySelector(`#autopilot .heading`).value ?? 360;
      }
    }
    ...

    // And we add an onchange handler for the heading input field:
    document
      .querySelector(`#autopilot .heading`)
      ?.addEventListener(`change`, (evt) => {
        const { value } = evt.target;
        server.autopilot.update({ HDG: value });
        evt.target.blur();
      });
  }

  // And then we also add some ALT-specific code to our update function:
  update(flightData, params) {
    if (!params) params;

    const altitude = document.querySelector(`#autopilot .altitude`);
    const heading = document.querySelector(`#autopilot .heading`);

    Object.entries(params).forEach(([key, value]) => {
      const e = document.querySelector(`#autopilot .${key}`);
      e?.classList.toggle(`active`, !!value);

      if (value && key === `ALT`) {
        if (!altitude || altitude === document.activeElement) return;
        altitude.value = parseFloat(value).toFixed(1);
      }

      // Then we also add the same input field update logic so that we don't
      // change the field's value while the user's already typing something.
      if (value && key === `HDG`) {
        if (!heading || heading === document.activeElement) return;
        heading.value = parseFloat(value).toFixed(1);
      }
    });

    // And if HDG is not active, we want to keep the input field in sync, too:
    if (!params[`ALT`]) altitude.value = round(flightData.alt);
    if (!params[`HDG`]) heading.value = round(flightData.heading);
  }
}
```

Then a minor update to the server's `autopilot.js` code:

```javascript
import { ALTITUDE_HOLD, HEADING_MODE, LEVEL_FLIGHT } from "./utils/constants.js";

export class AutoPilot {
  constructor(...) {
    ...
    this.modes = {
      [LEVEL_FLIGHT]: false,
      [ALTITUDE_HOLD]: false,
      // We're using a new constant here mostly "because words".
      // While hold an altitude makes sense whether we have a number
      // or not, "flying level" doesn't imply a number, whereas
      // "flying a heading" does, so let's just add a mode:
      [HEADING_MODE]: false,
    };
    ...
  }

  async setTarget(key, value) {
    ...
    if (type === HEADING_MODE) {
      if (value !== false) {
        console.log(`Engaging heading hold at ${value} degrees`);
        // When we set a heading, update the "heading bug" in-game:
        this.set("AUTOPILOT_HEADING_LOCK_DIR", value);
      }
    }
  }
```

With the `HEADING_MODE` constant added to our `constants.js`:

```javascript
...
export const HEADING_MODE = `HDG`;
```

Then, we can update `fly-level.js` to take heading and dampening-close-to-zero into account:

```javascript
import { HEADING_MODE } from "../utils/constants.js";
import { radians, constrainMap, getCompassDiff } from "../utils/utils.js";
const { abs } = Math;

...

const FEATURES = {
  // The main feature
  FLY_SPECIFIC_HEADING: true,
  // And our additional features
  DAMPEN_CLOSE_TO_ZERO: true,
};

...

export async function flyLevel(autopilot, state) {
  ...
  // Our "how much are we off" information, which we're going to rewrite
  // a little by instead calling a function to do the work for us:
  const { targetBank } = getTargetBankAndTurnRate(autopilot, heading);
  const diff = targetBank - bank;
  ...
  
  // New feature! If we're close to our target, dampen the
  // corrections, so we don't over/undershoot the target too much.
  if (FEATURES.DAMPEN_CLOSE_TO_ZERO) {
    const aDiff = abs(diff);
    if (aDiff < 2) update /= 2;
  }

  trim.roll += update;
  api.set(`AILERON_TRIM_PCT`, trim.roll);
}

// And our new function:
function getTargetBankAndTurnRate(autopilot, heading, maxBank) {
  const { modes } = autopilot;

  let targetBank = DEFAULT_TARGET_BANK;
  let maxDBank = DEFAULT_MAX_D_BANK;

  // If there is an autopilot flight heading set (either because the
  // user set one, or because of the previous waypoint logic) then we
  // set a new target bank, somewhere between zero and the maximum
  // bank angle we want to allow, with the target bank closer to zero
  // the closer we already are to our target heading.
  let targetHeading = FEATURES.FLY_SPECIFIC_HEADING && modes[HEADING_MODE];
  let headingDiff;
  if (targetHeading) {
    headingDiff = getCompassDiff(heading, targetHeading);
    targetBank = constrainMap(headingDiff, -30, 30, maxBank, -maxBank);
    maxDBank = constrainMap(abs(headingDiff), 0, 10, 0, maxDBank);
  }

  return { targetBank, maxDBank, targetHeading, headingDiff };
}
```

With a new helper function in our `utils.js` for getting the signed difference between two compass directions:

```javascript
export function getCompassDiff(current, target, direction = 1) {
  const diff = current > 180 ? current - 360 : current;
  target = target - diff;
  const result = target < 180 ? target : target - 360;
  if (direction > 0) return result;
  return target < 180 ? 360 - target : target - 360;
}
```

And we're done, our wing leveler can now actually fly a heading and maintain that heading indefinitely!

## Improving altitude hold and heading mode

Technically, we also just implemented "change logic", because if we can set an altitude or heading, then we can also change those numbers and the plane will go "okay well that's not what we're doing here, let me put in corrections until we're at that altitude/flying that heading". But if we do that, we see that the transitions aren't exactly smooth. If we change our altitude, and we look at the VS curve...

![image-20240112095149402](./images/combined/improvement-01.png)

That's definitely choppy. Things get worse though, if we try to change our heading:

![image-20240112095455585](./images/combined/improvement-02.png)

The heading change isn't super smooth either, but what's worse is that when we bank we're going to drop (because that's how physics works, we've traded lift for torque), and in order to compensate the autopilot will change the plane's pitch, but then when we come out of our turn, that extra VS pushes us up, then the autopilot tries to correct for that, but it's a bit too much, so we end up undershooting, then the autopilot tries to correct for a VS that's already larger than it can cope with, so it adds as much as it can, and we overshoot. And now we're in a situation where we're _technically_ in a "stable flight" configuration, but my goodness _would it ever be uncomfortable_:

![image-20240112095836943](./images/combined/improvement-03.png)

We might not be crashing, but we're also not really "flying" anymore, we're on a nightmare rollercoaster of death. So let's fix that.

### Emergency altitude intervention

Let's fix our altitude hold code so that we can get out of the above situation, by adding some emergency trimming to stabilize our vertical speed, and some code to "snap" to our target heading instead of oscillating around that for a (short, but noticable) time. Time for more features!

```javascript
// We're going to make our maximum rate of change
// for vertical speed a little more permissive:
const DEFAULT_MAX_dVS = 200;

// And then we'll add our new feature flag:
const FEATURES = {
  ...
  EMERGENCY_PROTECTION: true,
};

export async function altitudeHold(autopilot, flightInformation) {
  ...

  // A slight update to our dVS logic: allow it to fully counteract the VS update
  const maxdVS = constrainMap(abs(diff), 0, 100, 0, DEFAULT_MAX_dVS);  
  update += constrainMap(dVS, -maxdVS, maxdVS, trimStep, -trimStep);
  
  ...

  // And the feature itself: an emergency trimming override for when we're
  // ascending or descending too fast, or if the rate of change in our
  // vertical speed indicates that we might get in that situation soon.
  if (FEATURES.EMERGENCY_PROTECTION) {
    // Do we need to intervene? If so, throw away the update we just computed.
    const VS_EMERGENCY = VS < -DEFAULT_MAX_VS || VS > DEFAULT_MAX_VS;
    const DVS_EMERGENCY = dVS < -DEFAULT_MAX_dVS || dVS > DEFAULT_MAX_dVS;
    if (VS_EMERGENCY || DVS_EMERGENCY) {
      update = 0;
    }
    // And instead run much larger corrections by constraining from a much
    // larger input interval to a much larger output interval. Let's go with
    // four times bigger, but you can experiment with this value yourself!
    const f = 4;
    const fMaxVS = f * maxVS;
    const fMaxdVS = f * MaxdVS;
    const fStep = f * trimStep;
    // Are we exceeding our "permissible" vertical speed?
    if (VS_EMERGENCY) {
      console.log(`VS emergency! (${VS}/${maxVS})`);
      update += constrainMap(VS, -fMaxVS, fMaxVS, fStep, -fStep);
    }
    // What about the rate of change of our vertical speed?
    if (DVS_EMERGENCY) {
      console.log(`VS delta emergency! (${dVS}/${maxdVS})`);
      update += constrainMap(dVS, -fMaxdVS, fMaxdVS, fStep, -fStep);
    }
  }

  trim.pitch += update;
  api.set(`ELEVATOR_TRIM_POSITION`, trim.pitch);
}
```

And this seems to have tamed our rollercoaster well enough:

![ALT intervention](./images/combined/alt-intervention/alt-intervention.png)

Putting it through its paces by running four 100 degree turns shows that we're still not turning "perfectly level", but that's fine, at least we manage to make a turn and end up pointing in the right direction, at the right altitude after coming out of our turn, instead of things going horribly wrong.

In fact, let's intentionally make things go horribly wrong by yanking on the stick and making the plane rocket upwards, as well as push down to induce a nose dive. Do we stabilize to a safe situation again?

![ALT intervention](./images/combined/alt-intervention/alt-intervention 2.png)

We do! Sure, it won't be comfortable, and it'll be scary as heck, but we can just ride it out, instead of either getting stuck in a nightmare ride or our plane crashing.

### Snapping to a new heading

Another thing we'll want to "fix" (in quotes because it's not super terrible right now, but definitely a bit weird) is that when you change from one heading to another, we overshoot the new heading by a few degrees, and it takes a little while for the plane to correct for that overshoot. At which point it might overshoot _again_ by a degree or so, before finally making it to pointing the heading we wanted. That's... annoying. The reason for this is that we're correcting based on a difference in bank angle, without regard for the difference in heading, so by the time we get to our target heading, the bank angle only just realized it should be 0 and the plane needs some time to fully catch up.

So let's add a `SNAP_TO_HEADING` feature to our `fly-level.js` that checks how close we actually are to our target heading, and if we're close, very close, or _super_ close, boosts the update we need to force the bank angle to undershoot  a little, thus counteracting the overshoot:

```javascript
const FEATURES = {
  ...
  SNAP_TO_HEADING: true,
};

// "snap to heading" settings
const BUMP_FACTOR = 1.8;

export async function flyLevel(autopilot, state) {
  ...

  let update = 0;

  // We use a new variable for the bank update, so we can boost that as needed:
  let bankDiff = constrainMap(diff, -maxBank, maxBank, -step, step);

  // And then we add three rounds of boosting based on how
  // close to our intended target heading we are.
  if (FEATURES.SNAP_TO_HEADING) {
    const aHeadingDiff = abs(headingDiff);
    // We're going to run the snapping logic for as long as we're half
    // a degree off of our intended target heading:
    if (aHeadingDiff > 0.5 && aHeadingDiff < 5) {
      // And the way we make sure we snap is with some step-wise bumping:
      const bump = BUMP_FACTOR;
      bankDiff *= bump;
      if (aHeadingDiff < 2) {
        bankDiff *= bump;
        if (aHeadingDiff < 1) {
          bankDiff *= bump;
        }
      }
    }
    // This may be counteracted by DAMPEN_CLOSE_TO_ZERO, but that won't
    // kick in until dBank has been taken into account, so we're not
    // necessarily always going to undo there was we're doing here.
  }

  update -= bankDiff;
  
  ...
}
  
// And let's add 2 letters to our target finding function to help us out, too:
function getTargetBankAndTurnRate(autopilot, heading, maxBank) {
  ...
  if (targetHeading) {
    // instead of targeting "the actual heading", we're going to target
    // a heading midway between "here" and "the real target". This changes
    // our targeting behaviour from a linear function into a quadratic
    // easing function. Nice!
    headingDiff = getCompassDiff(heading, targetHeading) / 2;
    ...
  }
  ...
}
```

 Let's look at the difference this makes, by temporarily changing the charting config for our `heading` value from "always show the full 0 through 360 degrees" to "dynamically zoom the graph as needed" (similar to how vertical speed gets plotted). First, changing course from 250 degrees to 300 degrees and back with `SNAP_TO_HEADING` turned off vs. with `SNAP_TO_HEADING` turned on:

![Snap to heading](./images/combined/heading-snap/snap-to-heading.png)

Much better. The first two turns with our original code take "forever" to actually stabilize, overshooting, then again, and then _again_, whereas with snapping turned on we get to our target heading and then as the name implies we "snap to that heading" and now that's the direction we're going.

## Edge-case testing

Now that we have pretty decent control of both the horizontal and the vertical, let's see what happens when we throw this code at some fun edge cases: planes that don't quite follow the same recipe as most other planes. Like....

![Top Rudder Solo 103](./images/planes/top-rudder-shot.png)

The [Top Rudder Solo 103](https://www.toprudderaircraft.com/product-page/103solo-standard) - this type of plane was never meant to have an autopilot. Under no circumstances should you try to add one in real life. Not that you could if you wanted to, Which no sane person would want. So we will. _Because we can_.

That said, this is the least likely plane to succeed, mostly because it flies so close to its stall speed: when the stars align it'll do 60 knots, but 50 is more typical, at 30 knots there's a good chance that you'll fall out of the sky when you even so much as thinking about tipping the wings because you're on the edge of no longer having enough lift to maintain altitude, and at 25 knots it's just a brick. Not a problem under normal operation, but when we slap on an autopilot... let's just say things might get exciting!

So, let's see what happens when we start a flight and turn on our autopilot. We'll first see if it can hold an altitude, then set it to climb, see if it can do that, and then set it to descend, and see if it can do that.

![A Top Rudder failure...](./images/combined/top-rudder-failure.png)

...We... uh... yeah, we may need to do something about that. Things start out alright, where we're holding altitude perfectly fine, but once we start to climb, things start to go wrong, fast. See that "speed" graph? That's showing us that as we're climbing, we're losing speed. Nothing unusual about that, but we're losing _a lot_ of speed. So much so, in fact, that we drop below the safe climbing speed of 30 knots, all the way down to below stall speed at 21 knots. And then it's basically game over.

So let's add "making sure we have enough speed to stay in the air" to our emergency handling in `altitude-hold.js`:

```javascript
...
export async function altitudeHold(autopilot, flightInformation) {
  const { api, trim } = autopilot;
  const { data: flightData, model: flightModel } = flightInformation;

  // we're going to need our current speed, and the plane's climb and cruise speeds:
  const { VS, alt, pitch, speed } = flightData;
  const { VS: dVS, pitch: dPitch } = flightData.d ?? { VS: 0, pitch: 0 };
  const { pitchTrimLimit, climbSpeed, cruiseSpeed } = flightModel;

  let trimLimit = pitchTrimLimit[0];
  trimLimit = trimLimit === 0 ? 10 : trimLimit;
  let trimStep = trimLimit / 10_000;

  const maxVS = DEFAULT_MAX_VS;
  // then we pass those on to the function that calculates our target VS
  const { targetVS, targetAlt, altDiff } = getTargetVS(autopilot, maxVS, alt, speed, climbSpeed, cruiseSpeed);
  
  ...
}
  
function getTargetVS(autopilot, maxVS, alt, speed, climbSpeed, cruiseSpeed) {
  ...

  if (FEATURES.EMERGENCY_PROTECTION) {
    // Are we getting dangerously slow during a climb?
    const threshold = climbSpeed + 10;
    if (targetVS > 0 && speed < threshold) {
      console.log(`Speed emergency! (${speed}/${threshold})`);
      // If we're at climbSpeed, which is the absolute slowest we can go
      // if we want to safely climb, just stop climbing entirely. Otherwise,
      // interpolate between "don't climb" and half the original target VS
      // at our theshold speed.
      targetVS = constrainMap(speed, climbSpeed, threshold, 0, targetVS/2);
    }
  }

  return { targetVS, targetAlt, altDiff };
}
```

This code should be fairly self-explanatory (given the code comments): SimConnect gives us various design speeds, include the "safe climb speed" (V<sub>Y</sub>), cruise speed (V<sub>C</sub>), and stall speeds (V<sub>S<sub>0</sub></sub> for stall speed when set up to land, and V<sub>S<sub>1</sub></sub> for stall speed during regular flight) so we can use those to determine whether we've slowed down too much. We don't actually want the plane below the climb speed (so we can ignore the stall speeds) so we can check whether we've dropped below "10 knots above the climb speed" (10 knots above, because if our speed's already dropping, it's goin got keep dropping while we try to correct for it, so we need that safety byffer), and if so we fairly aggressively reduce the target vertical speed calculated so far, to the point where if our speed ends up at climb speed, we just set it to zero. This might mean we climb a _lot_ slower than we otherwise would, but on the upside we're going to _keep_ climbing instead of dropping out of the sky!

So we're no longer at risk of the death spiral we were getting in before. In fact, we can now "comfortably" climb from 1500 feet up to 6000 feet, and back down to 1500, and then back up to 6000 etc. etc:

![Top Rudder success!](./images/combined/top-rudder-success.png)

...insofar as flying up to that altitude can be called comfortable when piloting an ultralight, or course... I hope we're wearing thermal pants! And can I just point out: **we added an autopilot to an ultralight**. That alone would be an amazing bit of open source to run alongside your game! And we're only getting started!

Buuuuut just out of curiosity, what if we change altitude and heading at the same time? Let's try a 500 foot climb with a 90 degree turn at the same time, and then a 500 foot descent with another 90 degree turn. Place your bets on what will happen... will we live?

![Top Rudder success!](./images/combined/top-rudder-success-2.png)

We will! It's certainly not confidence inspiring, it doesn't look like a thing we'll ever _actually_ want to do, and even if we do, we'll probably want our hands on the stick despite having an "autopilot", but: we'll live! Excellent!

(You may also notice that we seem to be far most stable going down than going up: turns out actually having enough air flowing over your control surfaces makes an aircraft easier to work with... who knew!)

So let's try another edge-case. A normal plane, but one that doesn't have aileron trim. How do we deal with that?

## Planes without aileron trim

Not all planes have aileron trim, instead relying on setting a rudder trim to keep the plane straight, and the stick to do all the maneuvering, which means that our autopilot isn't much use. We'd be able to maintain an altitude, since virtually all planes have pitch trim, but that alone won't keep us in the air. You'd think that was something you could ask SimConnect about, but while there is an `AILERON_TRIM_DISABLED` variable, that only tells you whether it's _disabled_, and does not tell you whether there _is_ one or not. Instead, we're left having to just "compile a list of planes, as we find them", so... find, let's do that, even though it's quite dumb:

```javascript
export class FlightInformation {
  ...
  
  // Then our "update the model" code:
  async updateModel() {
    const data = await api.get(...FLIGHT_MODEL);
    if (!data) return (this.flightModel = false);

    // Make sure to run our quality-of-life functions:
    convertValues(data);
    renameData(data);
    
    // Does this plane have aileron trim?
    const noAileron = [`Turbo Arrow`];
    data.hasAileronTrim = !noAileron.some(t =>
      data.title.toLowerCase().includes(t.toLowerCase())
    );

    // Create a convenience value for trimming
    data.pitchTrimLimit = [data.trimUpLimit ?? 10, data.trimDownLimit ?? -10];
    return (this.model = data);
  }

  ...
}
```

We can now tap into the flight model's `hasAileronTrim` value to see whether we can just trim, or whether we need to level the plane by "attaching some strings to the steering wheel" in our `fly-level.js`:

```javascript
...
export async function flyLevel(autopilot, state) {
  const { trim, api } = autopilot;
  const { data: flightData, model: flightModel } = state;

  // Flight data
  const { bank, speed, heading, turnRate } = flightData;
  const { bank: dBank } = flightData.d ?? { bank: 0 };
  
  // Model data
  const { hasAileronTrim, weight } = flightModel;
  const useStickInstead = hasAileronTrim === false;

  // Our original step, based on the assumption that we're working
  // with trim, is now a "let" rather than a "const":
  let step = constrainMap(speed, 20, 150, radians(0.1), radians(5));

  // Because we'll need to change it if we're "trimming" on the stick:
  let aileron = 0;
  if (useStickInstead) {
    step = constrainMap(weight, 1000, 6000, 1, 3);
    aileron = flightData.aileron / 100; // make sure aileron is in the range [-1,1]
  }

  const maxBank = constrainMap(speed, 50, 200, 10, DEFAULT_MAX_BANK);
  const { targetBank, maxDBank, targetHeading, headingDiff } =
    // ...and we'll need this function to know whether we're on stick or not, too.
    getTargetBankAndTurnRate(autopilot, heading, maxBank, useStickInstead);

  ... 
  
  // And of course, we now need to either update the aileron trim
  // or just "the aileron", so: which one are we working with?
  if (useStickInstead) {
    const position = aileron + update / 100;
    // Even though the aileron value is reported as percentage, when
    // *setting* the aileron you need to map that to [-16384,+16384],
    // and it has to be a clean integer value or it'll crash SimConnect
    // Oh, and a positive aileron value corresponds to a negative here.
    // Because of course it does.
    api.trigger("AILERON_SET", (-16383 * position) | 0);
  } else {
    trim.roll += update;
    api.set("AILERON_TRIM_PCT", trim.roll);
  }
}

function getTargetBankAndTurnRate(autopilot, heading, maxBank, useStickInstead) {
  ...
  
  if (targetHeading) {
    headingDiff = getCompassDiff(heading, targetHeading);
    // if we're flying on stick, we use a sliding target, where we always
    // target half the distance to our real target. This will converge on
    // the real target as we progress through the turn, but it lets us
    // not overshoot (much) by taking slower to make the turn, especially
    // as we get close to our target.
    if (useStickInstead) headingDiff /= 2;
    targetBank = constrainMap(headingDiff, -30, 30, maxBank, -maxBank);
    maxDBank = constrainMap(abs(headingDiff), 0, 10, 0, maxDBank);
  }

  return { targetBank, maxDBank, targetHeading, headingDiff };
}
```

We're partially "guessing" here, with an alternative step size based on "flying a bunch of planes and seeing what works". The heading also isn't held as strictly as the trim-based approach, but at least now we can _fly_ planes without aileron trim, even if it's going to be less precise. In fact, we're probably going to drift, but again: we'll take it. At least things "work".

![the Piper Turbo Arrow III](./images/planes/turbo-arrow-III-shot.png)

Let's use Just Flight's [PA28 Piper Turbo Arrow III](https://www.justflight.com/product/pa-28r-turbo-arrow-iii-iv-microsoft-flight-simulator) to demonstrate the effect of this code, setting it to a heading of 250 degrees, switching to 300, and then back to 250. It can't strictly hold those, but it's "close enough to probably be fine if we have a flight path", which we'll tackle in part 4.

![Leveling using the stick](./images/combined/no-aileron-trim/level-on-stick.png)

The Piper settles a few degrees off from the actual heading it needs to fly (actually flying 253, 303, and 253) but given how few planes are "broken" in this way, we're going to call that good enough. We could test a few more planes that don't have aileron trim, and if they're all off in the same way, we can always just "cheat" by updating `getTargetBankAndTurnRate` so that it uses a heading that's 3 degrees less than what we specified or something. But that's more of an "if there's a plane we like to fly with this specific problem" rather than something that's worth tackling now.

What other edge-cases might we have?

## Controlling acrobatic planes

Say we want to have some fun in our stunt plane, but it's a boring flight to the practice "grounds" so we just turn on our autopilot to get us there.

![the Pitts Special S1](./images/planes/pitts-special-shot.png)

Will our current autopilot code actually get us there? As it turns out, no. No it won't:

![image-20240115102153561](./images/combined/acrobatic/bad-acrobatics.png)

That's a hard crash. And adding our plane to the list of "trim on stick" planes won't help either: the problem here is that these planes fly fundamentally differently from "regular" planes, with near-instant response to control inputs, and our autopilot simply can't run fast enough to keep up. We can't really speed up our autopilot (I mean, we can probably speed it up _a bit_, but we're definitely not going to run it every frame: we only have so much CPU available, and MSFS famously wants all of it), but what we _can_ do is make our autopilot give these kinds of planes much smaller corrections. This will make us turn slower, but on the upside: it makes the plane turn slower rather than immediately trying to do a roll.

Let's add an `isAcrobatic` flag to our flight model, in `flight-information.js`, and reorganize it since we're now working with multiple lists:

```javascript
...

// Yay, more hard-coded lists!
const noAileron = [`Turbo Arrow`].map(v => v.toLowerCase());
const acrobatic = [`Pitts`].map(v => v.toLowerCase());

export class FlightInformation {
  ...
    // Then our "update the model" code:
  async updateModel() {
    ...
    const title = data.title.toLowerCase();
    data.hasAileronTrim = !noAileron.some((t) =>title.includes(t));
    data.isAcrobatic = acrobatic.some((t) => title.includes(t));
    ...
  }
  ...
}
```

And presto, we now have an `isAcrobatic` flag that we can check in our `fly-level.js` code:

```javascript
...
export async function flyLevel(autopilot, state) {
  ...
  const { hasAileronTrim, weight, isAcrobatic } = flightModel;
  ...

  // Let's pass that value into our target finding function
  const { targetBank, maxDBank, targetHeading, headingDiff } =
    getTargetBankAndTurnRate(autopilot, heading, maxBank, isAcrobatic);
  const aHeadingDiff = abs(headingDiff);
  const diff = targetBank - bank;

  // And of course, use it to drastically reduce the step size,
  // until we're very close to our target, then only moderately
  // reduce the step size.
  if (isAcrobatic) {
    step = constrainMap(aHeadingDiff, 0, 10, step / 5, step / 20);
  }
  ...
}
  
// Remember how we made the heading a quadratic easing function?
// We're going to undo that for acrobatic planes, otherwise it
// will take them waaaay too long to cover the last few degrees
function getTargetBankAndTurnRate(autopilot, heading, maxBank, isAcrobatic) {
  ...
    headingDiff = getCompassDiff(heading, targetHeading);
    if (!isAcrobatic) headingDiff /= 2;
  ...
}

```

There. Let's see what that did for us:

![image-20240115105424178](./images/combined/acrobatic/good-acrobatics.png)

Looking pretty great!

So, let's try one more edge-case: planes that cruise very close to their "never exceed" (V<sub>NE</sub>) speed limit.

## Auto-throttling

Say we're flying a bear:

![The Kodiak 100](./images/planes/kodiak-100-shot.png)

This is the Daher Kodiak 100. It's fast! It's famous! It's also relatively easy to fly, but it has a really weird design quirk in MSFS... see if you can spot it:

![The problem with the Kodiak 100...](./images/combined/throttle/kodiak-problem.png)

If we look at its supposed cruise speed as reported by MSFS, it likes to fly at 174 knots. And if we look at our cockpit dash, it says we're going to die at 180 knots. That's... not a lot of leeway between "merrily cruising along" and "tearing a two million dollar plane apart in mid-air". So let's start a flight at 1500 feet, at its cruise speed of 174 knots, and climb up to its "intended" cruise altitude of 12000, and then... come back down to 1500 feet. And you can probably guess where this is going.

![Gettting to 12,000 feet is not a problem](./images/combined/throttle/kodiak-climb.png)

Going up: not a problem! With a cruise speed of 174 bit a minimum safe climb speed of 101 knots, the Kodiak has power _to spare_. We never even drop below 120 knots during our climb. And then we try to descend.

![Descending 12,000 feet does not end well](./images/combined/throttle/kodiak-descent-death.png)

The first few thousand feet: not a problem!

But all the while our speed is slowly creeping up, and after a little over 4000 feet of descent, at an altitude of 7860.7 feet, we're going too fast for the plane to handle and... 

![we overstressed the plane, which is a polite way to say we died](./images/combined/throttle/overstressed.png)

Game over.

So how do we deal with this edge-case? If you remember when we needed emergency measures to deal with the plane being told to climb faster than its engine could sustain, our solution then was to decrease the target VS. However, a second option would have been to just throttle up so that the plane has the power it needs, with a reduced target VS only once we're maxed out on the throttle.

Conversely, we can throttle _down_ if we're descending and we're seeing the plane go faster than its intended cruise speed. So let's write some "auto throttle" code  to help us keep our Kodiak 100 in one piece, starting with a new value to our `constants.js`:

```javascript
...
const AUTO_THROTTLE = `ATT`;
```

And then let's make a `src/autopilot/auto-throttle.js` file and get to work:

```javascript
import { ALTITUDE_HOLD, AUTO_THROTTLE } from "../utils/constants.js";
import { constrainMap } from "../utils/utils.js";

const { abs } = Math;

export function autoThrottle(autopilot, flightInformation) {
  const { api, modes } = autopilot;
	const { data: flightData, model: flightModel } = flightInformation;
  
  // We'll need to know our current altitude and speed...
  const { alt, speed } = flightData;
  const { speed: dV } = flightData.d;
  
  // As well as knowing how many engines we're working with,
  // and what the plane's intended cruise speed is:
  const { engineCount, cruiseSpeed } = flightModel;

  const targetAlt = modes[ALTITUDE_HOLD];
  const targetSpeed = cruiseSpeed;
  const diff = abs(speed - targetSpeed);
  
  // An accelleration threshold that we use to determine
  // if we should (still) speed up or down:
  const threshold = constrainMap(diff, 0, 10, 0.01, 0.2);
  
  // A factor for "how much our altitude difference matters":
  const altFactor = constrainMap(targetAlt - alt, 0, 100, 0, 0.25);
  
  // And our throttling step size, which is both dependent on
  // how far off our speed is from the target...
  let step = constrainMap(diff, 0, 50, 1, 5);
  
  // As well as how light the plane is, because the amount of
  // throttle we need for a lumbering hulk will be way more
  // than we need for a little and nimble little plane.
  step = constrainMap(weight, 1000, 6000, step/5, step);
  
  // Also we want to make sure that while we can throttle
  // up to 100%, we never throttle down past 25%. Because
  // we don't want the engines to cut out on us.
  const throttle = amount => {
    changeThrottle(api, engineCount, amount, 25, 100);
  }

  // 1) are we in a throttle-up situation?
  if (targetSpeed - speed > 2) {
    console.log(`throttle up`);
    if (dV <= threshold) {
      throttle(step);
    }
    // do we need to climb? then throttle up a bit more
    if (alt < targetAlt - 50) {
      console.log(`climbimg`);
      throttle(altFactor * step);
    }
    // are we speeding up more than desired?
    if (dV > threshold) {
      throttle(step / 4);
    }
  }

  // 2) are we in a throttle-down situation?
  if (speed - targetSpeed > 2) {
    console.log(`throttle down`);
    if (dV >= -3 * threshold) {
      console.log(`dV range good, throttling down`);
      throttle(-step);
    }
    // do we need to descend? then throttle down a bit more
    if (alt > targetAlt + 50) {
      console.log(`descending`);
      throttle(-altFactor * step);
    }
    // Are we slowing down more than desired?
    if (dV < -3 * threshold) {
      console.log(`dV too low, throttling up`);
      throttle(step / 4);
    }
  }
}

/**
 * To make life easier we make the "change the throttle" functionality
 * its own function, where we update all engines by the amount indicated,
 * and then poll the first engine to see what the *actual* new value is.
 */
async function changeThrottle(api, engineCount = 4, byHowMuch, floor = 0, ceiling = 100) {
  let newThrottle;
  for (let count = 1; count <= engineCount; count++) {
    const simVar = `GENERAL_ENG_THROTTLE_LEVER_POSITION:${count}`;
    const throttle = (await api.get(simVar))[simVar];
    if ((byHowMuch < 0 && throttle > floor) || (byHowMuch > 0 && throttle < ceiling)) {
      newThrottle = constrain(throttle + byHowMuch, floor, ceiling);
      api.set(simVar, newThrottle);
    }
  }
  const simVar = `GENERAL_ENG_THROTTLE_LEVER_POSITION:1`;
  newThrottle = (await api.get(simVar))[simVar];
  return newThrottle;
}
```

Effectively: "try to maintain cruise speed". And with that in place, what does our Kodiak do when told to go from 12000 feet down to 1500 feet?

![A fixed Kodiak 100](./images/combined/throttle/fixed.png)

And once more: we live. You can see the auto-throttle keeping our speed around 174 knots (we go over a bit, we go under a bit) through pretty much the entire descent. And with that, we've exhausted the list of edge cases to look at. Which means our autopilot is done! Which means we can finally get down to writing the _real_ autopilot! ..._Wait, what?_

# Part four: "Let's just have JavaScript fly the plane for us"

So far we've been looking at what we _call_ an autopilot, but is it? Can we just get in the plane, and then tell it to pilot itself? In the real world: no, absolutely not, for very good reasons. But we're not dealing with the real world, we're dealing with a video game that we have near enough full control over, so why would we stop at "what you can do in the real world" when we can make things _so_ much cooler by adding in the bits you won't get in real life? We now have the basics in place for making the plane go where we want it to go, so let's create a UI that lets use _tell it_ where we want it to go, starting _and ending_ on a runway. Because now we're ready to tackle the  _really_ interesting parts:

- creating a waypoint-based navigation system where you just put markers on the map to form a flight path, and have the plane figure out how to fly that path,
- adding terrain awareness so we don't even need to care about setting the correct altitudes for each waypoint,
- adding auto-takeoff so we can start the plane on the runway, hit "take off!" and then have the plane just... do that, and finally,
- adding auto-landing, so that at the end of the flight, the plane just finds a nearby airport, figures out the approach, and then lands itself.

If that sounds like too much work: it might be. And no one would blame you if you stopped here. But if that sounds _amazing_... we're not at the bottom of this page yet, let's implement some crazy shit!

## Mocking ourselves an airplane

Before we jump into all this, let's "quickly" implement a mock airplane, to save ourselves the hassle of needing to run MSFS for some tests that would take forever to run through MSFS, and just... don't need it running? All we need is our own fake plane, with associated fake API to report on that plane, such that it "mostly" behaves: as long as it models some rudimentary physics, running our autopilot code on it should work.

## Waypoint navigation

Now that we can fly a specific heading and altitude, and we can switch to new headings and altitudes, the next logical step would be to tell them autopilot to do that automatically, by programming a flight path to follow, with our plane flying towards some waypoint, and then when it gets close, transitioning to flying towards the next waypoint, and so on. Something like this:

![image-20230529142215897](./images/page/map-with-waypoints.png)

Flying towards a point is pretty easy, but transitioning in a way that "feels right" is a bit more work, so there might be a bit more code here than you'd expect. Plus, we want to place, move, and remove points using the map on our web page, but the actual waypoints themselves will live in the autopilot, so there's a bit of work to be done there, too.

As such, we're going to need to break down waypoint logic as a few separate tasks:

1. the server side, which is the authority on which waypoints exist and which one we're flying towards,
   1. which requires having code that models waypoints, and
   2. requires updating to our heading mode to made the plane fly along our flight path.
2. the client side, which lets us place and (re)move waypoints,
   1. which requires some Leaflet code for placing, showing, and moving waypoints as markers, and
   2. some regular JS for synchronizing with the server on waypoint information

### The server side

We'll start with a model for waypoints:

```javascript
// a silly little id function, but we don't need full uuids here
const nextId = (() => {
  let id = 1;
  return () => id++;
})();

export class Waypoint {
  constructor(owner, lat, long, alt = false) {
    this.id = nextId();
    this.owner = owner;
    this.reset();
    this.move(lat, long);
    this.elevate(alt);
  }

  reset() {
    this.completed = false;
    this.active = false;
    this.next = undefined;
  }

  // Set this waypoint's GPS location:
  move(lat, long) {
    this.lat = lat;
    this.long = long;
  }

  // set this waypoint's altitude
  elevate(alt) {
    // are we removing the elevation information by passing something falsey?
    if (!alt) return (this.alt = false);

    // We are not, so much sure the value we got is a sensible number.
    alt = parseFloat(alt);
    if (!isNaN(alt) && alt > 0) this.alt = alt;
  }

  // Since waypoints define a flight path, it's useful to have a reference to "the next waypoint" (if there is one):
  setNext(next) {
    this.next = next;
  }

  // Waypoints can be (de)activated and completed.
  activate() {
    this.active = Date.now();
  }
  deactivate() {
    this.active = false;
  }
  complete() {
    this.completed = true;
  }

  // And since we need to send them to the client, make sure that when this gets turned into JSON,
  // we do *not* include the owner object. The toJSON() function is really useful for that.
  toJSON() {
    const { id, lat, long, alt, active, complete, next } = this;
    return { id, lat, long, alt, active, completed, next: next?.id };
  }
}
```

And that's all we need them to do. Next up, a little waypoint manager:

```javascript
import { KMS_PER_KNOT, HEADING_MODE } from "./constants.js";
import {
  degrees,
  dist,
  getHeadingFromTo,
  getDistanceBetweenPoints,
  pathIntersection,
} from "./utils.js";
import { Waypoint } from "./waypoint.js";

const { abs } = Math;

export class WayPoints {
  constructor(autopilot) {
    this.autopilot = autopilot;
    this.reset();
  }

  reset() {
    this.points = [];
    this.currentWaypoint = undefined;
  }

  // Make sure that if someone asks for all waypoints, they don't get a reference to the actual array.
  getWaypoints() {
    return this.points.slice();
  }

  // Add a waypoint for a specific GPS coordinate
  add(lat, long, alt) {
    const { points } = this;
    const waypoint = new Waypoint(this, lat, long, alt);
    points.push(waypoint);
    // If we don't have a "current" point, this is now it.
    this.currentWaypoint ??= waypoint;
    this.resequence();
    return waypoint;
  }

  // Move a waypoint around
  move(id, lat, long) {
    this.points.find((e) => e.id === id)?.move(lat, long);
  }

  // Change a waypoint's elevation
  elevate(id, alt) {
    this.points.find((e) => e.id === id)?.elevate(alt);
  }

  // Remove a waypoint from the flight path
  remove(id) {
    const { points } = this;
    const pos = points.findIndex((e) => e.id === id);
    if (pos > -1) {
      points.splice(pos, 1)[0];
      if (this.currentWaypoint?.id === id) {
        this.currentWaypoint = this.currentWaypoint.next;
      }
      this.resequence();
    }
  }

  // Make sure all waypoints point to the next one in the flight path.
  resequence() {
    const { points } = this;
    for (let i = points.length - 1; i >= 0; i--) {
      points[i].setNext(points[i + 1]);
    }
  }

  // remove all active/completed flags from all waypoints and mark the first point as our active point.
  resetWaypoints() {
    this.points.forEach((waypoint) => waypoint.reset());
    this.resequence();
    this.currentWaypoint = this.points[0];
  }

  // Move the currently active waypoint to "the next" waypoint. Which might be nothing.
  transition() {
    const { currentWaypoint: c } = this;
    c.complete();
    this.currentWaypoint = this.currentWaypoint.next;
  }

  getHeading(state) {
    // We'll implement this function in a bit since it's the important one.
  }
}
```

We'll come back to the `getHeading` function in a bit, since that's the part that we'll tap into in our heading mode code to determine where to steer the plane, but for now let's close the loop so we can send and receive waypoint information to and from the client, where we see and work with them on our Leaflet map.

First, we update the server's autopilot code, so it can do waypoint things (which is mostly passing things on to the waypoint manager):

```javascript
export class AutoPilot {
  constructor(api, onChange = () => {}, lat = 0, long = 0) {
    ...
    this.waypoints = new WayPoints(this, lat, long);
  }

  // Read and pass-through functions for waypoints:
  getWaypoints() { return this.waypoints.getWaypoints(); }
  addWaypoint(lat, long) { this.waypoints.add(lat, long); }
  moveWaypoint(id, lat, long) { this.waypoints.move(id, lat, long); }
  elevateWaypoint(id, alt) { this.waypoints.elevate(id, alt); }
  removeWaypoint(id) { this.waypoints.remove(id); }
  resetFlight() { this.waypoints.resetWaypoints(); }

  getAutoPilotParameters() {
    const state = {
      MASTER: this.autoPilotEnabled,
      // add the waypoint information to our autopilot parameters:
      waypoints: this.waypoints.getWaypoints(),
    };
    Object.entries(this.modes).forEach(([key, value]) => {
      state[key] = value;
    });
    return state;
  }

  ...
}
```

With an update to our server so that we can actually "talk waypoints" in our autopilot message handling:

```javascript
    ...

    if (action === `autopilot`) {
      // Autopilot messages need to be further unpacked:
      const { action, params } = data;

      if (action === `update`) {
        autopilot.setParameters(params);
      }

      // We add a new action for waypoint handling, with three possible specific instructions:
      if (action === `waypoint`) {
        const { lat, long, alt, move, elevate, id, remove, reset } = data.params;
        if (reset)        { autopilot.resetFlight(); }
        else if (move)    { autopilot.moveWaypoint(id, lat, long); }
        else if (elevate) { autopilot.elevateWaypoint(id, alt); }
        else if (remove)  { autopilot.removeWaypoint(id); }
        else { autopilot.addWaypoint(lat, long, alt); }
      }

      socket.json(`autopilot`, autopilot.getAutoPilotParameters());
    }

    ...
```

So nothing too fancy, mostly just "the bare minimum code necessary to forward data into where it gets handled", and because we added the waypoints to our autopilot parameter set, the client will automatically get them as part of its autopilot interval polling.

### The client side

In fact, let's switch to the client side and update the data handler for that interval poll:

```javascript
export class Autopilot {
  ...

  bootstrap(params) {
    Object.entries(params).forEach(([key, value]) => {
      // if we see the waypoints key, we don't want to send this on as a standard
      // autopilot property, we want to do some special handling instead.
      if (key === `waypoints`) {
        return this.owner.manageWaypoints(value);
      }
      ...
    });
  }

  ...
}
```

With a corresponding update in our `plane.js`:

```javascript
export class Plane {
  constructor(map, location, heading) {
    console.log(`building plane`);
    // set up a waypoint overlay on our Leaflet map
    this.waypoints = new WaypointOverlay(this, map);
    ...
  }

  ...

  // and just forward all the data we get from the autopilot straight to the overlay
  async manageWaypoints(data) { this.waypoints.manage(data); }
  ...
};
```

Which just leaves implementing the code for managing Leaflet markers that represent our waypoints:

```javascript
import { callAutopilot } from "./api.js";
import { Trail } from "./trail.js";

export class WaypointOverlay {
  constructor(autopilot, map) {
    this.autopilot = autopilot;
    this.map = map;
    this.waypoints = [];
    this.setupMapHandling();
  }

  // Set up the event handling for the map: if we click, put a new waypoint on that GPS location.
  setupMapHandling() {
    this.map.on(`click`, (e) => this.add(e));
    // ...we'll be adding some more to this function later!
  }

  // The "manage" function takes all the waypoint information we got from the
  // autopilot and turns it into Leaflet marker add/update or remove instructions.
  manage(waypoints) {
    // Manage each waypoint that's in the list.
    waypoints.forEach((waypoint) => this.manageWaypoint(waypoint));

    // So we need to remove any waypoints from our map?
    if (waypoints.length < this.waypoints.length) {
      const toRemove = this.waypoints.filter(
        (w) => !waypoints.find((e) => e.id === w.id)
      );
      const noAPcall = true;
      toRemove.forEach((waypoint) => this.remove(waypoint));
    }
  }

  // This function gets called for all waypoints that the autopilot says exist.
  manageWaypoint(waypoint) {
    const { waypoints } = this;
    const { id } = waypoint;
    // That means that they're either new points, or updates to points we already know about.
    const known = waypoints.find((e) => e.id === id);
    if (!known) return this.addNewWaypoint(waypoint);
    this.updateKnownWaypoint(known, waypoint);
  }

  // Adding a new waypoint means creating a new marker:
  addNewWaypoint(waypoint) {
    // And remember that if we refresh the page mid-flight, we might get a bunch
    // of waypoints that have already been completed, so take that into account.
    const { id, lat, long, completed } = waypoint;

    // First we create a Leaflet icon, which is a div with custom size and CSS classes.
    const icon = L.divIcon({
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      className: `waypoint-div`,
      html: `<img class="${`waypoint-marker${completed ? ` completed` : ``}`}" src="css/images/marker-icon.png">`,
    });

     // Then we create a Leaflet marker that uses that icon as its visualisation.
    const marker = (waypoint.marker = L.marker(
      { lat, lng: long },
      { icon, draggable: true }
    ).addTo(this.map));

    // Then we add event listeners: when we click on a marker, we should be able to set its
    // altitude, and if we double-click a marker, it should get removed from the flight path.
    //
    // Leaflet has click and double click handle, but doesn't actually debounce clicks to see
    // if something was a double click. It just fires off spurious clicks *as well*, which isn't
    // great, so we need to run our own debounce code:
    let dblClickTimer = false;

    marker.on(`dblclick`, () => {
      clearTimeout(dblClickTimer);
      dblClickTimer = false;
      this.remove(waypoint);
    });

    marker.on(`click`, () => {
      if (dblClickTimer) return;
      dblClickTimer = setTimeout(() => {
        dblClickTimer = false;
        let value = prompt("Set waypoint altitude:", waypoint.alt);
        this.elevate(waypoint, value);
      }, 500);
    });

    // Next up: if we click-drag a marker, we want the server-side waypoint to update when we let go.
    marker.on(`drag`, (event) => (marker.__drag__latlng = event.latlng));
    marker.on(`dragend`, () => this.move(waypoint));

    // Then, because we want to see the path, not just individual markers, we
    // also build trails between "the new marker" and the previous one.
    const prev = this.waypoints.slice(-1)[0];
    this.waypoints.push(waypoint);
    if (prev) {
      waypoint.prev = prev;
      prev.next = waypoint;
      waypoint.trail = new Trail(this.map, [prev.lat, prev.long], `var(--flight-path-colour)`);
      waypoint.trail.add(lat, long);
    }
  }

  // A helper function for building waypoint-connecting trails
  addNewTrail(lat, long) {
    return new Trail(this.map, [lat, long], `var(--flight-path-colour)`);
  }

  // Updating a known marker means checking if it moved, or changes active/completed states:
  updateKnownWaypoint(known, { lat, long, active, completed }) {
    // First, are we currently dragging this point around? If so, don't
    // do anything to this point yet, because we're not done with it.
    if (known.marker?.__drag__latlng) return;

    // Did its location change?
    if (known.lat !== lat || known.long !== long) {
      known.lat = lat;
      known.long = long;
      known.marker.setLatLng([lat, long]);

      // if it did, we also need to update the trail(s) that connect to it.
      const prev = known.prev;
      if (prev) {
        // we can do this by updating the existing trail, but it's just as easy to just create a new one.
        known.trail?.remove();
        known.trail = this.addNewTrail(prev.lat, prev.long);
        known.trail.add(lat, long);
      }
      const next = known.next;
      if (next) {
        next.trail.remove();
        next.trail = this.addNewTrail(lat, long);
        next.trail.add(next.lat, next.long);
      }
    }

    // Do we need to update its altitude information?
    if (alt) {
      known.alt = alt;
      const div = known.marker.getElement();
      if (div && div.dataset) div.dataset.alt = `${alt}'`;
    }

    const css = known.marker._icon.classList;

    // Are we in the transition radius?
    known.active = active;
    if (active) { classes.add(`active`); } else { classes.remove(`active`); }

    // Or did we complete this waypoint?
    known.completed = completed;
    if (completed) { classes.add(`completed`); } else { classes.remove(`completed`); }
  }

  // the "add a marker" handler for map clicks
  add({ latlng }) {
    // remember, the server is the authority on waypoints, so when we click the map,
    // instead of immediately creating a marker we instead tell the autopilot to create
    // a waypoint. If it does, we'll find that new waypoint when manage() gets called.
    const { lat, lng: long } = latlng;
    callAutopilot(`waypoint`, { lat, long });
  }

  // the "move a marker" handler for marker click-drags
  move({ id, marker }) {
    const { lat, lng: long } = marker.__drag__latlng;
    marker.__drag__latlng = undefined;
    callAutopilot(`waypoint`, { update: true, id, lat, long });
  }

  // the "update the waypoint's elevation" call
  elevate({ id }, alt) {
    callAutopilot(`waypoint`, { elevate: true, id, alt });
  }

  // the "remove a marker" handler for marker clicks. Note that if this is a real
  // map click, we should tell the server that we want it removed, but if this gets
  // called from our own manage(waypoints) function, in response to the server having
  // sent us waypoint information that does not include some waypoints we're still
  // showing, then removing it from the map should *not* also come with a call to
  // the server to remove it. It already doesn't exist!
  remove(waypoint, withAPIcall = false) {
    if (!waypoint.id) {
      waypoint = this.waypoints.find((e) => e.id === waypoint);
    }

    const { id } = waypoint;

    // Send a remove call to the autopilot only if this was a client-initiated removal
    if (withAPIcall) callAutopilot(`waypoint`, { id, remove: true });

    // Removing the mark from our map is pretty easy:
    waypoint.marker.remove();
    waypoint.trail?.remove();

    // But this marker may have been in between to other markers, in which case
    // we need to link up its previous and next marker with a new trail.
    const prev = waypoint.prev;
    const next = waypoint.next;
    if (next) {
      next.trail.remove();
      if (prev) {
        next.trail = this.newTrail(prev.lat, prev.long);
        next.trail.add(next.lat, next.long);
        prev.next = next;
      }
      next.prev = prev;
    } else if (prev) {
      prev.next = undefined;
    }
  }

  // And finally, remember to remove the waypoint from the array:
  const pos = this.waypoints.findIndex((e) => e.id === id);
  this.waypoints.splice(pos, 1);
}
```

And of course, the image we're using for waypoints:

![marker-icon](./images/page/marker-icon.png)

With a smattering of CSS to make our markers look reasonable:

```CSS
:root {
  --flight-path-colour: #0003;
}

.waypoint-div {
  border: none;
  background: transparent;
}

.waypoint-div::before {
  content: attr(data-alt);
  position: relative;
  width: 40px;
  display: inline-block;
  text-align: center;
  bottom: -40px;
  text-shadow: 0px 0px 5px black, 0px 0px 10px black, 0px 0px 15px black;
  color: white;
  font-weight: bold;
}

.waypoint-div img.waypoint-marker {
  z-index: 1 !important;
  opacity: 1;
  width: 100%;
  height: 100%;
  position: relative;
  top: -20px;
}

.waypoint-div.active img.waypoint-marker {
  filter: hue-rotate(145deg) brightness(2);
}

.waypoint-div.completed img.waypoint-marker {
  filter: hue-rotate(-45deg);
  opacity: 1;
  width: 20px !important;
  height: 20px !important;
  position: relative;
  top: 0px;
  left: 10px;
}
```

We can now place a bunch of waypoints by clicking the map, which will send a waypoint creation message to the server, which creates the _actual_ waypoint, which we're then told about because the waypoints are now part of our autopilot information that we send to the client every time the autopilot updates.

![image-20230607105644939](./images/page/waypoints-with-alt.png)

### Flying and transitioning over waypoints

Of course with all this setup we still need to actually make the plane _fly_ using our waypoints, so let's update our server-side autopilot, specifically the `getTargetBankAndTurnRate` function that we use as part of `flyLevel`:

```javascript
function getTargetBankAndTurnRate(autopilot, state, maxBank) {
  const heading = degrees(state.heading);

  let targetBank = DEFAULT_TARGET_BANK;
  let maxTurnRate = DEFAULT_MAX_TURN_RATE;

  // Are we flying using waypoints?
  const { waypoints } = autopilot;
  const waypointHeading = waypoints.getHeading(state);
  if (waypointHeading) {
    autopilot.setTarget(HEADING_MODE, waypointHeading);
  }
  ...

  return { targetBank, maxTurnRate };
}
```

And then, finally, let's fill in that `getHeading` function. In fact, let's first take a little detour to figure out how we even want to do that.

#### Flight path policies

Say we have a plane, and a bunch of waypoints, and our plane cannot magically change heading. If we naively fly towards "the next waypoint on the list", things... don't look great:

<graphics-element title="a flight path tester" src="./graphics/flight-path-base.js"></graphics-element>

We see the plane getting wildly off-course depending on much it needs to turn, and while it passes _through_ each waypoint, it really doesn't follow the flight path we gave it. Instead, we want it to get "onto the flight path" as quickly as possible even if it overshoots a waypoint:

<graphics-element title="a flight path tester" src="./graphics/flight-path-base.js">
  <source src="./graphics/intercepting.js" />
</graphics-element>



If we pretend that the circle is an aeroplane, with the little dot showing its current heading, the question is "what should happen over time?". In fact, let's answer that by starting simpler, with zero waypoints:

[image removed pending graphics element code]

Obviously, "what should happen over time?" here is "the plane should just fly in whatever heading it's already going". So far so good! But now we add a waypoint:

[image removed pending graphics element code]

What we probably want is for the plane to calculate the angle from itself to that waypoint, and then fly the associated heading, as indicated in green. That heading is going to change over time, because we can't just instantly change course, but it'll get us to our waypoint:

[image removed pending graphics element code]

And if the plane is flying quickly, or has a low turning rate, it takes it a bit longer, and will transition over the waypoint at a different angle:

[image removed pending graphics element code]

What if we add another waypoint? We probably want the aeroplane to target the first waypoint, and then once it gets there, target the next point. In pseudo-code

```pseudocode
current = 0
target = waypoints[current]
if dist(plane, target) < 20 -> curent = current + 1
```

This gives us the following behaviour:

[image removed pending graphics element code]

That might work, and if we try this with more points we get something that kinda feels like a flight path, although it's not great:

[image removed pending graphics element code]

We're never actually "on" the flight path, we're always kinda next to it at a different angle. But it gets really problematic with steeper angles and bigger turning circles:

[image removed pending graphics element code]

That's basically terrible, this is not flying a flight plan, this is a drunk pilot, and not something we'd want to use. So we're going to have to give up on purely looking at the waypoints themselves. Instead, let's look at the paths between them: we can project the plane's position onto a path, picking the first point if the projection would lie outside the path, and then use that as our target. In pseudocode:

```pseudocode
current = 0

target = ???

if target exists -> plane.target(target)

plane.target = target:
  a = angle to target
  direction = sign of the angle difference between a and plane.heading;
  plane.heading = direction * some value that scales with fast the plane can turn
```

to figure out what the target should be, let's draw some more things. First, if we're not near the flight path, we want the following:

[image removed pending graphics element code: aproach from past the segment + approach from aside the segment]

wever, when we get close to the flight path, we want to target the point where our circle intersects the line, nearest to the next waypoint:

[image removed pending graphics element code: partial overlap at the start of the segment + partial overlap along the segment]

So if we express that in pseudo-code:

```pseudocode
p1 = waypoints[current]

p2 = waypoints[current + 1]
if p2 exists -> i1 = projection for our plane onto line p1--p2

p3 = waypoints[current + 2]
if p3 exists -> i2 = projection for our plane onto line p2--p3

target = i1
if dist(plane, p2) < radius ->
    current = current + 1
    if i2 exists -> target = i2

if target exists -> plane.target(target)
```

So what happens when we use _that_? Sure, we need to recompute that point every frame, but maths is cheap, so if it looks better, it's probably worth it:

[image removed pending graphics element code]

And it is: instead of never actually being on the flight path itself, we're now on the flight path _the majority of the time_. And a "switchback" style flight path is suddenly far less problematic:

[image removed pending graphics element code]

Although of course we still need to make sure our turns aren't unrealistically drastic. For instance, the same switch back path with a very-slow-to-turn plane wouldn't be great:

[image removed pending graphics element code]

And we also need to pick a good radius, because if it's too small, we'll overshoot (potentially so much that we need to circle back):

[image removed pending graphics element code]

And if it's too large, we'll basically smooth our path too much:

[image removed pending graphics element code]

So the trick is to pick a good radius based on how fast a plane can make a turn. The faster a plane can turn, the smaller we can make its transition radius, and the slower it turns, the bigger that radius will need to be. So let's switch from pseudo-code to actual code, and let's get to implementing!

```javascript
import { pathIntersection } from "./utils.js";

...

export class WayPoints {
  ...

  getHeading(state) {
    const { modes } = this.autopilot;
    let heading = modes[HEADING_MODE] || degrees(state.heading);

    const { latitude: cy, longitude: cx, speed, declination } = state;
    const { currentWaypoint: p1 } = this;

    // If there's no current waypoint, don't change the heading.
    if (!p1) return heading;

    // If there is, make sure it'll show as active on the client-side map
    const { lat: p1y, long: p1x } = p1;
    const p2 = p1.next;
    p1.activate();

    // Is there a next waypoint? If not, and we're coming up to the current waypoint,
    // complete the flight path by calling the transition() function
    if (!p2) {
      const d1 = getDistanceBetweenPoints(cy, cx, p1y, p1x);
      if (d1 < 0.5) {
        this.transition();
        return;
      }
      // If we did not transition, return the heading that points at p1, corrected for
      // magnetic declination, because otherwise we'll fly in the wrong direction!
      heading = getHeadingFromTo(cy, cx, p1y, p1x);
      return (heading - declination + 360) % 360;
    }

    // If there is a next point, we have a path we can work with.
    const { lat: p2y, long: p2x, next: p3 } = p2;
    p2.activate();

    // our initial target is simply going to be "the current waypoint"
    let target = p1;

    // And then we do some maths: we base our transition radius on how fast the aeroplane's going,
    // under the generally true rule that the faster the plane, the bigger the turning circle.
    const transition_time = 30;
    const transitionRadius = 0.01 * speed * KMS_PER_KNOT * transition_time;

    // Find the intersection point of our "circle" with the path segment between current and next.
    // Note that if that intersection lies outside the segment, it'll return the closes endpoint.
    const i1 = pathIntersection(p1x, p1y, p2x, p2y, cx, cy, transitionRadius);

    // Is there a path segment from the next point to the point after that?
    let i2 = undefined;
    if (p3) {
      const { lat: p3y, long: p3x } = p3;
      i2 = pathIntersection(p2x, p2y, p3x, p3y, cx, cy, transitionRadius);
    }

    // First guess: our target is that first intersection
    if (i1) target = i1;

    // If we're close enough to p2, update our target to i2 and switch the current point to the next one:
    const contained = (p) => {
      if (!p) return false;
      const { x, y } = p;
      return dist(p1.x, p1.y, x, y) <= transitionRadius;
    };

    if (dist(cx, cy, p2x, p2y) < transitionRadius || (contained(i1) && contained(i2))) {
      this.transition();
      if (i2) target = i2;
    }

    // We can now determine what the true heading towards this target is based on GPS coordinates,
    heading = getHeadingFromTo(cy, cx, target.y, target.x);
    // and then return it, corrected for magnetic declination, so it's a proper compass heading.
    return (heading - declination + 360) % 360;
  }
}
```

And then with the code for `pathIntersection`, we should be done:

```javascript
// Find a circle/line intersection, given a line segment, capping the intersection to the segment end points.
function pathIntersection(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const c = { x: cx, y: cy, r };

  const A = dy ** 2 + dx ** 2;
  const A2 = 1 / (2 * A);
  const B = 2 * (-c.x * dx - c.y * dy + x1 * dx + y1 * dy);
  const C =
    c.x ** 2 +
    c.y ** 2 +
    x1 ** 2 +
    y1 ** 2 -
    2 * c.x * x1 -
    2 * c.y * y1 -
    c.r ** 2;
  const D = B * B - 4 * A * C;
  const t1 = (-B + sqrt(D)) * A2;
  const t2 = (-B - sqrt(D)) * A2;

  // You may have noticed that the above code is just solving the
  // quadratic formula, so t1 and/or t2 might be "nothing". If there
  // are no roots, there there's no intersection between the circle
  // and the line *segment*, only the circle and the *line*.
  if (isNaN(t1) && isNaN(t2)) {
    const cx = c.x - x1;
    const cy = c.y - y1;
    let f = constrain((dx * cx + dy * cy) / (dx ** 2 + dy ** 2), 0, 1);
    return { x: x1 + dx * f, y: y1 + dy * f };
  }

  // If we have one root, then that's going to be our solution.
  if (isNaN(t1) || t1 < t2) t1 = t2;

  // cap the interesction if we have to:
  t = constrain(t1, 0, 1);

  // and return the actual intersection as {x,y} point
  return { x: x + dx * t, y: y + dy * t };
}
```

That's a lot of code to do what we sketched out before, so... does this work? Does this let us fly a flight plan?

<img src="./images/page/full-map.png" alt="image-20230604142254975" style="zoom: 67%;" />

You bet it does.

### Saving and loading flight paths

Before we move on to testing, let's make sure we can _repeat_ flights, otherwise testing is going to be quite the challenge. Thankfully, this is going to be super simple. First, we add some web page UI:

```html
<div id="maps-selectors">
  flight plan:
  <button name="clear">clear</button>
  <button name="reset">reset</button>
  <button name="save">save</button>
  load: <input type="file" name="load" />
</div>
```

With some extra JS added to our waypoint overlay:

```javascript
export class WaypointOverlay {
  ...

  setupMapHandling() {
    this.map.on(`click`, (e) => this.add(e));

    // Clearing the waypoints is a matter of just clicking each waypoint in reverse order:
    document
      .querySelector(`button[name="clear"]`)
      .addEventListener(`click`, () => {
        this.waypoints.reverse().forEach((waypoint) => waypoint.marker.fire(`dblclick`));
        this.waypoints = [];
      });

    // Resetting the path is a matter of telling the autopilot to do that for us:
    document
      .querySelector(`button[name="reset"]`)
      .addEventListener(`click`, () => {
        callAutopilot(`waypoint`, { reset: true });
      });

    // Saving our waypoints is actually fairly easy: we throw everything except the lat/long/alt
    // information away, and then we generate an `<a>` that triggers a file download for that
    // data in JSON format:
    document
      .querySelector(`button[name="save"]`)
      .addEventListener(`click`, () => {
        // Form our "purely lat/long/alt" data:
        const stripped = this.waypoints.map(({ lat, long }) => ({ lat, long }));
        const data = JSON.stringify(stripped, null, 2);

        // Then create our download link:
        const downloadLink = document.createElement(`a`);
        downloadLink.textContent = `download this flightplan`;
        downloadLink.href = `data:text/plain;base64,${btoa(data)}`;
        downloadLink.download = `flightplan.txt`;

        // And then automatically click it to trigger the download.
        console.log(`Saving current flight path.`);
        downloadLink.click();
      });

    // Loading data is even easier: we load the file using the file picker that is built
    // into the browser, then we parse the JSON and tell the autopilot to make waypoints:
    document
      .querySelector(`input[name="load"]`)
      .addEventListener(`change`, (evt) => {
        const file = evt.target.files[0];
        const reader = new FileReader();
        reader.onload = function () {
          try {
            // parse and then run through the list, sending autopilot "create waypoint" calls.
            const data = JSON.parse(reader.result);
            data.forEach(({ lat, long, alt }) => callAutopilot(`waypoint`, { lat, long, alt }));
            console.log(`Loaded flight path from file.`);
          } catch (e) {
            console.error(`Could not parse flight path.`);
          }
        };
        reader.readAsText(file);
      });
  }

  ...
}
```

### Picking the right waypoint

Of course, with saving and loading, we run the risk of loading a flight path that we're "in the middle of", with the plane nowhere near the start of the flight path. Right now, doing so would make the plane turn around so it can start all the way back at the start, which would be a bit silly. In order to deal with this, we update our loading code just a tiny bit, to trigger a new function on the autopilot side:

```javascript
export class WaypointOverlay {
  ...
  setupMapHandling() {
    ...
    document
      .querySelector(`input[name="load"]`)
      .addEventListener(`change`, (evt) => {
        const file = evt.target.files[0];
        const reader = new FileReader();
        reader.onload = function () {
          try {
            const data = JSON.parse(reader.result);
            data.forEach(({ lat, long }) => callAutopilot(`waypoint`, { lat, long }));

            // We add this one extra call:
            callAutopilot(`waypoint`, { revalidate: true })

            console.log(`Loaded flight path from file.`);
          } catch (e) {
            console.error(`Could not parse flight path.`);
          }
        };
        reader.readAsText(file);
      });
  }
}
```

And then we implement that `revalidate` instruction by first making the api server aware of it:

```javascript
if (action === `waypoint`) {
  const { lat, long, alt, move, elevate, id, remove, reset, revalidate } =
    data.params;
  if (revalidate) {
    autopilot.revalidate();
  } else if (reset) {
    autopilot.resetFlight();
  } else if (move) {
    autopilot.moveWaypoint(id, lat, long);
  } else if (elevate) {
    autopilot.elevateWaypoint(id, alt);
  } else if (remove) {
    autopilot.removeWaypoint(id);
  } else {
    autopilot.addWaypoint(lat, long, alt);
  }
}
```

With a pass-through in our `autopilot.js`:

```javascript
  async revalidateFlight() {
    const { PLANE_LATITUDE: lat, PLANE_LONGITUDE: long } = await this.get(`PLANE_LATITUDE`, `PLANE_LONGITUDE`);
    this.waypoints.revalidate(degrees(lat), degrees(long));
  }
```

And then the actual code in our waypoint manager:

```javascript
export class WayPoints {
  ...

  // revalidate the flight path based on the current plane position, marking the nearest waypoint
  // as "the currently active point", and any points prior to it as already completed.
  revalidate(lat, long) {
    // which point are we closest to?
    const { points } = this;
    const nearest = { distance: Number.MAX_SAFE_INTEGER, pos: -1 };
    points.forEach((p, pos) => {
      // reset each waypoint so that it doesn't count as active, nor as compeleted.
      p.reset();
      // then, is our plane closer to this point than any other point we saw so far?
      const d = getDistanceBetweenPoints(lat, long, p.lat, p.long);
      if (d < nearest.distance) {
        nearest.distance = d;
        nearest.pos = pos;
      }
    });

    // Mark all points before the one we're closest to as complete:
    for (let i = 0; i < nearest.pos; i++) points[i].complete();

    // And then make sure every point knows what the next point is,
    // and mark the one that we're closest to as our current waypoint.
    this.resequence();
    this.currentWaypoint = points[nearest.pos];
  }

  ...
}
```

### Testing our code

Now that we can load a flight path, we can load up [this one](https://gist.githubusercontent.com/Pomax/4bee1457ff3f33fdb1bb314908ac271b/raw/537b01ebdc0d3264ae7bfdf357b94bd963d20b3f/vancouver-island-loop.txt), which expects us to start on [runway 27 at Victoria Airport on Vancouver Island](https://www.google.com/maps/place/48%C2%B038'48.0%22N+123%C2%B024'44.4%22W/@48.6466197,-123.4125952,202m/data=!3m1!1e3!4m4!3m3!8m2!3d48.646658!4d-123.41234?entry=ttu), and does a round trip over [Shawnigan Lake](https://www.tourismcowichan.com/explore/about-cowichan/shawnigan-lake/) and [Sooke Lake](https://www.canoevancouverisland.com/canoe-kayak-vancouver-island-directory/sooke-lake/), turns right into the mountains at [Kapoor regional park](https://www.crd.bc.ca/parks-recreation-culture/parks-trails/find-park-trail/kapoor), follows the valley down to the coast, turns over [Port Renfrew](https://www.portrenfrew.com/) into the [San Juan river](<https://en.wikipedia.org/wiki/San_Juan_River_(Vancouver_Island)>) valley and then follows that all the way west to the [Kinsol Tressle](https://www.cvrd.ca/1379/Kinsol-Trestle), where we take a quick detour north towards [Cowichan Station](https://vancouverisland.com/plan-your-trip/regions-and-towns/vancouver-island-bc-islands/cowichan-station/), then back to Victoria Airport, which is in [Sidney](http://www.sidney.ca/), a good hour north of BC's capital of [Victoria](https://www.tourismvictoria.com/).

![image-20230607191256878](./images/ghost-dog.png)

#### De Havilland DHC-2 "Beaver"

No problems with the Beaver, it turns like a champ.

MAP IMAGE GOES HERE

And comparing the ground profile to the flown altitudes, that's looking pretty tidy.

SCIENCE IMAGES GO HERE

#### Cessna 310R

The 310R is considerably faster than the Beaver and you can see that for tight turns, like the one over Shawnigan lake, it needs more time to get onto the right path, causing it to kind of "weave between" the waypoints there. However, it's still able to complete the flight, and the flight is still pretty spot on for most of the path.

MAP IMAGE GOES HERE

The altitude profile shows we could probably tighten up our vertical damping but this is entirely acceptable. (The track is shorter, mostly because the 310R flies a lot faster than then Beaver!)

SCIENCE IMAGES GO HERE

#### Beechcraft Model 18

Quite a bit slower on the turn than the 310R or the Beaver, we can see the twin Beech having the same problems as the 310R. But again, nothing that stops it from flying this plan to completion.

MAP IMAGE GOES HERE

And the altitude graph. A bit more bouncy, but perfectly serviceable.

SCIENCE IMAGES GO HERE

#### Douglas DC-3

Same story with the DC-3: looks like our waypoint algorithm works just fine!

MAP IMAGE GOES HERE

We do see that the DC-3 is considerably more bouncy than even the twin Beech, but for its size and weight, we'll take it.

SCIENCE IMAGES GO HERE

## Terrain follow mode

Normally, most planes don't come with a mode that lets them "hug the landscape", but we're not flying real planes, we're flying virtual planes, and hugging the landscape would be pretty sweet to have if we just want to fly around on autopilot and enjoy the view. Conceptually, there's nothing particularly hard about terrain follow:

1. Scan our flight path up to a few nautical miles ahead of us,
2. find the highest point along that path,
3. set the autopilot altitude to something that lets us safely clear that highest point, and
4. keep repeating this check for as long as the autopilot is running the show.

The problem is with point (2) in that list: there is nothing baked into MSFS that lets us "query landscape elevation". We'd instead need to create a dummy object, spawn it into the world, then move it across the landscape and ask MSFS what its x, y, and z coordinates are. That's pretty annoying, and quite a bit of work. However, since the whole selling point of MSFS is that you can fly anywhere on Earth, as an alternative we could also just query some out-of-game resource for elevation data based on GPS coordinates.

Back in the day, Google offered that as a free web API, but they decided to charge quite a bit of money for that starting back in 2018, so that's out. There is also https://www.open-elevation.com, which _is_ free, but because they're not Google they're also frequently down, making them an admirable but highly unreliable resource. Which leaves "writing our own elevation API", which is surprisingly doable. We just need a good source of elevation data. Covering the entire planet. At a high enough resolution.

Enter the Japanese Aerospace eXploration Agency, or [JAXA](https://global.jaxa.jp/), and their freely available ALOS (Advanced Land Observing Satellite) [Digital Surface Model](https://en.wikipedia.org/wiki/Digital_elevation_model) datasets. Specifically, their [30 meter dataset](https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm), which has elevation data for the entire planet's land surface at a resolution finer than MSFS uses, and can be downloaded for free after signing up for an (again, free) account and agreeing to their [data license](https://earth.jaxa.jp/en/data/policy). One downside: it's 450GB of on-disk data hosted as a 150GB download spread out over hundreds of files. On the upside, we know how to program, so scripting the downloads isn't terribly hard, and a 1TB SSD is $50 these days, so that's unlikely to _really_ be a problem.

What _will_ be a problem is that the ALOS data uses the GeoTIFF data format: TIFF images with metadata that describes what section of planet they map to, and which mapping you need to use to go from pixel-coordinate to geo-coordinate. The TIFF part is super easy, we can just use the [tiff](https://www.npmjs.com/package/tiff) package to load those in, and ALOS thankfully has its files organized in directories with filenames that indicate which whole-angle GPS bounding box they're for, so finding the file we need to look up any GPS coordinate is also pretty easy... it's finding the pixel in the image that belongs to a _specific_ GPS coordinate that's a little more work.

Of course, [I already did this work so you don't have to](https://stackoverflow.com/questions/47951513#75647596), so let's dive in: what do we need?

### Working with ALOS data

We're going to split our ALOS code up into three parts: a querying object, a tile class, and a really simple caching system.

First, some ALOS constants:

```javascript
import { join, resolve } from "path";
import url from "node:url";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

export const SEA_LEVEL = 0;
export const ALOS_VOID_VALUE = -9999;
export const NO_ALOS_DATA_VALUE = 9999;
export const INDEX_FILE = resolve(join(__dirname, `alos-index.json`));
export const CACHE_DIR = resolve(join(__dirname, `cache`));
```

Then, our querying object:

```javascript
import { getDistanceBetweenPoints } from "../api/autopilot/utils/utils.js";
import {
  SEA_LEVEL,
  ALOS_VOID_VALUE,
  NO_ALOS_DATA_VALUE,
} from "./alos-constants.js";
import { ALOSTile } from "./alos-tile.js";

const { floor, ceil, max } = Math;

// JAXA ALOS World 3D (30m) dataset manager
// homepage: https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm
// data format: https://www.eorc.jaxa.jp/ALOS/en/aw3d30/aw3d30v11_format_e.pdf
// license: https://earth.jaxa.jp/en/data/policy/

export class ALOSInterface {
  constructor(tilesFolder) {
    this.tilesFolder = tilesFolder;
    this.loaded = false;
    this.files = [];
    if (!this.tilesFolder) {
      console.log(
        `No ALOS data folder specified, elevation service will not be available.`
      );
    } else {
      this.findFiles();
      this.loaded = true;
      console.log(`ALOS loaded, using ${this.files.length} tiles.`);
    }
  }

  findFiles(dir = this.tilesFolder) {
    readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && fullPath.endsWith(".tif"))
        this.files.push(fullPath);
      if (entry.isDirectory()) this.findFiles(fullPath);
    });
  }

  getTileFor(lat, long) {
    if (!this.loaded) return;

    const [tileName, tilePath] = this.getTileFromFolder(
      this.tilesFolder,
      lat,
      long
    );
    if (!tileName) return;
    return new ALOSTile(tilePath);
  }

  getTileFromFolder(basedir, lat, long) {
    // ALOS tiles are named ALPSMKC30_UyyyWxxx_DSM.tif, where
    // U is either "N" or "S", yyy is the degree of latitude
    // (with leading zeroes if necessary), W is either "E" or
    // "W", and xxx is the degree of longitude (again with
    // leading zeroes if necessary).
    const latDir = lat >= 0 ? "N" : "S";
    const longDir = long >= 0 ? "E" : "W";
    lat = `` + (latDir == "N" ? floor(lat) : ceil(-lat));
    long = `` + (longDir == "E" ? floor(long) : ceil(-long));
    const tileName = `ALPSMLC30_${latDir}${lat.padStart(
      3,
      "0"
    )}${longDir}${long.padStart(3, "0")}_DSM.tif`;

    // find the full path for this file in the list of
    // known files we built in findFiles().
    const fullPath = this.files.find((f) => f.endsWith(tileName));
    if (!fullPath) return [false, false];

    return [tileName, join(basedir, fullPath)];
  }

  // And finally the function we care about the most:
  lookup(lat, long) {
    if (!this.loaded) return NO_ALOS_DATA_VALUE;

    lat = +lat;
    long = +long;
    const tile = this.getTileFor(lat, long);
    if (!tile) console.warn(`no tile for ${lat},${long}...`);
    const elevation = tile?.lookup(lat, long) ?? ALOS_VOID_VALUE;
    return elevation === ALOS_VOID_VALUE ? SEA_LEVEL : elevation;
  }
}
```

And then our tile class:

```javascript
import { existsSync, readFileSync, copyFileSync } from "fs";
import { basename, join } from "path";
import tiff from "tiff";
import { ALOS_VOID_VALUE } from "./alos-constants.js";

const { floor, ceil, max } = Math;

export class ALOSTile {
  constructor(tilePath, coarseLevel = 10) {
    this.tilePath = tilePath;
    this.coarseLevel = coarseLevel;
    this.init(tilePath);
  }

  init(filename) {
    const file = readFileSync(filename);
    const image = tiff.decode(file.buffer);
    const block = (this.block = image[0]);
    const fields = block.fields;
    // See https://stackoverflow.com/questions/47951513#75647596
    let [sx, sy, sz] = fields.get(33550);
    let [px, py, k, gx, gy, gz] = fields.get(33922);
    sy = -sy;
    this.reverse = [-gx / sx, 1 / sx, 0, -gy / sy, 0, 1 / sy];
    this.pixels = block.data;
  }

  // Get an [x, y] pixel coordinate, given a GPS coordinate
  geoToPixel(lat, long) {
    const R = this.reverse;
    return [R[0] + R[1] * long + R[2] * lat, R[3] + R[4] * long + R[5] * lat];
  }

  // Get the elevation for some GPS coordinate
  lookup(lat, long) {
    const [x, y] = this.geoToPixel(lat, long);
    const pos = (x | 0) + (y | 0) * this.block.width;
    let value = this.pixels)[pos];
    // the highest point on earth is ~8848m
    if (value === undefined || value > 8900) value = ALOS_VOID_VALUE;
    return value;
  }
}
```

And now we have a way to query elevations for GPS coordinates, without having to use an external service, or messing around with object spawning in-game. Except... it's not very efficient at the moment. Let's fix that by adding tile caching, as well as "coarse" tiles, where we scale down each time by a factor of ten, but rather than averaging the pixels, we only keep "the brightest ones" so that we get a maximum elevation map for 300x300m rather than 30x30m, effectively making our lookups faster while keeping our plane just as safe:

```javascript
import { join } from "path";
import { mkdir } from "fs/promises";
import { ALOSTile } from "./alos-tile.js";
import { getDistanceBetweenPoints } from "../api/autopilot/utils/utils.js";
import { SEA_LEVEL, ALOS_VOID_VALUE, INDEX_FILE, CACHE_DIR } from "./alos-constants.js";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";

const { floor, ceil, max } = Math;

// Ensure our cache directory exists before we try writing files to it.
await mkdir(CACHE_DIR, { recursive: true });

export class ALOSInterface {
  constructor(tilesFolder) {
    this.tilesFolder = tilesFolder;
    this.loaded = false;
    this.files = [];
    this.cache = {};
    if (!this.tilesFolder) {
      console.log(
        `No ALOS data folder specified, elevation service will not be available.`
      );
    } else {
      this.loadIndex();
      this.loaded = true;
      console.log(`ALOS loaded, using ${this.files.length} tiles.`);
    }
  }

  loadIndex() {
    // To prevent us from having to run through a file tree every single time we
    // start, we build an index file instead, so we can load that directly.
    if (!existsSync(INDEX_FILE)) {
      console.log(`Indexing dataset...`);
      const mark = Date.now();
      this.findFiles();
      const json = JSON.stringify(
        this.files.map((v) => v.replace(this.tilesFolder, ``))
      );
      writeFileSync(INDEX_FILE, json);
      console.log(
        `Dataset indexed in ${((Date.now() - mark) / 1000).toFixed(2)}s (${
          this.files.length
        } tiles found)`
      );
    }
    this.files = JSON.parse(readFileSync(INDEX_FILE));
    console.log(`ALOS loaded, using ${this.files.length} tiles.`);
  }

  ...

  getTileFor(lat, long) {
    if (!this.loaded) return;

    const [tileName, tilePath] = this.getTileFromFolder(this.tilesFolder, lat, long);
    if (!tileName) return;
    // Instead of constantly loading the tile from file, we cache it in memory.
    this.cache[tilePath] ??= new ALOSTile(tilePath);
    return this.cache[tilePath];
  }

  lookup(lat, long, coarse = false) {
    if (!this.loaded) return NO_ALOS_DATA_VALUE;

    lat = +lat;
    long = +long;
    const tile = this.getTileFor(lat, long);
    if (!tile) console.warn(`no tile for ${lat},${long}...`);
    // pass the "coarse" flag along so we perform a more efficient, but lower resolution, lookup.
    const elevation = tile?.lookup(lat, long, coarse) ?? ALOS_VOID_VALUE;
    return elevation === ALOS_VOID_VALUE ? SEA_LEVEL : elevation;
  }
}
```

and our tile update:

```javascript
import tiff from "tiff";
import { basename, join } from "path";
import { ALOS_VOID_VALUE, CACHE_DIR } from "./alos-constants.js";
import { existsSync, readFileSync, copyFileSync } from "fs";

const { floor, ceil, max } = Math;

export class ALOSTile {
  constructor(tilePath, coarseLevel = 10) {
    this.tilePath = tilePath;
    this.coarseLevel = coarseLevel;
    // copy the file itself to our local cache dir for faster loading in the future
    const filename = join(`.`, CACHE_DIR, basename(tilePath));
    if (!existsSync(filename)) copyFileSync(tilePath, filename);
    this.init(filename);
  }

  init(filename) {
    ...
    this.pixels = block.data;
    this.formCoarseTile(block.width, block.height, [sx, sy, gx, gy]);
  }

  formCoarseTile(width, height, [sx, sy, gx, gy]) {
    // form a much smaller, coarse lookup map
    const { coarseLevel, pixels: p } = this;
    this.coarsePixels = [];
    for (let i = 0; i < p.length; i += coarseLevel) {
      this.coarsePixels[i / coarseLevel] = max(...p.slice(i, i + coarseLevel));
    }
    for (let i = 0, w = width / coarseLevel; i < w; i += coarseLevel) {
      let list = [];
      for (let j = 0; j < coarseLevel; j++) list.push(p[i + j * w]);
      this.coarsePixels[i / coarseLevel] = max(...list);
    }
    this.coarsePixels = new Uint16Array(this.coarsePixels);
    const [sxC, syC] = [sx * coarseLevel, sy * coarseLevel];
    this.coarseForward = [gx, sxC, 0, gy, 0, syC];
    this.coarseReverse = [-gx / sxC, 1 / sxC, 0, -gy / syC, 0, 1 / syC];
  }

  geoToPixel(lat, long, coarse = false) {
    const R = coarse ? this.coarseReverse : this.reverse;
    return [R[0] + R[1] * long + R[2] * lat, R[3] + R[4] * long + R[5] * lat];
  }

  lookup(lat, long, coarse = false) {
    const [x, y] = this.geoToPixel(lat, long, coarse);
    const pos = (x | 0) + (y | 0) * this.block.width;
    let value = (coarse ? this.coarsePixels : this.pixels)[pos];
    if (value === undefined || value > 8900) value = ALOS_VOID_VALUE;
    return value;
  }
}
```

We scale down our image data by first picking the brightest (and therefore highest) pixel out of every 10 pixels horizontally, then doing the same to that new data, but vertically. What we're left with is a 100x smaller image that encodes the max elevation over 300x300 meter blocks, rather than the original 30x30 meter blocks.

Which takes care of our original point (2) in our four point list, let's tackle the rest of our points:

### Finishing up

1. we can generate a path from our current location and a point for a miles ahead of us by using "the wrong" math in our ALOS interface, pretending that paths between two GPS coordinates are straight lines, instead of lying on a [great circle](https://en.wikipedia.org/wiki/Great_circle):

   ```javascript
   const COARSE_LEVEL = 10;

   export class ALOSInterface {
     ...

     getTileFor(lat, long) {
       ...
       this.cache[tilePath] ??= new ALOSTile(tilePath, COARSE_LEVEL);
       return this.cache[tilePath];
     }

     ...

     getHighestPointBetween(lat1, long1, lat2, long2, coarse = false) {
       if (!this.loaded) return { lat: 0, long: 0, elevation: NO_ALOS_DATA_VALUE };

       const distance = getDistanceBetweenPoints(lat1, long1, lat2, long2);
       const s = (coarse ? COARSE_LEVEL * 0.3 : 0.03) / distance;
       let maxValue = { elevation: ALOS_VOID_VALUE, lat: lat2, long: long2 };
       for (let i = s, lat, long, elevation; i <= 1; i += s) {
         lat = (1 - i) * lat1 + i * lat2;
         long = (1 - i) * long1 + i * long2;
         elevation = this.lookup(lat, long, coarse);
         if (elevation > maxValue.elevation) maxValue = { elevation, lat, long };
       }
       return maxValue;
     }
   }
   ```

   Which just leaves the question of how to get the GPS coordinate "given our current location, heading, and distance", which is one of those things we can just look up the code for:

   ```javascript
   function getPointAtDistance(lat1, long1, d, heading) {
     const R = 6371; // the average radius of Earth
     lat1 = radians(lat1);
     long1 = radians(long1);
     const angle = radians(heading);
     const lat2 = asin(
       sin(lat1) * cos(d / R) + cos(lat1) * sin(d / R) * cos(angle)
     );
     const dx = cos(d / R) - sin(lat1) * sin(lat2);
     const dy = sin(angle) * sin(d / R) * cos(lat1);
     const long2 = long1 + atan2(dy, dx);
     return { lat: degrees(lat2), long: degrees(long2) };
   }
   ```

2. We already wrote the code for this step!

3. We basically wrote the code for this already, too: we just update the value for `autopilot.modes[ALTITUDE_HOLD]` and the autopilot does the rest.

4. And this isn't even code: the autopilot will just keep running for as long as we don't turn it off.

Now we just need to add "terrain follow" as an autopilot mode (making sure it runs only when vertical hold is engaged):

```javascript
export const LEVEL_FLIGHT = `LVL`;
export const ALTITUDE_HOLD = `ALT`;
export const HEADING_MODE = `HDG`;
export const AUTO_THROTTLE = `ATT`;
export const TERRAIN_FOLLOW = `TER`;
```

With the new mode added to the autopilot code:

```javascript
...
import { ... TERRAIN_FOLLOW } from "./utils/constants.js";
import { followTerrain } from "./terrain-follow.js";

class AutoPilot {
  ...
  constructor() {
    ...
    this.modes = {
      [LEVEL_FLIGHT]: false,
      [ALTITUDE_HOLD]: false,
      [HEADING_MODE]: false,
      [AUTO_THROTTLE]: true,
      [TERRAIN_FOLLOW]: false
    };
    ...
  }

  ...

  getAutoPilotParameters() {
    const state = {
      MASTER: this.autoPilotEnabled,
      // we add the terrain follow "max elevation" information to our autopilot parameters
      elevation: this.modes[TERRAIN_FOLLOW] ? this.elevation : false,
    };
    Object.entries(this.modes).forEach(([key, value]) => (state[key] = value));
    return state;
  }

  ...

  // And when terrain follow is on, follow that terrain!
  async runAutopilot() {
    ...

    if (this.modes[ALTITUDE_HOLD]) {
      if (this.modes[TERRAIN_FOLLOW] !== false && this.alos.loaded) {
        followTerrain(this, state);
      }
      altitudeHold(this, state);
    }

    this.prevState = state;
  }
}
```

And of course, with a new file called `terrain-follow.js`:

```javascript
const { ceil } = Math;
import { degrees, getPointAtDistance } from "./utils/utils.js";
import { ALTITUDE_HOLD, FEET_PER_METER } from "./utils/constants.js";

const ALOS_VOID_VALUE = -9999;

export async function followTerrain(autopilot, state, altitude = 500) {
  const { latitude: lat, longitude: long, trueHeading } = state;
  const distance = 12; // in kilometers
  const { lat: lat2, long: long2 } = getPointAtDistance(
    lat,
    long,
    distance,
    degrees(trueHeading)
  );
  const coarseLookup = true;
  const maxValue = autopilot.alos.getHighestPointBetween(
    lat,
    long,
    lat2,
    long2,
    coarseLookup
  );
  if (maxValue.elevation === ALOS_VOID_VALUE) maxValue.elevation = 0;

  // We'll add these values to our autopilot parameters
  autopilot.elevation = maxValue;
  autopilot.elevation.lat2 = lat2;
  autopilot.elevation.long2 = long2;

  // Rememeber: ALOS data is in meters, but MSFS is in feet.
  // We'll crash really fast if we don't convert units =)
  let targetAltitude = maxValue.elevation * FEET_PER_METER + altitude;

  // We don't want to constantly change altitude, so we use elevation brackets:
  let bracketSize = 100;
  if (targetAltitude > 1000) bracketSize = 200;
  if (targetAltitude > 10000) bracketSize = 500;
  if (targetAltitude > 30000) bracketSize = 1000;
  targetAltitude = ceil(targetAltitude / bracketSize) * bracketSize;

  // Set the ALT value and let the autopilot do the rest
  autopilot.modes[ALTITUDE_HOLD] = targetAltitude;
}
```

Of course this does require so extra code to make sure waypoint elevation and terrain follow altitudes don't clash, so we're going to add an early return in `altitude-hold.js`:

```javascript
function updateAltitudeFromWaypoint(autopilot, state) {
  if (autopilot.modes[TERRAIN_FOLLOW]) return;

  const { waypoints } = autopilot;
  const waypointAltitude = waypoints.getAltitude(state);
  if (waypointAltitude) {
    autopilot.setTarget(ALTITUDE_HOLD, waypointAltitude);
  }
}
```

The last thing we'll do is add a bit of cosmetic code so that we can see the "terrain scan line" on our map while we're flying. First we update our `plane.js`:

```javascript
export class Plane {
  ...

  async setElevationProbe(value) {
    if (this.elevationProbe) this.elevationProbe.remove();
    if (!value) return;
    this.elevationProbe = new Trail(
      this.map,
      [this.state.lat, this.state.long],
      `#4F87`,
      { weight: 30, lineCap: `butt` }
    );
    this.elevationProbe.add(value.lat2, value.long2);
  }

  ...
}
```

And then we call this function in our client-side autopilot code:

```javascript
...

  bootstrap(params) {
    Object.entries(params).forEach(([key, value]) => {
      // draw our elevation scan line on the map
      if (key === `elevation`) return this.owner.setElevationProbe(value);
      ...
    });
  }

...
```

Which will give us the following visualization:

![image-20230527222138987](./images/page/flight-with-alos.png)

### Testing our code

Let's update our web page again so that we can toggle the auto-throttle and terrain follow modes:

```html
<div id="autopilot" class="controls">
  <link rel="stylesheet" href="/css/autopilot.css" />

  <button class="MASTER">AP</button>
  <button title="level wings" class="LVL">LVL</button>
  <label>Target altitude: </label>
  <input
    class="altitude"
    type="number"
    min="0"
    max="40000"
    value="1500"
    step="100"
  />
  <button title="altitude hold" class="ALT">ALT</button>
  <button class="TER">TER</button>
  <label>Target heading: </label>
  <input class="heading" type="number" min="1" max="360" value="360" step="1" />
  <button class="HDG">HDG</button>
</div>
```

And a minor update to our client-side autopilot JS:

```javascript
export const AP_DEFAULT = {
  MASTER: false,
  LVL: false,
  ALT: false,
  HDG: false,
  ATT: true,
  TER: false,
};
```

Just to make it aware that auto-throttle and terrain follow are things it can now toggle. So, graph time!

#### Top Rudder Solo 103

TEST RESULTS GO HERE

#### De Havilland DHC-2 "Beaver"

We'll be taking off from Victoria Airport on Vancouver Island, which sits at an elevation of about 60 feet, and then simply by heading straight, we'll have quite a bit of terrain to contend with. Let's see what happens!

TEST RESULTS GO HERE



Honestly, "not a lot" other than the autopilot giving us altitudes to fly that make sure we don't fly straight into a mountain side. The plane's altitude is not quite as "clean" or platformed as a human would fly the plane, but it doesn't have to be, we're not flying, the computer is.

#### Cessna 310R

The story is the same in the 310R, although because it's a lot faster than the Beaver, the elevation probe gives a smoother curve, but again: no mountain side collisions, which is good!

TEST RESULTS GO HERE

#### Beechcraft Model 18

Flying a tad faster than the 310R but reacting more slowly to control instructions, the altitude profile is even better looking than the 310R's. I love this plane, it is just a delight.

TEST RESULTS GO HERE

#### Douglas DC-3

Not much to say: it does what it needs to do despite weighing about as much as as half of Vancouver Island.

TEST RESULTS GO HERE

## Auto takeoff

In fact we can do one more thing if we just want the computer to fly our plane for us, and that's have it handle take-off when our plane's sitting on the ground. This is, barring auto-landing, the hardest thing to implement if we're not building a bespoke autopilot for one specific aeroplane, but we're going to do it anyway, and we're going to succeed, _and_ it's going to be glorious.

There's a few challenges we'll want to tackle, in order:

1. make sure the plane is ready for takeoff, then once ready
2. throttle up and roll down the runway to pick up speed. Ideally in a straight line. Then
3. rotating the plane in order to take off once we're at take-off speed, and then
4. leveling out the plane and switching to the autopilot.

```javascript
export class AutoTakeoff {
  prepped = false;
  takeoffHeading = false;
  takeoffAltitude = false;
  liftoff = false;
  levelOut = false;
  easeElevator = false;

  constructor(autopilot) {
    this.autopilot = autopilot;
    this.api = autopilot.api;
  }

  async run(state) {
    const { api } = this;

    const {
      TOTAL_WEIGHT: totalWeight,
      DESIGN_SPEED_VS1: vs1,
      DESIGN_SPEED_MIN_ROTATION: minRotate,
      NUMBER_OF_ENGINES: engineCount,
      TITLE: title,
    } = await api.get(
      `TOTAL_WEIGHT`,
      `DESIGN_SPEED_VS1`,
      `DESIGN_SPEED_MIN_ROTATION`,
      `NUMBER_OF_ENGINES``TITLE`
    );

    const {
      onGround,
      speed: currentSpeed,
      lift,
      dLift,
      verticalSpeed: vs,
      dVS,
      latitude: lat,
      longitude: long,
      isTailDragger,
    } = state;

    const heading = degrees(state.heading);
    const trueHeading = degrees(state.trueHeading);
    const vs12 = vs1 ** 2;

    if (!this.takeoffAltitude) this.takeoffAltitude = state.altitude;

    // Make sure we've set the aeroplane up for a runway roll.
    if (!this.prepped)
      return this.prepForRoll(
        isTailDragger,
        engineCount,
        state.altitude,
        lat,
        long,
        heading,
        trueHeading
      );

    // As long as we've not lifted off, throttle up to max
    if (!this.liftoff) await this.throttleUp(engineCount);

    // Try to keep us going in a straight line.
    this.autoRudder(
      onGround,
      isTailDragger,
      vs12,
      minRotate,
      currentSpeed,
      lat,
      long,
      heading
    );

    // Is it time to actually take off?
    await this.checkRotation(
      onGround,
      currentSpeed,
      lift,
      dLift,
      vs,
      dVS,
      totalWeight
    );

    // Is it time to hand off flight to the regular auto pilot?
    const altitudeGained = state.altitude - this.takeoffAltitude;
    await this.checkHandoff(
      title,
      isTailDragger,
      totalWeight,
      vs,
      dVS,
      altitudeGained
    );
  }
}
```

With the autopilot loading this class:

```javascript
import { ..., AUTO_TAKEOFF } from "./constants.js";
...

import { AutoTakeoff as ato } from "./auto-takeoff.js";
let AutoTakeoff = ato;

export class AutoPilot {
  constructor(api, onChange = () => {}) {

  }

  reset() {
    this.modes = {
      [LEVEL_FLIGHT]: false,
      [HEADING_MODE]: false,
      [ALTITUDE_HOLD]: false,
      [AUTO_THROTTLE]: true,
      [TERRAIN_FOLLOW]: false,
      [AUTO_TAKEOFF]: false,
    ];
    this.autoTakeoff = false;
  }

  watchForUpdates() {
    ...
    watch(__dirname, `auto-takeoff.js`, (lib) => {
      AutoTakeoff = lib.AutoTakeoff;
      // since this is a class instance, run a copy construction:
      this.autoTakeoff = new AutoTakeoff(this, this.autoTakeoff);
    });
  }

  async processChange(type, oldValue, newValue) {
    if (type === AUTO_TAKEOFF) {
      if (oldValue === false && newValue === true) {
        this.autoTakeoff = new AutoTakeoff(this);
        this.trim = { x: 0, y: 0, z: 0 };
      }
      this.AP_INTERVAL = newValue ? FAST_AUTOPILOT : REGULAR_AUTOPILOT;
    }
    ...
  }

  async runAutopilot() {
    ...
    const state = new State(data, this.prevState);

    if (!this.modes[AUTO_TAKEOFF] && state.speed < 15) {
      // Disengage our autopilot, but preserve all settings
      // in case we want to turn it back on momentarily.
      return;
    }

    // Are we in auto-takeoff?
    if (this.modes[AUTO_TAKEOFF]) this.autoTakeoff.run(state);

    // Do we need to level the wings / fly a specific heading?
    if (this.modes[LEVEL_FLIGHT]) flyLevel(this, state);

    ...
  }
}
```

And another update to `altitude-hold.js`:

```javascript
function updateAltitudeFromWaypoint(autopilot, state) {
  if (autopilot.modes[AUTO_TAKEOFF]) return;
  if (autopilot.modes[TERRAIN_FOLLOW]) return;

  const { waypoints } = autopilot;
  const waypointAltitude = waypoints.getAltitude(state);
  if (waypointAltitude) {
    autopilot.setTarget(ALTITUDE_HOLD, waypointAltitude);
  }
}
```

As well as `fly-level.js`:

```javascript
function updateHeadingFromWaypoint(autopilot, state) {
  if (autopilot.modes[AUTO_TAKEOFF]) return;

  const { waypoints } = autopilot;
  const waypointHeading = waypoints.getHeading(state);
  if (waypointHeading) {
    autopilot.setTarget(HEADING_MODE, waypointHeading);
  }
}
```

And finally in `waypoints.js`:

```javascript
export class WayPoints {
  ...

  getHeading(state) {
    // If we're in auto-takeoff, waypoints should not be active yet
    const { modes } = this.autopilot;
    if (modes[AUTO_TAKEOFF]) return;
    ...
  }
}
```

And with that out of the way, we can run through each step in the auto-takeoff process.

### Preflight checklist

The preflight checks are relatively easy:

- we want to make sure our altimeter is calibrated,
- the parking brake is off,
- flaps get fully retracted (some planes want flaps during takeoff, others don't, and we have no way of looking up which it is, so all planes get to lift off without the help of flaps. Use the runway, that's what it's for.)
- we reset all the trim values so that we start off neutral (again, some planes want trim for takeoff: too bad for them),
- we set the elevator position to 0 (just in case it wasn't),
- we set the fuel mixture somewhere between full rich and 65% depending on whether we're sitting at sea level or 8000 feet, or somewhere in between those two.
- if the plane's a tail dragger, we lock the tail wheel

So, in code:

```javascript
  async prepForRoll(isTailDragger, engineCount, altitude, lat, long, heading, trueHeading) {
    const { api, autopilot } = this;
    console.log(`Prep for roll`);

    // Record our initial heading and location, as well as a location along that heading
    // somewhere in the distance, so that we have a line we can (try to) stick to.
    if (!this.takeoffHeading) {
      this.takeoffHeading = heading;
      this.takeoffCoord = { lat, long };
      this.futureCoord = getPointAtDistance(lat, long, 2, trueHeading);
      autopilot.setTarget(HEADING_MODE, this.takeoffHeading);
    }

    // Ensure our barometric altimeter is calibrated
    api.trigger(`BAROMETRIC`);

    // Is the parking brake engaged? If so, let's take that off.
    const { BRAKE_PARKING_POSITION } = await api.get(`BRAKE_PARKING_POSITION`);
    if (BRAKE_PARKING_POSITION === 1) api.trigger(`PARKING_BRAKES`);

    // We don't have a database of which plane needs how much flaps for takeoff, so we
    // just... don't set flaps. It makes take-off take a bit longer, but then again:
    // use the whole runway, that's literally what it's for.
    let flaps = await api.get(`FLAPS_HANDLE_INDEX:1`);
    flaps = flaps[`FLAPS_HANDLE_INDEX:1`];
    if (flaps !== 0) api.set(`FLAPS_HANDLE_INDEX:1`, 0);

    // Reset all trim values before takeoff.
    api.set(`AILERON_TRIM_PCT`, 0);
    api.set(`ELEVATOR_TRIM_POSITION`, 0);
    api.set(`RUDDER_TRIM_PCT`, 0);

    // Set mixture to something altitude-appropriate and set props to 90%, mostly because we have no
    // way to ask MSFS what the "safe" value for props is, and we don't want the engines to burn out.
    const mixture = constrainMap(altitude, 3000, 8000, 100, 65);
    for (let i = 1; i <= engineCount; i++) {
      api.set(`GENERAL_ENG_MIXTURE_LEVER_POSITION:${i}`, mixture);
      api.set(`GENERAL_ENG_PROPELLER_LEVER_POSITION:${i}`, 90);
    }

    // Lock the tailwheel. If we have one, of course.
    if (isTailDragger) {
      const { TAILWHEEL_LOCK_ON } = await api.get(`TAILWHEEL_LOCK_ON`);
      if (TAILWHEEL_LOCK_ON === 0) api.trigger(`TOGGLE_TAILWHEEL_LOCK`);
    }

    // Force neutral elevator
    await api.set(`ELEVATOR_POSITION`, 0);
    this.prepped = true;
  }
```

With those steps performed, we can start to throttle up and roll down the runway.

### Runway roll

Now, the _easy_ part is slowly throttling the engines up to 100%. The _hard_ part is keeping the plane on the runway: propeller torque as well as small differences in engine outputs on multi-engine aircrafts can _and will_ roll us off the runway if we don't use the pedals to steer us in the right direction. For instance, let's see what happens if we just throttle up the engines without any kind of rudder action:

FOUR IMAGES OF VARIOUS PLANES ROLLING WITHOUT RUDDER

It's not good, this is varying degrees of crashing into trees or buildings, so we're definitely going to need to implement an "auto-rudder" of sorts if we want to at least _pretend_ we're sticking to the runway during takeoff.

One thing we notice is the difference between the 310R and the three tail draggers. As you may have guessed, this corresponds to the moment when the tail wheel no longer makes contact with the ground: up until that point we have the benefit of actually being able to (slightly) steer using the rear wheel, with the actual rudder having to do very little, but once it's off the ground we need to briefly work the rudder a lot harder to stop the plane from suddenly veering off.

So our attempt at an auto-rudder will consist of a few phases:

- pre-roll: where we make sure the plane's ready to roll (brakes, flaps, etc) and we record our start position
- initial roll, all wheels on the ground, plenty of control
  - the more out-of-heading we are, the more we steer back towards the center line.
  - if this is not a tail dragger, this phase effectively lasts for the entire roll.
- loss of control when the tail wheel comes off the ground
- Relatively stable control after the initial loss of control

If we're lucky (or we accept "good enough") we can come up with code that can handle all of these phases without knowing "which phase we're in", so we'll make some more observations:

- the faster we're going, the less rudder we need to apply to get the same effect
- the close to the center line we are, the less rudder we need to apply, and
- every plane has rudder characteristics that we could use to finesse the code, but we don't have access to them.

Now, the first two are relatively easy to implement (although we'll need a fair bit of code for step 2, even if it's simple code). It's that last point that's properly annoying. There's just no way to get the information we want, so if we want something that mostly kind of sort of works for mostly all planes, we're going to have run this code a million times for different planes and figure out what "magic constant" works for which plane. And then try to figure out what plane property that we _do_ have access to we can tie that to. To save you that headache, I've done that work for us, but suffice it to say we shouldn't feel good about this solution and ideally, one day, we will come up with something better.

So let's write some code:

```javascript
  async function changeThrottle(api, engineCount = 4, byHowMuch, floor = 0, ceiling = 100) {
    let newThrottle;
    for (let count = 1; count <= engineCount; count++) {
      const simVar = `GENERAL_ENG_THROTTLE_LEVER_POSITION:${count}`;
      const throttle = (await api.get(simVar))[simVar];
      if ((byHowMuch < 0 && throttle > floor) || (byHowMuch > 0 && throttle < ceiling)) {
        newThrottle = throttle + byHowMuch;
        api.set(simVar, newThrottle);
      }
    }
    return newThrottle ?? (byHowMuch < 0 ? floor : ceiling);
  }

  async throttleUp(engineCount) {
    const { api, maxed } = this;
    if (maxed) return;

    const newThrottle = await this.changeThrottle(api, engineCount, 1);
    console.log(`Throttle up to ${newThrottle | 0}%`);
    if (newThrottle === 100) {
      this.maxed = true;
    }
  }

  async autoRudder(onGround, isTailDragger, vs12, minRotate, currentSpeed, lat, long, heading) {
    const { api, takeoffCoord: p1, futureCoord: p2 } = this;

    // If we're actually in the air, we want to ease the rudder back to neutral.
    if (!onGround) {
      const { RUDDER_POSITION: rudder } = await api.get(`RUDDER_POSITION`);
      api.set(`RUDDER_POSITION`, rudder / 2);
      return;
    }

    // If we're still on the ground, get our aeroplane's drift with respect to the center line,
    // using orthogonal projection, https://en.wikipedia.org/wiki/Vector_projection
    // We know the centerline is p1--p2 (the place we started and a point in the distance
    // along the same heading as the runway), and we have a vector from p1 to our current
    // location, so we can project our current location onto the centerline and measure how
    // many feet off the centerline we are:
    const c = { lat, long };
    const abx = p2.long - p1.long;
    const aby = p2.lat - p1.lat;
    const acx = c.long - p1.long;
    const acy = c.lat - p1.lat;
    const coeff = (abx * acx + aby * acy) / (abx * abx + aby * aby);
    const dx = p1.long + abx * coeff;
    const dy = p1.lat + aby * coeff;
    const cross1 = (p2.long - p1.long) * (c.lat - p1.lat);
    const cross2 = (p2.lat - p1.lat) * (c.long - p1.long);
    const left = cross1 - cross2 > 0;
    const distInMeters = 100000 * FEET_PER_METER;
    const drift = (left ? 1 : -1) * dist(long, lat, dx, dy) * distInMeters;

    // Then we turn that distance into an error term that we add the number of degrees off
    // we are. If we need to fly 160 degrees and we're rolling towards 150, that's a 10
    // degree difference, but if we're also quite a few feet off the centerline, we can
    // tell the code we actually need to correct for, say, 12 or 15 degrees, so that we
    // don't just end up parallel to the center line, but actually drive back towards it.
    const limit = constrainMap(currentSpeed, 0, minRotate, 12, 4);
    const driftCorrection = constrainMap(drift, -130, 130, -limit, limit);

    // With that done, get our heading diff, with a drift correction worked in:
    const diff = getCompassDiff(heading, this.takeoffHeading + driftCorrection);

    // get our "magic constant":
    const stallFactor = constrainMap(vs12, 2500, 6000, 0.05, 0.3);

    // Set our "the faster we go, the less rudder we need" factor, which is just a straight
    // line down from 1 at a speed of zero to 0 at our minimum take-off speed, but constrained
    // so that we never go below 0.2, because we always want to be able to add *some* rudder.
    const speedFactor = constrain(1 - (currentSpeed / minRotate) ** 0.5, 0.2, 1);

    // Then the tail wheel: if this is not a tail dragger, only apply half the rudder.
    const tailFactor = isTailDragger ? 1 : 0.5;

    // And then finally we multiply all of those and put our foot down:
    const rudder = diff * stallFactor * speedFactor * tailFactor
    api.set(`RUDDER_POSITION`, rudder);
  }
```

And with that, what do things look like now?

THE SAME IMAGES BUT WITH RUDDER

That looks straight to me! There's a bit of wibbling on the runway by the heavier two, but nothing that keeps them from taking off straight.

So let's implement that whole "taking off" business!

### Rotate/take-off

Once we're at rolling at a good speed, we'll probably want to rotate the aeroplane (i.e. get its nose up) and take off to the skies, but what's a good speed

There are two special speeds that determine when an aeroplane can take off (from amongst a [truly humongous list](https://en.wikipedia.org/wiki/V_speeds) of "V- speeds"):

- `Vr`, or the "rotation speed", which is the speed at which you want to start pulling back on the stick or yoke to get the plane to lift off,and
- `V1`, which is the cutoff speed for aborting a takeoff. If you haven't taken off by the time the plane reaches `V1`, you are taking off, whether you like it or not, because the alternative is a crash. It's the speed at which your plane can no longer safely slow down to a stop simply by throttling and braking, so you're going to keep speeding up and you **_will_** take off, even if you then find a suitable place to perform an emergency landing.

For the purpose of our auto-takeoff we're going to _prefer_ to use `Vr`, but not every plane has a sensible value set for that (for... reasons? I have no idea, some planes have nonsense values like -1), so we'll use the rule "use `Vr` unless that's nonsense, then use `V1`".

```javascript
  async checkRotation(onGround, currentSpeed, lift, dLift, vs, totalWeight) {
    const { api, autopilot } = this;

    let {
      DESIGN_SPEED_MIN_ROTATION: minRotate, // this is our Vr
      DESIGN_TAKEOFF_SPEED: takeoffSpeed,   // this is our V1
    } = await api.get(`DESIGN_SPEED_MIN_ROTATION`, `DESIGN_TAKEOFF_SPEED`);

    // Annoyingly both values are in "feet per second" instead of knots, so let's convert:
    minRotate *= FPS_IN_KNOTS;
    takeoffSpeed *= FPS_IN_KNOTS;
    if (minRotate < 0) minRotate = 1.5 * takeoffSpeed;
    // Just for safety, we'll pick our actual rotation speed as "the one that MSFS
    // suggests should work, but let's add 5 knots, just in case":
    const rotateSpeed = minRotate + 5;

    // So now that we know when to rotate: are we in a rotation situation?
    if (!onGround || currentSpeed > rotateSpeed) {
      const { ELEVATOR_POSITION: elevator } = await api.get(`ELEVATOR_POSITION`);

      // We're still on the ground: start pulling back on the stick/yoke
      if (this.liftoff === false) {
        this.liftoff = Date.now();
        const pullBack = constrainMap(totalWeight, 3500, 14000, 0.05, 2);
        api.set(`ELEVATOR_POSITION`, pullBack);
      }

      // If we're not on the ground anymore, there are two possibilities:
      else {
        // First, if we're climbing too fast, back off on the elevator a bit:
        if (vs > 1000 && elevator > 0) {
          const backoff = constrainMap(vs, 100, 3000, this.easeElevator / 100, this.easeElevator / 10);
          api.set(`ELEVATOR_POSITION`, elevator - backoff);
        }

        // But if we're not climbing fast enough, pull on that stick/yoke a bit more:
        else if (dLift <= 0.2 && lift <= 300 && vs < 200) {
          let touch = constrainMap(totalWeight, 3500, 14000, 0.02, 0.2);
          touch = constrainMap(dLift, 0, 0.1, touch, 0);
          api.set(`ELEVATOR_POSITION`, elevator + touch);
        }

        // Irrespective of which of those two we're in, we want to make sure that the wing leveler
        // is turned on, because we absolutely positively want to fly straight during take-off:
        if (!autopilot.modes[LEVEL_FLIGHT]) autopilot.setTarget(LEVEL_FLIGHT, true);
      }
    }
  }
```

And that's our take off code. The trick is to make sure we pull on the stick/yoke enough to make the plane "rotate" upwards (hence the name), but not so hard that it flies out of control, so we just use small steps, and as long as we're not climbing we just keep doing that. Eventually our pulling back the elevator will overcome gravity.

### Handoff to the autopilot

The final step in the auto-takeoff process is to signal that auto-takeoff is complete, and to turn out the autopilot with the heading we're already flying, and with terrain mode turned on, for the ultimate "one click flight" that starts on the runway instead of in mid-air with an MSFS autopilot set to who knows what (I love it when MSFS spawns you with the AP set to climb 2000 feet per minute).

The code above suggests that there's a signal we can use to determine whether we've completed take-off, namely when we've leveling out the plane and we reach a point where we're no longer vertically accelerating. At that point we can safely switch to the autopilot and have it take over the whole "what altitude do we actually need to fly at?" business:

```javascript
  async checkHandoff(title, isTailDragger, totalWeight, vs, dVS, altitudeGained) {
    const { api, autopilot } = this;

    // If the plane is leveling out, and we're not vertically accelerating, switch to the autopilot!
    if (this.levelOut && dVS <= 0) {
      // Set the elevator trim (scaled for the plane's trim limits) so that the
      // autopilot doesn't start in neutral and we don't suddenly pitch down hard.
      const { ELEVATOR_TRIM_UP_LIMIT: trimLimit } = await api.get(`ELEVATOR_TRIM_UP_LIMIT`);

      // Note that these values are guesses: there does not appear to be anything in MSFS that lets
      // use set the trim value to what it needs to be, the best it can give us is "cruise pitch",
      // which unfortunately does not translate to trim values at all. As such, some planes can
      // absolutely still pitch down hard and crash, like the PAC P-750 XSTOL...
      const trim = trimLimit * constrainMap(totalWeight, 3000, 6500, 0.0003, 0.003);

      // So just to show off how to deal with a problematic plane:
      if (title.toLowerCase().includes(`orbx p-750`)) {
        trim *= 4; // Seriously, it needs four times as much trim as most other planes.
      }

      await api.set("ELEVATOR_TRIM_POSITION", trim);

      // Then reset the elevator since it's not required for the autopilot to do its job:
      await api.set("ELEVATOR_POSITION", 0);

      // And then turn on terrain follow, while turning off auto-takeoff. In order for terrain follow
      // to kick in, we do need an altitude, but that can be any value, since it's going to immediately
      // get overruled by the waypoint or terrain follow code.
      autopilot.setTarget(ALTITUDE_HOLD, 10000);
      autopilot.setTarget(TERRAIN_FOLLOW, true);
      autopilot.setTarget(AUTO_TAKEOFF, false);
    }

    // If the plane is not level yet: mark the plane as leveling out so that the above "what to do
    // while leveling out" code paths kick in:
    const limit = constrainMap(totalWeight, 3000, 6500, 300, 1000);
    if (!this.levelOut && (vs > limit || altitudeGained > 100)) {
      this.levelOut = true;
      console.log(`level out`);
      const { ELEVATOR_POSITION } = await api.get(`ELEVATOR_POSITION`);
      this.easeElevator = ELEVATOR_POSITION;

      // And now that we're leveling off, run through the post-takeoff procedure:
      api.set(`RUDDER_POSITION`, 0);
      api.trigger(`GEAR_UP`);
      // Normally we'd also raise flaps, but we never lowered them, so we're already winning!
    }
  }
```

And... that's it, we implemented auto-takeoff! One-button flying, here we go!

### Testing our code

As always, we'll want to update our web page so that we can actually click that "one click flight" button:

```html
<div class="controls">
  <link rel="stylesheet" href="/css/autopilot.css" />
  <button class="MASTER">AP</button>
  <button title="level wings" class="LVL">LVL</button>
  <label>Target altitude: </label>
  <input
    class="altitude"
    type="number"
    min="0"
    max="40000"
    value="4500"
    step="100"
  />
  <button title="altitude hold" class="ALT">ALT</button>
  <button title="auto throttle" class="ATT">ATT</button>
  <button title="terrain follow" class="TER">TER</button>
  <label>Target heading: </label>
  <input class="heading" type="number" min="1" max="360" value="360" step="1" />
  <button title="heading mode" class="HDG">HDG</button>
  <!-- make the magic happen! -->
  <button title="auto take-off" class="ATO">take off</button>
</div>
```

That's getting crowded, but it's the last thing we're adding. No client-side JS changes, other than updating our list of autopilot strings:

```javascript
export const AP_DEFAULT = {
  MASTER: false,
  LVL: false,
  ALT: false,
  ATT: false,
  TER: false,
  HDG: false,
  ATO: false,
};
```

And with that, we should be able to just spawn planes on a run and... fly.

In fact, we already did! All the graphs for terrain follow that started on the runway started with pressing the auto-takeoff button.

## Auto-landing

Of course, a flight consists of three parts: takeoff, "the flight" and landing, so... before we consider all of this "done", I'd say there's one thing left we should take a crack at. And because we can, let's implement this as a browser experiment (as a demonstration of how we _can_ do things purely client side).

This no longer uses a browser experiment.


### Auto-landing phases

There's a couple of steps and phases that we need to implement, starting with the most obvious one: finding an airport to land at. MSFS has two ways to check for airports, one that just gets every airport in the game, which isn't super useful, and one that gets all airport that are in the current "local reality bubble" (that's literally what the SDK calls it).

<table>
<tr>
<td style="width:33%"><img src="./runways-macro.png" alt="image-20230615120232718"></td>
<td style="width:28%"><img src="./runways-meso.png" alt="image-20230615120256440"></td>
<td style="width:38%"><img src="./runways-local.png" alt="image-20230615120308207"></td>
</tr>
</table>

Uhh, so... yeah: that can still be a _lot_ of airports, and not every plane can land at every airport (ever tried landing a regular plane on a water runway? Not the best landing), so we'll need a few checks:

1. Find all nearby airports,
2. Reduce that list to, say, 10 airports,
3. Remove any airport that we can't land at,
4. Find all approach points for all runways and check how close we are to each, where an approach point is "a gps coordinate several miles ahead of the runway where we can start our approach". Even if one airport is closer than another, that may not be true for their approach points.
5. Determine a waypoint based path to that approach point (because we need to execute up to a 180 degree turn in order to end up flying in the right heading, and we don't want to do that at the last second).

Once we have a flight plan towards a runway, and we've flown it to the approach, the auto-landing procedure consists of the following phases:

1. The slow-down phase, where we throttle down in order to get to "we should survive landing" speed,
2. The descent phase, where we slowly drop to an altitude from which we'll survive landing,
3. The "short final" phase, where we're basically at the runway and drop the landing gear (if it's retractable) send the plane down towards the ground (this may involve flaring the aircraft at some distance above the ground),
4. The initial touch down, where we engage the brakes
5. The roll-out, where we keep applying brakes and use the rudder to keep us straight on the runway as we slow down, and
6. The end, where the plane has stopped, we can let go of the breaks, retract the flaps, and because we're in a sim, turn off the engine(s).

Note that this is a pretty simplified landing that you'd never fly in real life, or even in-sim if you're flying yourself, but the subtleties of landing are lost on a computer, we need to be explicit about every step, and in order to get auto-landing to work _at all_ we're taking some shortcuts. Refinements and finessing can always come later, if desired.

So, let's write some code

### Finding an approach

First, let's find the approach we'll need in order to land, which as we saw in the previous section means finding an airport, runway, and waypoints to get us lined up:

```javascript
function getNearestApproach(plane, approachDistance, airportCount = 10, icao = undefined) {
  const candidates = [];

  // Just because we can, if we already know the airport we want to land at,
  // we can bypass the "find a nearby airport" part of the approach-finding-code:
  if (icao) {
    const simvar = `AIRPORT:${icao}`;
    const airport = (await getAPI(simvar))[simvar];
    candidates.push(airport);
  } else {
    // If we don't, get all nearby airports. This will give us a list of airport
    // summaries, which isn't much more than their GPS coordinate, name, and ICAO code.
    const { NEARBY_AIRPORTS: nearby } = await getAPI(`NEARBY_AIRPORTS`);

    // We then reduce that to "airportCount" airports, since most will be nowhere near us:
    const { lat, long } = plane.lastUpdate;
    const reduced = nearby
      .map((e) => {
        e.d = getDistanceBetweenPoints(lat, long, e.latitude, e.longitude);
        return e;
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, (airportCount = 10));

    // We can then ask for the full airport details for each of those.
    for await (let airport of reduced) {
      const simvar = `AIRPORT:${airport.icao}`;
      const fullAirport = (await getAPI(simvar))[simvar];
      fullAirport.distance = airport.d;
      candidates.push(fullAirport);
    }
  }

  // Now that we have our shortlist, let's calculate all their approach points.
  candidates.forEach((airport) =>
    computeApproachCoordinates(
      plane,
      airport,
      approachDistance,
      MARGIN_DISTANCE
    )
  );

  // We can then sort on how close we are to each approach point...
  let approaches = candidates
    .map((airport) => airport.runways.map((runway) => runway.approach))
    .flat(Infinity)
    .sort((a, b) => a.distanceToPlane - b.distanceToPlane);

  // And then remove any water landings if we can't land on water!
  const { FLOATS: isFloatPlane } = plane.flightModel.values;
  if (!isFloatPlane)
    approaches = approaches.filter((e) => {
      const surface = e.runway.surface;
      return !surface.includes(`water`);
    });

  // The first element left in the list is our approach!
  return  approaches[0];
}
```

Of course this does rely on that `computeApproachCoordinates` function, for turning runway information into actual approaches:

```javascript
function computeApproachCoordinates(plane, airport, approachDistance) {
  // Get the current plane lat/long
  const { lat: planeLat, long: planeLong } = plane.lastUpdate;

  // Then for each runway at an airport, figure out what the various coordinates
  // we need in order to build an approach path.
  airport.runways.forEach((runway) => {
    const { latitude: lat, longitude: long, length, width, heading } = runway;
    runway.airport = airport;
    let args;

    // Runways in MSFS are encoded as a center point, and a length and width, so
    // we need to do some math to get the runway center end points and four corners.
    args = [lat, long, length / 2000, heading];
    const { lat: latS, long: longS } = getPointAtDistance(...args);
    args = [lat, long, length / 2000, heading + 180];
    const { lat: latE, long: longE } = getPointAtDistance(...args);
    args = [latS, longS, width / 2000, heading + 90];
    const { lat: lat1, long: long1 } = getPointAtDistance(...args);
    args = [latS, longS, width / 2000, heading - 90];
    const { lat: lat2, long: long2 } = getPointAtDistance(...args);
    args = [latE, longE, width / 2000, heading - 90];
    const { lat: lat3, long: long3 } = getPointAtDistance(...args);
    args = [latE, longE, width / 2000, heading + 90];
    const { lat: lat4, long: long4 } = getPointAtDistance(...args);

    // To make our lives easier, let's just save those values, just in case.
    runway.coordinates = [
      [latE, longE],
      [latS, longS],
    ];

    runway.bbox = [
      [lat1, long1],
      [lat2, long2],
      [lat3, long3],
      [lat4, long4],
    ];

    // Then, for each runway we need to figure out our approach points,
    // which will consist of, in reverse order:
    //
    // - the runway end point,
    // - the runway start,
    // - the point several miles out from the start where we start our approach, and
    // - helper points to get us onto the approach, if needed.
    //
    // Runways have two ends, so we need to do this twice for each runway:
    runway.approach.forEach((approach, pos) => {
      const start = runway.coordinates[pos];
      const end = runway.coordinates[1 - pos];

      // First up, our approach point is `approachDistance` away from the start of the runway:
      approach.heading = (heading + (1 - pos) * 180) % 360;
      args = [...start, approachDistance, approach.heading];
      const { lat: alat, long: along } = getPointAtDistance(...args);
      const anchor = [alat, along];

      // To help make getting to the approach easier, add some "easing points",
      // which does require knowing which side of the runway line we're on.
      const a1 = getHeadingFromTo(...anchor, ...end);
      const a2 = getHeadingFromTo(...anchor, planeLat, planeLong);
      const s = sign(getCompassDiff(a2, a1));

      args = [alat, along, MARGIN_DISTANCE, approach.heading + s * 90];
      const { lat: palat1, long: palong1 } = getPointAtDistance(...args);
      args = [palat1, palong1, MARGIN_DISTANCE, approach.heading + s * 180];
      const { lat: palat2, long: palong2 } = getPointAtDistance(...args);

      // We'll save all those points
      approach.coordinates = {
        easingPoints: [
          [palat1, palong1],
          [palat2, palong2],
        ],
        anchor,
        runwayStart: start,
        runwayEnd: end,
      };

      // And record how far we are from this approach
      approach.distanceToPlane = getDistanceBetweenPoints(
        planeLat,
        planeLong,
        alat,
        along
      );

      // With some back-references to the runway and airport, for future ease-of-code.
      approach.airport = airport;
      approach.runway = runway;
    });
  });
}
```

Lots of code, but not a lot of "logic". The bulk is "building points" based on knowing distances and angles. The only thing that's worth looking at is those easing points: what do those do? Well...

### Getting lined up

Consider the following setup:

PUT A GRAPHICS-ELEMENT HERE

base setup: a runway and six approach locations: prior, next to, and past the runway, on either side.

Then show how things go wrong simply by showing the path from the cursor to trying to fly an aproach, approach with offset, and approach with forced offset first.

And now we have workable approaches: if we're further from the runway than the approach, we set up three waypoints (one easing point, the approach point, and the runway end) and if we're closer to the runway than the approach point, we use three (two easing points, the approach point, and the runway end).

Of course, the other part of getting lined up is "being at the right altitude", but that part is relatively easy: we're simply going to declare that we want to be at 1500 feet above the runway at the start of the approach, and 200 feet above the runway about halfway through the approach, and we'll just set the autopilot `ALT` value according to how close to the approach/runway we are.

So let's add some "getting onto the approach" code. First up, a function that'll actually build the waypoints _as_ autopilot waypoints for this approach:

```javascript
CODE INVALID
```

And then a `getOntoApproach` function to, you know, get us onto the approach:

```javascript
CODE INVALID
```

And then we can plug that into our currently empty `autoland` function:

```javascript
CODE INVALID
```

If we were to run this right now, we'll see something like this:

![{89722211-5B6A-4F94-B6BA-CE9F8EA2374A}](./approach-flight-c310r.png)

...if we remembered to implement the approach visualization:

```javascript
CODE INVALID
```

So handy. But while flying over the runway is useful in order to understand your landing when you're flying a plane yourself, it's not much use for an auto-lander: we want to get this plane on the ground!

### Landing the plane

So let's implement the next part of our landing procedure:

```javascript
CODE INVALID
```

There's two things we need to answer before we can run this code, though: what's a safe throttle position, and what's the right distance from the runway to start the actual landing? Because those depend on the plane we're flying. Unfortunately, as far as I know (although I'd love to be shown otherwise) there is no good way to abstract that information from SimConnect variables and/or current flight information, so.... we hard code them. For example, for the DeHavilland DHC-2 "Beaver", `SAFE_THROTTLE` is 65%, and `DROP_DISTANCE_KM` is 0.5, and for the Cessna 310R, the `SAFE_THROTTLE` is 35%, and the `DROP_DISTANCE` is 0.8... how do we know? I flew those planes, many many times, over a nice flat stretch of Australia where you can just go in a straight line forever while setting the throttle to something and then wait to see what speed that eventually slows you down to. And then cutting the throttle to see how long it takes to hit the ground. Science!

But yeah, it means we're going to need some airplane-specific parameters, which means we might as well make some airplane profiles. We don't _want_ those, but I haven't figured out a way to make auto-landing work without them, so... let's go? We'll make a little `parameters.js` file, and I'm giving you two airplanes but you get to do the rest:

```javascript
CODE INVALID
```

and then we update our autoland code to use those:

```javascript
CODE INVALID
```

Disappointing, but at least we know this will work. For the planes we figure out all these parameters for at least. Moving on: the `throttleTo` function is really simple: every time it gets called, we make sure to update the current target altitude, while decreasing the throttle by 1%, until we reach the target throttle percentage. Then we stop running it. Following that, `reachRunway` is just as simple. It also runs the "make sure to update the target altitude" code, and just checks "are we close enough to the runway to start landing?". If so, it stops running. Because at that point it's time for...

#### Getting onto the runway

Landing the plane is really more of a controlled crash: we cut the engine (or rather, throttle, we keep the engine itself running), drop our landing gear, and fully extend the flaps so that we basically end up gliding onto the runway.

```javascript
CODE INVALID
```

Simple enough, although there's one part missing: we need to flare, as in pull up a little just before we hit the ground, so we don't hit the ground with our wheels, pivot over them, remember we don't have a nose wheel, and plow propeller-first into the runway. So:

```javascript
CODE INVALID
```

With that, by the time this function exits we are on the ground, without having kissed the tarmac with our lips, rather than our wheels. Which means it's time for...

#### Braking and steering

Different planes can brake different amounts without things going wrong. If we're in a tail dragger, we can only apply so much brake force before the wheels slow down faster than the plane, and the plane rotates forward and does a nose-over. If we're in a plane with a tricycle gear, though, we have a wheel at the nose that prevents nose-over and we can basically brake as hard as we want, until we've stopped. So:

```javascript
CODE INVALID
```

And that's it! We've done everything necessary to achieve fully automated flight!

### Testing the code

Now, testing this code is rather straight forward in that we just fire up MSFS, put a plan on a runway, create a bit of a flight plan, hit "take off" in the browser, and when we reach the last marker, we click "land" (we could automate that, but that's for another day. By you). That does not translate well into pictures, though, so as the final test for all our hard work, let's just capture this one using the medium of video capture.

We'll fly the Beaver from [Dingleburn Station](https://dingleburn.co.nz/) on New Zealand's South Island to [Wānaka](https://en.wikipedia.org/wiki/W%C4%81naka), with auto-takeoff, waypoint navigation, and auto-landing. Enjoy a 20 minute trip across some beautiful New Zealand scenery.

<iframe width="1000" height="400" src="https://www.youtube.com/embed/xIyGfYj66T0" frameborder="0" allow="picture-in-picture" allowfullscreen></iframe>

# Conclusions

Holy crap, we did a lot! Also: this stuff is cool!

We've just been writing a bunch of JS and it's flying aeroplanes in a flight simulator for us. Sure, you could spend an hour programming the in-game autopilot, but unless you're deep into flight sims and you want full realism "all-where every-when", that's not exactly an appealing prospect. And yes, getting to the point where can just hit "go" and enjoy the ride took a bit of work, but now, if we want, we never have to use an in-game autopilot again.

So you might be wondering what else we can do. Here are some thoughts:

1. We could vastly improve auto landing by taking runway length and slope into account, not to mention terrain: not every runway has a nice clear path to it. Good luck landing at [Lukla](https://en.wikipedia.org/wiki/Tenzing-Hillary_Airport), for instance!
2. We could add in a "fly inverted" button so that acrobatic planes can file on autopilot... upside down. This would require a different way of trimming because acrobatic/fighter planes tend to "go where you point them" nearly immediately, and running an autopilot every half second with fairly coarse trim instructions because we're relying on planes to slowly act on those trim instructions would make those type of planes flip and spin out of control rather quickly.
3. We could make the waypoint code more like "path tracking" code, where we don't just define waypoints but give them curve control points that let use create fancy paths through canyons or over landscape features rather than just flying mostly straight lines between them.
4. We could try to replace our blocks of "code guesses" with self-tuning PID controller code so we that we only need to say what what targets we want, and the PID controller figures out what good steps sizes for that are. This is one of those "conceptually, this is simple" because we can replace a whole bunch of code with a PID initialization and then a few lines of update loop, but actually making that work can be the worst time sink you never knew existed. The problem with PID controllers isn't setting them up, it's the full-time job of tweaking them that will make you regret your life decisions.
5. I mean you've seen what we can do already, the sky's the limit. Or, you know what: no, it isn't. We're already flying, there are no limits. Get your learn on and write something amazing, and then tell the world about it.

I hope you had fun, and maybe I'll see you in-sim. Send me a screenshot if you see me flying, I might just be testing more code to add to this tutorial! =D

— [Pomax](https://mastodon.social/@TheRealPomax)
