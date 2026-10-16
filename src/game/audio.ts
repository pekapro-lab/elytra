export class GardenAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private drone: OscillatorNode | null = null;
  private music = 0;
  private step = 0;
  private lastShot = 0;
  muted = false;

  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.2;
      master.connect(ctx.destination);
      const drone = ctx.createOscillator();
      const dg = ctx.createGain();
      drone.type = "sine";
      drone.frequency.value = 73.4;
      dg.gain.value = 0.035;
      drone.connect(dg);
      dg.connect(master);
      drone.start();
      this.ctx = ctx;
      this.master = master;
      this.drone = drone;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.2, now + 0.05);
  }

  tick(dt: number, playing: boolean) {
    if (!playing || this.muted || !this.ctx) return;
    this.music += dt;
    if (this.music < 0.48) return;
    this.music = 0;
    const scale = [146.83, 174.61, 196, 220, 261.63, 196, 174.61];
    const freq = scale[this.step % scale.length];
    this.step += 1;
    this.tone(freq, 0.32, "triangle", 0.028);
    if (this.step % 4 === 0) this.tone(freq / 2, 0.4, "sine", 0.02);
  }

  queen(active: boolean) {
    if (!this.drone || !this.ctx) return;
    this.drone.frequency.setTargetAtTime(active ? 55 : 73.4, this.ctx.currentTime, 0.4);
  }

  shoot() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastShot < 0.07) return;
    this.lastShot = now;
    this.tone(720, 0.045, "square", 0.03, -380);
  }

  hurt() {
    this.tone(160, 0.14, "sawtooth", 0.05, -90);
  }

  explode(big: boolean) {
    this.noise(big ? 0.38 : 0.16, big ? 0.12 : 0.06);
    this.tone(big ? 90 : 180, big ? 0.32 : 0.12, "triangle", big ? 0.06 : 0.03, -40);
  }

  pickup() {
    this.tone(520, 0.08, "triangle", 0.04);
    this.tone(780, 0.1, "sine", 0.035);
  }

  bomb() {
    this.tone(180, 0.28, "sawtooth", 0.05, 220);
    this.noise(0.3, 0.08);
  }

  die() {
    this.tone(220, 0.4, "sawtooth", 0.06, -160);
    this.noise(0.45, 0.1);
  }

  dispose() {
    try {
      this.drone?.stop();
      void this.ctx?.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
    this.master = null;
    this.drone = null;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slide = 0,
  ) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    }
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number) {
    if (!this.ctx || !this.master || this.muted) return;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    const amp = this.ctx.createGain();
    amp.gain.value = gain;
    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    src.start();
  }
}
