[ to do ]

- add waypoint on existing path?
- check flight paths with waypoint elevations for terrain interference (two points at 400' with 1000' peak in between should get a warning)
- add UI for throttle, propellor, and mixture (not necessarily interactive)?
- disabled takeoff button when we're in the air?
- [x] set a minimum altitude for TER? (e.g. for tour flights)
- make the elevation server initialize and periodically ping the NAS?
- add inverted flight back in.
- auto-takeoff check: close the windows???? (looking at you islander/trislander)
- elevation server as Leaflet map tile source (hill shaded)?

[ To do soon ]

- Should the flight information object be owned by the API, since it's basically a giant API collection wrapper?
- rename flightModel and flightData to flightInformation.model and flightInformation.data? That way client state can just set `{ flightInformation }`

[ UPDATE DOC ]

- backport:
  - waypoint control buttons
  - waypoint updates -> autopilot onChange
  - CSS changes for button bars
  - the heading mode code =\_=
  - try/catch the autopilot run() function
  - charts: dual plotting

[ UPDATE CODE]

- teleport detection doesn't work
- add some UI for "how long the flight is expected to take" based on current speed.
- call out the fact that we won't be writing perfect code from the get go. This is a programming journey, not "copy this code". If you want to copy the code, just clone the repo and run `run.bat`.


Does this make sense? Or would we just waste time computing:
  - convert TER path segments into a single outline poly
    - if intersection, replace the endpoints with the intersection point
    - if no intersection, no work required

Alternatively, do we want to compute strips along a waypoint so we're working with as much cached data as possible and don't hit ALOS as much?