// VISE/SIX cover art maker — wires the UI, drag/zoom, and PNG export.
// A `?shot=` query renders a fixed scene for screenshots (./shots.js).
import { renderCover, NEON } from './art.js';
import { runShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const vctx = view.getContext('2d');

const SAMPLE_LIST = [
  { id: 'boulevard', label: 'Boulevard' },
  { id: 'pier', label: 'Pier' },
];

// ---- app state ------------------------------------------------------------
const state = {
  photos: [], // loaded Image objects
  photoIndex: 0,
  view: { x: 0.5, y: 0.5, zoom: 1 },
  panels: 1,
  grade: 'sunset',
  gradeAmt: 0.62,
  duotone: false,
  caption: 'Sunset Heist',
  subtitle: 'A VICE CITY STORY',
  accent: '#ff3cac',
  seed: 1,
  tagline: 'VICE CITY · A NEW STORY',
};

let outW = 1080;
let outH = 1080;

// ---- image loading --------------------------------------------------------
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function loadSamples() {
  const imgs = await Promise.all(SAMPLE_LIST.map((s) => loadImage(`samples/${s.id}.jpg`)));
  state.photos = imgs;
  state.photoIndex = 0;
}

// ---- drawing --------------------------------------------------------------
function draw() {
  // keep the on-screen canvas at a preview resolution but export at full size
  renderCover(view, state);
}

function setOutSize(w, h) {
  outW = w;
  outH = h;
  view.width = w;
  view.height = h;
  draw();
  fitViewToStage();
  $('dimLabel').textContent = `${w} × ${h}`;
}

function fitViewToStage() {
  // CSS scales the canvas down to fit; keep aspect by letting max-width/height act
  const pad = 52;
  const availW = window.innerWidth - 336 - pad * 2;
  const availH = window.innerHeight - pad * 2;
  const scale = Math.min(availW / outW, availH / outH, 1);
  view.style.width = Math.round(outW * scale) + 'px';
  view.style.height = Math.round(outH * scale) + 'px';
}

// ---- UI sync --------------------------------------------------------------
function syncUI() {
  $('caption').value = state.caption;
  $('subtitle').value = state.subtitle;
  $('capCount').textContent = state.caption.length;
  $('gradeAmt').value = state.gradeAmt;
  $('zoom').value = state.view.zoom;
  $('zoomVal').textContent = 'zoom';
  document.querySelectorAll('#panels button').forEach((b) => b.classList.toggle('on', +b.dataset.panels === state.panels));
  document.querySelectorAll('#grades button').forEach((b) => b.classList.toggle('on', b.dataset.grade === state.grade));
  document.querySelectorAll('#swatch button').forEach((b) => b.classList.toggle('on', b.dataset.color === state.accent));
  $('duotone').checked = state.duotone;
  // samples
  document.querySelectorAll('#samples button').forEach((b, i) => b.classList.toggle('on', i === state.photoIndex));
  $('photoName').textContent = SAMPLE_LIST[state.photoIndex]?.label || 'photo';
}

function refresh() {
  syncUI();
  draw();
}

// ---- build swatches & sample buttons -------------------------------------
function buildControls() {
  const sw = $('swatch');
  NEON.forEach((c) => {
    const b = document.createElement('button');
    b.dataset.color = c;
    b.style.background = c;
    b.title = c;
    b.addEventListener('click', () => {
      state.accent = c;
      refresh();
    });
    sw.appendChild(b);
  });

  const sm = $('samples');
  SAMPLE_LIST.forEach((s, i) => {
    const b = document.createElement('button');
    b.style.backgroundImage = `url(samples/${s.id}.jpg)`;
    const lab = document.createElement('span');
    lab.textContent = s.label;
    b.appendChild(lab);
    b.addEventListener('click', () => {
      state.photoIndex = i;
      state.view = { x: 0.5, y: 0.5, zoom: 1 };
      refresh();
    });
    sm.appendChild(b);
  });
}

// ---- events ---------------------------------------------------------------
function bindEvents() {
  $('caption').addEventListener('input', (e) => {
    state.caption = e.target.value;
    $('capCount').textContent = e.target.value.length;
    draw();
  });
  $('subtitle').addEventListener('input', (e) => {
    state.subtitle = e.target.value;
    draw();
  });
  $('gradeAmt').addEventListener('input', (e) => {
    state.gradeAmt = +e.target.value;
    draw();
  });
  $('zoom').addEventListener('input', (e) => {
    state.view.zoom = +e.target.value;
    draw();
  });
  $('duotone').addEventListener('change', (e) => {
    state.duotone = e.target.checked;
    draw();
  });

  document.querySelectorAll('#panels button').forEach((b) => {
    b.addEventListener('click', () => {
      state.panels = +b.dataset.panels;
      refresh();
    });
  });
  document.querySelectorAll('#grades button').forEach((b) => {
    b.addEventListener('click', () => {
      state.grade = b.dataset.grade;
      refresh();
    });
  });

  // size
  $('size').addEventListener('change', (e) => {
    const [w, h] = e.target.value.split('x').map(Number);
    setOutSize(w, h);
  });

  // export
  $('export').addEventListener('click', exportPNG);

  // surprise
  $('random').addEventListener('click', surprise);

  // file picker
  const fileInput = $('photo');
  const drop = $('drop');
  drop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) loadFile(f);
  });
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('over');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove('over');
    }),
  );
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
}

