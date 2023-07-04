// =====================================================

import { unit, reflect, lerp, constrain, constrainMap } from "./js/utils.js";
import { readPNG } from "./js/read-png.js";
import { generateIsoMap } from "./js/iso-lines.js";
import { getColor, getColorMapping, lerpColor } from "./js/color.js";
import { blur } from "./js/blur.js";

// =====================================================

const IN_BROWSER = typeof document !== `undefined`;

async function getBaseImage() {
  // client-side?
  const filename = `./ALPSMLC30_N048W124_DSM.120m.png`;
  if (IN_BROWSER) return filename;

  // serer-side.
  const { ALOSInterface } = await import("../src/elevation/alos-interface.js");
  const dotenv = await import("dotenv");
  dotenv.config({ path: "../.env" });
  const { DATA_FOLDER } = process.env;
  console.log(`data folder:`, DATA_FOLDER);
  const alos = new ALOSInterface(DATA_FOLDER);

  await alos.getXYZImage(
    `whatever.png`,
    51.1845783,-128.8418523,
    48.2004625,-122.9284875
  );
  process.exit(1);

  const lat = process.argv[2];
  const long = process.argv[3];
  console.log(`argv:`, lat, long, process.argv[4]);
  const tile = alos.getTileFor(lat, long);
  console.log(`tilepath:`, tile.tilePath);
  const { processFile } = await import("../src/elevation/convert.js");
  const pngPath = processFile(tile.tilePath, 4);
  console.log(`file:`, pngPath);
  return pngPath;
}

const SOURCE = await getBaseImage();
const BGSOURCE = `./bgblue.png`;

// =====================================================

let createCanvas = (width, height) => {
  const cvs = document.createElement(`canvas`);
  cvs.width = width;
  cvs.height = height;
  return cvs;
};

let writePNG = () => {};
let Image = globalThis.Image;

let ImageData = globalThis.ImageData ?? {};
let fs;

if (!IN_BROWSER) {
  const canvas = await import("canvas");
  createCanvas = (width, height) => canvas.createCanvas(width, height);
  ImageData = canvas.ImageData;
  const pngLib = await import("./js/read-png.js");
  writePNG = pngLib.writePNG;
  fs = await import("fs/promises");
  fetch = async (path) => {
    const data = fs.readFile(path);
    return { arrayBuffer: () => data };
  };
  Image = canvas.Image;
  Object.defineProperty(Image.prototype, `onload`, {
    get: function () {
      return this._onload;
    },
    set: function (fn) {
      this._onload = fn;
      if (this.src) fn();
    },
  });
}

let png;
let shoreMap;
let colorMap;
let colorMask;
let isoMap;
let normals;
let hillShade = () => {};

const bg = new Image();

let SHOW_FALSE_COLOUR = true;
let SHOW_WATER = true;
let SHOW_ISO_LINES = true;
let ISO_BANDS = 100;
let ISO_LINE_OPACITY = 0.2;
let DRAW_HILL_SHADE = true;

(function initFlags() {
  if (!IN_BROWSER) return;

  const color = document.getElementById(`color`);
  SHOW_FALSE_COLOUR = color.checked;
  color.addEventListener(`click`, (evt) => {
    SHOW_FALSE_COLOUR = evt.target.checked;
    draw();
  });

  const water = document.getElementById(`water`);
  SHOW_WATER = water.checked;
  water.addEventListener(`click`, (evt) => {
    SHOW_WATER = evt.target.checked;
    draw();
  });

  const isolines = document.getElementById(`isolines`);
  SHOW_ISO_LINES = isolines.checked;
  isolines.addEventListener(`click`, (evt) => {
    SHOW_ISO_LINES = evt.target.checked;
    draw();
  });

  const isostrength = document.getElementById(`isostrength`);
  ISO_LINE_OPACITY = parseFloat(isostrength.value);
  isostrength.addEventListener(`change`, (evt) => {
    ISO_LINE_OPACITY = parseFloat(evt.target.value);
    draw();
  });

  const isobands = document.getElementById(`isobands`);
  ISO_BANDS = parseFloat(isobands.value);
  isobands.addEventListener(`change`, (evt) => {
    ISO_BANDS = parseFloat(evt.target.value);
    isoMap = undefined;
    draw();
  });

  const hillshade = document.getElementById(`hillshade`);
  DRAW_HILL_SHADE = hillshade.checked;
  hillshade.addEventListener(`change`, (evt) => {
    DRAW_HILL_SHADE = evt.target.checked;
    draw();
  });
})();

