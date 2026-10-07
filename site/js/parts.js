import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Part catalogue. Every robot = one mobility module + one body + one weapon
// (the weapon is mounted twice, one per shoulder).
// ---------------------------------------------------------------------------

export const MOBILITY = {
  wheels: { name: 'Rover Wheels', tag: 'FAST', blurb: 'Top speed and sharp handling. Cannot jump.', speed: 15.5, accel: 48, armor: 0, jump: 0, hp: 0, height: 1.35, turn: 9 },
  tracks: { name: 'Crawler Tracks', tag: 'ARMOR', blurb: 'Slow and steady. Takes 20% less damage.', speed: 10.5, accel: 30, armor: 0.2, jump: 0, hp: 150, height: 1.3, turn: 4.5 },
  legs: { name: 'Strider Legs', tag: 'JUMP', blurb: 'Balanced walker. Jump onto and over cover.', speed: 12.5, accel: 36, armor: 0.08, jump: 13, hp: 50, height: 2.72, turn: 6.5 },
};

export const BODIES = {
  scout: { name: 'Scout', tag: 'LIGHT', blurb: 'Nimble light frame. +15% speed, thin armor.', hp: 650, speedMul: 1.15, w: 2.2, h: 1.3, d: 2.5, radius: 1.55, scale: 0.9 },
  brawler: { name: 'Brawler', tag: 'MEDIUM', blurb: 'Dependable all-rounder frame.', hp: 900, speedMul: 1.0, w: 2.7, h: 1.7, d: 2.6, radius: 1.8, scale: 1.0 },
  titan: { name: 'Titan', tag: 'HEAVY', blurb: 'Walking fortress. Slow, massive HP pool.', hp: 1250, speedMul: 0.82, w: 3.3, h: 2.2, d: 3.0, radius: 2.1, scale: 1.15 },
};

export const WEAPONS = {
  gatling: { name: 'Punisher Gatling', tag: 'RAPID', blurb: 'Spin-up bullet hose. Reliable at mid range.', kind: 'bullet', damage: 9, interval: 0.08, speed: 130, spread: 0.018, mag: 45, reload: 2.2, range: 80, ideal: 18, color: 0xffc85a },
  cannon: { name: 'Thunder Cannon', tag: 'SPLASH', blurb: 'Slow, heavy shells that explode on impact.', kind: 'shell', damage: 110, splash: 4, interval: 1.1, speed: 78, spread: 0.003, mag: 5, reload: 2.8, range: 110, ideal: 26, color: 0xff7a2e },
  rockets: { name: 'Orkan Rockets', tag: 'HOMING', blurb: 'Aim near the enemy to lock on. Rockets curve in.', kind: 'rocket', damage: 38, splash: 2.5, interval: 0.16, speed: 46, spread: 0.05, mag: 8, reload: 3.2, range: 90, ideal: 28, homing: 2.2, color: 0x5ee6ff },
  laser: { name: 'Ember Laser', tag: 'BEAM', blurb: 'Continuous beam. Short range, mind the heat.', kind: 'beam', dps: 110, range: 40, heatRate: 0.34, coolRate: 0.45, ideal: 18, color: 0xff3df0 },
};

export const PAINTS = [
  { name: 'Cobalt', hex: 0x2f86ff, glow: 0x49d6ff },
  { name: 'Amber', hex: 0xffa51f, glow: 0xffd24a },
  { name: 'Venom', hex: 0x2fc06f, glow: 0x7dffb0 },
  { name: 'Crimson', hex: 0xd8303f, glow: 0xff5a6e },
  { name: 'Violet', hex: 0x8a5cff, glow: 0xd28cff },
  { name: 'Ghost', hex: 0xd8dee8, glow: 0x8ff3ff },
];

export function sustainedDps(w) {
  if (w.kind === 'beam') {
    const on = 1 / w.heatRate, off = 1 / w.coolRate;
    return (w.dps * on) / (on + off);
  }
  return (w.mag * w.damage) / (w.mag * w.interval + w.reload);
}

export function randomLoadout() {
  const pick = (o) => { const k = Object.keys(o); return k[Math.floor(Math.random() * k.length)]; };
  return { mobility: pick(MOBILITY), body: pick(BODIES), weapon: pick(WEAPONS) };
}

export function buildName(l) {
  return `${BODIES[l.body].name} · ${MOBILITY[l.mobility].name} · ${WEAPONS[l.weapon].name}`;
}

// ---------------------------------------------------------------------------
// Procedural robot meshes. Models face +Z.
// ---------------------------------------------------------------------------

