| plane | <div style="border-bottom:1px solid black; text-align:center">weight</div>wingarea | flight | inverted?
| ---|---|---|---
| top rudder      | 3.5 |    good     | (lol)
| pitts           | 9.6 |    good     | yes
| r3              | 13.2 |   good     | yes
| turbo arrow III | 14.5 |   good     | na
| beaver          | 15.8 |   good     | na
| d18             | 18.8 |   good     | na
| kodiak          | 21.5 |   good     | na
| 310r            | 23 |     good     | na
| DC-3            | 23.9 |   good     | na
| TMB             | 30.5 |   good     | na
| king air        | 41.22 |  good     | na
| 747-8           | 126.5 |  bad | (lol v2)

The boeing kills itself just by turning.

Code to use:

```js
const wpa = weight / wingArea;
const maxFactor = constrainMap(wpa, 4, 25, 1, 3);
maxStick *= constrainMap(abs(headingDiff), 0, 10, 1, maxFactor);
```