// Let's set up the main canvas using nicely big dimensions
let w = 800;
let h = w;
let cvs;
if (IN_BROWSER) {
  cvs = document.getElementById(`cvs`);
  cvs.width = cvs.height = w;
} else {
  cvs = createCanvas(w, w);
}
let ctx = cvs.getContext(`2d`);

// As well as set up our cursor handling
let mouseX = -0.5;
let mouseY = -0.5;
if (IN_BROWSER) {
  cvs.addEventListener(`mousemove`, (evt) => {
    mouseX = (evt.offsetX - w / 2) / w;
    mouseY = (evt.offsetY - h / 2) / h;
    draw();
  });
}

// get our image data
fetch(SOURCE)
  .then((r) => r.arrayBuffer())
  .then((data) => {
    bg.onload = () => {
      png = readPNG(SOURCE, data);
      hillShade = createHillShader();
      draw();
      drawColorGradient();
    };
    bg.src = BGSOURCE;
  });

async function draw() {
  if (!png) return;
  ctx.clearRect(0, 0, w, h);
  drawShoreLine();
  drawColorMap();
  hillShade();
  drawIsoMap();
  if (!IN_BROWSER) {
    const d = 800;
    const c256 = createCanvas(d, d);
    const ctx = c256.getContext(`2d`);
    ctx.drawImage(cvs, 0, 0, d, d);
    console.log(`writing file...`);
    const opts = { compressionLevel: 9 };
    const buffer = c256.toBuffer(`image/png`, opts);
    await fs.writeFile(process.argv[4] ?? `output.png`, buffer);
  }
}

function drawColorGradient() {
  if (!IN_BROWSER) return;
  const map = getColorMapping();
  const grad = createCanvas(w, 100);
  const ctx = grad.getContext(`2d`);
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  const max = map.at(-1)[0];
  for (let i = 1, e = map.length - 1; i <= e; i++) {
    const [e1, c1] = map[i];
    const [e2, c2] = map[i];
    for (let t = 0; t <= 1; t += 0.01) {
      const e = lerp(t, e1, e2);
      const c = lerpColor(t, c1, c2);
      gradient.addColorStop(constrain(e / max, 0, 1), `rgb(${c.join(`,`)})`);
    }
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, 100);
  document.body.appendChild(grad);
}

