import { GardenAudio } from "./audio";
import { drawWorld } from "./render";
import type { World } from "./render";
import {
  HI_KEY,
  type Bit,
  type Enemy,
  type Floater,
  type HudSnapshot,
  type Kind,
  type Leaf,
  type Mode,
  type Mote,
  type Pickup,
  type PickupKind,
  type Player,
  type Pulse,
  type Shot,
  type Spawn,
  type Tone,
  type Weapon,
} from "./types";

const STEP = 1 / 60;
const GAME_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "Space",
  "KeyP",
  "KeyM",
  "Enter",
]);

const BASE_HP: Record<Kind, number> = {
  ant: 2,
  mosquito: 2,
  spider: 6,
  scorpion: 14,
  queen: 96,
};

const BASE_SCORE: Record<Kind, number> = {
  ant: 100,
  mosquito: 150,
  spider: 250,
  scorpion: 400,
  queen: 2500,
};

const CONTACT: Record<Kind, number> = {
  ant: 14,
  mosquito: 12,
  spider: 18,
  scorpion: 26,
  queen: 34,
};

interface Probe {
  getYaw: () => number;
  getSpeed: () => number;
  getX: () => number;
  getY: () => number;
  setKeys: (codes: string[]) => void;
  setSteer: (v: number) => void;
  applyDamage: (n: number) => void;
  getMode: () => Mode;
  getScore: () => number;
  getFriendlyShots: () => number;
}

