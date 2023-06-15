export function deg(rad) {
  return (rad * 180) / Math.PI;
}
export function rad(deg) {
  return (deg / 180) * Math.PI;
}

export function map(v, oS, oE, tS, tE) {
  return tS + ((tE - tS) * (v - oS)) / (oE - oS);
}

export function constrain(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
