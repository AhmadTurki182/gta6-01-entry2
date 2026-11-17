// audio.js — fully procedural WebAudio: 3 radio stations, engine hum, sirens,
// gunshots, footsteps, UI blips. No audio files, no network.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.radioOn = true;
    this.station = 0;
    this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null;
    this.radioTimer = null;
    this.stations = [
      { name: 'BAY FM 92.1 — Sunset Drive', scale: [0, 3, 5, 7, 10], base: 220, tempo: 0.42, wave: 'triangle' },
      { name: 'NEON 104.7 — Night Pulse', scale: [0, 2, 3, 7, 8, 10], base: 110, tempo: 0.24, wave: 'sawtooth' },
      { name: 'PALM 88.3 — Coastal Chill', scale: [0, 4, 5, 9, 11], base: 262, tempo: 0.6, wave: 'sine' },
    ];
    this.step = 0;
  }
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // engine: two detuned saws through a lowpass
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 60;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
      // siren: alternating two-tone
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine'; this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.startRadio();
    } catch (e) { /* audio unavailable: game still plays */ }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setEngine(rpm, inCar) {
    if (!this.ctx) return;
    this.engineOsc.frequency.value = 50 + rpm * 140;
    this.engineGain.gain.value = inCar ? 0.05 + rpm * 0.06 : 0;
  }
  setSiren(on, wanted) {
    if (!this.ctx) return;
    this.sirenGain.gain.value = on ? 0.05 + wanted * 0.008 : 0;
    if (on) this.sirenOsc.frequency.value = (Math.sin(performance.now() * 0.004) > 0 ? 750 : 950);
  }
  nextStation() {
    this.station = (this.station + 1) % this.stations.length;
    this.step = 0;
    return this.stations[this.station].name;
  }
  startRadio() {
    if (this.radioTimer) return;
    this.radioTimer = setInterval(() => {
      if (!this.ctx || !this.radioOn) return;
      const st = this.stations[this.station];
      const note = st.scale[this.step % st.scale.length] + 12 * Math.floor((this.step / st.scale.length) % 2);
      const freq = st.base * Math.pow(2, note / 12);
      const o = this.ctx.createOscillator();
      o.type = st.wave; o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.09, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + st.tempo * 0.95);
      o.connect(g); g.connect(this.master);
      o.start(); o.stop(this.ctx.currentTime + st.tempo);
      // bass note every 4 steps
      if (this.step % 4 === 0) {
        const b = this.ctx.createOscillator(); b.type = 'sine'; b.frequency.value = st.base / 2;
        const bg = this.ctx.createGain();
        bg.gain.setValueAtTime(0.12, this.ctx.currentTime);
        bg.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + st.tempo * 1.8);
        b.connect(bg); bg.connect(this.master);
        b.start(); b.stop(this.ctx.currentTime + st.tempo * 1.8);
      }
      this.step++;
    }, 260);
  }
  blip(freq = 880) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + 0.13);
  }
  gunshot() {
    if (!this.ctx) return;
    const dur = 0.14;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = 0.35;
    src.connect(g); g.connect(this.master); src.start();
  }
  crash() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(120, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + 0.3);
  }
  coin() { this.blip(1320); setTimeout(() => this.blip(1760), 90); }
}
