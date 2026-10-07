import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Collision helpers (axis-aligned boxes + vertical cylinders for robots)
// ---------------------------------------------------------------------------

export function rayBox(o, d, b, tMax) {
  let t0 = 0, t1 = tMax;
  if (Math.abs(d.x) < 1e-9) { if (o.x < b.minX || o.x > b.maxX) return -1; }
  else {
    let a = (b.minX - o.x) / d.x, c = (b.maxX - o.x) / d.x;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return -1;
  }
  if (Math.abs(d.y) < 1e-9) { if (o.y < b.minY || o.y > b.maxY) return -1; }
  else {
    let a = (b.minY - o.y) / d.y, c = (b.maxY - o.y) / d.y;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return -1;
  }
  if (Math.abs(d.z) < 1e-9) { if (o.z < b.minZ || o.z > b.maxZ) return -1; }
  else {
    let a = (b.minZ - o.z) / d.z, c = (b.maxZ - o.z) / d.z;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return -1;
  }
  return t0;
}

// Ray vs. finite vertical cylinder. Returns distance along the (unit) ray or -1.
export function rayCylinder(o, d, cx, cz, r, y0, y1, tMax) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  let lo = 0, hi = tMax;
  if (a < 1e-9) {
    if (ox * ox + oz * oz > r * r) return -1;
  } else {
    const b = ox * d.x + oz * d.z;
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - a * c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    const tA = (-b - s) / a, tB = (-b + s) / a;
    if (tA > lo) lo = tA;
    if (tB < hi) hi = tB;
    if (lo > hi) return -1;
  }
  if (Math.abs(d.y) < 1e-9) {
    if (o.y < y0 || o.y > y1) return -1;
  } else {
    let ta = (y0 - o.y) / d.y, tb = (y1 - o.y) / d.y;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > lo) lo = ta;
    if (tb < hi) hi = tb;
    if (lo > hi) return -1;
  }
  return lo;
}

