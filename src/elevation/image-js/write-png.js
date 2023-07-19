import path from "path";
import zlib from "zlib";
import crc32 from "crc/crc32";
import { readFileSync, writeFileSync } from "fs";
import { mkdirSync } from "fs";

const LITTLE_ENDIAN = Symbol(`little endian`);
const BIG_ENDIAN = Symbol(`big endian`);
const endian = (function checkEndian() {
  const buf = new ArrayBuffer(2);
  const u8 = new Uint8Array(buf);
  const u16 = new Uint16Array(buf);
  u8.set([0xaa, 0xbb], 0);
  return u16[0] === 0xbbaa ? LITTLE_ENDIAN : BIG_ENDIAN;
})();

const toBytes = (v) => v.split(``).map((v) => v.charCodeAt(0));

const reverseEndian = (pngPixels8) => {
  for (let i = 0, e = pngPixels8.length; i < e; i += 2) {
    let _ = pngPixels8[i];
    pngPixels8[i] = pngPixels8[i + 1];
    pngPixels8[i + 1] = _;
  }
};

const fourByte = (num) => {
  return [
    (num & 0xff000000) >> 24,
    (num & 0xff0000) >> 16,
    (num & 0xff00) >> 8,
    num & 0xff,
  ];
};

const from4b = (b) => (b[0] << 24) + (b[1] << 16) + (b[2] << 8) + b[3];

const makeChunk = (type, data = []) => {
  const typeBytes = toBytes(type);
  const length = fourByte(data.length);
  const buffer = [...typeBytes, ...data];
  const crc = crc32(buffer);
  return Buffer.from([...length, ...buffer, ...fourByte(crc)]);
};

const assemble = (...chunks) => Buffer.concat([...chunks, makeChunk(`IEND`)]);

export function writePNG(pngPath, pngPixels, w, h, geoTags, palette) {
  const dirs = pngPath.substring(0, pngPath.lastIndexOf(path.sep));
  mkdirSync(dirs, { recursive: true });

  const pngPixels8 = new Uint8Array(pngPixels.buffer);

  // how many bits is this data?
  let bits = (8 * pngPixels.length) / (w * h);
  const rgba = bits === 32 || bits === 64;
  if (rgba) bits /= 4;

  // how many bytes per pixel?
  const bytes = (bits / 8) * rgba ? 4 : 1;

  // do we need to reverse the byte ordering?
  if (endian === LITTLE_ENDIAN && bits === 16) reverseEndian(pngPixels8);

  // PNG preamble
  const magic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [magic];

  // PNG header
  let IHDR_DATA = [
    ...fourByte(w), // width
    ...fourByte(h), // height
    -1, // bit depth, as number
    -1, // color: 0=grayscale, 3=palette, 6=RGBA
    0, //  compression method must be set to 0.
    0, //  filter method, must be set to 0
    0, //  interlace method (0, because we don't want interlacing)
  ];

  // header for 8 bit palette or RGBA image
  if (bits === 8) {
    IHDR_DATA[8] = 8;
    IHDR_DATA[9] = palette ? 3 : 6;
  }

  // header for 16 bit greyscale image
  else if (bits === 16) {
    IHDR_DATA[8] = 16;
    IHDR_DATA[9] = 0;
  }

  // we should not be able to trigger this, but always good to have
  else throw new Error(`writePNG() can only work with 8 or 16 bit data`);

  // convert the pixel raster to scanlines that start with
  // a zero byte,to indicate they use filter type "none":
  const filtered = new Uint8Array(pngPixels8.length + h);
  for (let y = 0; y < h; y++) {
    const s = bytes * y * w;
    const d = 1 + y + s;
    filtered.set(pngPixels8.subarray(s, s + bytes * w), d);
  }

  // Create the header chunk
  chunks.push(makeChunk(`IHDR`, IHDR_DATA));

  // Do we need to encode a palette?
  if (bits === 8 && palette) {
    chunks.push(makeChunk(`PLTE`, palette));
  }

  /// deflate the pixels and form data chunk
  chunks.push(makeChunk(`IDAT`, zlib.deflateSync(filtered, { level: 9 })));

  // add the geotags as a text chunk, if there are geotags.
  if (geoTags) {
    chunks.push(
      // note the last letter if capitalised, because any resizing
      // will invalidate this block, and so it is not safe to copy.
      makeChunk(`tEXT`, [
        ...toBytes(`GeoTags`), // keyword
        0, // keyword null terminator
        ...toBytes(JSON.stringify(geoTags)), // actual text
      ])
    );
  }

  // and write that file to disk.
  writeFileSync(pngPath, assemble(...chunks));
}

export function readPNG(pngPath) {
  const data = readFileSync(pngPath);
  // Get the raster dimensions
  const width = from4b(data.subarray(16, 20));
  const height = from4b(data.subarray(20, 24));
  const pos = data.indexOf(`IDAT`);
  const length = from4b(data.subarray(pos - 4, pos));
  const deflated = data.subarray(pos + 4, pos + 4 + length);
  const imageData = zlib.inflateSync(deflated);
  // Convert scan lines into pixels
  const bytes = new Int8Array(width * height * 2);
  for (let y = 0; y < height; y++) {
    // skip over the first byte, which is the scanline's filter type byte.
    const s = 1 + y * (width + 1);
    const slice = imageData.subarray(s, s + width);
    bytes.set(slice, y * width);
  }
  if (endian === LITTLE_ENDIAN) reverseEndian(bytes);
  const pixels = new Int16Array(bytes.buffer);
  const gpos = data.indexOf(`tEXt`);
  const glen = from4b(data.subarray(gpos - 4, gpos));
  const json = data.subarray(data.indexOf(`GeoTags`) + 8, gpos + 4 + glen);
  const geoTags = JSON.parse(json.toString());
  return { width, height, pixels, geoTags };
}
