// how prominent should the isolines be, and which colour should they use?
const OUTLINE_COLOR = [0, 0, 0];

/**
 * This function takes a PNG pixel array, and a list of elevations, and
 * returns a pixel array that has been recoloured using the `getColor`
 * colour gradient function.
 */
export function generateIsoMap({ height, width, pixels }, isoValues = []) {
  const newPixels = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0, e = newPixels.length; i < e; i++) {
    newPixels[i] = 0;
  }
  isoValues.forEach((value) =>
    addIsolineLayer(pixels, newPixels, width, height, value)
  );
  return newPixels;
}

/**
 * This function colours a single ISO band in-place.
 */
function addIsolineLayer(pixels, newPixels, width, height, threshold) {
  const t = threshold;
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      let i = x + y * width;

      let nw = pixels[i];
      let ne = pixels[i + 1];
      let se = pixels[i + 1 + width];
      let sw = pixels[i + width];

      const b1 = nw > t ? 8 : 0;
      const b2 = ne > t ? 4 : 0;
      const b3 = se > t ? 2 : 0;
      const b4 = sw > t ? 1 : 0;

      const matchType = b1 + b2 + b3 + b4;

      // Since we're (for now) working on the pixel grid, we don't actually care
      // about the location of the isoline point _between_ pixels, we just need
      // to color "the actual pixel" and leave everything else transparent.
      if (0 < matchType && matchType < 15) {
        newPixels[4 * i] = OUTLINE_COLOR[0];
        newPixels[4 * i + 1] = OUTLINE_COLOR[1];
        newPixels[4 * i + 2] = OUTLINE_COLOR[2];
        newPixels[4 * i + 3] = 255;
      }
    }
  }

  return newPixels;
}