function loadFile(file) {
  const url = URL.createObjectURL(file);
  loadImage(url).then((img) => {
    state.photos = [img, ...state.photos.slice(1)];
    state.photoIndex = 0;
    state.view = { x: 0.5, y: 0.5, zoom: 1 };
    $('photoName').textContent = file.name.replace(/\.[^.]+$/, '').slice(0, 16);
    refresh();
  });
}

// ---- drag to reposition + wheel zoom -------------------------------------
function bindStageGestures() {
  let dragging = false;
  let last = null;

  view.addEventListener('pointerdown', (e) => {
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    view.classList.add('grabbing');
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - last.x) / view.clientWidth;
    const dy = (e.clientY - last.y) / view.clientHeight;
    last = { x: e.clientX, y: e.clientY };
    state.view.x = Math.min(1, Math.max(0, state.view.x - dx));
    state.view.y = Math.min(1, Math.max(0, state.view.y - dy));
    draw();
  });
  const end = () => {
    dragging = false;
    last = null;
    view.classList.remove('grabbing');
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);

  view.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      state.view.zoom = Math.min(3, Math.max(1, state.view.zoom * factor));
      $('zoom').value = state.view.zoom;
      draw();
    },
    { passive: false },
  );

  window.addEventListener('resize', fitViewToStage);
}

// ---- export ---------------------------------------------------------------
function exportPNG() {
  const status = $('status');
  // render at full output resolution (canvas already is out size)
  draw();
  const name = `vise-six-${outW}x${outH}.png`;
  view.toBlob((blob) => {
    if (!blob) {
      status.textContent = 'Export failed — try a smaller size.';
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    status.textContent = `Saved ${name}`;
    setTimeout(() => {
      if (status.textContent.startsWith('Saved')) status.textContent = '';
    }, 4000);
  }, 'image/png');
}

// ---- surprise -------------------------------------------------------------
const CAPTIONS = [
  'Sunset Heist', 'Neon Getaway', 'Vice City Story', 'Midnight Run',
  'Ocean Drive', 'Palm Royale', 'Chrome Hearts', 'Star Island',
  'Neon Tide', 'After Hours', 'Heat Wave', 'Paradise PD',
];
const SUBS = [
  'A VICE CITY STORY', 'WELCOME TO THE SIX', 'ONE NIGHT ONLY',
  'THE CITY IS YOURS', 'NO RULES · JUST NEON', 'LIVE FAST · PAINT SLOW',
];

function surprise() {
  const r = Math.random;
  state.photoIndex = Math.floor(r() * SAMPLE_LIST.length);
  state.panels = 1 + Math.floor(r() * 4);
  state.grade = ['sunset', 'neon', 'vice'][Math.floor(r() * 3)];
  state.gradeAmt = 0.5 + r() * 0.4;
  state.duotone = r() > 0.6;
  state.caption = CAPTIONS[Math.floor(r() * CAPTIONS.length)];
  state.subtitle = SUBS[Math.floor(r() * SUBS.length)];
  state.accent = NEON[Math.floor(r() * NEON.length)];
  state.seed = (Math.random() * 1e9) | 0;
  state.view = { x: 0.5, y: 0.5, zoom: 1 };
  refresh();
}

// ---- boot -----------------------------------------------------------------
async function boot() {
  buildControls();
  bindEvents();
  bindStageGestures();
  await loadSamples();
  refresh();
  fitViewToStage();

  const shot = new URLSearchParams(location.search).get('shot');
  if (shot) {
    runShot(shot, new URLSearchParams(location.search), {
      setCaption: (t) => { state.caption = t; },
      setSubtitle: (t) => { state.subtitle = t; },
      setPhoto: (id) => {
        const i = SAMPLE_LIST.findIndex((s) => s.id === id);
        if (i >= 0) state.photoIndex = i;
      },
      setGrade: (g) => { if (['sunset', 'neon', 'vice'].includes(g)) state.grade = g; },
      setPanels: (n) => { state.panels = n; },
      setSize: (w, h) => { setOutSize(w, h); },
      setAccent: (c) => { state.accent = c; },
      addShotClass: (c) => document.body.classList.add(c),
      setView: (v) => { state.view = v; },
      setSeed: (s) => { state.seed = s; },
      redraw: () => { syncUI(); draw(); },
      fit: fitViewToStage,
    });
  }
}

boot();