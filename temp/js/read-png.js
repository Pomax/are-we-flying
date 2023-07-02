// This is a surprisingly simple bit of JS for parsing 16 bit grayscale
// PNG files, although they do need to follow a few rules: they shouldn't
// use any special pixel filtering, and there should be a single IDAT
// chunk of pixel data.

// This is a browser based gzip deflate implementation, which we'll need
// for as long as browsers don't have a Compression object to work with.
// Which you'd think had been include decades ago, given that browsers
// already have libraries linked in for all kinds of data compression and
// decompression, especially given the modern web with server-side compression.

let pako;
const IN_BROWSER = typeof document !== `undefined`;
if (IN_BROWSER) {
  pako = globalThis.pako;
} else {
  const zlib = await import("zlib");
  pako = {
    deflate: zlib.deflateSync,
    inflate: zlib.inflateSync,
  };
}

// We'll need to know which "endian" encoding this computer uses, because
// that's just ridiculously important....
// See https://en.wikipedia.org/wiki/Endianness for all the details here.
import { LITTLE_ENDIAN, BIG_ENDIAN, endian, reverseEndian } from "./endian.js";
import { indexOf } from "./utils.js";

const from4b = (b) => (b[0] << 24) + (b[1] << 16) + (b[2] << 8) + b[3];

/**
 * parse a byte array as a PNG, and return the width, height, pixel data,
 * and if present, "GeoTags" text chunk. No standard PNG will have that
 * last part, but the data that I'm working with over on the repo for
 * https://github.com/Pomax/are-we-flying most definintely does.
 */
export function readPNG(pngPath, data) {
  data = new Uint8Array(data);

  // Get the raster dimensions
  const width = from4b(data.subarray(16, 20));
  const height = from4b(data.subarray(20, 24));

  // Convert image scan lines into 16 bit pixels rows
  const pos = indexOf(data, `IDAT`);
  const length = from4b(data.subarray(pos - 4, pos));
  const deflated = data.subarray(pos + 4, pos + 4 + length);
  const imageData = pako.inflate(deflated);
  const bytes = new Uint8Array(width * height * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width * 2; x++) {
      bytes[x + y * width * 2] = imageData[1 + x + y * (width * 2 + 1)];
    }
  }
  if (endian === LITTLE_ENDIAN) reverseEndian(bytes);
  const pixels = new Int16Array(bytes.buffer);

  // Get the GeoTag data,if there is any
  let geoTags;
  const gpos = indexOf(data, `tEXt`);
  if (gpos > -1) {
    const bts = data.subarray(gpos - 4, gpos);
    const glen = from4b(bts);
    const json = new TextDecoder().decode(
      data.subarray(indexOf(data, `GeoTags`) + 8, gpos + 4 + glen)
    );
    geoTags = JSON.parse(json.toString());
  }

  // we're done.
  return { width, height, pixels, geoTags };
}
