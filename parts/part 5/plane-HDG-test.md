| plane | <div style="border-bottom:1px solid black; text-align:center">weight</div>wingarea | flight | inverted?
| ---|---|---|---
| top rudder      | 3.5 |       good     | lol
| pitts           | 9.6 |       good     |
| r3              | 13.2 |      good     |
| turbo arrow III | 14.5 |      good     |
| beaver          | 15.8 |      good     |
| d18             | 18.8 |      good     |
| kodiak          | 21.5 |      good     |
| 310r            | 23 |        good     |
| DC-3            | 23.9 |      good     |
| TMB             | 30.5 |      good     |
| king air        | 41.22 |     good     |
| 747-8           | 126.5 |  we're not testing this =) |lol v2

Code to use:

```js
const wpa = weight / wingArea;
const maxFactor = constrainMap(wpa, 4, 25, 1, 3);
maxStick *= constrainMap(abs(headingDiff), 0, 10, 1, maxFactor);
```

