// let baseColorMapping = [
//   [-500, [0, 0, 100]],
//   [0, [0, 0, 100]],
//   [1, [25, 200, 25]],
//   [100, [0, 180, 0]],
//   [300, [0, 140, 0]],
//   [600, [110, 65, 0]],
//   [1000, [175, 155, 120]],
//   [1500, [200, 230, 230]],
//   [1800, [200, 230, 255]],
//   [2000, [230, 230, 255]],
//   [2500, [255, 255, 255]],
//   [9001, [255, 255, 255]],
// ];

let baseColorMapping = [
  [-500, [0, 0, 100]],
  [0, [0, 0, 100]],
  [1, [210, 230, 210]],
  [100, [180, 225, 185]],
  [300, [175, 220, 180]],
  [600, [170, 215, 175]],
  [9001, [255, 255, 255]],
];

let palette;

function getbaseColorMapping() {
  return baseColorMapping;
}

function setColors(mapping) {
  baseColorMapping = mapping;
}

function getPalette() {
  if (palette) return palette;

  palette = [];

  // water and shoreline
  // 0: deep
  // 1: shore band
  // 2: shore line (water)
  // 3: shore line (ground)
  palette[0] = [150, 190, 250];
  palette[1] = [150, 220, 200];
  palette[2] = [150, 240, 220];
  palette[3] = [210, 230, 220];

  // 4-254: -500m to 9000m gradient
  const entries = baseColorMapping;
  for (let i = 4; i <= 254; i++) {
    const elevation = -500 + ((i - 4) / 250) * 9500;
    const pos = entries.findIndex(([e, c], i) => e > elevation);
    // console.log(elevation, pos);
    const e1 = entries[pos - 1];
    const e2 = entries[pos];
    const r = (elevation - e1[0]) / (e2[0] - e1[0]);
    palette[i] = lerpColor(r, e1[1], e2[1]);
  }

  // make sure "1m" maps to that actual colour:
  palette[17] = baseColorMapping[2][1];

  // And finally, set the iso line color as 255th value
  palette[255] = [0, 0, 0];

  return palette;
}

/**
 * Generate a colour for a specific elevation, based on interpolating between
 * different fixed values. For instance, the colour for 50' is midway between
 * the two known colours at 1' and 100'.
 */
function getColor(elevation) {
  return palette[(4 + (250 * (elevation + 500)) / 9500) | 0];
}

/**
 * Linear intERPolation function for RGB colours.
 */
function lerpColor(r, c1, c2) {
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
function lerpChannel(r, v1, v2) {
  return ((1 - r) * v1 ** 0.5 + r * v2 ** 0.5) ** 2;
}

getPalette();

export {
  getbaseColorMapping,
  setColors,
  getColor,
  getPalette,
  lerpColor,
  lerpChannel,
};
