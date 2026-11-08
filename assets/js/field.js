// Renders a slowly turning horned goat's head, a Baphomet, as ASCII into
// <pre id="field">. Each character cell casts one ray into a signed-distance
// model (skull, muzzle, brow, ears, beard and two ribbed, back-curling horns)
// and picks a glyph by how brightly that point is lit. The light follows the
// pointer.

(() => {
  const el = document.getElementById('field');
  if (!el) return;

  const RAMP = ' .,:;-=+*ox%#@';
  const STILL = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FRAME_MS = 1000 / 24;
  const CAM_Z = -4.2, FOCAL = 3.4;
  const BOUND = 2.0;   // radius of a sphere that contains the whole head
  const FIT = 1.65;     // half the shorter screen side, in scene units

  // ── Shapes ──────────────────────────────────────────────

  const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

  function smin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  }
  function smax(a, b, k) { return -smin(-a, -b, k); }

  function ellipsoid(px, py, pz, rx, ry, rz) {
    const k0 = len(px / rx, py / ry, pz / rz);
    const k1 = len(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
    return k0 * (k0 - 1) / k1;
  }

  // A capsule whose radius tapers from r1 at a to r2 at b.
  function taper(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
    const pax = px - ax, pay = py - ay, paz = pz - az;
    const bax = bx - ax, bay = by - ay, baz = bz - az;
    const h = Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
    return len(pax - bax * h, pay - bay * h, paz - baz * h) - (r1 + (r2 - r1) * h);
  }

  // One horn as a chain of tapering segments: up from the skull, back, out,
  // then curling down. Mirrored for the left side.
  const HORN = [
    [0.20, 0.72, 0.02], [0.32, 0.98, 0.12], [0.50, 1.18, 0.30], [0.71, 1.27, 0.52],
    [0.91, 1.24, 0.72], [1.07, 1.10, 0.85], [1.16, 0.90, 0.88], [1.18, 0.70, 0.80],
  ];
  const HORN_R = [0.17, 0.15, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03];

  function horn(px, py, pz) {
    // Skip the segments entirely when far from the horn's bounding sphere.
    const b = len(px - 0.68, py - 1.0, pz - 0.45) - 0.78;
    if (b > 0.15) return b;
    let d = Infinity;
    for (let i = 0; i < HORN.length - 1; i++) {
      const [ax, ay, az] = HORN[i], [bx, by, bz] = HORN[i + 1];
      d = Math.min(d, taper(px, py, pz, ax, ay, az, bx, by, bz, HORN_R[i], HORN_R[i + 1]));
    }
    // Ridges around the horn, like growth rings.
    const ring = Math.sin((py * 0.6 + pz + px * 0.4) * 38) * 0.012;
    return d + ring;
  }

  function head(x, y, z) {
    const ax = Math.abs(x); // the face is symmetric

    let d = ellipsoid(x, y - 0.42, z - 0.05, 0.5, 0.42, 0.46);                     // cranium
    d = smin(d, ellipsoid(ax - 0.2, y - 0.12, z + 0.2, 0.2, 0.24, 0.22), 0.2);   // cheekbones
    d = smin(d, taper(x, y, z, 0, 0.30, -0.14, 0, -0.46, -0.44, 0.30, 0.2), 0.25);  // muzzle
    d = smin(d, taper(x, y, z, 0, 0.02, 0.02, 0, -0.42, -0.26, 0.24, 0.14), 0.2);   // jaw
    d = smin(d, taper(ax, y, z, 0, 0.47, -0.36, 0.32, 0.44, -0.3, 0.08, 0.065), 0.08); // brow

    // Eye sockets and nostrils.
    d = smax(d, -len(ax - 0.24, y - 0.3, z + 0.46) + 0.14, 0.04);
    d = smax(d, -len(ax - 0.08, y + 0.44, z + 0.62) + 0.045, 0.02);

    // Ears, drooping outward.
    d = smin(d, ellipsoid(ax - 0.5, y - 0.2 + (ax - 0.5) * 0.7, z - 0.04, 0.21, 0.1, 0.14), 0.1);

    // Beard.
    d = smin(d, taper(x, y, z, 0, -0.45, -0.32, 0, -0.98, -0.24, 0.13, 0.02), 0.1);

    return smin(d, horn(ax, y, z), 0.08);
  }

  // ── Rendering ───────────────────────────────────────────

  let cols = 0, rows = 0, cellW = 7, cellH = 14, scale = 1, cx = 0, cy = 0;
  let lightX = -0.5, lightY = 0.6, aimX = lightX, aimY = lightY;
  let lx = 0, ly = 0, lz = -1;   // unit vector toward the light, set per frame
  let cyaw = 1, syaw = 0, cpit = 1, spit = 0;

  function dist(x, y, z) {
    // Turn the head about y, then nod it about x.
    const x1 = x * cyaw - z * syaw;
    const z1 = x * syaw + z * cyaw;
    const y1 = y * cpit - z1 * spit;
    const z2 = y * spit + z1 * cpit;
    return head(x1, y1, z2);
  }

  function measure() {
    const probe = document.createElement('span');
    probe.textContent = 'M'.repeat(100);
    el.textContent = '';
    el.appendChild(probe);
    cellW = probe.getBoundingClientRect().width / 100;
    cellH = parseFloat(getComputedStyle(el).lineHeight);
    el.textContent = '';

    const w = innerWidth, h = innerHeight;
    cols = Math.ceil(w / cellW);
    rows = Math.ceil(h / cellH);
    scale = (2 * FIT) / Math.min(w, h);
    cx = w / 2;
    // Sit the head a little high so the name has room underneath.
    cy = h * 0.43;
  }

  function shade(px, py, pz, dx, dy, dz) {
    const e = 0.003;
    let nx = dist(px + e, py, pz) - dist(px - e, py, pz);
    let ny = dist(px, py + e, pz) - dist(px, py - e, pz);
    let nz = dist(px, py, pz + e) - dist(px, py, pz - e);
    const nl = len(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;

    const ndl = nx * lx + ny * ly + nz * lz;
    const diffuse = Math.max(ndl, 0);
    const rdotv = -((2 * ndl * nx - lx) * dx + (2 * ndl * ny - ly) * dy + (2 * ndl * nz - lz) * dz);
    const spec = Math.pow(Math.max(rdotv, 0), 20);
    const rim = Math.pow(1 - Math.abs(nx * dx + ny * dy + nz * dz), 3);

    // Ambient occlusion: points tucked into creases (eye sockets, nostrils,
    // where the horns meet the skull) see less light.
    let occ = 0;
    for (let i = 1; i <= 3; i++) {
      const h = 0.06 * i;
      occ += (h - dist(px + nx * h, py + ny * h, pz + nz * h)) / i;
    }
    const ao = Math.max(0, Math.min(1, 1 - 4 * occ));

    return (0.05 + 0.75 * diffuse + 0.4 * spec + 0.25 * rim) * (0.25 + 0.75 * ao);
  }

  function frame(now) {
    const t = now / 1000;
    const yaw = 0.28 * Math.sin(t * 0.25);
    const pitch = 0.06 + 0.1 * Math.sin(t * 0.17 + 1.3);
    cyaw = Math.cos(yaw); syaw = Math.sin(yaw);
    cpit = Math.cos(pitch); spit = Math.sin(pitch);

    lightX += (aimX - lightX) * 0.08;
    lightY += (aimY - lightY) * 0.08;
    const ll = len(lightX, lightY, 0.9);
    lx = lightX / ll; ly = lightY / ll; lz = -0.9 / ll;

    // Fade in over the first two seconds.
    const boot = STILL ? 1 : Math.min(1, now / 2000);
    const top = RAMP.length - 1;
    const lines = new Array(rows);

    for (let r = 0; r < rows; r++) {
      let line = '';
      const v = (cy - (r + 0.5) * cellH) * scale;
      for (let c = 0; c < cols; c++) {
        const u = ((c + 0.5) * cellW - cx) * scale;

        let dx = u, dy = v, dz = FOCAL;
        const dl = len(dx, dy, dz);
        dx /= dl; dy /= dl; dz /= dl;

        const b = CAM_Z * dz;
        const disc = b * b - (CAM_Z * CAM_Z - BOUND * BOUND);
        if (disc < 0) { line += ' '; continue; }

        const root = Math.sqrt(disc);
        let d = -b - root;
        const far = -b + root;
        let hit = false;
        for (let i = 0; i < 64 && d < far; i++) {
          const s = dist(dx * d, dy * d, CAM_Z + dz * d);
          if (s < 0.004) { hit = true; break; }
          d += s * 0.8;
        }

        if (!hit) { line += ' '; continue; }

        const lum = shade(dx * d, dy * d, CAM_Z + dz * d, dx, dy, dz) * boot;
        line += RAMP[Math.max(1, Math.min(top, Math.round(lum * top)))];
      }
      lines[r] = line;
    }
    el.textContent = lines.join('\n');
  }

  let last = -Infinity;
  function loop(now) {
    if (now - last >= FRAME_MS) { last = now; frame(now); }
    requestAnimationFrame(loop);
  }

  addEventListener('pointermove', (e) => {
    aimX = (e.clientX / innerWidth - 0.5) * 2.4;
    aimY = (0.5 - e.clientY / innerHeight) * 2.4;
  }, { passive: true });

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { measure(); if (STILL) frame(8000); }, 100);
  });

  document.fonts.ready.then(() => {
    measure();
    if (STILL) {
      lightX = aimX; lightY = aimY;
      frame(8000);
    } else {
      requestAnimationFrame(loop);
    }
  });
})();