declare global {
  interface Window {
    __controlsTest?: Probe;
  }
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function planWave(wave: number): Spawn[] {
  const cycle = ((wave - 1) % 5) + 1;
  const extra = wave > 5;
  const out: Spawn[] = [];
  const lane = (i: number, n: number) => 0.14 + (n === 1 ? 0.36 : (i / (n - 1)) * 0.72);

  if (cycle === 1) {
    out.push({ delay: 0.35, kind: "ant", x: 0.5 });
    const n = extra ? 7 : 5;
    for (let i = 0; i < n; i++) out.push({ delay: 0.85 + i * 0.38, kind: "ant", x: lane(i, n) });
  } else if (cycle === 2) {
    const n = extra ? 7 : 5;
    for (let i = 0; i < n; i++) {
      out.push({ delay: 0.3 + i * 0.42, kind: "mosquito", x: i % 2 === 0 ? 0.22 : 0.78 });
    }
  } else if (cycle === 3) {
    out.push({ delay: 0.25, kind: "spider", x: 0.3 });
    out.push({ delay: 1, kind: "spider", x: 0.72 });
    if (extra) out.push({ delay: 1.7, kind: "spider", x: 0.5 });
    for (let i = 0; i < 4; i++) out.push({ delay: 1.5 + i * 0.32, kind: "ant", x: lane(i, 4) });
  } else if (cycle === 4) {
    out.push({ delay: 0.3, kind: "scorpion", x: 0.5 });
    if (extra) out.push({ delay: 1.2, kind: "scorpion", x: 0.24 });
    for (let i = 0; i < 4; i++) {
      out.push({ delay: 0.55 + i * 0.4, kind: "mosquito", x: i % 2 ? 0.16 : 0.84 });
    }
  } else {
    out.push({ delay: 0.7, kind: "queen", x: 0.5 });
  }
  return out;
}

function readHi() {
  try {
    const n = Number(localStorage.getItem(HI_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export class MicroGame {
  private readonly canvas: HTMLCanvasElement;
  private readonly onHud: (hud: HudSnapshot) => void;
  private readonly audio = new GardenAudio();
  private readonly keys = new Set<string>();
  private injected: Set<string> | null = null;
  private steer = 0;
  private raf = 0;
  private dead = false;
  private last = 0;
  private acc = 0;
  private lastEmit = 0;
  private hudDirty = true;
  private dpr = 1;
  private w = 1;
  private h = 1;
  private time = 0;
  private scroll = 0;
  private shake = 0;
  private flash = 0;
  private hitstop = 0;
  private mode: Mode = "title";
  private paused = false;
  private score = 0;
  private hi = 0;
  private hiAtStart = 0;
  private newRecord = false;
  private wave = 1;
  private combo = 0;
  private comboT = 0;
  private weapon: Weapon = "aguijon";
  private weaponT = 0;
  private fireCd = 0;
  private bombCd = 0;
  private waveTime = 0;
  private rest = 0;
  private spawnIndex = 0;
  private spawns: Spawn[] = [];
  private banner = "";
  private bannerT = 0;
  private showHint = true;
  private pointer: { x: number; y: number } | null = null;
  private pid: number | null = null;
  private was = { bomb: false, pause: false, mute: false, confirm: false };
  private ro: ResizeObserver | null = null;
  private padBomb = false;
  private reduced = false;
  private queenAlive = false;

  private player: Player = {
    x: 180,
    y: 420,
    r: 10,
    hp: 100,
    maxHp: 100,
    bank: 0,
    invuln: 0,
    spd: 0,
    alive: true,
  };

  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private bits: Bit[] = [];
  private floaters: Floater[] = [];
  private pickups: Pickup[] = [];
  private pulses: Pulse[] = [];
  private leaves: Leaf[] = [];
  private motes: Mote[] = [];

  constructor(canvas: HTMLCanvasElement, onHud: (hud: HudSnapshot) => void) {
    this.canvas = canvas;
    this.onHud = onHud;
    this.hi = readHi();
    this.hiAtStart = this.hi;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.bind();
    this.resize();
    this.placeTitleBeetle();
    this.raf = requestAnimationFrame(this.frame);
    this.attachProbe();
    this.emit(true);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.unbind();
    this.audio.dispose();
    if (window.__controlsTest && window.__controlsTest.getMode === this.probe.getMode) {
      delete window.__controlsTest;
    }
  }

  play() {
    if (this.mode === "playing") return;
    this.audio.unlock();
    this.mode = "playing";
    this.paused = false;
    this.score = 0;
    this.wave = 1;
    this.combo = 0;
    this.comboT = 0;
    this.weapon = "aguijon";
    this.weaponT = 0;
    this.fireCd = 0.2;
    this.bombCd = 0;
    this.rest = 0;
    this.banner = "";
    this.bannerT = 0;
    this.newRecord = false;
    this.showHint = true;
    this.hiAtStart = this.hi;
    this.enemies.length = 0;
    this.shots.length = 0;
    this.bits.length = 0;
    this.floaters.length = 0;
    this.pickups.length = 0;
    this.pulses.length = 0;
    this.player.hp = this.player.maxHp;
    this.player.alive = true;
    this.player.invuln = 1.35;
    this.player.x = this.w / 2;
    this.player.y = this.band().max;
    this.player.bank = 0;
    this.beginWave();
    this.hudDirty = true;
  }

  bomb() {
    this.requestBomb();
  }

  togglePause() {
    if (this.mode !== "playing") return;
    this.paused = !this.paused;
    this.hudDirty = true;
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.hudDirty = true;
  }

  private probe: Probe = {
    getYaw: () => 0,
    getSpeed: () => this.player.spd,
    getX: () => this.player.x,
    getY: () => this.player.y,
    setKeys: (codes) => {
      this.injected = new Set(codes);
    },
    setSteer: (v) => {
      this.steer = Math.max(-1, Math.min(1, v));
    },
    applyDamage: (n) => {
      if (this.mode !== "playing") return;
      this.player.invuln = 0;
      this.hurt(n);
    },
    getMode: () => this.mode,
    getScore: () => this.score,
    getFriendlyShots: () => this.shots.filter((s) => s.friendly && s.life > 0).length,
  };

  private attachProbe() {
    const qa = import.meta.env.DEV || new URLSearchParams(location.search).has("qa");
    if (qa) window.__controlsTest = this.probe;
  }

  private bind() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearKeys);
    document.addEventListener("visibilitychange", this.clearKeys);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("contextmenu", this.onMenu);
    window.addEventListener("resize", this.resize);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
  }

  private unbind() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearKeys);
    document.removeEventListener("visibilitychange", this.clearKeys);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("contextmenu", this.onMenu);
    window.removeEventListener("resize", this.resize);
    this.ro?.disconnect();
    this.ro = null;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    this.audio.unlock();
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private clearKeys = () => {
    this.keys.clear();
    this.pointer = null;
    this.pid = null;
  };

  private onMenu = (e: Event) => {
    e.preventDefault();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.pid !== null) return;
    this.audio.unlock();
    this.pid = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.trackPointer(e);
    if (this.mode !== "playing") return;
    this.showHint = false;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.pid) return;
    this.trackPointer(e);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pid) return;
    this.pid = null;
    this.pointer = null;
  };

  private trackPointer(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 72,
    };
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const prevW = this.w;
    const prevH = this.h;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    if (prevW > 2 && prevH > 2 && (prevW !== w || prevH !== h)) {
      const sx = w / prevW;
      const sy = h / prevH;
      this.player.x *= sx;
      this.player.y *= sy;
      for (const enemy of this.enemies) {
        enemy.x *= sx;
        enemy.y *= sy;
      }
      for (const shot of this.shots) {
        shot.x *= sx;
        shot.y *= sy;
      }
    }
    this.w = w;
    this.h = h;
    this.seedGarden();
    this.clampPlayer();
  };

  private seedGarden() {
    const rand = mulberry32(11);
    const leaves: Leaf[] = [];
    for (let i = 0; i < 26; i++) {
      leaves.push({
        x: rand() * this.w,
        y: rand() * this.h,
        s: 28 + rand() * 78,
        rot: rand() * Math.PI,
        layer: rand() < 0.55 ? 0 : 1,
      });
    }
    const motes: Mote[] = [];
    for (let i = 0; i < 22; i++) {
      motes.push({
        x: rand() * this.w,
        y: rand() * this.h,
        z: rand(),
        p: rand() * Math.PI * 2,
        tone: rand() > 0.7 ? "gold" : "leaf",
      });
    }
    this.leaves = leaves;
    this.motes = motes;
  }

  private placeTitleBeetle() {
    this.player.x = this.w / 2;
    this.player.y = this.h * 0.4;
    this.player.alive = true;
  }

  private frame = (now: number) => {
    if (this.dead) return;
    if (!this.last) this.last = now;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.step(STEP);
      this.acc -= STEP;
      steps += 1;
    }
    this.draw();
    if (now - this.lastEmit > 100 || this.hudDirty) this.emit(false);
    this.raf = requestAnimationFrame(this.frame);
  };

  private step(dt: number) {
    this.time += dt;
    this.scroll += dt * (this.queenAlive ? 28 : 18);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 14);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (this.bannerT > 0) this.bannerT -= dt;

    const playing = this.mode === "playing" && !this.paused;
    this.audio.tick(dt, playing);

    if (this.mode === "title") {
      this.player.x = this.w / 2 + Math.sin(this.time * 0.7) * Math.min(36, this.w * 0.08);
      this.player.y = this.h * 0.38;
      this.player.bank = Math.sin(this.time * 0.7) * 0.18;
      this.player.spd = 0;
      this.edgeKeys(false);
      this.fx(dt);
      return;
    }

    if (!playing) {
      this.edgeKeys(false);
      this.fx(dt);
      return;
    }

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.edgeKeys(true);
      return;
    }

    this.updatePlayer(dt);
    this.updateWeapon(dt);
    this.updateDirector(dt);
    this.updateEnemies(dt);
    this.updateShots(dt);
    this.collide();
    this.fx(dt);
    const nextQueen = this.enemies.some((e) => e.kind === "queen" && !e.dead);
    if (nextQueen !== this.queenAlive) {
      this.queenAlive = nextQueen;
      this.audio.queen(nextQueen);
    }
    this.edgeKeys(true);
  }

  private activeKeys() {
    return this.injected ?? this.keys;
  }

  private edgeKeys(live: boolean) {
    const keys = this.activeKeys();
    const bomb = keys.has("Space");
    const pause = keys.has("KeyP");
    const mute = keys.has("KeyM");
    const confirm = keys.has("Enter");
    if (live && bomb && !this.was.bomb) this.requestBomb();
    if (pause && !this.was.pause && this.mode === "playing") this.togglePause();
    if (mute && !this.was.mute) this.toggleMute();
    if (confirm && !this.was.confirm && this.mode !== "playing") this.play();
    if (!live && bomb && !this.was.bomb && this.mode !== "playing") this.play();
    this.was = { bomb, pause, mute, confirm };
  }

  private band() {
    const max = this.h - 124;
    const min = Math.min(this.h * 0.56, max - 48);
    return { min, max };
  }

  private clampPlayer() {
    const pad = 22;
    const { min, max } = this.band();
    this.player.x = Math.max(pad, Math.min(this.w - pad, this.player.x));
    this.player.y = Math.max(min, Math.min(max, this.player.y));
  }

  private updatePlayer(dt: number) {
    const keys = this.activeKeys();
    let mx = 0;
    let my = 0;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) mx -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) mx += 1;
    if (keys.has("ArrowUp") || keys.has("KeyW")) my -= 1;
    if (keys.has("ArrowDown") || keys.has("KeyS")) my += 1;
    mx -= this.steer;
    const pad = this.readPad();
    mx += pad.x;
    my += pad.y;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    const speed = 290;
    let vx = 0;
    let vy = 0;
    if (this.pointer && this.injected === null) {
      const dx = this.pointer.x - this.player.x;
      const dy = this.pointer.y - this.player.y;
      const d = Math.hypot(dx, dy);
      if (d > 3) {
        const step = Math.min(d, 680 * dt);
        vx = (dx / d) * (step / dt);
        vy = (dy / d) * (step / dt);
        this.player.x += (dx / d) * step;
        this.player.y += (dy / d) * step;
      }
      this.showHint = false;
    } else {
      vx = mx * speed;
      vy = my * speed;
      this.player.x += vx * dt;
      this.player.y += vy * dt;
      if (mx !== 0 || my !== 0) this.showHint = false;
    }
    this.player.spd = Math.hypot(vx, vy);
    const targetBank = Math.max(-0.4, Math.min(0.4, mx * 0.38));
    this.player.bank += (targetBank - this.player.bank) * Math.min(1, dt * 10);
    if (this.player.invuln > 0) this.player.invuln -= dt;
    this.clampPlayer();
  }

  private readPad() {
    let x = 0;
    let y = 0;
    const pads = navigator.getGamepads?.();
    if (!pads) return { x, y };
    for (const pad of pads) {
      if (!pad) continue;
      let ax = pad.axes[0] ?? 0;
      let ay = pad.axes[1] ?? 0;
      const mag = Math.hypot(ax, ay);
      const dz = 0.18;
      if (mag < dz) {
        ax = 0;
        ay = 0;
      } else {
        const scale = (mag - dz) / ((1 - dz) * mag);
        ax *= scale;
        ay *= scale;
      }
      x += ax;
      y += ay;
      if (pad.buttons[14]?.pressed) x -= 1;
      if (pad.buttons[15]?.pressed) x += 1;
      if (pad.buttons[12]?.pressed) y -= 1;
      if (pad.buttons[13]?.pressed) y += 1;
      const bomb = !!pad.buttons[0]?.pressed;
      if (bomb && !this.padBomb) this.requestBomb();
      this.padBomb = bomb;
    }
    return { x, y };
  }

  private updateWeapon(dt: number) {
    if (this.weaponT > 0) {
      this.weaponT -= dt;
      if (this.weaponT <= 0) {
        this.weapon = "aguijon";
        this.weaponT = 0;
        this.hudDirty = true;
      }
    }
    if (this.bombCd > 0) this.bombCd = Math.max(0, this.bombCd - dt);
    this.fireCd -= dt;
    if (this.fireCd > 0 || !this.player.alive) return;
    this.fire();
    this.fireCd = this.weapon === "pulso" ? 0.07 : this.weapon === "abanico" ? 0.18 : 0.14;
  }

  private fire() {
    const y = this.player.y - 18;
    const speed = 640;
    const push = (angle: number, ox = 0) => {
      this.shots.push({
        x: this.player.x + ox,
        y,
        vx: Math.sin(angle) * speed,
        vy: -Math.cos(angle) * speed,
        r: 4,
        friendly: true,
        dmg: 1,
        life: 1.6,
      });
    };
    if (this.weapon === "abanico") {
      for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) push(a);
    } else {
      push(0, -7);
      push(0, 7);
    }
    this.audio.shoot();
    if (this.shots.length > 90) this.shots.splice(0, this.shots.length - 90);
  }

  private requestBomb() {
    if (this.mode !== "playing" || this.paused || this.bombCd > 0 || !this.player.alive) return;
    this.bombCd = 8;
    this.flash = 0.35;
    this.shake = Math.max(this.shake, 7);
    this.audio.bomb();
    this.pulses.push({ x: this.player.x, y: this.player.y, life: 0.45, max: 0.45 });
    for (const shot of this.shots) {
      if (!shot.friendly) shot.life = 0;
    }
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const d = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
      if (d < 230) this.damageEnemy(enemy, enemy.kind === "queen" ? 18 : 40);
    }
    try {
      navigator.vibrate?.(16);
    } catch {
      /* no haptics */
    }
    this.hudDirty = true;
  }

  private beginWave() {
    this.waveTime = 0;
    this.spawnIndex = 0;
    this.spawns = planWave(this.wave);
    const queen = this.spawns.some((s) => s.kind === "queen");
    this.banner = queen ? "La reina" : `Oleada ${this.wave}`;
    this.bannerT = 1.5;
    this.hudDirty = true;
  }

  private updateDirector(dt: number) {
    if (this.rest > 0) {
      this.rest -= dt;
      if (this.rest <= 0) {
        this.wave += 1;
        this.beginWave();
      }
      return;
    }
    this.waveTime += dt;
    while (this.spawnIndex < this.spawns.length && this.spawns[this.spawnIndex].delay <= this.waveTime) {
      const spawn = this.spawns[this.spawnIndex];
      this.spawnEnemy(spawn.kind, spawn.x);
      this.spawnIndex += 1;
    }
    if (this.spawnIndex >= this.spawns.length && this.enemies.every((e) => e.dead)) {
      this.enemies.length = 0;
      this.rest = 1.25;
    }
  }

  private loopScale() {
    return 1 + Math.floor((this.wave - 1) / 5) * 0.4;
  }

  private spawnEnemy(kind: Kind, xNorm: number, y?: number) {
    if (this.enemies.length > 28 && kind !== "queen") return;
    const scale = this.loopScale();
    const speedBoost = 1 + Math.floor((this.wave - 1) / 5) * 0.07;
    const hp = Math.max(1, Math.round(BASE_HP[kind] * (kind === "queen" ? 1 + (scale - 1) * 0.8 : scale)));
    const radii: Record<Kind, number> = { ant: 12, mosquito: 11, spider: 16, scorpion: 18, queen: 28 };
    const vy: Record<Kind, number> = {
      ant: 78,
      mosquito: 128,
      spider: 62,
      scorpion: 42,
      queen: 36,
    };
    const enemy: Enemy = {
      kind,
      x: Math.max(24, Math.min(this.w - 24, xNorm * this.w)),
      y: y ?? -36,
      vx: kind === "spider" ? 90 : 0,
      vy: vy[kind] * speedBoost,
      hp,
      maxHp: hp,
      r: radii[kind],
      phase: Math.random() * Math.PI * 2,
      shoot: kind === "queen" ? 1.1 : 0.8 + Math.random() * 0.6,
      aux: kind === "queen" ? 3.2 : 0.6,
      score: BASE_SCORE[kind],
      dead: false,
    };
    this.enemies.push(enemy);
    if (kind === "queen") {
      this.floaters.push({
        x: enemy.x,
        y: this.h * 0.3,
        text: "Reina avispa",
        life: 1.4,
        max: 1.4,
        tone: "gold",
      });
    }
  }

  private updateEnemies(dt: number) {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.phase += dt;
      if (enemy.kind === "ant") {
        enemy.y += enemy.vy * dt;
      } else if (enemy.kind === "mosquito") {
        enemy.x += Math.sin(enemy.phase * 4.2) * 70 * dt;
        enemy.y += enemy.vy * dt;
      } else if (enemy.kind === "spider") {
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        enemy.aux -= dt;
        if (enemy.x < 28 || enemy.x > this.w - 28 || enemy.aux <= 0) {
          enemy.vx *= -1;
          enemy.aux = 0.55 + Math.random() * 0.35;
          enemy.x = Math.max(28, Math.min(this.w - 28, enemy.x));
        }
      } else if (enemy.kind === "scorpion") {
        enemy.x += Math.sin(enemy.phase * 1.4) * 36 * dt;
        enemy.y += enemy.vy * dt;
      } else {
        const targetY = this.h * 0.2;
        enemy.y += (targetY - enemy.y) * Math.min(1, dt * 1.4);
        enemy.x = this.w * 0.5 + Math.sin(enemy.phase * 0.8) * this.w * 0.28;
        enemy.aux -= dt;
        if (enemy.aux <= 0 && this.enemies.length < 24) {
          enemy.aux = 3.6;
          this.spawnEnemy("ant", enemy.x / this.w - 0.06, enemy.y + 24);
          this.spawnEnemy("mosquito", enemy.x / this.w + 0.06, enemy.y + 20);
        }
      }

      if (enemy.kind !== "ant" && enemy.kind !== "queen") this.enemyShoot(enemy, dt);
      if (enemy.kind === "queen") this.queenShoot(enemy, dt);

      if (enemy.kind !== "queen" && enemy.y > this.h + 48) enemy.dead = true;
    }
    this.compactEnemies();
  }

  private enemyShoot(enemy: Enemy, dt: number) {
    enemy.shoot -= dt;
    if (enemy.shoot > 0) return;
    if (this.shots.length > 70) return;
    const pace = enemy.kind === "scorpion" ? 1.35 : enemy.kind === "spider" ? 1.7 : 1.55;
    enemy.shoot = pace;
    const speed = enemy.kind === "mosquito" ? 210 : enemy.kind === "spider" ? 140 : 160;
    const base = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
    const angles = enemy.kind === "scorpion" ? [-0.38, 0, 0.38] : [0];
    for (const off of angles) {
      const a = base + off;
      this.shots.push({
        x: enemy.x,
        y: enemy.y + enemy.r,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: enemy.kind === "spider" ? 6 : 4.5,
        friendly: false,
        dmg: 8,
        life: 4,
      });
    }
  }

  private queenShoot(enemy: Enemy, dt: number) {
    enemy.shoot -= dt;
    if (enemy.shoot > 0 || this.shots.length > 70) return;
    const ratio = enemy.hp / enemy.maxHp;
    if (ratio > 0.66) {
      enemy.shoot = 0.95;
      this.aimShot(enemy, 190, 0, 5);
    } else if (ratio > 0.33) {
      enemy.shoot = 1.15;
      for (const off of [-0.6, -0.3, 0, 0.3, 0.6]) this.aimShot(enemy, 170, off, 5);
    } else {
      enemy.shoot = 1.45;
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 * i) / 12 + enemy.phase;
        this.shots.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(a) * 120,
          vy: Math.sin(a) * 120,
          r: 4.5,
          friendly: false,
          dmg: 8,
          life: 5,
        });
      }
    }
  }

  private aimShot(enemy: Enemy, speed: number, offset: number, r: number) {
    const a = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x) + offset;
    this.shots.push({
      x: enemy.x,
      y: enemy.y + 16,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r,
      friendly: false,
      dmg: 8,
      life: 4,
    });
  }

  private updateShots(dt: number) {
    for (const shot of this.shots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (shot.x < -30 || shot.x > this.w + 30 || shot.y < -40 || shot.y > this.h + 40) shot.life = 0;
    }
    this.compact(this.shots);
  }

  private collide() {
    for (const shot of this.shots) {
      if (shot.life <= 0) continue;
      if (shot.friendly) {
        for (const enemy of this.enemies) {
          if (enemy.dead) continue;
          if (Math.hypot(shot.x - enemy.x, shot.y - enemy.y) < enemy.r + shot.r) {
            shot.life = 0;
            this.damageEnemy(enemy, shot.dmg);
            break;
          }
        }
      } else if (this.player.alive && this.player.invuln <= 0) {
        if (Math.hypot(shot.x - this.player.x, shot.y - this.player.y) < this.player.r + shot.r) {
          shot.life = 0;
          this.hurt(shot.dmg);
        }
      }
    }

    if (this.player.alive && this.player.invuln <= 0) {
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        if (Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) < enemy.r * 0.72 + this.player.r) {
          this.hurt(CONTACT[enemy.kind]);
          if (enemy.kind !== "queen") this.damageEnemy(enemy, 6);
          break;
        }
      }
    }

    for (const pickup of this.pickups) {
      if (Math.hypot(pickup.x - this.player.x, pickup.y - this.player.y) < 22) {
        this.takePickup(pickup);
        pickup.life = 0;
      }
    }
  }

  private damageEnemy(enemy: Enemy, amount: number) {
    if (enemy.dead) return;
    enemy.hp -= amount;
    this.bits.push({
      x: enemy.x,
      y: enemy.y,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 40,
      life: 0.25,
      max: 0.25,
      size: 2,
      tone: "gold",
    });
    if (enemy.hp > 0) return;
    this.kill(enemy);
  }

  private kill(enemy: Enemy) {
    enemy.dead = true;
    const big = enemy.kind === "queen";
    this.burst(enemy.x, enemy.y, big ? 26 : 10, big ? "gold" : "leaf");
    this.audio.explode(big);
    if (this.comboT > 0) this.combo += 1;
    else this.combo = 1;
    this.comboT = 2.05;
    const gained = enemy.score * Math.min(this.combo, 8);
    this.score += gained;
    this.floaters.push({ x: enemy.x, y: enemy.y - 8, text: `+${gained}`, life: 0.75, max: 0.75, tone: "leaf" });
    if (this.combo >= 2) {
      this.floaters.push({
        x: enemy.x,
        y: enemy.y - 24,
        text: `×${this.combo}`,
        life: 0.7,
        max: 0.7,
        tone: "gold",
      });
    }
    this.shake = Math.min(12, this.shake + (big ? 9 : 2.2));
    if (big) this.hitstop = 0.07;
    this.maybeDrop(enemy);
    if (this.score > this.hi) {
      this.hi = this.score;
      this.writeHi();
    }
    this.hudDirty = true;
  }

  private maybeDrop(enemy: Enemy) {
    if (this.pickups.length >= 3) return;
    let kind: PickupKind | null = null;
    if (enemy.kind === "queen") kind = "heal";
    else if (Math.random() < 0.16) {
      const roll = Math.random();
      kind = roll < 0.4 ? "heal" : roll < 0.7 ? "abanico" : "pulso";
    }
    if (!kind) return;
    this.pickups.push({ kind, x: enemy.x, y: enemy.y, vy: 46, life: 8 });
  }

  private takePickup(pickup: Pickup) {
    this.audio.pickup();
    if (pickup.kind === "heal") {
      if (this.player.hp >= this.player.maxHp) {
        this.score += 150;
        this.floaters.push({ x: pickup.x, y: pickup.y, text: "+150", life: 0.7, max: 0.7, tone: "gold" });
        if (this.score > this.hi) {
          this.hi = this.score;
          this.writeHi();
        }
      } else {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 28);
        this.floaters.push({ x: pickup.x, y: pickup.y, text: "Vida", life: 0.7, max: 0.7, tone: "leaf" });
      }
    } else {
      this.weapon = pickup.kind;
      this.weaponT = 9;
      this.floaters.push({
        x: pickup.x,
        y: pickup.y,
        text: pickup.kind === "abanico" ? "Abanico" : "Pulso",
        life: 0.7,
        max: 0.7,
        tone: "gold",
      });
    }
    this.hudDirty = true;
  }

  private hurt(amount: number) {
    if (!this.player.alive || this.player.invuln > 0 || this.mode !== "playing") return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.player.invuln = 1.05;
    this.shake = Math.max(this.shake, 6);
    this.hitstop = 0.045;
    this.flash = 0.12;
    this.audio.hurt();
    this.combo = 0;
    this.comboT = 0;
    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }
    this.hudDirty = true;
    if (this.player.hp > 0) return;
    this.player.alive = false;
    this.burst(this.player.x, this.player.y, 22, "gold");
    this.audio.die();
    this.mode = "over";
    this.paused = false;
    this.newRecord = this.score > this.hiAtStart;
    this.banner = "";
    this.bannerT = 0;
    this.writeHi();
  }

  private burst(x: number, y: number, n: number, tone: Tone) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 140;
      this.bits.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.4,
        max: 0.75,
        size: 1.5 + Math.random() * 2.5,
        tone: i % 4 === 0 ? "gold" : tone,
      });
    }
    if (this.bits.length > 180) this.bits.splice(0, this.bits.length - 180);
  }

  private fx(dt: number) {
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        this.combo = 0;
        this.hudDirty = true;
      }
    }
    for (const bit of this.bits) {
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      bit.vy += 24 * dt;
      bit.life -= dt;
    }
    this.compact(this.bits);
    for (const floater of this.floaters) {
      floater.y -= 26 * dt;
      floater.life -= dt;
    }
    this.compact(this.floaters);
    for (const pulse of this.pulses) pulse.life -= dt;
    this.compact(this.pulses);
    for (const pickup of this.pickups) {
      pickup.y += pickup.vy * dt;
      pickup.life -= dt;
      if (pickup.y > this.h + 20) pickup.life = 0;
    }
    this.compact(this.pickups);
  }

  private compact<T extends { life: number }>(list: T[]) {
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i].life > 0) list[w++] = list[i];
    }
    list.length = w;
  }

  private compactEnemies() {
    let w = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      if (!this.enemies[i].dead) this.enemies[w++] = this.enemies[i];
    }
    this.enemies.length = w;
  }

  private writeHi() {
    try {
      localStorage.setItem(HI_KEY, String(this.hi));
    } catch {
      /* private mode */
    }
  }

  private draw() {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const world: World = {
      w: this.w,
      h: this.h,
      scroll: this.scroll,
      time: this.time,
      shake: this.shake,
      flash: this.flash,
      leaves: this.leaves,
      motes: this.motes,
      player: this.player,
      enemies: this.enemies,
      shots: this.shots,
      bits: this.bits,
      floaters: this.floaters,
      pickups: this.pickups,
      pulses: this.pulses,
      banner: this.banner,
      bannerT: this.bannerT,
      mode: this.mode,
      reduced: this.reduced,
    };
    drawWorld(ctx, world);
  }

  private snapshot(): HudSnapshot {
    return {
      mode: this.mode,
      paused: this.paused,
      muted: this.audio.muted,
      score: this.score,
      hi: this.hi,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      wave: this.wave,
      combo: this.combo,
      weapon: this.weapon,
      weaponLeft: Math.max(0, this.weaponT),
      bombRatio: this.bombCd <= 0 ? 1 : 1 - this.bombCd / 8,
      bombLeft: Math.max(0, this.bombCd),
      newRecord: this.newRecord,
      showHint: this.showHint,
    };
  }

  private emit(force: boolean) {
    this.lastEmit = performance.now();
    this.hudDirty = false;
    if (!force && this.dead) return;
    this.onHud(this.snapshot());
  }
}