function stdMat(color, metalness, roughness) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function makeMaterials(paint, glow) {
  const g = new THREE.Color(glow);
  return {
    paint: stdMat(paint, 0.45, 0.38),
    dark: stdMat(0x22262d, 0.7, 0.5),
    mid: stdMat(0x5b6370, 0.8, 0.35),
    tire: stdMat(0x131519, 0.1, 0.9),
    glow: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: g, emissiveIntensity: 3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a1a24, metalness: 0.9, roughness: 0.12, emissive: g, emissiveIntensity: 0.4 }),
  };
}

function B(parent, w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function C(parent, rt, rb, h, seg, m, x = 0, y = 0, z = 0, axis = 'y') {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  else if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function treadTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#23272e'; x.fillRect(0, 0, 32, 32);
  x.fillStyle = '#5f6672'; x.fillRect(0, 5, 32, 10);
  x.fillStyle = '#121418'; x.fillRect(0, 15, 32, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- mobility -------------------------------------------------------------

function buildWheels(g, M, rig) {
  B(g, 2.1, 0.45, 2.9, M.dark, 0, 0.85, 0);
  B(g, 1.6, 0.35, 2.3, M.paint, 0, 1.18, 0);
  B(g, 1.9, 0.1, 0.1, M.glow, 0, 0.9, 1.46);
  for (const sx of [-1, 1]) {
    B(g, 0.9, 0.18, 0.3, M.mid, sx * 0.95, 0.72, 1.05);
    B(g, 0.9, 0.18, 0.3, M.mid, sx * 0.95, 0.72, -1.05);
    for (const sz of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(sx * 1.35, 0.65, sz * 1.05);
      g.add(w);
      C(w, 0.65, 0.65, 0.55, 20, M.tire, 0, 0, 0, 'x');
      C(w, 0.36, 0.36, 0.6, 10, M.mid, 0, 0, 0, 'x');
      B(w, 0.62, 0.14, 1.0, M.dark);
      B(w, 0.62, 1.0, 0.14, M.dark);
      B(w, 0.64, 0.12, 0.12, M.glow, 0, 0.26, 0);
      rig.wheels.push(w);
    }
  }
}

function buildTracks(g, M, rig) {
  const tex = treadTexture();
  rig.treadTex = tex;
  const tread = new THREE.MeshStandardMaterial({ color: 0x8a919c, map: tex, metalness: 0.6, roughness: 0.7 });
  rig.extraMats.push(tread);
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 3.3), [M.dark, M.dark, tread, M.dark, M.dark, M.dark]);
    t.position.set(sx * 1.25, 0.52, 0);
    g.add(t);
    C(g, 0.5, 0.5, 0.85, 14, M.dark, sx * 1.25, 0.52, 1.65, 'x');
    C(g, 0.5, 0.5, 0.85, 14, M.dark, sx * 1.25, 0.52, -1.65, 'x');
    for (let i = 0; i < 4; i++) {
      const rw = new THREE.Group();
      rw.position.set(sx * 1.7, 0.45, -1.2 + i * 0.8);
      g.add(rw);
      C(rw, 0.3, 0.3, 0.1, 12, M.mid, 0, 0, 0, 'x');
      B(rw, 0.12, 0.5, 0.1, M.dark);
      rig.rollers.push(rw);
    }
    B(g, 0.12, 0.35, 3.0, M.paint, sx * 1.72, 0.98, 0);
  }
  B(g, 1.7, 0.75, 2.9, M.dark, 0, 0.9, 0);
  B(g, 1.2, 0.1, 0.1, M.glow, 0, 1.0, 1.46);
}

function buildLegs(g, M, rig) {
  B(g, 1.7, 0.55, 1.3, M.dark, 0, 2.45, 0);
  B(g, 1.0, 0.3, 0.9, M.mid, 0, 2.08, 0);
  rig.legs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 1.0, 2.45, 0);
    g.add(hip);
    C(hip, 0.32, 0.32, 0.55, 14, M.mid, 0, 0, 0, 'x');
    B(hip, 0.5, 1.3, 0.62, M.paint, 0, -0.65, 0.05);
    const knee = new THREE.Group();
    knee.position.set(0, -1.25, 0);
    hip.add(knee);
    C(knee, 0.27, 0.27, 0.58, 14, M.dark, 0, 0, 0, 'x');
    B(knee, 0.42, 1.2, 0.5, M.dark, 0, -0.6, -0.05);
    B(knee, 0.16, 0.5, 0.06, M.glow, 0, -0.5, 0.22);
    B(knee, 0.75, 0.22, 1.2, M.mid, 0, -1.09, 0.15);
    rig.legs.push({ hip, knee });
  }
}

