// Draws a small sphere of evenly spaced points into <pre id="field">, turning
// slowly and breathing faintly. Nearer points get heavier glyphs, farther ones
// lighter, so it reads as a globe of dots. landing.css sets the name directly
// beneath it, so CENTER_Y and RADIUS here must agree with .seal there.

(() => {
  const el = document.getElementById('field');
  if (!el) return;

  const GLYPHS = '.·:+*';
  const STILL = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FRAME_MS = 1000 / 24;
  const COUNT = 440;        // points on the sphere
  const RADIUS = 190;       // px, on screens big enough for it
  const CENTER_Y = 0.42;    // fraction of the viewport height
  const TILT = 0.4;         // lean of the spin axis toward the viewer

  // Spread points evenly over a unit sphere along a golden-angle spiral.
  const POINTS = [];
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < COUNT; i++) {
    const y = 1 - (2 * (i + 0.5)) / COUNT;
    const r = Math.sqrt(1 - y * y);
    POINTS.push([Math.cos(GOLDEN * i) * r, y, Math.sin(GOLDEN * i) * r]);
  }

  let cols = 0, rows = 0, cellW = 7, cellH = 14, radius = RADIUS, cx = 0, cy = 0;

  function measure() {
    const probe = document.createElement('span');
    probe.textContent = 'M'.repeat(100);
    el.textContent = '';
    el.appendChild(probe);
    cellW = probe.getBoundingClientRect().width / 100;
    cellH = parseFloat(getComputedStyle(el).lineHeight);
    el.textContent = '';

    cols = Math.ceil(innerWidth / cellW);
    rows = Math.ceil(innerHeight / cellH);
    radius = Math.min(RADIUS, innerWidth * 0.4, innerHeight * 0.26);
    cx = innerWidth / 2;
    cy = innerHeight * CENTER_Y;
  }

  function frame(now) {
    const t = now / 1000;
    const spin = t * 0.25;
    const cs = Math.cos(spin), ss = Math.sin(spin);
    const ct = Math.cos(TILT), st = Math.sin(TILT);
    const r = radius * (1 + 0.03 * Math.sin(t * 0.9));
    const boot = STILL ? 1 : Math.min(1, now / 2000);

    // One character per cell; where points overlap, the nearest wins.
    const grid = new Array(rows * cols).fill(' ');
    const depth = new Float32Array(rows * cols).fill(-2);

    for (const [x, y, z] of POINTS) {
      // Spin about y, then lean toward the viewer about x.
      const x1 = x * cs - z * ss, z1 = x * ss + z * cs;
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;

      const c = Math.floor((cx + x1 * r) / cellW);
      const row = Math.floor((cy - y2 * r) / cellH);
      if (c < 0 || c >= cols || row < 0 || row >= rows) continue;
      const i = row * cols + c;
      if (-z2 <= depth[i]) continue;
      depth[i] = -z2;

      // -z2 runs from -1 (back) to 1 (front).
      const near = ((1 - z2) / 2) * boot;
      grid[i] = GLYPHS[Math.min(GLYPHS.length - 1, Math.floor(near * GLYPHS.length))];
    }

    const lines = new Array(rows);
    for (let row = 0; row < rows; row++) lines[row] = grid.slice(row * cols, (row + 1) * cols).join('');
    el.textContent = lines.join('\n');
  }

  let last = -Infinity;
  function loop(now) {
    if (now - last >= FRAME_MS) { last = now; frame(now); }
    requestAnimationFrame(loop);
  }

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { measure(); if (STILL) frame(0); }, 100);
  });

  document.fonts.ready.then(() => {
    measure();
    if (STILL) frame(0);
    else requestAnimationFrame(loop);
  });
})();
