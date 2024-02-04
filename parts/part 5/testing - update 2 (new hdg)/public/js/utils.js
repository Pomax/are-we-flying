const { sin, cos, atan2, sqrt } = Math;

// Return a promise that doesn't resolve until `fn()` returns a truthy value, or we run out of retries.
export function waitFor(fn, timeout = 5000, retries = 100) {
  return new Promise((resolve, reject) => {
    (async function run() {
      if (--retries === 0) reject(new Error(`max retries reached`));
      try {
        const data = await fn();
        if (!data) return setTimeout(run, timeout, retries);
        resolve(data);
      } catch (e) {
        reject(e);
      }
    })();
  });
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

export function constrainMap(v, ds, de, ts, te) {
  return constrain(map(v, ds, de, ts, te), ts, te);
}

export function getDistanceBetweenPoints(lat1, long1, lat2, long2, R = 6371) {
  // see https://stackoverflow.com/a/365853/740553

  lat1 = parseFloat(lat1);
  long1 = parseFloat(long1);
  lat2 = parseFloat(lat2); // do we still need parseFloat here?
  long2 = parseFloat(long2);

  const dLat = radians(lat2 - lat1);
  const dLong = radians(long2 - long1);
  lat1 = radians(lat1);
  lat2 = radians(lat2);

  const a =
    sin(dLat / 2) * sin(dLat / 2) +
    sin(dLong / 2) * sin(dLong / 2) * cos(lat1) * cos(lat2);
  const c = 2 * atan2(sqrt(a), sqrt(1 - a));
  return R * c;
}
