/* =========================================================================
   VISE / SIX — cover art engine (Canvas 2D, offline, deterministic)
   Draws a GTA-poster-style cover: photo(s) with a Vice-City colour grade,
   neon bars, bold outlined lettering, grain & vignette. Pure procedural art,
   no external assets, no network, no fonts beyond system faces.
   ========================================================================= */

// -- deterministic pseudo-random ------------------------------------------
function hash32(n) {
  n = n | 0;
  n = (n ^ 61) ^ (n >>> 16);
  n = (n + (n << 3)) | 0;
  n = n ^ (n >>> 4);
  n = Math.imul(n, 0x27d4eb2d);
  n = n ^ (n >>> 15);
  return n >>> 0;
}
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// -- grade definitions -----------------------------------------------------
// Each grade: three split-tone colours (shadows / mids / highlights), a vertical
// sunset ramp used for the ambient wash, plus a "sky" ramp for the backdrop
// behind letterboxed photos and the sun glow.
const GRADES = {
  sunset: {
    label: 'Sunset',
    stops: [
      [0.00, [34, 210, 200]],  // teal top
      [0.30, [255, 170, 80]],  // amber
      [0.60, [255, 80, 120]],  // rose
      [1.00, [60, 180, 200]],  // teal-cyan base (was violet -> too red)
    ],
    shadow: [14, 104, 130],  // deep teal
    mid: [150, 60, 200],    // blue-magenta / violet (not red)
    hi: [255, 186, 84],     // amber gold
    rim: [150, 250, 245],   // cool neon rim
    vignette: 0.42,
    sky: ['#0a2a3a', '#123c4e', '#7b2a6a', '#ff8a4a'],
    sun: 'rgba(255,214,150,0.95)',
  },
  neon: {
    label: 'Neon Night',
    stops: [
      [0.00, [24, 16, 52]],
      [0.38, [80, 26, 150]],
      [0.66, [220, 40, 170]],
      [1.00, [12, 8, 30]],
    ],
    shadow: [22, 16, 62],   // indigo
    mid: [216, 46, 178],    // magenta
    hi: [110, 236, 255],    // cyan
    rim: [140, 250, 255],
    vignette: 0.52,
    sky: ['#0b0822', '#241066', '#c02a9a', '#2ad0e0'],
    sun: 'rgba(120,230,255,0.9)',
  },
  vice: {
    label: 'Vice',
    stops: [
      [0.00, [120, 240, 226]], // aqua
      [0.34, [120, 220, 200]],
      [0.66, [255, 108, 150]], // pink
      [1.00, [90, 50, 200]],   // violet
    ],
    shadow: [16, 70, 84],   // teal
    mid: [255, 96, 150],    // pink
    hi: [150, 250, 240],    // mint
    rim: [170, 255, 250],
    vignette: 0.44,
    sky: ['#0c2030', '#155a6e', '#ff6c96', '#7a3ce0'],
    sun: 'rgba(180,255,250,0.92)',
  },
};

const NEON = ['#ff3cac', '#29c7d8', '#ffb43a', '#8a5cff', '#ff5a7a', '#3affc0', '#ffffff'];
const INK = '#0a0714';

// -- colour helpers --------------------------------------------------------
const hexCache = new Map();
function hexRgb(hex) {
  let c = hexCache.get(hex);
  if (c) return c;
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? parseInt(h.split('').map((x) => x + x).join(''), 16)
    : parseInt(h, 16);
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  hexCache.set(hex, c);
  return c;
}

// -- vertical sunset ramp (for ambient wash) ------------------------------
function buildRamp(grade) {
  const st = grade.stops;
  const lut = new Uint8ClampedArray(256 * 3);
  let seg = 0;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    while (seg < st.length - 2 && t > st[seg + 1][0]) seg++;
    const a = st[seg], b = st[seg + 1];
    const lt = clamp((t - a[0]) / (b[0] - a[0] || 1), 0, 1);
    const c = mix(a[1], b[1], lt);
    lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2];
  }
  return lut;
}

