// The sun at the core of the atom, as pixels: a mottled disc with bright active regions and a
// brighter rim, and an uneven corona around it. The result is the same on every load (no random
// numbers). It takes a moment to compute, so the sky computes it in a worker (`sun.worker.ts`),
// away from the page's main thread, and paints it when it arrives.

export const SUN_DISC = 192;
export const SUN_CORONA = 256;

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const hash = (x: number) => {
  const v = Math.sin(x * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

export interface Region {
  a: number;
  r: number;
  f: number;
  p: number;
}

/** A few bright active regions, away from the very centre. */
export const sunRegions = (): Region[] =>
  Array.from({ length: 11 }, (_, i) => ({
    a: hash(i * 3.3 + 1) * TAU,
    r: 0.15 + Math.sqrt(hash(i * 7.1 + 2)) * 0.8,
    f: 0.3 + hash(i * 5.7) * 0.5,
    p: hash(i * 9.9) * TAU,
  }));

/** The random value at the grid point (i, j). */
const corner = (i: number, j: number, per: number, seedN: number) =>
  hash(
    (((i % per) + per) % per) * 57.1 +
      (((j % per) + per) % per) * 131.7 +
      seedN,
  );

/** Smooth value noise in [0, 1], tiled at `per`. */
function noise2(x: number, y: number, per: number, seedN: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const v = (i: number, j: number) => corner(i, j, per, seedN);
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  return lerp(
    lerp(v(xi, yi), v(xi + 1, yi), sx),
    lerp(v(xi, yi + 1), v(xi + 1, yi + 1), sx),
    sy,
  );
}
const fbm = (x: number, y: number, oct: number, seedN: number) => {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    sum += amp * noise2(x * f, y * f, 64 * f, seedN + o * 17);
    amp *= 0.5;
    f *= 2;
  }
  return sum;
};

/** The pixels (RGBA) of the disc (`SUN_DISC` square) and of the corona (`SUN_CORONA` square). */
export function sunPixels(): {
  disc: Uint8ClampedArray<ArrayBuffer>;
  corona: Uint8ClampedArray<ArrayBuffer>;
} {
  const N = SUN_DISC;
  const active = sunRegions();
  const img = { data: new Uint8ClampedArray(N * N * 4) };
  const stopsC = [
    [0, [34, 42, 74]],
    [0.32, [92, 110, 168]],
    [0.55, [168, 186, 232]],
    [0.75, [226, 233, 252]],
    [1, [255, 255, 255]],
  ] as const;
  const colour = (v: number) => {
    v = clamp(v, 0, 1);
    for (let i = 1; i < stopsC.length; i++) {
      if (v <= stopsC[i][0]) {
        const [a0, c0] = stopsC[i - 1];
        const [a1, c1] = stopsC[i];
        const k = (v - a0) / (a1 - a0);
        return c0.map((c, j) => c + (c1[j] - c) * k);
      }
    }
    return [255, 255, 255];
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = ((x + 0.5) / N) * 2 - 1;
      const v = ((y + 0.5) / N) * 2 - 1;
      const rr = Math.hypot(u, v);
      const o = (y * N + x) * 4;
      if (rr > 1) {
        img.data[o + 3] = 0;
        continue;
      }
      // fine granulation and larger dark lanes
      let val =
        0.56 +
        0.24 * (fbm(u * 13 + 3, v * 13 + 7, 4, 1) - 0.5) +
        0.2 * (fbm(u * 3.1 + 11, v * 3.1 + 5, 3, 9) - 0.5);
      // active regions: bright cores with a little structure around them
      // (the structure is the same for every region, so it is computed once per pixel)
      const grain = fbm(u * 16, v * 16, 3, 31);
      for (const ar of active) {
        const ax = Math.cos(ar.a) * ar.r;
        const ay = Math.sin(ar.a) * ar.r;
        const dd = Math.hypot(u - ax, v - ay);
        val +=
          0.18 * Math.exp(-((dd / 0.035) ** 2)) +
          0.14 * Math.exp(-((dd / 0.12) ** 2)) * grain;
      }
      // the rim is brighter, as the sun looks in extreme ultraviolet
      val += 0.4 * Math.pow(rr, 5);
      const c = colour(val);
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = Math.round(255 * clamp((1 - rr) * N * 0.5, 0, 1));
    }
  }
  // the corona: soft light just outside the rim, uneven along the rim
  const C = SUN_CORONA;
  const cimg = { data: new Uint8ClampedArray(C * C * 4) };
  const rim = (C / 2 / 3.1) * 2; // the disc radius in this picture
  for (let y = 0; y < C; y++) {
    for (let x = 0; x < C; x++) {
      const dx = x + 0.5 - C / 2;
      const dy = y + 0.5 - C / 2;
      const r = Math.hypot(dx, dy) / rim;
      const o = (y * C + x) * 4;
      if (r < 0.9) continue;
      const ang = Math.atan2(dy, dx);
      const n = fbm(Math.cos(ang) * 2.2 + 5, Math.sin(ang) * 2.2 + 5, 4, 51);
      const reach = 0.12 + 0.34 * n * n;
      const fall =
        Math.exp(-Math.max(0, r - 1) / reach) * clamp((r - 0.9) / 0.08, 0, 1);
      const edge = clamp((1.5 - r) / 0.3, 0, 1);
      const a = clamp(fall * (0.55 + 0.6 * n) * edge * edge, 0, 1);
      cimg.data[o] = 200;
      cimg.data[o + 1] = 218;
      cimg.data[o + 2] = 255;
      cimg.data[o + 3] = Math.round(255 * a * 0.85);
    }
  }
  return { disc: img.data, corona: cimg.data };
}