function drawShoreLine() {
  const { width, height } = png;
  ctx.globalCompositeOperation = `source-out`;
  ctx.drawImage(bg, 0, 0);

  if (!SHOW_WATER) return;

  ctx.globalCompositeOperation = `source-over`;

  if (!shoreMap) {
    shoreMap = ctx.createImageData(width, height);
    let { data } = shoreMap;
    const flat = (n) => n.x === 0 && n.y === 0;
    const getNormal = (x, y) => {
      x = constrain(x, 0, width - 1);
      y = constrain(y, 0, height - 1);
      let i = x + y * width;
      return normals[i];
    };

    // run initial edge pass, setting all water pixels to distance=1
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let i = x + y * width;
        const n = normals[i];
        i = 4 * i;
        data[i + 3] = 0;
        if (!flat(n)) continue;

        const K = 8;
        const S = 2;
        let shoreline = false;
        let offshore = true;
        for (let kx = -K; kx <= K; kx++) {
          for (let ky = -K; ky <= K; ky++) {
            if (kx === 0 && ky === 0) continue;
            if ((kx ** 2 + ky ** 2) ** 0.5 > K) continue;
            const flatPixel = flat(getNormal(x + kx, y + ky));
            offshore = offshore && flatPixel;
            if (-S <= kx && kx <= S && -S <= ky && ky <= S) {
              shoreline = shoreline || !flatPixel;
            }
          }
        }

        // mark this as a water pixel by setting alpha to 255
        data[i + 3] = 255;

        // also mark this as an offshore pixel by setting blue to 0
        data[i + 2] = 0;

        if (offshore) continue;

        // if it's not an offshore pixel, mark the actual shoreline
        // as 1, and the rest of the band as 2:
        data[i + 2] = shoreline ? 1 : 2;
      }
    }

    // then color the water map
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 255) continue;
      const d = data[i + 2];

      // deep water?
      if (d === 0) {
        data[i + 0] = 10;
        data[i + 1] = 25;
        data[i + 2] = 30;
        data[i + 3] = 255;
      }

      // shoreline?
      else if (d === 1) {
        data[i + 0] = 45;
        data[i + 1] = 90;
        data[i + 2] = 80;
      }

      // shore band?
      else if (d === 2) {
        data[i + 0] = 25;
        data[i + 1] = 60;
        data[i + 2] = 65;
      }
    }

    blur(shoreMap.data, width, height, 20);
  }

  const cvs = createCanvas(width, height);
  const pctx = cvs.getContext(`2d`);
  ctx.globalAlpha = 0.5;
  pctx.putImageData(shoreMap, 0, 0);
  ctx.drawImage(cvs, 0, 0, w, h);
  ctx.globalAlpha = 1;
}

function createHillShader() {
  const { height, width, pixels, geoTags } = png;

  const getElevation = (x, y) => {
    x = constrain(x, 0, width - 1);
    y = constrain(y, 0, height - 1);
    return pixels[x + y * width];
  };

  // Build normals
  normals = [];
  const elevation = { min: 0, max: 0 };
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const a = getElevation(x - 1, y);
      const b = getElevation(x + 1, y);
      const c = getElevation(x, y - 1);
      const d = getElevation(x, y + 1);
      const n = unit({ x: a - b, y: c - d, z: 2 });
      normals[x + y * width] = n;
    }
  }

  // Set up the hillshading function
  return () => runHillShade(width, height, pixels, normals, geoTags);
}

/**
 * The hill shading code is fairly "text book", but of course text books can be hard to read
 */
