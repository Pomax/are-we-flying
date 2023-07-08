import path from "path";
import zlib from "zlib";
import crc32 from "crc/crc32";
import { writeFileSync } from "fs";
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

const fourByte = (num) => {
  return [
    (num & 0xff000000) >> 24,
    (num & 0xff0000) >> 16,
    (num & 0xff00) >> 8,
    num & 0xff,
  ];
};

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

  if (endian === LITTLE_ENDIAN) {
    // we need to reverse every byte pair =_=
    for (let i = 0, e = pngPixels8.length; i < e; i += 2) {
      let _ = pngPixels8[i];
      pngPixels8[i] = pngPixels8[i + 1];
      pngPixels8[i + 1] = _;
    }
  }

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
