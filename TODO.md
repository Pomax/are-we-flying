[ bug ]

- "clear" does not clear all waypoints. This should literally be a "clear" call to the AP??
- GROUND_ALTITUDE cannot be relied upon.

place waypoint, plane targets
place second waypoint, plane immediately switches target
why?
cause: path projection, so the first waypoint needs "the plane's current position" added to force it as target.

[ in progress ]

- auto-landing
  - [x] find runway, altitude, and heading
  - [x] set glide to 1500 feet above runway
  - [x] get onto flight path to runway *at the start*
  - [x] establish the glide slope
  - [x] slow down to stall + 20, then down to stall speed
  - [x] flare before touchdown
  - [x] apply brakes and rudder during roll


[ to do ]

- waypoints: if there's a p1/p2 pair and the distance from plane to p2 is

- autopilot: fall back to physical controls when trim doesn't work?
- auto-takeoff: runway awareness means we can pick appropriate throttle steps... right?
- wrapper: unknown vars still throw a full exception?
- add waypoint on existing path?
- check flight paths with waypoint elevations for terrain interference (two points at 400' with 1000' peak in between should get a warning)
- add UI for throttle, propellor, and mixture (not necessarily interactive)?
- disabled takeoff button when we're in the air?
- [bug] graphing: plotting scale flips sign once min/max get adjusted
- don't trim if we're at max trim already (instead, use throttle)
- set a minimum altitude for TER? (e.g. for tour flights)
- make the elevation server initialize and periodically ping the NAS?
- maybe make the elevation server run in its own process so it doesn't hold up the autopilot when turning on terrain follow
- add inverted flight back in...?
- add code to set the in-game course-select indicator (I have no idea which variable this would be)
- auto-takeoff check: close the windows???? (looking at you islander/trislander)
- elevation server as Leaflet map tile source (hill shaded)?
- why does slew mode lock up the api server?

[ added ]

- [x] flight model triggers update (ONCE)
- [x] made the autopilot reset when we start a new flight.
- [x] swap terrain follow and waypoint sections.

- [x] waypoints have altitude now (bypassed during terrain follow).
- [x] waypoint revalidation so you can start a flight plan nearest to where you are instead of "at the start".
- [x] waypoint management: click map to add, click-drag to move, click to set altitude, double-click to remove
- [x] flightpaths can be reset after loading and revalidation.

- [x] auto-takeoff check: set barometric pressure
- [x] auto takeoff: runway center line awareness, so we fly down the runway, not parallel to it
- [x] auto-takeoff no longer revalidates flight path on hand-over

- [x] hot reloading for fly-level, altitude-hold, and auto-takeoff (should we document this?)

- [ ] autopilot "zero" update, to reset trim

