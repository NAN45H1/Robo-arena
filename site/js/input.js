// Keyboard + mouse (pointer lock) + touch controls.
export class Input {
  constructor(canvas, isTouch) {
    this.canvas = canvas;
    this.isTouch = isTouch;
    this.keys = new Set();
    this.pressed = new Set();
    this.dx = 0;
    this.dy = 0;
    this.fire = false;
    this.zoom = false;
    this.locked = false;
    this.freeLook = false;
    this.enabled = false;
    this.onLockChange = null;
    this.stick = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
    this.look = { id: null, x: 0, y: 0 };

    addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.fire = false; this.zoom = false; });
    addEventListener('mousemove', (e) => {
      if (!this.enabled || this.isTouch) return;
      if (this.locked || this.freeLook) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.isTouch) return;
      if (!this.locked && !this.freeLook) { this.lock(); return; }
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.zoom = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.zoom = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.fire = false; this.zoom = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.freeLook = true; });
    if (isTouch) this.setupTouch();
  }

  lock() {
    if (this.isTouch || this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.freeLook = true; });
    } catch {
      this.freeLook = true;
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setupTouch() {
    const layer = document.getElementById('touch');
    const stickEl = document.getElementById('stick');
    const knob = document.getElementById('knob');
    const btn = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('on');
        down();
      });
      const rel = () => { el.classList.remove('on'); if (up) up(); };
      el.addEventListener('pointerup', rel);
      el.addEventListener('pointercancel', rel);
      el.addEventListener('pointerleave', rel);
    };
    btn('t-fire', () => { this.fire = true; }, () => { this.fire = false; });
    btn('t-jump', () => this.pressed.add('Space'));
    btn('t-boost', () => this.pressed.add('ShiftLeft'));
    btn('t-reload', () => this.pressed.add('KeyR'));
    btn('t-zoom', () => { this.zoom = !this.zoom; });

    const resetStick = () => {
      this.stick.id = null;
      this.stick.x = this.stick.y = 0;
      knob.style.transform = '';
      stickEl.classList.remove('active');
      stickEl.style.left = '';
      stickEl.style.top = '';
    };
    layer.addEventListener('pointerdown', (e) => {
      if (e.target !== layer) return;
      layer.setPointerCapture(e.pointerId);
      if (e.clientX < innerWidth * 0.45 && this.stick.id === null) {
        this.stick.id = e.pointerId;
        this.stick.ox = e.clientX;
        this.stick.oy = e.clientY;
        stickEl.classList.add('active');
        stickEl.style.left = `${e.clientX - 65}px`;
        stickEl.style.top = `${e.clientY - 65}px`;
      } else if (this.look.id === null) {
        this.look.id = e.pointerId;
        this.look.x = e.clientX;
        this.look.y = e.clientY;
      }
    });
    layer.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stick.id) {
        let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
        const m = Math.hypot(dx, dy), max = 55;
        if (m > max) { dx *= max / m; dy *= max / m; }
        this.stick.x = dx / max;
        this.stick.y = dy / max;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (e.pointerId === this.look.id) {
        this.dx += (e.clientX - this.look.x) * 1.6;
        this.dy += (e.clientY - this.look.y) * 1.6;
        this.look.x = e.clientX;
        this.look.y = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === this.stick.id) resetStick();
      if (e.pointerId === this.look.id) this.look.id = null;
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
  }

  consume(...codes) {
    let hit = false;
    for (const c of codes) if (this.pressed.delete(c)) hit = true;
    return hit;
  }

  axis() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (this.stick.id !== null) { x += this.stick.x; y -= this.stick.y; }
    return { x, y };
  }

  takeLook() {
    const r = { x: this.dx, y: this.dy };
    this.dx = this.dy = 0;
    return r;
  }

  endFrame() {
    this.pressed.clear();
  }
}
