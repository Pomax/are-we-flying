import { constrain } from "./js/utils.js";

export function distanceField(data, width, height) {
  function getPixel(x, y) {
    x = constrain(x, 0, width - 1);
    y = constrain(y, 0, height - 1);
    const i = 4 * (x + y * width);
    return data[i + 2];
  }

  function runStep(ref) {
    let updated = false;
    const data2 = new Uint16Array(data.length).fill(0);

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const i = 4 * (x + y * width);

        //       // copy pixel value, but keep mask 0
        data2[i] = data[i];
        data2[i + 1] = data[i + 1];
        data2[i + 2] = data[i + 2];

        // ignore on unmasked pixels
        if (data[i + 3] !== 255) continue;

        // ignore pixels that aren't a ref match
        if (data[i + 2] !== ref) continue;

        // get all pixels within a radius of
        const n = [
          // getPixel(x - 1, y - 1),
          getPixel(x - 1, y),
          // getPixel(x - 1, y + 1),
          getPixel(x, y - 1),
          getPixel(x, y + 1),
          // getPixel(x + 1, y - 1),
          getPixel(x + 1, y),
          // getPixel(x + 1, y + 1),
        ];
        const v = 1 + Math.min(...n);
        data2[i + 2] = v;

        // mark the new mask, for the next pass
        if (data2[i + 2] === ref + 1) data2[i + 3] = 255;

        // and mark that we had an update
        updated = true;
      }
    }

    if (updated) data = data2;

    return updated;
  }

  for (let ref = 1, e = Math.max(width, height) / 2; ref < e; ref++) {
    if (!runStep(ref)) break;
  }

  return data;
}