// -- photo drawing ---------------------------------------------------------
// Cover-fits `img` into box {x,y,w,h} using focus (0..1) and zoom (>=1),
// with optional horizontal mirror for panel variety.
function drawPhoto(ctx, img, box, opt) {
  const o = opt || {};
  const focusX = o.focusX === undefined ? 0.5 : o.focusX;
  const focusY = o.focusY === undefined ? 0.5 : o.focusY;
  const zoom = o.zoom === undefined ? 1 : o.zoom;
  const mirror = !!o.mirror;

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const cover = Math.max(box.w / iw, box.h / ih) * zoom;
  const dw = iw * cover;
  const dh = ih * cover;
  const dx = box.x + (box.w - dw) * focusX;
  const dy = box.y + (box.h - dh) * focusY;

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  if (mirror) {
    ctx.translate(box.x + box.w, box.y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, box.w - (dx - box.x) - dw, dy - box.y, dw, dh);
  } else {
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  ctx.restore();
  return { dx, dy, dw, dh };
}

// -- split-tone colour grade ----------------------------------------------
// Operates on the whole canvas but only inside the photo band [top,bottom).
// Three-band split tone: shadows -> teal/indigo, mids -> magenta, highlights
// -> amber/cyan. Produces the warm/cool separation a Vice-City sunset needs.
function applyGrade(ctx, W, H, grade, amt, duotone, band) {
  const top = band ? band.top : 0;
  const bot = band ? band.bottom : H;
  let img;
  try {
    img = ctx.getImageData(0, 0, W, H);
  } catch (e) {
    return;
  }
  const d = img.data;
  const sh = grade.shadow, md = grade.mid, hi = grade.hi;

  // Precompute per-row ambient sunset weight (stronger toward bottom).
  const rowWeight = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    const yn = clamp((y - top) / Math.max(1, bot - top), 0, 1);
    // peak sunset intensity around 60% down the photo, fade slightly at very bottom
    rowWeight[y] = amt * smooth(clamp((yn - 0.05) / 0.85, 0, 1));
  }

  for (let i = 0; i < d.length; i += 4) {
    const p = i >> 2;
    const y = (p / W) | 0;
    if (y < top || y >= bot) continue;
    let r = d[i], g = d[i + 1], b = d[i + 2];

    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const s = smooth(lum);

    // duotone option: push whole image toward the split-tone ramp
    if (duotone) {
      const dr = sh[0] + (hi[0] - sh[0]) * s;
      const dg = sh[1] + (hi[1] - sh[1]) * s;
      const db = sh[2] + (hi[2] - sh[2]) * s;
      r = r * 0.4 + dr * 0.6;
      g = g * 0.4 + dg * 0.6;
      b = b * 0.4 + db * 0.6;
    }

    // split-tone by luminance: shadows->shadow, mids->mid, highlights->hi
    // weights peak at the respective third, overlap smoothly
    // lift shadows first so they read as deep teal, not near-black
    r = r * 1.12 + 8; g = g * 1.12 + 10; b = b * 1.12 + 14;
    const wShadow = Math.pow(1 - s, 1.4);
    const wHigh = Math.pow(s, 1.4);
    const wMid = 1 - Math.abs(s - 0.5) * 2; // triangle peaked at mid
    const wsum = wShadow + wMid + wHigh || 1;
    const tr = (sh[0] * wShadow + md[0] * wMid + hi[0] * wHigh) / wsum;
    const tg = (sh[1] * wShadow + md[1] * wMid + hi[1] * wHigh) / wsum;
    const tb = (sh[2] * wShadow + md[2] * wMid + hi[2] * wHigh) / wsum;

    // split-tone strength (keep some original photo texture)
    const toneAmt = 0.42;
    r = r * (1 - toneAmt) + tr * toneAmt;
    g = g * (1 - toneAmt) + tg * toneAmt;
    b = b * (1 - toneAmt) + tb * toneAmt;

    // ambient sunset wash (vertical gradient, stronger toward bottom)
    const w = rowWeight[y];
    if (w > 0.001) {
      const t = clamp((y - top) / Math.max(1, bot - top), 0, 1);
      // warm at horizon (amber) -> cool at very bottom (teal)
      const warm = t < 0.55
        ? mix([255, 80, 120], [255, 170, 70], smooth(t / 0.55))
        : mix([255, 170, 70], [60, 180, 200], smooth((t - 0.55) / 0.45));
      r = r * (1 - w) + warm[0] * w;
      g = g * (1 - w) + warm[1] * w;
      b = b * (1 - w) + warm[2] * w;
    }

    d[i] = clamp(r, 0, 255);
    d[i + 1] = clamp(g, 0, 255);
    d[i + 2] = clamp(b, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

// -- subject rim-light / pop ----------------------------------------------
// Adds a cool rim on the upper third and a warm glow on the lower third of the
// photo so the subject separates from the ambient grade.
function addRimLight(ctx, W, H, grade, band) {
  const top = band ? band.top : 0;
  const bot = band ? band.bottom : H;
  const h = bot - top;
  // cool rim from top
  let g = ctx.createLinearGradient(0, top, 0, top + h * 0.22);
  g.addColorStop(0, `rgba(${grade.rim[0]},${grade.rim[1]},${grade.rim[2]},0.35)`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = g;
  ctx.fillRect(0, top, W, h * 0.22);
  // warm glow from bottom
  g = ctx.createLinearGradient(0, top + h * 0.72, 0, bot);
  g.addColorStop(0, 'rgba(255,150,70,0)');
  g.addColorStop(1, `rgba(${grade.hi[0]},${grade.hi[1]},${grade.hi[2]},0.22)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, top + h * 0.72, W, h * 0.28);
  ctx.restore();
}

// -- vignette + scanlines + grain -----------------------------------------
let grainCanvas = null;
let grainCtx = null;
function getGrain() {
  if (grainCanvas) return grainCanvas;
  grainCanvas = document.createElement('canvas');
  grainCanvas.width = grainCanvas.height = 128;
  grainCtx = grainCanvas.getContext('2d');
  const id = grainCtx.createImageData(128, 128);
  const rnd = rng(1337);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * 90;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  grainCtx.putImageData(id, 0, 0);
  return grainCanvas;
}

function overlayTexture(ctx, w, h, grade) {
  // vignette
  const v = grade.vignette;
  const g = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.30, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.62, `rgba(0,0,0,${v * 0.28})`);
  g.addColorStop(1, `rgba(0,0,0,${v})`);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // scanlines
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000';
  const step = Math.max(2, Math.round(h / 240));
  for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, 1);
  ctx.restore();

  // grain
  const gc = getGrain();
  const pat = ctx.createPattern(gc, 'repeat');
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// -- text helpers ----------------------------------------------------------
function fontStr(size, weight) {
  return `${weight || 900} ${size}px "Arial Black", "Helvetica Neue", Impact, "DejaVu Sans", system-ui, sans-serif`;
}
function measureSpaced(ctx, str, spacing) {
  let w = 0;
  const chars = str.split('');
  for (let i = 0; i < chars.length; i++) {
    w += ctx.measureText(chars[i]).width;
    if (i < chars.length - 1) w += spacing;
  }
  return w;
}
function drawSpaced(ctx, str, cx, y, spacing) {
  const chars = str.split('');
  const total = measureSpaced(ctx, str, spacing);
  let x = cx - total / 2;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, y);
    x += ctx.measureText(chars[i]).width + spacing;
  }
}

// -- text block (GTA lettering) -------------------------------------------
function drawLettering(ctx, o) {
  const {
    cx, topY, maxW, caption, subtitle, accent,
    maxSize, minSize, lineGap,
  } = o;
  const captionTxt = (caption || '').trim().toUpperCase();
  const subTxt = (subtitle || '').trim().toUpperCase();
  if (!captionTxt && !subTxt) return { bottom: topY };

  const startSize = maxSize || 200;
  let lines = [];
  let size = startSize;

  const wrap = (sz) => {
    ctx.font = fontStr(sz, 900);
    const words = captionTxt.split(/\s+/).filter(Boolean);
    const out = [];
    let cur = '';
    for (const word of words) {
      const trial = cur ? cur + ' ' + word : word;
      if (ctx.measureText(trial).width > maxW * 0.98 && cur) {
        out.push(cur);
        cur = word;
      } else cur = trial;
    }
    if (cur) out.push(cur);
    return out;
  };

  if (captionTxt) {
    lines = wrap(size);
    let guard = 0;
    while (guard++ < 200) {
      ctx.font = fontStr(size, 900);
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (widest <= maxW * 0.98 && lines.length <= 3) break;
      size -= 3;
      if (size <= (minSize || 40)) break;
      lines = wrap(size);
    }
  }

  const subSize = Math.max(20, size * 0.22);
  const lineH = size * (lineGap || 0.88);
  let y = topY + size * 0.80;

  ctx.textBaseline = 'alphabetic';

  lines.forEach((line) => {
    const lw = ctx.measureText(line).width;
    const lx = cx - lw / 2;

    // drop shadow + thick stroke
    ctx.save();
    ctx.shadowColor = 'rgba(5,2,12,0.9)';
    ctx.shadowBlur = size * 0.09;
    ctx.shadowOffsetX = size * 0.028;
    ctx.shadowOffsetY = size * 0.048;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size * 0.085);
    ctx.strokeStyle = INK;
    ctx.strokeText(line, lx, y);
    ctx.fillStyle = INK;
    ctx.fillText(line, lx, y);
    ctx.restore();

    // main white fill
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, lx, y);

    // accent highlight band across top of glyphs
    ctx.save();
    ctx.beginPath();
    ctx.rect(lx - 6, y - size * 0.80, lw + 12, size * 0.30);
    ctx.clip();
    const ag = ctx.createLinearGradient(0, y - size * 0.80, 0, y - size * 0.34);
    ag.addColorStop(0, accent);
    ag.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = ag;
    ctx.fillText(line, lx, y);
    ctx.restore();

    y += lineH;
  });

  // subtitle with rules
  if (subTxt) {
    y += size * 0.10;
    ctx.font = fontStr(subSize, 700);
    const spacing = subSize * 0.20;
    const tw = measureSpaced(ctx, subTxt, spacing);
    ctx.fillStyle = accent;
    ctx.fillRect(cx - tw / 2 - subSize * 0.9, y - subSize * 0.32, subSize * 0.7, Math.max(2, subSize * 0.06));
    ctx.fillRect(cx + tw / 2 + subSize * 0.2, y - subSize * 0.32, subSize * 0.7, Math.max(2, subSize * 0.06));
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    drawSpaced(ctx, subTxt, cx, y, spacing);
  }

  return { bottom: y, size };
}

// -- backdrop (sky + sun) behind letterboxed photos -----------------------
function drawSkyBackdrop(ctx, w, h, grade, horizonY) {
  const g = ctx.createLinearGradient(0, 0, 0, horizonY + 2);
  g.addColorStop(0, grade.sky[0]);
  g.addColorStop(0.5, grade.sky[1]);
  g.addColorStop(0.82, grade.sky[2]);
  g.addColorStop(1, grade.sky[3]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, horizonY + 2);

  const cx = w * 0.5, cy = horizonY - horizonY * 0.04;
  const r = Math.min(w, h) * 0.32;
  const sg = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
  sg.addColorStop(0, grade.sun);
  sg.addColorStop(0.5, 'rgba(255,150,80,0.40)');
  sg.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// -- neon bar --------------------------------------------------------------
function drawNeonBar(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(6, h * 0.7);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.shadowBlur = Math.max(3, h * 0.35);
  ctx.fillRect(x, y, w, h);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(x, y + h * 0.34, w, Math.max(1, h * 0.32));
  ctx.restore();
}

// =========================================================================
// MAIN render
// =========================================================================
export function renderCover(canvas, state) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const S = Math.min(W, H);

  const grade = GRADES[state.grade] || GRADES.sunset;
  const seed = hash32(state.seed || 1);
  const accent = state.accent || '#ff3cac';
  const gradeAmt = state.gradeAmt === undefined ? 0.62 : state.gradeAmt;
  const duotone = !!state.duotone;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a0714';
  ctx.fillRect(0, 0, W, H);

  const panels = clamp(state.panels || 1, 1, 4);
  const photos = state.photos && state.photos.length ? state.photos : [];
  const activePhoto = (i) => photos[i % photos.length] || null;
  const view = state.view || { x: 0.5, y: 0.5, zoom: 1 };

  const margin = S * 0.045;
  const gap = panels > 1 ? S * 0.018 : 0;

  // reserved text zone (top)
  const textZoneTop = H * 0.05;
  const textZoneH = H * (panels === 1 ? 0.33 : 0.29);
  const titleBottom = textZoneTop + textZoneH;

  // photo band
  const photoTop = titleBottom + S * 0.012;
  const bottomBarH = S * 0.045;
  const photoBottom = H - margin - bottomBarH;

  // ----- draw panels -----
  const drawPanel = (box, idx, opt) => {
    const img = activePhoto(idx);
    // backdrop behind letterboxing
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    drawSkyBackdrop(ctx, box.w, box.h, grade, box.h * 0.62);
    ctx.restore();

    if (img) {
      const foc = idx === 0 ? view : { x: 0.5, y: 0.5, zoom: 1 };
      drawPhoto(ctx, img, box, {
        focusX: foc.x, focusY: foc.y, zoom: foc.zoom,
        mirror: !!(opt && opt.mirror),
      });
    }
  };

  if (panels === 1) {
    drawPanel({ x: margin, y: photoTop, w: W - margin * 2, h: photoBottom - photoTop }, 0, null);
  } else {
    const gw = W - margin * 2;
    const gh = photoBottom - photoTop;
    const cols = panels === 4 ? 2 : panels; // 2->2 cols, 3->3 cols, 4->2x2
    const rows = panels === 4 ? 2 : 1;
    const cw = (gw - gap * (cols - 1)) / cols;
    const ch = (gh - gap * (rows - 1)) / rows;
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (idx >= panels) break;
        const bx = margin + c * (cw + gap);
        const by = photoTop + r * (ch + gap);
        drawPanel({ x: bx, y: by, w: cw, h: ch }, idx, { mirror: idx === 2 });
        idx++;
      }
    }
  }

  // ----- colour grade + rim light over the photo band -----
  const band = { top: photoTop, bottom: photoBottom };
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, photoTop, W, photoBottom - photoTop);
  ctx.clip();
  applyGrade(ctx, W, H, grade, gradeAmt, duotone, band);
  addRimLight(ctx, W, H, grade, band);
  ctx.restore();

  // ----- neon horizon bar above photo -----
  const barY = photoTop - S * 0.006;
  drawNeonBar(ctx, margin, barY, W - margin * 2, Math.max(3, S * 0.008), accent);
  drawNeonBar(ctx, margin, barY + S * 0.018, (W - margin * 2) * 0.34, Math.max(2, S * 0.004), NEON[1]);

  // ----- bottom bar with tagline -----
  const byY = H - margin - bottomBarH;
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,16,0.86)';
  ctx.fillRect(0, byY - S * 0.006, W, bottomBarH + S * 0.006);
  drawNeonBar(ctx, 0, byY - S * 0.008, W, Math.max(3, S * 0.007), accent);
  const tag = (state.tagline || 'VICE CITY · A NEW STORY').toUpperCase();
  ctx.font = `700 ${Math.round(S * 0.024)}px "Helvetica Neue", Arial, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  const tSpacing = S * 0.007;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  drawSpaced(ctx, tag, W / 2, byY + bottomBarH * 0.52, tSpacing);
  ctx.restore();

  // ----- lettering -----
  const capSize = panels === 1 ? S * 0.19 : S * 0.13;
  drawLettering(ctx, {
    cx: W / 2,
    topY: textZoneTop,
    maxW: W * 0.9,
    caption: state.caption,
    subtitle: state.subtitle,
    accent,
    maxSize: capSize,
    minSize: Math.round(S * 0.05),
    lineGap: 0.86,
  });

  // ----- texture overlay -----
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  overlayTexture(ctx, W, H, grade);
  ctx.restore();

  // ----- corner accents -----
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, S * 0.004);
  ctx.shadowColor = accent;
  ctx.shadowBlur = S * 0.015;
  const cx0 = margin * 0.7, cy0 = margin * 0.7;
  const cl = S * 0.05;
  ctx.beginPath();
  ctx.moveTo(cx0, cy0 + cl); ctx.lineTo(cx0, cy0); ctx.lineTo(cx0 + cl, cy0);
  ctx.moveTo(W - cx0 - cl, cy0); ctx.lineTo(W - cx0, cy0); ctx.lineTo(W - cx0, cy0 + cl);
  ctx.moveTo(cx0, H - cy0 - cl); ctx.lineTo(cx0, H - cy0); ctx.lineTo(cx0 + cl, H - cy0);
  ctx.moveTo(W - cx0 - cl, H - cy0); ctx.lineTo(W - cx0, H - cy0); ctx.lineTo(W - cx0, H - cy0 - cl);
  ctx.stroke();
  ctx.restore();
}

export { GRADES, NEON };