function runHillShade(width, height, pixels, normals, geoTags) {
  if (!DRAW_HILL_SHADE) return;

  // First off, we need a light source, which is really just "a vector" that we can
  // reflect over our normals to determine how much light will end up going straight
  // up, because that's the only thing we really care about here:
  const F = (v) => constrainMap(v, 0, 1, 0, 255);
  const light = unit({
    x: mouseX * w * 2,
    y: mouseY * h * 2,
    z: 10,
  });

  // We also want to know what RGB value corresponds to a perfectly flat surface, so
  // that we can "ignore" those later on (by rendering them as 100% transparent).
  const flat = unit(reflect(light, { x: 0, y: 0, z: 1 }));
  const flatValue = constrainMap(flat.z ** 0.1, 0, 1, 0, 255);

  // Then we perform the illunation trick!
  const drawPixels = false;
  const drawHill = true;
  const shaded = ctx.createImageData(width, height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let i = x + y * width;
      const p = pixels[i];
      const n = normals[i];

      // We compute the illumination for this pixel, with some
      // non-linear scaling to make the terrain "pop".
      const r = unit(reflect(light, n));
      const e = constrainMap(r.z ** 0.1, 0, 1, 0, 255);

      // Also, the Canvas pixel array is actually four elements per pixel,
      // since it encodes the R, G, B, and transparency (alpha) channels
      // separately, so we need to update the pixel index from "just a normal
      // array index" to a canvas RGBA offset:
      i = 4 * i;

      // And then step 1: set alpha to fully opaque
      shaded.data[i + 3] = 255;

      // Then, if we're debugging, draw some pixel data
      if (drawPixels) {
        shaded.data[i + 0] = constrainMap(p, -500, 9000, 0, 255) | 0;
        shaded.data[i + 1] = constrainMap(p, -500, 9000, 0, 255) | 0;
        shaded.data[i + 2] = constrainMap(p, -500, 9000, 0, 255) | 0;
      } else {
        shaded.data[i + 0] = F(n.x) | 0;
        shaded.data[i + 1] = F(n.y) | 0;
        shaded.data[i + 2] = F(n.z) | 0;
      }

      // But if we're NOT debugging, draw our terrain pixel, now that
      // it's been illuminated by "the sun"
      if (drawHill) {
        const r = 1;
        shaded.data[i + 0] = lerp(r, F(n.x), e) | 0;
        shaded.data[i + 1] = lerp(r, F(n.y), e) | 0;
        shaded.data[i + 2] = lerp(r, F(n.z), e) | 0;
        shaded.data[i + 3] = e === flatValue ? 0 : 255;
      }
    }
  }

  const blurred = new ImageData(shaded.data.slice(), width, height);
  blur(blurred.data, width, height, 15);

  // We then overlay the hill shading:
  let cvs2 = createCanvas(width, height);
  let ctx2 = cvs2.getContext(`2d`);
  ctx2.putImageData(blurred, 0, 0);

  // First as a general shading layer, using the "color burn" overlay mode
  ctx.globalCompositeOperation = `color-burn`;
  ctx.globalAlpha = 0.2;
  ctx.drawImage(cvs2, 0, 0, w, h);
  ctx.globalAlpha = 1;

  // And then as "the real layer" using "source-over", which is a fancy
  // way of saying "just draw the thing":
  ctx2.putImageData(shaded, 0, 0);
  ctx.globalCompositeOperation = `source-over`;
  ctx.globalAlpha = 0.3;
  ctx.drawImage(cvs2, 0, 0, w, h);
  ctx.globalAlpha = 1;
}

/**
 * The iso map function generates the coloring that makes our map actually
 * look like a map, by generating a bunch of isoline surfaces and "flood fill"
 * coloring each of those, based on the corresponding elevation.
 */
function drawIsoMap() {
  if (!SHOW_ISO_LINES) return;

  const lines = [...new Array((9000 / ISO_BANDS) | 0)].map(
    (_, i) => i * ISO_BANDS
  );
  isoMap ??= generateIsoMap(png, lines);
  const pxl = new ImageData(isoMap, png.width, png.height);
  const cvs = createCanvas(pxl.width, pxl.height);
  const pctx = cvs.getContext(`2d`);
  pctx.putImageData(pxl, 0, 0);

  // draw the iso lines
  ctx.globalCompositeOperation = `source-over`;
  ctx.globalAlpha = ISO_LINE_OPACITY;
  ctx.drawImage(cvs, 0, 0, w, h);
  ctx.globalAlpha = 1;
}

function drawColorMap() {
  const { width, height, pixels } = png;
  ctx.globalCompositeOperation = `source-over`;

  if (!colorMap) {
    colorMap = ctx.createImageData(width, height);
    colorMask = ctx.createImageData(width, height);
    const { data } = colorMap;
    const { data: mask } = colorMask;
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let i = x + y * width;
        const n = normals[i];
        const c = getColor(pixels[i]);
        i = 4 * i;
        // terrain color
        data[i + 0] = c[0] | 0;
        data[i + 1] = c[1] | 0;
        data[i + 2] = c[2] | 0;
        data[i + 3] = n.x === 0 && n.y === 0 ? 0 : 255;
        // terrain mask
        mask[i + 0] = 255;
        mask[i + 1] = 255;
        mask[i + 2] = 255;
        mask[i + 3] = data[i + 3];
      }
    }
  }

  const cvs = createCanvas(width, height);
  const pctx = cvs.getContext(`2d`);
  if (!SHOW_FALSE_COLOUR) {
    pctx.putImageData(colorMask, 0, 0);
  } else {
    pctx.putImageData(colorMap, 0, 0);
  }

  ctx.drawImage(cvs, 0, 0, w, h);
  ctx.filter = `brightness(1)`;
}