// --- bodies ---------------------------------------------------------------

function bodyScout(g, M, b) {
  const { w, h, d } = b;
  B(g, w, h * 0.72, d * 0.82, M.paint, 0, h * 0.36, -0.12);
  const nose = B(g, w * 0.84, h * 0.46, 1.1, M.paint, 0, h * 0.3, d * 0.36);
  nose.rotation.x = 0.32;
  B(g, w * 0.56, h * 0.34, d * 0.42, M.glass, 0, h * 0.86, 0.2);
  B(g, w * 0.5, 0.09, 0.06, M.glow, 0, h * 0.5, d * 0.5 + 0.14);
  B(g, w * 0.72, h * 0.42, 0.34, M.dark, 0, h * 0.42, -d * 0.52);
  for (const sx of [-1, 1]) {
    B(g, 0.08, 0.62, 0.9, M.dark, sx * w * 0.3, h * 0.95, -d * 0.36);
    C(g, 0.17, 0.17, 0.1, 14, M.glow, sx * 0.42, h * 0.42, -d * 0.52 - 0.2, 'z');
  }
}

function bodyBrawler(g, M, b) {
  const { w, h, d } = b;
  B(g, w, h, d, M.paint, 0, h / 2, 0);
  B(g, w * 0.72, h * 0.46, 0.22, M.dark, 0, h * 0.48, d / 2 + 0.1);
  B(g, w * 0.5, 0.16, 0.08, M.glow, 0, h * 0.82, d / 2 + 0.04);
  B(g, w * 1.04, 0.3, d * 0.7, M.dark, 0, h + 0.1, -0.1);
  B(g, w * 0.6, h * 0.62, 0.36, M.dark, 0, h * 0.5, -d / 2 - 0.16);
  for (const sx of [-1, 1]) B(g, 0.12, 0.42, 0.05, M.glow, sx * w * 0.2, h * 0.5, -d / 2 - 0.36);
  C(g, 0.05, 0.05, 1.0, 6, M.mid, -w * 0.32, h + 0.7, -d * 0.3);
}

function bodyTitan(g, M, b) {
  const { w, h, d } = b;
  B(g, w, h * 0.9, d, M.paint, 0, h * 0.45, 0);
  B(g, w * 1.06, h * 0.32, d * 0.86, M.dark, 0, h * 0.94, -0.05);
  C(g, 0.62, 0.62, 0.1, 24, M.dark, 0, h * 0.46, d / 2 + 0.02, 'z');
  C(g, 0.46, 0.46, 0.12, 24, M.glow, 0, h * 0.46, d / 2 + 0.06, 'z');
  B(g, w * 0.44, 0.18, 0.08, M.glow, 0, h * 0.94, d * 0.43 + 0.05);
  for (const sx of [-1, 1]) {
    B(g, 0.2, h * 0.7, d * 0.8, M.dark, sx * (w / 2 + 0.05), h * 0.42, 0);
    B(g, 0.5, 0.55, 0.5, M.mid, sx * w * 0.3, h * 1.2, -d * 0.3);
  }
  C(g, 0.04, 0.04, 1.5, 6, M.mid, -w * 0.3, h * 1.1 + 0.75, -d * 0.35);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.glow);
  tip.position.set(-w * 0.3, h * 1.1 + 1.5, -d * 0.35);
  g.add(tip);
}

// --- weapons (return the muzzle) -----------------------------------------

function wGatling(g, M, rig) {
  C(g, 0.34, 0.38, 0.9, 16, M.dark, 0, 0, 0.1, 'z');
  B(g, 0.3, 0.45, 0.7, M.paint, 0, -0.32, -0.05);
  C(g, 0.36, 0.36, 0.08, 16, M.mid, 0, 0, -0.34, 'z');
  B(g, 0.08, 0.06, 0.6, M.glow, 0, 0.36, 0.1);
  const sp = new THREE.Group();
  sp.position.z = 0.55;
  g.add(sp);
  rig.spinners.push(sp);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    C(sp, 0.065, 0.065, 1.3, 8, M.mid, Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0.6, 'z');
  }
  C(sp, 0.29, 0.29, 0.12, 16, M.dark, 0, 0, 1.05, 'z');
  C(sp, 0.09, 0.09, 1.3, 8, M.dark, 0, 0, 0.6, 'z');
  const mz = new THREE.Object3D();
  mz.position.set(0, 0, 1.9);
  g.add(mz);
  return mz;
}

