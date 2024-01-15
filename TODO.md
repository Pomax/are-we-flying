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

- Document feature flags as they are in `emergency` pa
- backport:
    alt + lvl code (pruned)
    flightinformation and flightvalues
    frontend autopilot bar: update alt + heading when not active.
- add: "death by speed-up on the descent"
  - start part 4 with autothrottle?
    - or move it to part 3?
