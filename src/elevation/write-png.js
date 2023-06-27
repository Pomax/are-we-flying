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

export function writePNG(pngPath, pngPixels, w, h, GeoTags) {
  const dirs = pngPath.substring(0, pngPath.lastIndexOf(path.sep));
  mkdirSync(dirs, { recursive: true });

  // convert the pixel raster to scanlines that start with
  // a zero byte to indicate filter type "none":
  const pngPixels8 = new Uint8Array(pngPixels.buffer);

  if (endian === LITTLE_ENDIAN) reverseEndian(pngPixels8);

  const filtered = new Uint8Array(pngPixels8.length + h);
  for (let y = 0; y < h; y++) {
    const s = 2 * y * w;
    const d = 1 + y + s;
    filtered.set(pngPixels8.subarray(s, s + 2 * w), d);
  }

  // PNG preamble
  const magic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // header for 16 bit greyscale image
  const IHDR = makeChunk(`IHDR`, [
    ...fourByte(w), // width
    ...fourByte(h), // height
    16, // bit depth: 16 bits
    0, // color: greyscale
    0, // compression method, must be 0
    0, // filter method, must be 0
    0, // interlace method: no interlacing
  ]);

  // deflate the pixels and form data chunk
  const IDAT = makeChunk(`IDAT`, zlib.deflateSync(filtered, { level: 9 }));

  // add the geotags as a text chunk
  const tEXt = makeChunk(`tEXt`, [
    ...toBytes(`GeoTags`), // keyword
    0, // keyword null terminator
    ...toBytes(JSON.stringify(GeoTags)), // actual text
  ]);

  // turn into a file and write to disk.
  const pngData = Buffer.concat([magic, IHDR, IDAT, tEXt, makeChunk(`IEND`)]);
  writeFileSync(pngPath, pngData);
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
