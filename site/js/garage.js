import * as THREE from 'three';
import { MOBILITY, BODIES, WEAPONS, PAINTS, buildRobotMesh, disposeRig, sustainedDps } from './parts.js';

const $ = (id) => document.getElementById(id);

const ICONS = {
  wheels: '<svg viewBox="0 0 40 40"><rect x="7" y="12" width="26" height="9" rx="2"/><circle cx="12" cy="26" r="6"/><circle cx="28" cy="26" r="6"/><circle cx="12" cy="26" r="1.8"/><circle cx="28" cy="26" r="1.8"/></svg>',
  tracks: '<svg viewBox="0 0 40 40"><rect x="10" y="10" width="20" height="8" rx="1.5"/><rect x="5" y="20" width="30" height="11" rx="5.5"/><circle cx="11" cy="25.5" r="2"/><circle cx="17" cy="25.5" r="2"/><circle cx="23" cy="25.5" r="2"/><circle cx="29" cy="25.5" r="2"/></svg>',
  legs: '<svg viewBox="0 0 40 40"><rect x="12" y="6" width="16" height="7" rx="1.5"/><path d="M15 13 L11 22 L14 32 M25 13 L29 22 L26 32"/><path d="M10 33 H18 M22 33 H30"/></svg>',
  scout: '<svg viewBox="0 0 40 40"><path d="M8 24 L14 15 H26 L32 24 Z"/><path d="M16 15 L19 11 H23 L25 15"/><path d="M8 24 H32 V28 H8 Z"/></svg>',
  brawler: '<svg viewBox="0 0 40 40"><rect x="9" y="11" width="22" height="18" rx="2"/><path d="M14 16 H26"/><rect x="5" y="14" width="4" height="10"/><rect x="31" y="14" width="4" height="10"/></svg>',
  titan: '<svg viewBox="0 0 40 40"><rect x="6" y="9" width="28" height="23" rx="2"/><circle cx="20" cy="21" r="4.5"/><path d="M11 13 H29"/><path d="M13 9 V4"/></svg>',
  gatling: '<svg viewBox="0 0 40 40"><rect x="5" y="15" width="10" height="10" rx="2"/><path d="M15 16 H35 M15 20 H35 M15 24 H35"/><path d="M28 14 V26"/></svg>',
  cannon: '<svg viewBox="0 0 40 40"><rect x="4" y="14" width="12" height="12" rx="1.5"/><path d="M16 18 H31 V22 H16"/><rect x="31" y="16" width="5" height="8"/></svg>',
  rockets: '<svg viewBox="0 0 40 40"><rect x="6" y="9" width="28" height="22" rx="2"/><circle cx="13" cy="16" r="2.6"/><circle cx="20" cy="16" r="2.6"/><circle cx="27" cy="16" r="2.6"/><circle cx="13" cy="24" r="2.6"/><circle cx="20" cy="24" r="2.6"/><circle cx="27" cy="24" r="2.6"/></svg>',
  laser: '<svg viewBox="0 0 40 40"><path d="M4 16 H16 L20 18 V22 L16 24 H4 Z"/><path d="M20 20 H37" stroke-width="3"/><path d="M8 14 V26 M12 14 V26"/></svg>',
};

const SLOTS = { mobility: MOBILITY, body: BODIES, weapon: WEAPONS };
const STORE_KEY = 'roboarena.loadout.v1';