function circleHitsBox(x, z, r, b) {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function grain(x, s, n, a) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * a})`;
    x.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
}

function panelTex(base, seam) {
  return canvasTex(128, (x, s) => {
    x.fillStyle = base; x.fillRect(0, 0, s, s);
    grain(x, s, 700, 0.05);
    x.strokeStyle = seam; x.lineWidth = 3;
    x.strokeRect(1.5, 1.5, s - 3, s - 3);
    x.beginPath(); x.moveTo(s / 2, 0); x.lineTo(s / 2, s); x.stroke();
    x.fillStyle = seam;
    for (const [px, py] of [[10, 10], [s - 10, 10], [10, s - 10], [s - 10, s - 10]]) { x.beginPath(); x.arc(px, py, 3, 0, 7); x.fill(); }
  });
}

function floorTex() {
  return canvasTex(256, (x, s) => {
    x.fillStyle = '#171c26'; x.fillRect(0, 0, s, s);
    const h = s / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      x.fillStyle = (i + j) % 2 ? '#1a202b' : '#161b24';
      x.fillRect(i * h, j * h, h, h);
    }
    grain(x, s, 1500, 0.035);
    x.strokeStyle = '#262f40'; x.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      x.beginPath(); x.moveTo(i * h, 0); x.lineTo(i * h, s); x.stroke();
      x.beginPath(); x.moveTo(0, i * h); x.lineTo(s, i * h); x.stroke();
    }
    x.strokeStyle = '#34425a'; x.lineWidth = 2;
    for (const [cx, cy] of [[h / 2, h / 2], [h * 1.5, h / 2], [h / 2, h * 1.5], [h * 1.5, h * 1.5]]) {
      x.beginPath(); x.moveTo(cx - 6, cy); x.lineTo(cx + 6, cy); x.moveTo(cx, cy - 6); x.lineTo(cx, cy + 6); x.stroke();
    }
  });
}

// BoxGeometry whose UVs are scaled to world units so textures tile instead of stretching.
function boxGeo(w, h, d, tile = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
  }
  return g;
}

const hot = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.half = 55;
    this.boxes = [];
    this.pickups = [];
    this.spawns = [{ x: 0, z: -44, yaw: 0 }, { x: 0, z: 44, yaw: Math.PI }];
    this.mats = {
      wall: new THREE.MeshStandardMaterial({ map: panelTex('#2a303c', '#1a1e26'), metalness: 0.5, roughness: 0.6 }),
      dark: new THREE.MeshStandardMaterial({ map: panelTex('#343b48', '#1f242d'), metalness: 0.55, roughness: 0.55 }),
      crate: new THREE.MeshStandardMaterial({ map: panelTex('#4a5262', '#2a303b'), metalness: 0.35, roughness: 0.6 }),
      concrete: new THREE.MeshStandardMaterial({ map: panelTex('#6a707b', '#4b505a'), metalness: 0.05, roughness: 0.85 }),
    };
    this.buildEnvironment();
    this.buildLayout();
    this.buildPickups();
  }

  buildEnvironment() {
    const s = this.scene;
    s.background = new THREE.Color(0x0b1120);
    s.fog = new THREE.Fog(0x141a2c, 110, 300);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(0x04060c) },
          mid: { value: new THREE.Color(0x1a1f3d) },
          horizon: { value: new THREE.Color(0xc4553a) },
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(horizon, mid, smoothstep(-0.02, 0.2, h)); c = mix(c, top, smoothstep(0.2, 0.75, h)); gl_FragColor = vec4(c, 1.0); }',
      }),
    );
    sky.renderOrder = -1;
    s.add(sky);

    const starPos = [];
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.15 + Math.random() * 1.3;
      starPos.push(Math.cos(a) * Math.cos(e) * 400, Math.sin(e) * 400, Math.sin(a) * Math.cos(e) * 400);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    s.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbfd4ff, size: 1.4, sizeAttenuation: false, fog: false })));

    s.add(new THREE.HemisphereLight(0x8fa8ff, 0x2a1d14, 0.9));
    const sun = new THREE.DirectionalLight(0xffd6ae, 2.6);
    sun.position.set(45, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    s.add(sun);
    s.add(sun.target);

    // Arena floor + outer ground
    const ft = floorTex();
    ft.repeat.set(this.half * 2 / 8, this.half * 2 / 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.half * 2, this.half * 2), new THREE.MeshStandardMaterial({ map: ft, metalness: 0.25, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    const gt = floorTex();
    gt.repeat.set(60, 60);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: gt, color: 0x5a6070, metalness: 0.2, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    s.add(ground);

    // Floor markings
    const flat = (geo, color, x, z, opacity = 1) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.03, z);
      s.add(m);
      return m;
    };
    flat(new THREE.RingGeometry(17, 17.3, 128), hot(0x35e0ff, 1.6), 0, 0);
    flat(new THREE.RingGeometry(26, 26.12, 128), hot(0x35e0ff, 0.9), 0, 0);
    const [a, b] = this.spawns;
    flat(new THREE.CircleGeometry(4, 48), 0x0d2438, a.x, a.z, 0.7);
    flat(new THREE.RingGeometry(3.7, 4.05, 48), hot(0x35b8ff, 2.2), a.x, a.z);
    flat(new THREE.CircleGeometry(4, 48), 0x3a0d14, b.x, b.z, 0.7);
    flat(new THREE.RingGeometry(3.7, 4.05, 48), hot(0xff3b4e, 2.2), b.x, b.z);

    // Distant skyline silhouettes with neon bands
    const n = 90;
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    bGeo.translate(0, 0.5, 0);
    const bld = new THREE.InstancedMesh(bGeo, new THREE.MeshStandardMaterial({ color: 0x0c111b, roughness: 0.9, metalness: 0.2 }), n);
    const bands = new THREE.InstancedMesh(bGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc3 = new THREE.Vector3();
    const neon = [hot(0x35e0ff, 1.6), hot(0xff3df0, 1.4), hot(0xff8a3d, 1.6)];
    let bi = 0;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.05;
      const rad = 115 + Math.random() * 110;
      const w = 8 + Math.random() * 18, h = 14 + Math.random() * 70;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang);
      p.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      sc3.set(w, h, w * (0.6 + Math.random() * 0.8));
      m4.compose(p, q, sc3);
      bld.setMatrixAt(i, m4);
      const bandsHere = Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 2) : 0;
      for (let k = 0; k < bandsHere && bi < n * 2; k++) {
        const y = h * (0.35 + Math.random() * 0.6);
        m4.compose(p.clone().setY(y), q, new THREE.Vector3(w * 1.02, 0.35, sc3.z * 1.02));
        bands.setMatrixAt(bi, m4);
        bands.setColorAt(bi, neon[Math.floor(Math.random() * neon.length)]);
        bi++;
      }
    }
    bands.count = bi;
    s.add(bld, bands);
  }

  addBox(cx, cz, w, d, h, style) {
    const b = { minX: cx - w / 2, maxX: cx + w / 2, minY: 0, maxY: h, minZ: cz - d / 2, maxZ: cz + d / 2, cx, cz, w, d, h, wall: style === 'wall' };
    this.boxes.push(b);
    const matKey = { wall: 'wall', pillar: 'dark', block: 'dark', platform: 'dark', crate: 'crate', barrier: 'concrete', cover: 'concrete' }[style];
    const mesh = new THREE.Mesh(boxGeo(w, h, d), this.mats[matKey]);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (style === 'wall') {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.18, d + 0.02), new THREE.MeshBasicMaterial({ color: hot(0x35e0ff, 2) }));
      strip.position.set(cx, h - 0.6, cz);
      this.scene.add(strip);
    } else {
      const edge = { pillar: 0xff8a3d, block: 0xff8a3d, barrier: 0xffc94d }[style] ?? 0x35e0ff;
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: hot(edge, 2.2) }));
      lines.position.copy(mesh.position);
      this.scene.add(lines);
    }
    return b;
  }

  buildLayout() {
    const H = this.half, T = 3, WH = 8;
    this.addBox(0, -H - T / 2, 2 * H + 2 * T, T, WH, 'wall');
    this.addBox(0, H + T / 2, 2 * H + 2 * T, T, WH, 'wall');
    this.addBox(-H - T / 2, 0, T, 2 * H, WH, 'wall');
    this.addBox(H + T / 2, 0, T, 2 * H, WH, 'wall');

    this.addBox(0, 0, 8, 8, 1.8, 'platform');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.addBox(sx * 11, sz * 11, 2.6, 2.6, 8, 'pillar');

    // One half of the map; each entry is mirrored through the centre so both sides are fair.
    const half = [
      [22, 0, 3, 16, 4.2, 'cover'],
      [-14, -24, 4, 4, 3, 'crate'],
      [-9.5, -25, 3, 3, 1.6, 'crate'],
      [16, -20, 4.5, 4.5, 3.2, 'crate'],
      [28, -34, 7, 3, 2.2, 'barrier'],
      [-32, -14, 3, 9, 4.2, 'cover'],
      [0, -33, 11, 1.8, 2.4, 'barrier'],
      [-38, -38, 5, 5, 5.5, 'block'],
      [40, -12, 4, 4, 2.2, 'crate'],
      [-20, -41, 3, 3, 3, 'crate'],
    ];
    for (const [x, z, w, d, h, st] of half) {
      this.addBox(x, z, w, d, h, st);
      this.addBox(-x, -z, w, d, h, st);
    }
  }

  buildPickups() {
    const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3dffa0, emissiveIntensity: 2.6 });
    const pad = new THREE.MeshStandardMaterial({ color: 0x1b222c, metalness: 0.6, roughness: 0.4 });
    for (const x of [-38, 38]) {
      const g = new THREE.Group();
      g.position.set(x, 0, 0);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 0.2, 32), pad);
      base.position.y = 0.1;
      base.receiveShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.07, 8, 48), glow);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.22;
      const cross = new THREE.Group();
      cross.position.y = 1.6;
      cross.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 0.42), glow));
      cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.3, 0.42), glow));
      g.add(base, ring, cross);
      this.scene.add(g);
      this.pickups.push({ pos: new THREE.Vector3(x, 0, 0), cross, active: true, t: 0 });
    }
  }

  resetPickups() {
    for (const p of this.pickups) { p.active = true; p.t = 0; p.cross.visible = true; }
  }

  update(dt, time) {
    for (const p of this.pickups) {
      p.cross.rotation.y += dt * 1.6;
      p.cross.position.y = 1.6 + Math.sin(time * 2.2) * 0.2;
      if (!p.active) {
        p.t -= dt;
        if (p.t <= 0) { p.active = true; p.cross.visible = true; }
      }
    }
  }

  nearestPickup(pos) {
    let best = null, bd = Infinity;
    for (const p of this.pickups) {
      if (!p.active) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { pickup: best, pos: best.pos, dist: bd } : null;
  }

  // Distance to the first box or the ground along a unit ray, or Infinity.
  raycast(o, d, maxT) {
    let best = maxT, hit = false;
    if (d.y < -1e-6) {
      const tg = -o.y / d.y;
      if (tg >= 0 && tg < best) { best = tg; hit = true; }
    }
    for (const b of this.boxes) {
      const t = rayBox(o, d, b, best);
      if (t >= 0 && t < best) { best = t; hit = true; }
    }
    return hit ? best : Infinity;
  }

  lineClear(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    const d = { x: dx / len, y: dy / len, z: dz / len };
    return this.raycast(a, d, len - 0.05) === Infinity;
  }

  // Push a circle (robot footprint) out of any box taller than it can step onto.
  resolveCircle(p, r, footY, step) {
    let hit = false;
    for (const b of this.boxes) {
      if (b.maxY <= footY + step) continue;
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2), k = (r - d) / d;
        p.x += dx * k;
        p.z += dz * k;
      } else {
        const l = p.x - b.minX, rr = b.maxX - p.x, bk = p.z - b.minZ, f = b.maxZ - p.z;
        const m = Math.min(l, rr, bk, f);
        if (m === l) p.x = b.minX - r;
        else if (m === rr) p.x = b.maxX + r;
        else if (m === bk) p.z = b.minZ - r;
        else p.z = b.maxZ + r;
      }
    }
    return hit;
  }

  groundHeight(x, z, r, footY, step) {
    let g = 0;
    for (const b of this.boxes) {
      if (b.maxY > footY + step + 1e-3 || b.maxY <= g) continue;
      if (circleHitsBox(x, z, r, b)) g = b.maxY;
    }
    return g;
  }

  blockingBox(x, z, r, footY, step) {
    for (const b of this.boxes) {
      if (b.maxY <= footY + step) continue;
      if (circleHitsBox(x, z, r, b)) return b;
    }
    return null;
  }
}
