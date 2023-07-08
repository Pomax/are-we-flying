// A whooooooooooooole bunch of generally useful functions

const { sqrt } = Math;

// vector math
export function sub(v1, v2) {
  return { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z };
}

export function muls(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function dot(v1, v2) {
  return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
}

export function mag(v) {
  return sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
}

export function unit(v, m = mag(v)) {
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

export function reflect(ray, normal) {
  const f = (2 * dot(ray, normal)) / dot(normal, normal);
  const s = muls(normal, f);
  return sub(s, ray);
}

export function lerp(r, a, b) {
  return (1 - r) * a + r * b;
}

export function map(v, ds, de, ts, te) {
  const d = de - ds;
  if (d === 0) return ts;
  return ts + ((v - ds) * (te - ts)) / d;
}

export function constrain(v, m, M) {
  if (m > M) return constrain(v, M, m);
  return v > M ? M : v < m ? m : v;
}

export function constrainMap(v, s, e, m, M) {
  return constrain(map(v, s, e, m, M), m, M);
}

// A "shim" that acts like array.indexOf, then then for typed arrays
export function indexOf(ab, sequence) {
  let first = sequence[0];
  let len = sequence.length;
  if (typeof first === `string`) {
    sequence = sequence.split(``).map((v) => v.charCodeAt(0));
    first = sequence[0];
  }
  let pos = -1;
  let found = false;
  while (!found) {
    // console.log(ab, first);
    pos = ab.indexOf(first, pos + 1);
    // console.log(`result for`, sequence, `:`, pos);
    if (pos === -1) return -1;
    const s1 = ab.slice(pos, pos + len);
    const s2 = sequence;
    // console.log(s1, s2);
    if (iterableEqual(s1, s2)) return pos;
  }
  return -1;
}

function iterableEqual(s1, s2) {
  for (let i = 0, e = s2.length; i < e; i++) {
    if (s1[i] !== s2[i]) return false;
  }
  return true;
}
