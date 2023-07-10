// =====================================================

import { unit, reflect } from "./utils.js";
import {
  lerp,
  constrain,
  constrainMap,
} from "../../api/autopilot/utils/utils.js";
import { generateIsoMap } from "./iso-lines.js";
import { getColor, getPalette } from "./color.js";
import { blur } from "./blur.js";
import { createCanvas, loadImage, ImageData } from "canvas";
import url from "url";
import path from "path";
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

const ISO_BANDS = 200;
const ISO_LINE_OPACITY = 0.2;
const bg = await loadImage(path.join(__dirname, `bgblue.png`));

// =====================================================

function buildNormals(png) {
  const { height, width, pixels } = png;

  const getElevation = (x, y) => {
    x = constrain(x, 0, width - 1);
    y = constrain(y, 0, height - 1);
    return pixels[x + y * width];
  };

  // Build normals
  const normals = [];
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

  return normals;
}

// =====================================================

export async function colorize(pixels, width, height, withIsolines=true) {
  const png = { width, height, pixels, geoTags: undefined };
  return await draw(png, withIsolines);
}

async function draw(png, withIsolines=true) {
  // generate a canvas to work with
  const { width: w, height: h } = png;
  const normals = buildNormals(png);
  const cvs = createCanvas(w, h);
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext(`2d`);
  // do all the drawing we need to do
  const args = [png, normals, ctx];
  drawShoreLine(...args);
  drawFalseColor(...args);
  drawHillShading(...args);
  if (withIsolines) drawIsoMap(...args);
  // form PNG buffer
  // return cvs.toBuffer(`image/png`, { compressionLevel: 9 });
  return {
    pixels: ctx.getImageData(0, 0, w, h).data,
    width: w,
    height: h,
    palette: getPalette(),
  };
}

function drawShoreLine(png, normals, ctx) {
  const { width, height } = png;
  ctx.globalCompositeOperation = `source-out`;
  // ctx.drawImage(bg, 0, 0, width, height);
  ctx.globalCompositeOperation = `source-over`;

  const shoreMap = ctx.createImageData(width, height);
  let { data } = shoreMap;
  const flat = (n) => n.x === 0 && n.y === 0;
  const getNormal = (x, y) => {
    x = constrain(x, 0, width - 1);
    y = constrain(y, 0, height - 1);
    let i = x + y * width;
    return normals[i];
  };

  // Run through the pixel grid and mask pixels as shore/water
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

      // if it's not an offshore pixel, though, mark the actual
      // shoreline as 1, and the rest of the shore band as 2:
      data[i + 2] = shoreline ? 1 : 2;
    }
  }

  // Then color the water map for the three possible water types.
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 255) continue;
    const d = data[i + 2];

    // deep water?
    if (d === 0) {
      data[i + 0] = 160;
      data[i + 1] = 200;
      data[i + 2] = 230;
      data[i + 3] = 255;
    }

    // shoreline?
    else if (d === 1) {
      data[i + 0] = 160;
      data[i + 1] = 200;
      data[i + 2] = 230;
    }

    // shore band?
    else if (d === 2) {
      data[i + 0] = 160;
      data[i + 1] = 200;
      data[i + 2] = 230;
    }
  }

  // blur the map so it looks nice, and apply it
  blur(shoreMap.data, width, height, 20);

  const cvs2 = createCanvas(width, height);
  const pctx = cvs2.getContext(`2d`);
  ctx.globalAlpha = 0.5;
  pctx.putImageData(shoreMap, 0, 0);
  ctx.drawImage(cvs2, 0, 0, width, height);
  ctx.globalAlpha = 1;
}

function drawFalseColor(png, normals, ctx) {
  const { width, height, pixels } = png;
  ctx.globalCompositeOperation = `source-over`;

  const colorMap = ctx.createImageData(width, height);
  const colorMask = ctx.createImageData(width, height);
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

  const cvs2 = createCanvas(width, height);
  const pctx = cvs2.getContext(`2d`);
  pctx.putImageData(colorMap, 0, 0);
  ctx.drawImage(cvs2, 0, 0, width, height);
}

function drawHillShading(png, normals, ctx) {
  const { width, height, pixels } = png;

  // First off, we need a light source, which is really just "a vector" that we can
  // reflect over our normals to determine how much light will end up going straight
  // up, because that's the only thing we really care about here:
  const F = (v) => constrainMap(v, 0, 1, 0, 255);
  const light = unit({
    x: -400,
    y: -400,
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
  ctx.drawImage(cvs2, 0, 0, width, height);
  ctx.globalAlpha = 1;

  // And then as "the real layer" using "source-over", which is a fancy
  // way of saying "just draw the thing":
  ctx2.putImageData(shaded, 0, 0);
  ctx.globalCompositeOperation = `source-over`;
  ctx.globalAlpha = 0.3;
  ctx.drawImage(cvs2, 0, 0, width, height);
  ctx.globalAlpha = 1;
}

/**
 * The iso map function generates the coloring that makes our map actually
 * look like a map, by generating a bunch of isoline surfaces and "flood fill"
 * coloring each of those, based on the corresponding elevation.
 */
function drawIsoMap(png, normals, ctx) {
  const lines = [...new Array((9000 / ISO_BANDS) | 0)].map(
    (_, i) => i * ISO_BANDS
  );
  const isoMap = generateIsoMap(png, lines);
  const pxl = new ImageData(isoMap, png.width, png.height);
  const cvs2 = createCanvas(pxl.width, pxl.height);
  const pctx = cvs2.getContext(`2d`);
  pctx.putImageData(pxl, 0, 0);

  // draw the iso lines
  ctx.globalCompositeOperation = `source-over`;
  ctx.globalAlpha = ISO_LINE_OPACITY;
  ctx.drawImage(cvs2, 0, 0, png.width, png.height);
  ctx.globalAlpha = 1;
}
