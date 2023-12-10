[ in progress ]

- auto-landing
  - [x] find runway, altitude, and heading
  - [x] draw runway on the map
  - [ ] set glide to 1500 feet above runway
  - [ ] get onto flight path to runway _at the start_
  - [ ] establish the glide slope
  - [ ] slow down to stall + 20, then down to stall speed
  - [ ] flare before touchdown
  - [ ] apply brakes and rudder during roll

[ to do ]

- auto-takeoff: runway awareness means we can pick appropriate throttle steps... right?
- add waypoint on existing path?
- check flight paths with waypoint elevations for terrain interference (two points at 400' with 1000' peak in between should get a warning)
- add UI for throttle, propellor, and mixture (not necessarily interactive)?
- disabled takeoff button when we're in the air?
- set a minimum altitude for TER? (e.g. for tour flights)
- make the elevation server initialize and periodically ping the NAS?
- add inverted flight back in.
- auto-takeoff check: close the windows???? (looking at you islander/trislander)
- elevation server as Leaflet map tile source (hill shaded)?
- why does slew mode lock up the api server?
