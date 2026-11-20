/* Independent effects/music settings and lifecycle facade, inspired by flutter/games. All notes original. */
export class TableAudio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.timer = null;
    this.active = true;
    this.step = 0;
  }
  async unlock() {
    try {
      if (!this.ctx)
        this.ctx = new (
          globalThis.AudioContext || globalThis.webkitAudioContext
        )();
      if (this.active && this.ctx.state === "suspended")
        await this.ctx.resume();
      this.sync();
    } catch {}
  }
  tone(freq, duration = 0.12, volume = 0.12, when = 0, type = "sine") {
    if (!this.ctx || !this.active || this.ctx.state !== "running") return;
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain(),
      t = this.ctx.currentTime + when;
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume * this.settings.volume, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + duration + 0.02);
  }
  effect(name) {
    if (!this.settings.sfx) return;
    const seq = {
      select: [520],
      deal: [300, 400],
      pass: [230, 180],
      play: [440, 660],
      bid: [440, 550, 660],
      bomb: [100, 75, 55, 220],
      win: [392, 494, 587, 784],
      lose: [330, 294, 220],
      error: [130, 120],
    }[name] || [440];
    seq.forEach((f, i) =>
      this.tone(
        f,
        name === "bomb" ? 0.35 : 0.15,
        0.16,
        i * 0.075,
        name === "bomb" ? "triangle" : "sine",
      ),
    );
  }
  sync() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.active && this.settings.music && this.ctx?.state === "running") {
      const melody = [
        196, 247, 294, 370, 330, 294, 247, 220, 196, 294, 392, 370, 330, 247,
        220, 247,
      ];
      this.timer = setInterval(() => {
        this.tone(melody[this.step++ % melody.length], 0.55, 0.055);
        if (this.step % 4 === 0) this.tone(98, 0.9, 0.04);
      }, 360);
    }
  }
  pause() {
    this.active = false;
    clearInterval(this.timer);
    this.timer = null;
    this.ctx?.suspend().catch(() => {});
  }
  resume() {
    this.active = true;
    if (this.ctx)
      this.ctx
        .resume()
        .then(() => this.sync())
        .catch(() => {});
  }
}
