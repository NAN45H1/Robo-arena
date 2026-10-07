// Tiny synthesized sound kit (no audio files needed).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.loops = new Map();
    this.vol = 0.5;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(c.destination);
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, 0.02);
  }

  _noise(dur, type, f0, f1, vol, t0 = 0, q = 1) {
    const c = this.ctx, t = c.currentTime + t0;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(Math.max(vol, 0.0001), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  _tone(type, f0, f1, dur, vol, t0 = 0) {
    const c = this.ctx, t = c.currentTime + t0;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(Math.max(vol, 0.0001), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name, v = 1) {
    if (!this.ctx || this.muted || v < 0.02) return;
    v = Math.min(1, v);
    switch (name) {
      case 'bullet': this._noise(0.07, 'bandpass', 2600, 900, 0.3 * v, 0, 0.9); this._tone('square', 170, 60, 0.05, 0.08 * v); break;
      case 'shell': this._tone('sine', 150, 36, 0.5, 0.9 * v); this._noise(0.4, 'lowpass', 2400, 180, 0.6 * v); break;
      case 'rocket': this._noise(0.35, 'bandpass', 500, 2600, 0.3 * v, 0, 1.6); this._tone('sawtooth', 260, 640, 0.14, 0.04 * v); break;
      case 'explosion': this._noise(1.0, 'lowpass', 1400, 60, 0.9 * v); this._tone('sine', 95, 30, 0.6, 0.7 * v); break;
      case 'bigboom': this._noise(1.8, 'lowpass', 1800, 40, 1.0 * v); this._tone('sine', 70, 22, 1.2, 1.0 * v); this._noise(0.6, 'highpass', 3000, 800, 0.3 * v, 0.1); break;
      case 'impact': this._noise(0.06, 'highpass', 4200, 1800, 0.12 * v); break;
      case 'hit': this._tone('square', 1350, 950, 0.04, 0.1 * v); break;
      case 'hurt': this._tone('sawtooth', 210, 80, 0.14, 0.16 * v); this._noise(0.1, 'highpass', 2600, 1200, 0.18 * v); break;
      case 'reload': this._tone('square', 480, 430, 0.04, 0.08 * v); this._tone('square', 760, 720, 0.04, 0.08 * v, 0.13); break;
      case 'reloaded': this._tone('triangle', 900, 1250, 0.09, 0.14 * v); break;
      case 'boost': this._noise(0.45, 'bandpass', 380, 3200, 0.45 * v, 0, 2); break;
      case 'jump': this._tone('sine', 170, 420, 0.2, 0.22 * v); this._noise(0.25, 'bandpass', 300, 1200, 0.2 * v, 0, 1.5); break;
      case 'land': this._tone('sine', 120, 45, 0.2, 0.4 * v); this._noise(0.16, 'lowpass', 900, 150, 0.25 * v); break;
      case 'pickup': [523, 659, 784, 1047].forEach((f, i) => this._tone('triangle', f, f * 1.01, 0.14, 0.18 * v, i * 0.07)); break;
      case 'overheat': this._noise(0.7, 'highpass', 5200, 1200, 0.28 * v); this._tone('sawtooth', 420, 140, 0.35, 0.08 * v); break;
      case 'beep': this._tone('square', 660, 660, 0.12, 0.12 * v); break;
      case 'go': this._tone('square', 990, 990, 0.35, 0.14 * v); this._tone('square', 1480, 1480, 0.35, 0.06 * v); break;
      case 'click': this._tone('triangle', 1200, 900, 0.05, 0.12 * v); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone('triangle', f, f, 0.25, 0.18 * v, i * 0.11)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this._tone('sawtooth', f, f * 0.98, 0.3, 0.09 * v, i * 0.16)); break;
      default: break;
    }
  }

  // Continuous laser hum, one per robot.
  loop(key, on, v = 1) {
    if (!this.ctx) return;
    const c = this.ctx;
    let L = this.loops.get(key);
    if (on && !L) {
      const o1 = c.createOscillator(), o2 = c.createOscillator(), lfo = c.createOscillator();
      o1.type = 'sawtooth'; o1.frequency.value = 128;
      o2.type = 'square'; o2.frequency.value = 259;
      lfo.frequency.value = 22;
      const lfoGain = c.createGain(); lfoGain.gain.value = 0.35;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1700;
      const trem = c.createGain(); trem.gain.value = 0.65;
      const g = c.createGain(); g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(trem); trem.connect(g); g.connect(this.master);
      lfo.connect(lfoGain); lfoGain.connect(trem.gain);
      o1.start(); o2.start(); lfo.start();
      L = { g };
      this.loops.set(key, L);
    }
    if (L) L.g.gain.setTargetAtTime(on && !this.muted ? 0.16 * Math.min(1, v) : 0, c.currentTime, on ? 0.03 : 0.06);
  }

  stopLoops() {
    for (const k of this.loops.keys()) this.loop(k, false);
  }
}
