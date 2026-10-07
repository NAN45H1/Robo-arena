import * as THREE from 'three';
import { BOOST_CD } from './robot.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export class Hud {
  constructor() {
    this.root = $('hud');
    this.e = {
      pFill: $('p-fill'), pGhost: $('p-ghost'), pHp: $('p-hp'), pName: $('p-name'),
      eFill: $('e-fill'), eGhost: $('e-ghost'), eHp: $('e-hp'), eName: $('e-name'),
      round: $('round-label'), sp: $('score-p'), se: $('score-e'),
      cross: $('crosshair'), hit: $('hitmarker'), reload: $('reload-ring'), reloadArc: $('reload-arc'),
      tag: $('enemy-tag'), tagFill: $('tag-fill'), tagDist: $('tag-dist'), off: $('offscreen'),
      wName: $('w-name'), wAmmo: $('w-ammo'), wFill: $('w-fill'), wBar: $('w-bar'), wState: $('w-state'),
      boostFill: $('boost-fill'), boost: $('boost-box'),
      center: $('center-msg'), cBig: $('c-big'), cSmall: $('c-small'),
      nums: $('numbers'), vig: $('vignette'), low: $('lowhp'), map: $('minimap'), hint: $('controls-hint'), toast: $('toast'),
    };
    this.ctx = this.e.map.getContext('2d');
    this.ghostP = 1;
    this.ghostE = 1;
    this.vig = 0;
    this.centerT = 0;
    this.toastT = 0;
    this.cache = {};
  }

  show(on) { this.root.classList.toggle('show', on); }

  txt(key, el, value) { if (this.cache[key] !== value) { this.cache[key] = value; el.textContent = value; } }
  sty(key, el, prop, value) { if (this.cache[key] !== value) { this.cache[key] = value; el.style[prop] = value; } }
  cls(key, el, name, on) { if (this.cache[key] !== on) { this.cache[key] = on; el.classList.toggle(name, on); } }

  setup(game) {
    this.cache = {};
    this.ghostP = this.ghostE = 1;
    this.e.pName.textContent = 'YOU';
    this.e.eName.textContent = game.enemy.name;
    this.e.wName.textContent = game.player.weapon.name;
    this.e.hint.classList.remove('fade');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.e.hint.classList.add('fade'), 14000);
  }

  center(big, small = '', dur = 1.6, kind = '') {
    const c = this.e.center;
    this.e.cBig.textContent = big;
    this.e.cSmall.textContent = small;
    c.className = kind;
    void c.offsetWidth;
    c.classList.add('show');
    this.centerT = dur;
  }

  toast(text) {
    this.e.toast.textContent = text;
    this.e.toast.classList.add('show');
    this.toastT = 1.4;
  }

  hitMarker(kill = false) {
    const h = this.e.hit;
    h.classList.remove('show', 'kill');
    void h.offsetWidth;
    h.classList.add('show');
    if (kill) h.classList.add('kill');
  }

  hurt(amount) { this.vig = Math.min(1, this.vig + amount / 110 + 0.12); }

  number(x, y, amount, big) {
    const d = document.createElement('div');
    d.className = big ? 'num big' : 'num';
    d.textContent = Math.round(amount);
    d.style.left = `${x + (Math.random() - 0.5) * 30}px`;
    d.style.top = `${y + (Math.random() - 0.5) * 16}px`;
    d.addEventListener('animationend', () => d.remove());
    this.e.nums.appendChild(d);
  }

  update(game, dt) {
    const P = game.player, E = game.enemy, e = this.e, cam = game.camera;
    const W = innerWidth, H = innerHeight;

    // Health bars
    const pf = Math.max(0, P.hp / P.maxHp), ef = Math.max(0, E.hp / E.maxHp);
    this.ghostP = Math.max(pf, this.ghostP - dt * 0.35);
    this.ghostE = Math.max(ef, this.ghostE - dt * 0.35);
    this.sty('pf', e.pFill, 'width', `${(pf * 100).toFixed(1)}%`);
    this.sty('pg', e.pGhost, 'width', `${(this.ghostP * 100).toFixed(1)}%`);
    this.sty('ef', e.eFill, 'width', `${(ef * 100).toFixed(1)}%`);
    this.sty('eg', e.eGhost, 'width', `${(this.ghostE * 100).toFixed(1)}%`);
    this.txt('php', e.pHp, `${Math.ceil(P.hp)}`);
    this.txt('ehp', e.eHp, `${Math.ceil(E.hp)}`);
    this.txt('round', e.round, `ROUND ${game.round}`);
    this.txt('sp', e.sp, `${game.score[0]}`);
    this.txt('se', e.se, `${game.score[1]}`);

    // Weapon panel
    const wp = P.weapon;
    if (wp.kind === 'beam') {
      this.txt('ammo', e.wAmmo, `${Math.round(P.heat * 100)}%`);
      this.txt('wstate', e.wState, P.overheated ? 'OVERHEATED' : 'HEAT');
      this.sty('wfill', e.wFill, 'width', `${(P.heat * 100).toFixed(1)}%`);
      this.cls('whot', e.wBar, 'hot', P.overheated || P.heat > 0.75);
      this.cls('wrel', e.wBar, 'reloading', false);
    } else {
      const rel = P.reloadT > 0;
      this.txt('ammo', e.wAmmo, rel ? '—' : `${P.ammo}/${wp.mag}`);
      this.txt('wstate', e.wState, rel ? 'RELOADING' : 'AMMO');
      const frac = rel ? 1 - P.reloadT / wp.reload : P.ammo / wp.mag;
      this.sty('wfill', e.wFill, 'width', `${(frac * 100).toFixed(1)}%`);
      this.cls('wrel', e.wBar, 'reloading', rel);
      this.cls('whot', e.wBar, 'hot', false);
    }
    const bf = 1 - P.boostCd / BOOST_CD;
    this.sty('bf', e.boostFill, 'width', `${(bf * 100).toFixed(1)}%`);
    this.cls('bready', e.boost, 'ready', bf >= 1);

    // Crosshair + reload ring
    this.cls('xenemy', e.cross, 'enemy', game.aimOnEnemy);
    this.cls('xzoom', e.cross, 'zoom', game.zoomed);
    const reloading = wp.kind !== 'beam' && P.reloadT > 0;
    const heatRing = wp.kind === 'beam' && P.heat > 0.02;
    this.cls('rr', e.reload, 'show', reloading || heatRing);
    if (reloading || heatRing) {
      const f = reloading ? 1 - P.reloadT / wp.reload : P.heat;
      this.sty('rarc', e.reloadArc, 'strokeDashoffset', `${(113 * (1 - f)).toFixed(1)}`);
      this.cls('rhot', e.reload, 'hot', heatRing && (P.overheated || P.heat > 0.75));
    }

    // Enemy tag / off-screen arrow
    _v.set(E.pos.x, E.pos.y + E.height + 1.3, E.pos.z).project(cam);
    const behind = _v.z > 1;
    const sx = ((_v.x + 1) / 2) * W, sy = ((1 - _v.y) / 2) * H;
    const onScreen = !behind && sx > 0 && sx < W && sy > 0 && sy < H;
    const dist = Math.hypot(E.pos.x - P.pos.x, E.pos.z - P.pos.z);
    this.cls('tagshow', e.tag, 'show', onScreen && E.alive);
    if (onScreen) {
      e.tag.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%, -100%)`;
      this.sty('tagf', e.tagFill, 'width', `${(ef * 100).toFixed(1)}%`);
      this.txt('tagd', e.tagDist, `${Math.round(dist)} m`);
    }
    this.cls('offshow', e.off, 'show', !onScreen && E.alive);
    if (!onScreen && E.alive) {
      let ax = _v.x, ay = _v.y;
      if (behind) { ax = -ax; ay = -ay; }
      const ang = Math.atan2(-ay, ax);
      const rx = W / 2 - 60, ry = H / 2 - 60;
      const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-6), ry / Math.abs(Math.sin(ang) || 1e-6));
      const x = W / 2 + Math.cos(ang) * k, y = H / 2 + Math.sin(ang) * k;
      e.off.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -50%) rotate(${ang}rad)`;
    }

    // Damage vignette + low HP
    this.vig = Math.max(0, this.vig - dt * 1.4);
    this.sty('vig', e.vig, 'opacity', this.vig.toFixed(2));
    this.cls('low', e.low, 'show', P.alive && pf < 0.3);

    if (this.centerT > 0) {
      this.centerT -= dt;
      if (this.centerT <= 0) e.center.classList.remove('show');
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) e.toast.classList.remove('show');
    }

    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const ctx = this.ctx, S = this.e.map.width, R = S / 2;
    const P = game.player, E = game.enemy, A = game.arena;
    const yaw = game.camYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const scale = R / 62;
    const tx = (x, z) => {
      const dx = x - P.pos.x, dz = z - P.pos.z;
      return [R + (dx * rx + dz * rz) * scale, R - (dx * fx + dz * fz) * scale];
    };
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(8, 12, 20, 0.78)';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(53, 224, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let r = 20; r < R; r += 20) { ctx.beginPath(); ctx.arc(R, R, r, 0, Math.PI * 2); ctx.stroke(); }

    for (const b of A.boxes) {
      ctx.fillStyle = b.wall ? 'rgba(53, 224, 255, 0.35)' : b.maxY < 2.6 ? 'rgba(150, 165, 190, 0.45)' : 'rgba(190, 205, 230, 0.75)';
      ctx.beginPath();
      const pts = [tx(b.minX, b.minZ), tx(b.maxX, b.minZ), tx(b.maxX, b.maxZ), tx(b.minX, b.maxZ)];
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fill();
    }
    for (const p of A.pickups) {
      if (!p.active) continue;
      const [x, y] = tx(p.pos.x, p.pos.z);
      ctx.fillStyle = '#3dffa0';
      ctx.fillRect(x - 5, y - 1.5, 10, 3);
      ctx.fillRect(x - 1.5, y - 5, 3, 10);
    }
    if (E.alive) {
      const [x, y] = tx(E.pos.x, E.pos.z);
      ctx.fillStyle = '#ff4d5e';
      ctx.shadowColor = '#ff4d5e';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // Player arrow (camera forward is always up)
    ctx.fillStyle = '#35e0ff';
    ctx.beginPath();
    ctx.moveTo(R, R - 8);
    ctx.lineTo(R + 6, R + 6);
    ctx.lineTo(R, R + 3);
    ctx.lineTo(R - 6, R + 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(53, 224, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
}
