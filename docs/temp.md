<!--

### Changing altitudes

And of course, now that we have code that tells the altitude hold to hold a specific altitude, we get transitioning between altitudes for free: no extra code changes required, we just type in the new altitude we want in our number field on the web page, and then... the plane change altitude for us.

=== DO WE EVEN WANT/NEED SMOOTH RAMP? ===

Let's smooth that out by, instead of just immediately setting our `targetVS` to the maximum value setting it to "something higher (or lower) than our current VS" until we reach maximum vertical speed:

```javascript
import { constrain, constrainMap } from "../utils/utils.js";
const { abs, sign } = Math;

const FEATURES = {
  ...
  SMOOTH_RAMP_UP: true,
};

...

function getTargetVS(autopilot, maxVS, alt) {
  ...

  const targetAltitude = autopilot.modes[ALTITUDE_HOLD];
  if (targetAltitude) {
    altDiff = targetAltitude - currentAltitude;

    if (FEATURES.SMOOTH_RAMP_UP) {
      const direction = sign(altDiff);
      const plateau = 200;

      // If we're more than <plateau> feet away from our target, ramp
      // our target up to maxVS, and keep it there.
      if (abs(altDiff) > plateau) {
        // start ramping up our vertical speed until we're at maxVS
        if (abs(VS) < maxVS) {
          const step = direction * plateau;
          targetVS = constrain(VS + step, -maxVS, maxVS);
        } else {
          targetVS = direction * maxVS;
        }
      }

      // And if we're close to the target, start reducing our target
      // speed such that our target VS is zero at our target altitude.
      else {
        targetVS = constrainMap(altDiff, -plateau, plateau, -maxVS, maxVS);
      }
    }

    // if we're not smooth-ramping, we just target maxVs, same as we did before:
    else {
      targetVS = constrainMap(altDiff, -plateau, plateau, -maxVS, maxVS);
    }
  }

  return { targetVS, altDiff };
}
```

=== COMPARATIVE RESULT HERE ===

### Tidying up our ALT

So let's just put in three more "fixes" before we move on, mostly because we're here now anyway, and they're very easy to add:

1. outright ignoring truly tiny updates if we're already tending in the right direction,
2. boosting small updates if we need to go up, but we're going down (or vice versa),
3. making sure we don't tell the plane to trim past +/- 100% (because _oh boy_ will MSFS let you do that!)

All of these should make intuitive sense, and they're very little work to put in:

```javascript
const FEATURES = {
  ...
  SKIP_TINY_UPDATES: true,
  BOOST_SMALL_CORRECTIONS: true,
  LIMIT_TRIM_TO_100: true,
};

export async function altitudeHold(autopilot, state) {
  ...

  const updateMagnitude = update / trimStep;

  // Skip tiny updates if we're already moving in the right direction
  if (FEATURES.SKIP_TINY_UPDATES && sign(targetVS) === sign(VS) && abs(updateMagnitude) < 0.001) return;

  // Boost small updates if we're moving in the wrong direction
  if (FEATURES.BOOST_SMALL_CORRECTIONS && sign(targetVS) !== sign(VS) && abs(updateMagnitude) < 0.01) update *= 2;

  trim.pitch += update;

  if (FEATURES.LIMIT_TRIM_TO_100) trim.pitch = constrain(trim.pitch, -Math.PI / 20, Math.PI / 20);

  api.set(`ELEVATOR_TRIM_POSITION`, trim.pitch);
}
```

And that's it. Three constants, four lines of code. And the effect of these are pretty subtle: the first two reduce oscillations around the target altitude while also reducing over/undershoot when we change altitudes, and the last one prevents us from telling MSFS to trim past what would be realistic values. If you want to see an airplane spin like a top, see what happens when you run ``api.set(`ELEVATOR_TRIM_POSITION`, 10)``. It's honestly kind of amazing to watch.

=== UPDATE FLY LEVEL ===

-->