export class Garage {
  constructor(sfx) {
    this.sfx = sfx;
    this.onDeploy = null;
    this.el = $('garage');
    this.panel = this.el.querySelector('.panel');
    this.loadout = { mobility: 'legs', body: 'brawler', weapon: 'gatling', paint: 0 };
    this.difficulty = 'normal';
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && MOBILITY[saved.mobility] && BODIES[saved.body] && WEAPONS[saved.weapon]) this.loadout = { ...this.loadout, ...saved };
      if (saved && saved.difficulty) this.difficulty = saved.difficulty;
    } catch { /* storage unavailable */ }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    this.camTarget = new THREE.Vector3(0, 2, 0);
    this.camDist = 12;
    this.spin = 0.6;
    this.dragging = false;
    this.rig = null;
    this.time = 0;
    this.buildScene();
    this.buildUI();
    this.rebuild();
  }

  buildScene() {
    const s = this.scene;
    s.background = new THREE.Color(0x06080d);
    s.fog = new THREE.Fog(0x06080d, 30, 70);
    s.add(new THREE.HemisphereLight(0x9fb4ff, 0x080808, 0.6));
    const key = new THREE.SpotLight(0xffffff, 900, 45, 0.5, 0.6, 2);
    key.position.set(7, 13, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    s.add(key, key.target);
    const rim = new THREE.SpotLight(0x35e0ff, 700, 40, 0.6, 0.6, 2);
    rim.position.set(-8, 7, -7);
    s.add(rim, rim.target);
    const fill = new THREE.PointLight(0xff8a3d, 80, 25, 2);
    fill.position.set(7, 3, -5);
    s.add(fill);

    const grid = document.createElement('canvas');
    grid.width = grid.height = 128;
    const g = grid.getContext('2d');
    g.fillStyle = '#0b0f17'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#18202e'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128);
    const gt = new THREE.CanvasTexture(grid);
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
    gt.repeat.set(30, 30);
    gt.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: gt, metalness: 0.5, roughness: 0.45 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    const metal = new THREE.MeshStandardMaterial({ color: 0x1a1f28, metalness: 0.8, roughness: 0.35 });
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.7, 0.35, 64), metal);
    plat.position.y = 0.175;
    plat.receiveShadow = true;
    s.add(plat);
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x35e0ff).multiplyScalar(2.2) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.45, 0.05, 8, 128), glow);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.36;
    s.add(ring);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(5.6, 5.7, 128), glow);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.01;
    s.add(ring2);

    const barMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x35e0ff).multiplyScalar(0.9) });
    const barMat2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a3d).multiplyScalar(1.1) });
    for (let i = -7; i <= 7; i++) {
      const a = Math.PI + i * 0.16;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 9, 0.12), i % 3 === 0 ? barMat2 : barMat);
      bar.position.set(Math.sin(a) * 16, 4.5, Math.cos(a) * 16);
      s.add(bar);
    }
    const back = new THREE.Mesh(new THREE.CylinderGeometry(16.5, 16.5, 12, 48, 1, true, Math.PI - 1.3, 2.6), new THREE.MeshStandardMaterial({ color: 0x0d121b, side: THREE.BackSide, metalness: 0.4, roughness: 0.7 }));
    back.position.y = 6;
    s.add(back);

    this.turntable = new THREE.Group();
    this.turntable.position.y = 0.35;
    s.add(this.turntable);
  }

  buildUI() {
    for (const [slot, defs] of Object.entries(SLOTS)) {
      const wrap = this.el.querySelector(`.slot[data-slot="${slot}"] .opts`);
      for (const [id, d] of Object.entries(defs)) {
        const b = document.createElement('button');
        b.className = 'opt';
        b.dataset.slot = slot;
        b.dataset.id = id;
        b.innerHTML = `<span class="opt-icon">${ICONS[id]}</span><span class="opt-text"><b>${d.name}</b><small>${d.blurb}</small></span><span class="opt-tag">${d.tag}</span>`;
        b.addEventListener('click', () => {
          if (this.loadout[slot] === id) return;
          this.loadout[slot] = id;
          this.sfx.init();
          this.sfx.play('click');
          this.rebuild();
        });
        wrap.appendChild(b);
      }
    }
    const sw = $('swatches');
    PAINTS.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.title = p.name;
      b.setAttribute('aria-label', `${p.name} paint`);
      const hex = `#${p.hex.toString(16).padStart(6, '0')}`;
      b.style.background = hex;
      b.style.color = hex;
      b.addEventListener('click', () => {
        this.loadout.paint = i;
        this.sfx.init();
        this.sfx.play('click');
        this.rebuild();
      });
      sw.appendChild(b);
    });
    for (const b of $('difficulty').querySelectorAll('button')) {
      b.addEventListener('click', () => {
        this.difficulty = b.dataset.d;
        this.sfx.init();
        this.sfx.play('click');
        this.refreshUI();
        this.save();
      });
    }
    $('deploy').addEventListener('click', () => { if (this.onDeploy) this.onDeploy({ ...this.loadout }, this.difficulty); });

    const canvas = $('game');
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.el.classList.contains('show')) return;
      this.dragging = true;
      this.dragX = e.clientX;
    });
    addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.turntable.rotation.y += (e.clientX - this.dragX) * 0.01;
      this.dragX = e.clientX;
      this.spin = 0;
    });
    addEventListener('pointerup', () => { this.dragging = false; });
  }

  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...this.loadout, difficulty: this.difficulty })); } catch { /* ignore */ }
  }

  rebuild() {
    if (this.rig) disposeRig(this.rig);
    const paint = PAINTS[this.loadout.paint] || PAINTS[0];
    this.rig = buildRobotMesh(this.loadout, paint.hex, paint.glow);
    this.rig.root.rotation.y = 0;
    this.turntable.add(this.rig.root);
    const h = this.rig.height;
    this.camTarget.set(0, 0.35 + h * 0.5, 0);
    this.camDist = 5.5 + h * 1.7;
    this.refreshUI();
    this.save();
  }

  refreshUI() {
    for (const b of this.el.querySelectorAll('.opt')) b.classList.toggle('sel', this.loadout[b.dataset.slot] === b.dataset.id);
    this.el.querySelectorAll('.swatch').forEach((b, i) => b.classList.toggle('sel', i === this.loadout.paint));
    for (const b of $('difficulty').querySelectorAll('button')) b.classList.toggle('sel', b.dataset.d === this.difficulty);

    const mob = MOBILITY[this.loadout.mobility], body = BODIES[this.loadout.body], wp = WEAPONS[this.loadout.weapon];
    const hp = body.hp + mob.hp;
    const eff = hp / (1 - mob.armor);
    const speed = mob.speed * body.speedMul;
    const dps = sustainedDps(wp);
    const stats = [
      ['Durability', `${hp} HP${mob.armor ? ` · −${Math.round(mob.armor * 100)}% dmg` : ''}`, eff / 1800],
      ['Speed', `${speed.toFixed(1)} m/s`, speed / 18],
      ['Firepower', `${Math.round(dps)} DPS${wp.splash ? ' + splash' : ''}`, dps / 80],
      ['Range', `${wp.range} m`, wp.range / 110],
    ];
    $('stat-bars').innerHTML = stats.map(([k, v, f]) => `<div class="stat"><div class="stat-head"><span>${k}</span><b>${v}</b></div><div class="stat-track"><div class="stat-fill" style="width:${Math.min(100, f * 100).toFixed(0)}%"></div></div></div>`).join('');
    $('build-name').innerHTML = `<small>YOUR BUILD</small>${body.name} <span>on</span> ${mob.name.split(' ')[1]} <span>with</span> ${wp.name}`;
  }

  show(on) { this.el.classList.toggle('show', on); }

  resize(w, h) {
    this.camera.aspect = w / h;
    const wide = w > 820;
    if (wide) {
      const pw = this.panel.getBoundingClientRect().width;
      const sw = w > 1100 ? 334 : 0;
      this.camera.setViewOffset(w, h, -(pw - sw) / 2, 0, w, h);
    } else {
      const sheet = this.panel.getBoundingClientRect();
      const visible = h - sheet.height;
      this.camera.setViewOffset(w, h, 0, (h - visible) / 2 - 10, w, h);
    }
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.time += dt;
    if (!this.dragging) {
      this.spin = Math.min(0.6, this.spin + dt * 0.3);
      this.turntable.rotation.y += dt * this.spin;
    }
    const rig = this.rig;
    for (const sp of rig.spinners) sp.rotation.z += dt * 4;
    rig.inner.position.y = Math.sin(this.time * 2) * 0.05;
    const cam = this.camera;
    const portrait = cam.aspect < 1;
    const fov = portrait ? 55 : 36;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const dist = this.camDist * (portrait ? 1.6 : innerWidth <= 820 ? 1.25 : 1);
    const want = new THREE.Vector3(0, this.camTarget.y + 1.2 + dist * 0.12, dist);
    cam.position.lerp(want, 1 - Math.exp(-dt * 5));
    cam.lookAt(this.camTarget);
  }
}
