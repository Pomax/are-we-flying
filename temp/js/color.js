let colorMapping = [
  [-5000, [0, 0, 100]],
  //[-1, [0, 0, 100]],
  //[0, [255, 255, 120]],
  [1, [25, 220, 25]],
  [100, [0, 180, 0]],
  [300, [0, 140, 0]],
  [600, [110, 65, 0]],
  [1000, [175, 155, 120]],
  [1500, [200, 230, 230]],
  [1800, [200, 230, 255]],
  [2000, [230, 230, 255]],
  [2500, [255, 255, 255]],
  [9000, [255, 255, 255]],
];

export function getColorMapping() {
  return colorMapping;
}

export function setColors(mapping) {
  colorMapping = mapping;
}

/**
 * Generate a colour for a specific elevation, based on interpolating between
 * different fixed values. For instance, the colour for 50' is midway between
 * the two known colours at 1' and 100'.
 */
export function getColor(elevation) {
  const entries = colorMapping;
  const pos = entries.findIndex(([e, c], i) => e > elevation);
  const e1 = entries[pos - 1];
  const e2 = entries[pos];
  const r = (elevation - e1[0]) / (e2[0] - e1[0]);
  return lerpColor(r, e1[1], e2[1]);
}

export function blurColors(...c) {
  const n = c.length;
  let [r, g, b] = [0, 0, 0];
  c.forEach((c) => {
    r += c[0] ** 0.5;
    g += c[1] ** 0.5;
    b += c[2] ** 0.5;
  });
  r /= n;
  g /= n;
  b /= n;
  return [r ** 2, g ** 2, b ** 2];
}

/**
 * Linear intERPolation function for RGB colours.
 */
export function lerpColor(r, c1, c2) {
  return [
    lerpChannel(r, c1[0], c2[0]) | 0,
    lerpChannel(r, c1[1], c2[1]) | 0,
    lerpChannel(r, c1[2], c2[2]) | 0,
  ];
}

/**
 * "linear" interpolation between two (single channel)
 * colour values, based on real world light.
 * See https://www.youtube.com/watch?v=LKnqECcg6Gw for more on this.
 */
export function lerpChannel(r, v1, v2) {
  return ((1 - r) * v1 ** 0.5 + r * v2 ** 0.5) ** 2;
}