function wCannon(g, M) {
  B(g, 0.62, 0.62, 1.1, M.dark, 0, 0, -0.1);
  B(g, 0.5, 0.2, 0.9, M.paint, 0, 0.4, -0.1);
  C(g, 0.15, 0.2, 2.1, 14, M.mid, 0, 0.02, 1.45, 'z');
  B(g, 0.44, 0.34, 0.42, M.dark, 0, 0.02, 2.55);
  C(g, 0.23, 0.23, 0.1, 14, M.glow, 0, 0.02, 0.55, 'z');
  const mz = new THREE.Object3D();
  mz.position.set(0, 0.02, 2.85);
  g.add(mz);
  return mz;
}

function wRockets(g, M) {
  B(g, 0.95, 0.85, 1.2, M.paint, 0, 0.05, 0.1);
  B(g, 0.85, 0.75, 0.08, M.dark, 0, 0.05, 0.72);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) C(g, 0.11, 0.11, 0.06, 12, M.glow, -0.26 + i * 0.26, -0.12 + j * 0.34, 0.77, 'z');
  B(g, 0.2, 0.12, 0.9, M.dark, 0, 0.53, 0.1);
  const mz = new THREE.Object3D();
  mz.position.set(0, 0.05, 0.95);
  g.add(mz);
  return mz;
}

function wLaser(g, M) {
  C(g, 0.2, 0.3, 1.5, 16, M.dark, 0, 0, 0.4, 'z');
  for (const z of [0, 0.35, 0.7]) C(g, 0.31, 0.31, 0.07, 18, M.glow, 0, 0, z, 'z');
  C(g, 0.09, 0.16, 0.6, 12, M.mid, 0, 0, 1.4, 'z');
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), M.glow);
  lens.position.z = 1.72;
  g.add(lens);
  B(g, 0.14, 0.3, 0.8, M.paint, 0, 0.32, 0.2);
  const mz = new THREE.Object3D();
  mz.position.set(0, 0, 1.8);
  g.add(mz);
  return mz;
}

const MOB_BUILD = { wheels: buildWheels, tracks: buildTracks, legs: buildLegs };
const BODY_BUILD = { scout: bodyScout, brawler: bodyBrawler, titan: bodyTitan };
const WEAPON_BUILD = { gatling: wGatling, cannon: wCannon, rockets: wRockets, laser: wLaser };

export function buildRobotMesh(loadout, paint, glow) {
  const mob = MOBILITY[loadout.mobility];
  const body = BODIES[loadout.body];
  const s = body.scale;
  const M = makeMaterials(paint, glow);
  const root = new THREE.Group();
  const base = new THREE.Group();
  root.add(base);
  const rig = { root, base, mats: M, extraMats: [], wheels: [], rollers: [], treadTex: null, legs: null, spinners: [], pivots: [], muzzles: [] };

  const mobG = new THREE.Group();
  mobG.scale.setScalar(s);
  base.add(mobG);
  MOB_BUILD[loadout.mobility](mobG, M, rig);
  const mobH = mob.height * s;

  const torso = new THREE.Group();
  torso.position.y = mobH;
  root.add(torso);
  const inner = new THREE.Group();
  torso.add(inner);
  BODY_BUILD[loadout.body](inner, M, body);

  const mountY = body.h * 0.62;
  for (const sx of [-1, 1]) {
    B(inner, 0.55 * s, 0.32, 0.55, M.dark, sx * (body.w / 2 + 0.2 * s), mountY, 0.1);
    const pivot = new THREE.Group();
    pivot.position.set(sx * (body.w / 2 + 0.5 * s), mountY, 0.1);
    inner.add(pivot);
    const wg = new THREE.Group();
    wg.scale.setScalar(s);
    pivot.add(wg);
    rig.muzzles.push(WEAPON_BUILD[loadout.weapon](wg, M, rig));
    rig.pivots.push(pivot);
  }

  rig.torso = torso;
  rig.inner = inner;
  rig.mobH = mobH;
  rig.aimHeight = mobH + mountY;
  rig.height = mobH + body.h + 0.3;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return rig;
}

export function disposeRig(rig) {
  rig.root.removeFromParent();
  rig.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  for (const m of Object.values(rig.mats)) m.dispose();
  for (const m of rig.extraMats) m.dispose();
  if (rig.treadTex) rig.treadTex.dispose();
}
