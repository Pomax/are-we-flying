[ to do ]

- add waypoint on existing path?
- check flight paths with waypoint elevations for terrain interference (two points at 400' with 1000' peak in between should get a warning)
- add UI for throttle, propellor, and mixture (not necessarily interactive)?
- disabled takeoff button when we're in the air?
- set a minimum altitude for TER? (e.g. for tour flights)
- make the elevation server initialize and periodically ping the NAS?
- auto-takeoff check: close the windows???? (looking at you islander/trislander)
- elevation server as Leaflet map tile source (hill shaded)?

[ UPDATE DOC ]

- backport:
  - waypoint control buttons
  - waypoint updates -> autopilot onChange
  - CSS changes for button bars
  - the heading mode code =\_=
  - try/catch the autopilot run() function
  - charts: dual plotting

[ UPDATE CODE]

- add some UI for "how long the flight is expected to take" based on current speed.
- call out the fact that we won't be writing perfect code from the get go. This is a programming journey, not "copy this code". If you want to copy the code, just clone the repo and run `run.bat`.


Alternatively, do we want to compute strips along a waypoint so we're working with as much cached data as possible and don't hit ALOS as much?

backport and document: ENV_PATH in constants.js

- add ALOS tile explorer to the ALOS server so we can check elevations graphically?
- fly level requires "actual flight heading", not "airplane heading". We need to know our actual GPS track heading.
- MUCH TIGHTER VS CONTROL DURING LANDING OMGWTF
- Tighten up the altitude hold, not super happy with how slow it is in setting trim.
