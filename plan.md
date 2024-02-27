# Approach pattern

```
.--- runway end alt         .--- runway + 1000'
|   .--- runway start alt   |     .--- runway + 1000'
|   |     .--- start + 100' |     |   .--- plane/waypoint alt
|   |     |                 |     |   |
a1  a1    a2                a3    a4  a5

E---S-----M-----------------A-----o1--o2
|   |     |                 |     |   |
|   |     `--- 100' mark    |     |   `--- offset 2
|   `--- runway start       |     `--- offset 1
`--- runway end             `--- approach anchor
```

## sections:

- **E--S** is the runway
- **S--M** is the part of the track where we stabilize our altitude to "near runway alt"
- **M--A** is the approach glidepath from "1000' above the runway" to "100' above the runway start"
- **A--o1** is the flightpath section that forces a plane to line up with the approach
- **o1--o2** is an optional flightpath section to force the plane to "start at o1"

# Landing phases

1. get onto the approach
1. fly down the approach until we're 100' above the runway at 2km out
1. then very slowly descend to 30 feet above the runway
1. then cut the engines
1. drop the last 30 feet
1. flare if needed before we touch down?
1. once down, autorudder and brake (and pull back as needed)

