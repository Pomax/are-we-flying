/*
  This small bit of code lets us figure out which "endianness"
  this browser uses. This matters *a lot* because PNG expects
  multi-byte values to always be ordered as "most significant
  byte first", meaning that if we have a two byte value "300",
  we have two ways to represent that: 0x01 0x2C or 0x2C 0x01
  and PNG *absolutely needs* bytes ordered in that first way,
  *not* the second way.

  However, your computer has its own opinion, and depending
  on which operating system you're in, you don't get a choice,
  multi-byte values may be encoded in that "wrong" way and
  things would go very wrong, so.... we NEED to know which
  endianness the browser's using.
*/

export const LITTLE_ENDIAN = Symbol(`little endian`);
export const BIG_ENDIAN = Symbol(`big endian`);

export const endian = (function checkEndian() {
  const buf = new ArrayBuffer(2);
  const u8 = new Uint8Array(buf);
  const u16 = new Uint16Array(buf);
  u8.set([0xaa, 0xbb], 0);
  return u16[0] === 0xbbaa ? LITTLE_ENDIAN : BIG_ENDIAN;
})();

// And we need a way to "flip" byte pairs to make sure the
// bytes are "endian-ordered" the way we need them to be.
export function reverseEndian(pngPixels8) {
  for (let i = 0, e = pngPixels8.length; i < e; i += 2) {
    let _ = pngPixels8[i];
    pngPixels8[i] = pngPixels8[i + 1];
    pngPixels8[i + 1] = _;
  }
}
