// Fixed, deterministic scenes for screenshots.
//   ?shot=start   initial / demo state (square, single photo, Sunset)
//   ?shot=editor  the tool UI with controls + a live preview
//   ?shot=cover   the finished cover, no chrome (square)
//   ?shot=panels  a multi-panel variant (square)
// `seed=N` makes grain / layout deterministic. `window.__shotReady` is set once
// the canvas has been painted, so a screenshot tool knows when to capture.

const PRESETS = {
  start: {
    size: [1080, 1080], photo: 'boulevard', caption: 'Boulevard Queen',
    subtitle: 'A VICE CITY STORY', grade: 'sunset', gradeAmt: 0.62,
    panels: 1, accent: '#ff3cac', seed: 7,
    setView: { x: 0.5, y: 0.42, zoom: 1.05 },
  },
  editor: {
    size: [1080, 1080], photo: 'pier', caption: 'Sunset Heist',
    subtitle: 'A VICE CITY STORY', grade: 'sunset', gradeAmt: 0.66,
    panels: 1, accent: '#ff3cac', seed: 21,
    setView: { x: 0.5, y: 0.5, zoom: 1 },
    chrome: true, // show the full tool UI
  },
  cover: {
    size: [1080, 1080], photo: 'pier', caption: 'Sunset Heist',
    subtitle: 'A VICE CITY STORY', grade: 'sunset', gradeAmt: 0.68,
    panels: 1, accent: '#ff3cac', seed: 3,
    setView: { x: 0.5, y: 0.5, zoom: 1.02 },
    cover: true, // hide the panel, fill the frame
  },
  panels: {
    size: [1080, 1080], photo: 'boulevard', caption: 'Vice City Story',
    subtitle: 'WELCOME TO THE SIX', grade: 'neon', gradeAmt: 0.6,
    panels: 3, accent: '#29c7d8', seed: 11,
    setView: { x: 0.5, y: 0.45, zoom: 1.05 },
    cover: true,
  },
};

export async function runShot(shot, query, api) {
  const preset = PRESETS[shot] || PRESETS.start;

  if (preset.cover) api.addShotClass('shot-cover');

  // size first so the canvas is right before we paint
  api.setSize(preset.size[0], preset.size[1]);

  const photoId = query.get('photo') || preset.photo;
  const caption = query.get('caption') || preset.caption;
  const seed = query.has('seed') ? +query.get('seed') : preset.seed;

  api.setPhoto(photoId);
  api.setCaption(decodeURIComponent(caption));
  api.setSubtitle(preset.subtitle);
  api.setGrade(preset.grade);
  api.setPanels(preset.panels);
  api.setAccent(preset.accent);
  api.setSeed(seed);
  api.setView(preset.setView || { x: 0.5, y: 0.5, zoom: 1 });

  // for the editor shot we want the on-screen canvas to fit the stage nicely
  if (preset.chrome) api.fit();

  api.redraw();

  // let the browser paint two frames, then announce readiness
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.__shotReady = true;
    }),
  );
}