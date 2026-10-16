import { PALETTE } from "./types";
import type {
  Bit,
  Enemy,
  Floater,
  Kind,
  Leaf,
  Mote,
  Pickup,
  PickupKind,
  Player,
  Pulse,
  Ring,
  Shot,
  Tone,
} from "./types";

/* ------------------------------------------------------------------ *
 *  Render de Elytra.
 *
 *  Todo es dibujo procedural en canvas 2D. Las capas estáticas y los
 *  sprites se pre-renderizan una vez (al cambiar tamaño / dpr) en lienzos
 *  fuera de pantalla; por fotograma solo se hacen drawImage, unos pocos
 *  trazos animados y cero asignaciones. Sin shadowBlur en bucles: los
 *  brillos son sprites aditivos pre-renderizados.
 * ------------------------------------------------------------------ */

export interface World {
  w: number;
  h: number;
  dpr: number;
  /** Fracción [0,1) entre el último paso fijo y el siguiente, para interpolar. */
  alpha: number;
  /** 0 = bajo, 1 = medio, 2 = alto. */
  quality: 0 | 1 | 2;
  scroll: number;
  time: number;
  shake: number;
  flash: number;
  hurt: number;
  leaves: Leaf[];
  motes: Mote[];
  player: Player;
  enemies: Enemy[];
  shots: Shot[];
  bits: Bit[];
  floaters: Floater[];
  pickups: Pickup[];
  pulses: Pulse[];
  rings: Ring[];
  banner: string;
  bannerT: number;
  mode: "title" | "playing" | "over";
  reduced: boolean;
}

const STEP = 1 / 60;
const TAU = Math.PI * 2;

const TONE: Record<Tone, string> = {
  gold: PALETTE.gold,
  leaf: PALETTE.leaf,
  sting: PALETTE.sting,
  fg: PALETTE.fg,
  muted: PALETTE.muted,
};
const TONES: Tone[] = ["gold", "leaf", "sting", "fg", "muted"];

/* ------------------------------ sprites ------------------------------ */

interface Sprite {
  c: HTMLCanvasElement;
  w: number;
  h: number;
  ox: number;
  oy: number;
}

type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext("2d");
  if (!g) throw new Error("Sin contexto 2D");
  return [c, g];
}

function makeSprite(
  dpr: number,
  w: number,
  h: number,
  ox: number,
  oy: number,
  draw: (g: Ctx) => void,
): Sprite {
  const [c, g] = makeCanvas(w * dpr, h * dpr);
  g.scale(dpr, dpr);
  g.translate(ox, oy);
  draw(g);
  return { c, w, h, ox, oy };
}

function blit(ctx: Ctx, s: Sprite, x: number, y: number, scale = 1) {
  ctx.drawImage(s.c, x - s.ox * scale, y - s.oy * scale, s.w * scale, s.h * scale);
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
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

function wrap(v: number, m: number) {
  return ((v % m) + m) % m;
}

function lerp(a: number | undefined, b: number, t: number) {
  return a === undefined ? b : a + (b - a) * t;
}

function ell(g: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
}

/** Elipse con volumen: foco de luz arriba a la izquierda, borde oscuro y brillo especular. */
function shaded(
  g: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  light: string,
  mid: string,
  dark: string,
  rot = 0,
  spec = 0.3,
) {
  const grad = g.createRadialGradient(
    x - rx * 0.35,
    y - ry * 0.4,
    0.4,
    x,
    y,
    Math.max(rx, ry) * 1.2,
  );
  grad.addColorStop(0, light);
  grad.addColorStop(0.5, mid);
  grad.addColorStop(1, dark);
  g.fillStyle = grad;
  ell(g, x, y, rx, ry, rot);
  g.fill();
  g.lineWidth = 0.9;
  g.strokeStyle = "rgba(3, 9, 6, 0.75)";
  g.stroke();
  if (spec > 0) {
    g.fillStyle = `rgba(255, 255, 255, ${spec})`;
    ell(g, x - rx * 0.32, y - ry * 0.44, rx * 0.34, ry * 0.2, rot - 0.5);
    g.fill();
  }
}

function leafPath(g: Ctx, s: number) {
  g.beginPath();
  g.moveTo(0, -s);
  g.bezierCurveTo(s * 0.72, -s * 0.35, s * 0.5, s * 0.5, 0, s);
  g.bezierCurveTo(-s * 0.5, s * 0.5, -s * 0.72, -s * 0.35, 0, -s);
}

/** Hoja con luz de luna por la derecha, nervio central y nervios laterales. */
function paintLeaf(
  g: Ctx,
  x: number,
  y: number,
  s: number,
  rot: number,
  dark: string,
  mid: string,
  lit: string,
  veins: number,
  rim: number,
) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const grad = g.createLinearGradient(-s * 0.6, 0, s * 0.6, 0);
  grad.addColorStop(0, dark);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, lit);
  g.fillStyle = grad;
  leafPath(g, s);
  g.fill();
  if (rim > 0) {
    g.strokeStyle = rgba(PALETTE.mossHi, rim);
    g.lineWidth = 1.2;
    g.stroke();
  }
  if (veins > 0) {
    g.strokeStyle = rgba(PALETTE.leaf, veins);
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(0, -s * 0.86);
    g.lineTo(0, s * 0.82);
    for (let i = 1; i <= 5; i++) {
      const vy = -s * 0.7 + i * s * 0.26;
      const vx = s * 0.34 * Math.sin((i / 6) * Math.PI);
      g.moveTo(0, vy);
      g.lineTo(vx, vy - s * 0.14);
      g.moveTo(0, vy);
      g.lineTo(-vx, vy - s * 0.14);
    }
    g.stroke();
  }
  g.restore();
}

/* ------------------------------ activos ------------------------------ */

interface Assets {
  key: string;
  w: number;
  h: number;
  dpr: number;
  buf: HTMLCanvasElement;
  bctx: Ctx;
  bg: HTMLCanvasElement;
  shafts: HTMLCanvasElement;
  far: Tile;
  mid: Tile;
  near: Tile;
  fog: Tile;
  vignette: HTMLCanvasElement;
  hurtVig: HTMLCanvasElement;
  glow: Record<Tone, Sprite>;
  ring: Record<Tone, Sprite>;
  bolt: Sprite;
  orb: Sprite;
  beetle: Sprite;
  wing: Sprite;
  enemy: Record<Kind, Sprite>;
  pickup: Record<PickupKind, Sprite>;
  grassFar: CanvasGradient;
  grassNear: CanvasGradient;
  pollen: Float32Array;
}

interface Tile {
  c: HTMLCanvasElement;
  /** Tamaño lógico del tile (px CSS). */
  tw: number;
  th: number;
  /** Píxeles del lienzo por px lógico. */
  k: number;
}

let assets: Assets | null = null;

function getAssets(ctx: Ctx, w: number, h: number, dpr: number): Assets {
  const key = `${Math.round(w)}x${Math.round(h)}@${dpr}`;
  if (assets && assets.key === key) return assets;
  assets = buildAssets(ctx, key, w, h, dpr);
  return assets;
}

function buildAssets(ctx: Ctx, key: string, w: number, h: number, dpr: number): Assets {
  const glow = {} as Record<Tone, Sprite>;
  const ring = {} as Record<Tone, Sprite>;
  for (const t of TONES) {
    glow[t] = makeGlow(dpr, TONE[t]);
    ring[t] = makeRingSprite(dpr, TONE[t]);
  }
  const enemy = {
    ant: makeAnt(dpr),
    mosquito: makeMosquito(dpr),
    spider: makeSpider(dpr),
    scorpion: makeScorpion(dpr),
    queen: makeQueen(dpr),
  } as Record<Kind, Sprite>;
  const pickup = {
    heal: makePickup(dpr, "heal"),
    abanico: makePickup(dpr, "abanico"),
    pulso: makePickup(dpr, "pulso"),
  } as Record<PickupKind, Sprite>;

  const grassFar = ctx.createLinearGradient(0, h - 62, 0, h);
  grassFar.addColorStop(0, "#14301f");
  grassFar.addColorStop(1, "#08150e");
  const grassNear = ctx.createLinearGradient(0, h - 44, 0, h);
  grassNear.addColorStop(0, "#07130c");
  grassNear.addColorStop(1, "#020604");

  const rand = mulberry32(77);
  const pollen = new Float32Array(48 * 3);
  for (let i = 0; i < 48; i++) {
    pollen[i * 3] = rand();
    pollen[i * 3 + 1] = rand();
    pollen[i * 3 + 2] = rand();
  }

  const [buf, bctx] = makeCanvas(w, h);
  return {
    key,
    w,
    h,
    dpr,
    buf,
    bctx,
    bg: makeBackground(w, h),
    shafts: makeShafts(w, h),
    far: makeFarLayer(w, h),
    mid: makeMidLayer(w, h),
    near: makeNearLayer(w, h),
    fog: makeFog(w, h),
    vignette: makeVignette(w, h),
    hurtVig: makeHurtVignette(w, h),
    glow,
    ring,
    bolt: makeBolt(dpr),
    orb: makeOrb(dpr),
    beetle: makeBeetle(dpr),
    wing: makeWing(dpr),
    enemy,
    pickup,
    grassFar,
    grassNear,
    pollen,
  };
}

function makeGlow(dpr: number, color: string): Sprite {
  return makeSprite(dpr, 64, 64, 32, 32, (g) => {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 32);
    grad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    grad.addColorStop(0.12, rgba(color, 0.9));
    grad.addColorStop(0.35, rgba(color, 0.32));
    grad.addColorStop(0.65, rgba(color, 0.08));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(-32, -32, 64, 64);
  });
}

function makeRingSprite(dpr: number, color: string): Sprite {
  return makeSprite(dpr, 128, 128, 64, 64, (g) => {
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 64);
    grad.addColorStop(0, rgba(color, 0));
    grad.addColorStop(0.62, rgba(color, 0));
    grad.addColorStop(0.82, rgba(color, 0.85));
    grad.addColorStop(0.9, "rgba(255, 255, 255, 0.55)");
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(-64, -64, 128, 128);
  });
}

/* ------------------------------ fondo ------------------------------ */

function makeBackground(w: number, h: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(w, h);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#061310");
  sky.addColorStop(0.4, "#08180f");
  sky.addColorStop(0.75, "#07140c");
  sky.addColorStop(1, "#020604");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // estrellas minúsculas entre el follaje
  const rand = mulberry32(5);
  for (let i = 0; i < 46; i++) {
    const x = rand() * w;
    const y = rand() * h * 0.5;
    g.fillStyle = `rgba(246, 236, 210, ${0.1 + rand() * 0.35})`;
    g.fillRect(x, y, rand() > 0.85 ? 1.6 : 1, rand() > 0.85 ? 1.6 : 1);
  }

  // luna: halo ancho, halo cálido, disco con mares y borde luminoso
  const mx = w * 0.74;
  const my = h * 0.14;
  const R = Math.max(15, Math.min(w, h) * 0.04);
  const halo = g.createRadialGradient(mx, my, R * 0.8, mx, my, w * 0.55);
  halo.addColorStop(0, "rgba(120, 180, 150, 0.22)");
  halo.addColorStop(0.35, "rgba(70, 130, 100, 0.08)");
  halo.addColorStop(1, "rgba(40, 90, 70, 0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, w, h);
  const warm = g.createRadialGradient(mx, my, R * 0.6, mx, my, R * 5.5);
  warm.addColorStop(0, "rgba(246, 226, 180, 0.5)");
  warm.addColorStop(0.2, "rgba(228, 177, 90, 0.16)");
  warm.addColorStop(1, "rgba(228, 177, 90, 0)");
  g.fillStyle = warm;
  g.fillRect(0, 0, w, h);
  const disc = g.createRadialGradient(mx - R * 0.3, my - R * 0.3, 1, mx, my, R);
  disc.addColorStop(0, "#fff7dc");
  disc.addColorStop(0.7, "#efd9a2");
  disc.addColorStop(1, "#cfae6c");
  g.fillStyle = disc;
  g.beginPath();
  g.arc(mx, my, R, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(160, 125, 70, 0.28)";
  for (const [dx, dy, r] of [
    [-0.3, -0.15, 0.28],
    [0.25, 0.2, 0.22],
    [0.05, -0.45, 0.14],
    [-0.1, 0.4, 0.16],
  ]) {
    g.beginPath();
    g.arc(mx + dx * R, my + dy * R, r * R, 0, TAU);
    g.fill();
  }

  // dosel oscuro en los bordes superiores: encuadra la luna
  const sides: Array<[number, number, number, number]> = [
    [0.02, -0.01, 120, 0.4],
    [0.2, -0.04, 96, -0.5],
    [0.47, -0.05, 84, 0.2],
    [0.97, 0.0, 130, -0.35],
    [0.58, -0.06, 70, -0.1],
  ];
  for (const [fx, fy, s, r] of sides) {
    paintLeaf(g, w * fx, h * fy, s, r, "#010403", "#030c07", "#07170f", 0, 0);
  }
  return c;
}

function makeShafts(w: number, h: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(w, h);
  const ox = w * 0.74;
  const oy = h * 0.1;
  const beams: Array<[number, number, number]> = [
    [-0.42, 38, 0.1],
    [-0.28, 62, 0.07],
    [-0.12, 30, 0.09],
    [0.06, 52, 0.06],
  ];
  for (const [ang, width, a] of beams) {
    g.save();
    g.translate(ox, oy);
    g.rotate(ang);
    const len = h * 1.15;
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, `rgba(246, 226, 180, ${a * 1.6})`);
    grad.addColorStop(0.5, `rgba(180, 220, 170, ${a * 0.7})`);
    grad.addColorStop(1, "rgba(180, 220, 170, 0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-width * 0.12, 0);
    g.lineTo(width * 0.12, 0);
    g.lineTo(width, len);
    g.lineTo(-width, len);
    g.closePath();
    g.fill();
    g.restore();
  }
  return c;
}

function setBlur(g: Ctx, px: number) {
  if ("filter" in g) g.filter = px > 0 ? `blur(${px}px)` : "none";
}

function makeTile(w: number, h: number, k: number, hMul: number): [Tile, Ctx] {
  const th = Math.max(900, Math.round(h * hMul));
  const [c, g] = makeCanvas(w * k, th * k);
  g.scale(k, k);
  return [{ c, tw: w, th, k }, g];
}

/** Dibuja `fn` en la posición y sus copias ±th para que el tile case al hacer wrap vertical. */
function wrapY(th: number, y: number, s: number, fn: (yy: number) => void) {
  fn(y);
  if (y - s < 0) fn(y + th);
  if (y + s > th) fn(y - th);
}

function makeFarLayer(w: number, h: number): Tile {
  const [tile, g] = makeTile(w, h, 1, 1.5);
  const th = tile.th;
  const rand = mulberry32(21);
  setBlur(g, 2.2);
  for (let i = 0; i < 16; i++) {
    const x = rand() * w;
    const y = rand() * th;
    const s = 50 + rand() * 80;
    const rot = rand() * Math.PI;
    wrapY(th, y, s, (yy) => paintLeaf(g, x, yy, s, rot, "#071710", "#0d2318", "#133324", 0, 0));
  }
  setBlur(g, 0);
  // bulbos bioluminiscentes lejanos
  for (let i = 0; i < 9; i++) {
    const x = rand() * w;
    const y = rand() * th;
    const r = 2 + rand() * 2.5;
    const hue = rand() > 0.5 ? "rgba(120, 230, 180," : "rgba(228, 190, 110,";
    wrapY(th, y, 40, (yy) => {
      g.strokeStyle = "rgba(18, 48, 32, 0.8)";
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, yy + 26);
      g.quadraticCurveTo(x + (rand() - 0.5) * 12, yy + 12, x, yy);
      g.stroke();
      const gr = g.createRadialGradient(x, yy, 0, x, yy, r * 6);
      gr.addColorStop(0, `${hue} 0.55)`);
      gr.addColorStop(0.3, `${hue} 0.16)`);
      gr.addColorStop(1, `${hue} 0)`);
      g.fillStyle = gr;
      g.fillRect(x - r * 6, yy - r * 6, r * 12, r * 12);
      g.fillStyle = `${hue} 0.95)`;
      g.beginPath();
      g.arc(x, yy, r * 0.7, 0, TAU);
      g.fill();
    });
  }
  return tile;
}

function makeMidLayer(w: number, h: number): Tile {
  const [tile, g] = makeTile(w, h, 1, 1.6);
  const th = tile.th;
  const rand = mulberry32(33);
  // tallos finos
  for (let i = 0; i < 7; i++) {
    const x = rand() * w;
    const y = rand() * th;
    const sway = (rand() - 0.5) * 36;
    wrapY(th, y, 190, (yy) => {
      const gr = g.createLinearGradient(0, yy, 0, yy + 180);
      gr.addColorStop(0, "rgba(42, 90, 62, 0)");
      gr.addColorStop(0.5, "rgba(61, 122, 82, 0.5)");
      gr.addColorStop(1, "rgba(42, 90, 62, 0)");
      g.strokeStyle = gr;
      g.lineWidth = 1.6 + rand() * 1.4;
      g.beginPath();
      g.moveTo(x, yy);
      g.bezierCurveTo(x + sway, yy + 50, x - sway, yy + 120, x + sway * 0.4, yy + 180);
      g.stroke();
    });
  }
  for (let i = 0; i < 17; i++) {
    const x = rand() * w;
    const y = rand() * th;
    const s = 30 + rand() * 62;
    const rot = rand() * Math.PI;
    wrapY(th, y, s, (yy) => {
      paintLeaf(g, x, yy, s, rot, "#081a11", "#102a1a", "#1c4430", 0.13, 0.32);
    });
  }
  // gotas de rocío con destello de luna
  for (let i = 0; i < 16; i++) {
    const x = rand() * w;
    const y = rand() * th;
    wrapY(th, y, 10, (yy) => {
      const gr = g.createRadialGradient(x, yy, 0, x, yy, 6);
      gr.addColorStop(0, "rgba(255, 250, 225, 0.9)");
      gr.addColorStop(0.25, "rgba(246, 226, 180, 0.35)");
      gr.addColorStop(1, "rgba(246, 226, 180, 0)");
      g.fillStyle = gr;
      g.fillRect(x - 6, yy - 6, 12, 12);
    });
  }
  return tile;
}

function makeNearLayer(w: number, h: number): Tile {
  const [tile, g] = makeTile(w, h, 1, 1.9);
  const th = tile.th;
  const rand = mulberry32(55);
  setBlur(g, 5);
  for (let i = 0; i < 9; i++) {
    const left = i % 2 === 0;
    const x = left ? -w * 0.02 + rand() * w * 0.2 : w * 1.02 - rand() * w * 0.2;
    const y = rand() * th;
    const s = 70 + rand() * 90;
    const rot = (left ? 0.5 : -0.5) + (rand() - 0.5) * 1.2;
    wrapY(th, y, s, (yy) => paintLeaf(g, x, yy, s, rot, "#010503", "#030b07", "#06140d", 0, 0));
  }
  setBlur(g, 0);
  return tile;
}

function makeFog(w: number, h: number): Tile {
  const tw = Math.round(w * 1.6);
  const [c, g] = makeCanvas(tw, h);
  const rand = mulberry32(91);
  const bands = [0.3, 0.52, 0.8];
  for (const by of bands) {
    for (let i = 0; i < 4; i++) {
      const x = rand() * tw;
      const y = h * by + (rand() - 0.5) * h * 0.12;
      const rx = w * (0.45 + rand() * 0.4);
      const ry = h * (0.05 + rand() * 0.05);
      for (const off of [-tw, 0, tw]) {
        g.save();
        g.translate(x + off, y);
        g.scale(1, ry / rx);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
        gr.addColorStop(0, "rgba(70, 120, 96, 0.2)");
        gr.addColorStop(0.5, "rgba(46, 92, 70, 0.08)");
        gr.addColorStop(1, "rgba(46, 92, 70, 0)");
        g.fillStyle = gr;
        g.fillRect(-rx, -rx, rx * 2, rx * 2);
        g.restore();
      }
    }
  }
  return { c, tw, th: h, k: 1 };
}

function makeVignette(w: number, h: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(w, h);
  const edge = g.createRadialGradient(w / 2, h * 0.46, h * 0.22, w / 2, h * 0.5, h * 0.74);
  edge.addColorStop(0, "rgba(2, 7, 4, 0)");
  edge.addColorStop(1, "rgba(2, 7, 4, 0.62)");
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
  return c;
}

function makeHurtVignette(w: number, h: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(w * 0.5, h * 0.5);
  g.scale(0.5, 0.5);
  const edge = g.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.7);
  edge.addColorStop(0, "rgba(226, 70, 50, 0)");
  edge.addColorStop(1, "rgba(226, 70, 50, 0.7)");
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
  return c;
}

/** Copia un tile con wrap vertical dibujando solo la franja visible (2 drawImage). */
function drawTileY(ctx: Ctx, t: Tile, offset: number, w: number, h: number, alpha: number) {
  const o = wrap(offset, t.th);
  ctx.globalAlpha = alpha;
  // pantalla [0, o) muestra el final del tile
  if (o > 0) {
    const sh = Math.min(o, t.th);
    ctx.drawImage(t.c, 0, (t.th - sh) * t.k, t.tw * t.k, sh * t.k, 0, 0, w, sh);
  }
  const rest = h - o;
  if (rest > 0) {
    ctx.drawImage(t.c, 0, 0, t.tw * t.k, Math.min(rest, t.th) * t.k, 0, o, w, Math.min(rest, t.th));
  }
}

function drawTileX(ctx: Ctx, t: Tile, offset: number, w: number, h: number, alpha: number) {
  const o = wrap(offset, t.tw);
  ctx.globalAlpha = alpha;
  const first = Math.min(t.tw - o, w);
  ctx.drawImage(t.c, o, 0, first, h, 0, 0, first, h);
  if (first < w) ctx.drawImage(t.c, 0, 0, w - first, h, first, 0, w - first, h);
}

/* ------------------------------ sprites de juego ------------------------------ */

function makeBolt(dpr: number): Sprite {
  // cabeza arriba (origen), cola hacia abajo
  return makeSprite(dpr, 20, 54, 10, 14, (g) => {
    const tail = g.createLinearGradient(0, 0, 0, 40);
    tail.addColorStop(0, "rgba(246, 226, 180, 0.85)");
    tail.addColorStop(0.35, "rgba(228, 177, 90, 0.4)");
    tail.addColorStop(1, "rgba(228, 177, 90, 0)");
    g.fillStyle = tail;
    g.beginPath();
    g.moveTo(-3, 0);
    g.lineTo(3, 0);
    g.lineTo(0.8, 40);
    g.lineTo(-0.8, 40);
    g.closePath();
    g.fill();
    const head = g.createRadialGradient(0, 0, 0, 0, 0, 10);
    head.addColorStop(0, "rgba(255, 255, 255, 1)");
    head.addColorStop(0.3, "rgba(246, 226, 180, 0.95)");
    head.addColorStop(0.65, "rgba(228, 177, 90, 0.35)");
    head.addColorStop(1, "rgba(228, 177, 90, 0)");
    g.fillStyle = head;
    g.fillRect(-10, -10, 20, 20);
    g.fillStyle = "#fffbe8";
    ell(g, 0, 0, 1.8, 5);
    g.fill();
  });
}

function makeOrb(dpr: number): Sprite {
  return makeSprite(dpr, 36, 36, 18, 18, (g) => {
    // borde oscuro para que se lea sobre cualquier fondo, cuerpo rojo y núcleo caliente
    g.fillStyle = "rgba(14, 3, 3, 0.85)";
    g.beginPath();
    g.arc(0, 0, 8.6, 0, TAU);
    g.fill();
    const body = g.createRadialGradient(0, 0, 0, 0, 0, 7.4);
    body.addColorStop(0, "#fff3d0");
    body.addColorStop(0.28, "#ffc25a");
    body.addColorStop(0.62, PALETTE.sting);
    body.addColorStop(1, PALETTE.stingDeep);
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, 7.4, 0, TAU);
    g.fill();
  });
}

function makeWing(dpr: number): Sprite {
  // ala derecha, raíz en el origen
  return makeSprite(dpr, 40, 24, 4, 16, (g) => {
    const grad = g.createLinearGradient(0, 0, 32, -4);
    grad.addColorStop(0, "rgba(200, 255, 220, 0.7)");
    grad.addColorStop(0.6, "rgba(160, 235, 190, 0.28)");
    grad.addColorStop(1, "rgba(160, 235, 190, 0.04)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(12, -15, 33, -8);
    g.quadraticCurveTo(28, 5, 0, 3);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(230, 255, 240, 0.5)";
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(1, 0);
    g.quadraticCurveTo(14, -8, 32, -8);
    g.moveTo(2, 1);
    g.quadraticCurveTo(14, -2, 28, -3);
    g.stroke();
  });
}

function makeBeetle(dpr: number): Sprite {
  return makeSprite(dpr, 72, 80, 36, 46, (g) => {
    g.lineCap = "round";
    g.lineJoin = "round";

    // patas bajo el caparazón
    g.strokeStyle = "#1a3a28";
    g.lineWidth = 1.3;
    g.beginPath();
    for (const side of [-1, 1]) {
      g.moveTo(side * 6, -6);
      g.lineTo(side * 15, -10);
      g.lineTo(side * 18, -6);
      g.moveTo(side * 7, 0);
      g.lineTo(side * 17, 1);
      g.lineTo(side * 19, 6);
      g.moveTo(side * 6, 7);
      g.lineTo(side * 14, 13);
      g.lineTo(side * 15, 18);
    }
    g.stroke();

    const half = (side: number) => {
      g.beginPath();
      g.moveTo(0, -16);
      g.quadraticCurveTo(side * 25, -7, side * 15, 15);
      g.quadraticCurveTo(side * 6, 9, 0, 5);
      g.closePath();
      const body = g.createLinearGradient(0, -14, side * 22, 6);
      body.addColorStop(0, "#245d3d");
      body.addColorStop(0.32, "#5fbf8e");
      body.addColorStop(0.55, "#2f7a52");
      body.addColorStop(1, "#0c2819");
      g.fillStyle = body;
      g.fill();
      g.save();
      g.clip();
      // irisación dorada/turquesa en bandas
      const irid = g.createLinearGradient(side * 4, -16, side * 20, 14);
      irid.addColorStop(0, "rgba(228, 177, 90, 0)");
      irid.addColorStop(0.35, "rgba(228, 177, 90, 0.34)");
      irid.addColorStop(0.55, "rgba(90, 220, 200, 0.24)");
      irid.addColorStop(1, "rgba(90, 220, 200, 0)");
      g.fillStyle = irid;
      g.fillRect(-30, -20, 60, 40);
      // brillo especular largo
      g.fillStyle = "rgba(235, 255, 240, 0.34)";
      ell(g, side * 8.5, -7, 2.4, 8.5, side * 0.38);
      g.fill();
      g.fillStyle = "rgba(255, 255, 255, 0.22)";
      ell(g, side * 12.5, -2, 0.9, 3.5, side * 0.3);
      g.fill();
      // nervaduras
      g.strokeStyle = "rgba(6, 24, 14, 0.55)";
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(side * 4, -9);
      g.quadraticCurveTo(side * 13, -1, side * 8, 10);
      g.moveTo(side * 9, -11);
      g.quadraticCurveTo(side * 18, -3, side * 13, 9);
      g.stroke();
      g.restore();
      g.strokeStyle = PALETTE.gold;
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(0, -16);
      g.quadraticCurveTo(side * 25, -7, side * 15, 15);
      g.quadraticCurveTo(side * 6, 9, 0, 5);
      g.closePath();
      g.stroke();
    };
    half(-1);
    half(1);
    // sutura central
    g.strokeStyle = "#0a1f14";
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(0, -14);
    g.lineTo(0, 5);
    g.stroke();
    g.strokeStyle = PALETTE.goldHi;
    g.globalAlpha = 0.6;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(0.9, -13);
    g.lineTo(0.9, 3);
    g.stroke();
    g.globalAlpha = 1;

    // pronoto + cabeza
    shaded(g, 0, -13, 8, 4.2, "#8ad9a6", "#3f9a68", "#16452c", 0, 0.3);
    shaded(g, 0, -19, 5.6, 5, "#66bb88", "#2d7a50", "#0f3822", 0, 0.28);
    // ojos con brillo
    for (const s of [-1, 1]) {
      g.fillStyle = PALETTE.gold;
      g.beginPath();
      g.arc(s * 2.7, -19.6, 1.9, 0, TAU);
      g.fill();
      g.fillStyle = "#fffbe8";
      g.beginPath();
      g.arc(s * 2.2, -20.2, 0.7, 0, TAU);
      g.fill();
    }
    // mandíbulas y antenas con maza
    g.strokeStyle = PALETTE.goldHi;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-2, -24);
    g.quadraticCurveTo(-4, -27, -2.4, -28);
    g.moveTo(2, -24);
    g.quadraticCurveTo(4, -27, 2.4, -28);
    g.moveTo(-3, -23);
    g.quadraticCurveTo(-11, -31, -8, -37);
    g.moveTo(3, -23);
    g.quadraticCurveTo(11, -31, 8, -37);
    g.stroke();
    g.fillStyle = PALETTE.gold;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(s * 8, -37, 1.7, 0, TAU);
      g.fill();
    }
  });
}

function makeAnt(dpr: number): Sprite {
  return makeSprite(dpr, 44, 52, 22, 28, (g) => {
    g.lineCap = "round";
    shaded(g, 0, 7, 5.6, 7, "#8fd1a0", PALETTE.mossHi, "#0c2316", 0, 0.34);
    g.strokeStyle = "rgba(228, 177, 90, 0.55)";
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(-4.4, 9);
    g.quadraticCurveTo(0, 11.2, 4.4, 9);
    g.moveTo(-3.6, 4.4);
    g.quadraticCurveTo(0, 6.4, 3.6, 4.4);
    g.stroke();
    shaded(g, 0, -1, 3.8, 4.4, "#8fd1a0", PALETTE.mossHi, "#133324", 0, 0.3);
    shaded(g, 0, -8.4, 3.6, 3.3, "#9fdbac", PALETTE.mossHi, "#133324", 0, 0.3);
    // ojos rojos brillantes
    g.fillStyle = "#ff7058";
    g.beginPath();
    g.arc(-1.6, -9, 0.95, 0, TAU);
    g.arc(1.6, -9, 0.95, 0, TAU);
    g.fill();
    // mandíbulas y antenas
    g.strokeStyle = PALETTE.gold;
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(-1.5, -11);
    g.quadraticCurveTo(-6, -17, -4, -19.5);
    g.moveTo(1.5, -11);
    g.quadraticCurveTo(6, -17, 4, -19.5);
    g.moveTo(-1, -11.4);
    g.lineTo(-2.4, -13.2);
    g.moveTo(1, -11.4);
    g.lineTo(2.4, -13.2);
    g.stroke();
  });
}

function makeMosquito(dpr: number): Sprite {
  return makeSprite(dpr, 44, 56, 22, 26, (g) => {
    g.lineCap = "round";
    g.strokeStyle = "#87a592";
    g.lineWidth = 0.9;
    g.beginPath();
    for (const s of [-1, 1]) {
      g.moveTo(s * 2, 1);
      g.lineTo(s * 8, 9);
      g.lineTo(s * 12, 17);
      g.moveTo(s * 1.5, 5);
      g.lineTo(s * 6, 14);
      g.lineTo(s * 8, 22);
      g.moveTo(s * 1.5, -1);
      g.lineTo(s * 10, 3);
      g.lineTo(s * 14, 10);
    }
    g.stroke();
    shaded(g, 0, 3, 2.1, 6.2, "#7ac49a", PALETTE.mossMid, "#0c2316", 0, 0.28);
    shaded(g, 0, -3, 2.6, 4.6, "#8fd1a0", PALETTE.mossHi, "#133324", 0, 0.3);
    g.strokeStyle = "rgba(228, 177, 90, 0.5)";
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-1.8, 2);
    g.lineTo(1.8, 2.8);
    g.moveTo(-1.6, 5);
    g.lineTo(1.6, 5.8);
    g.stroke();
    shaded(g, 0, -9, 2.3, 2.3, "#9fdbac", PALETTE.mossHi, "#133324", 0, 0.25);
    g.fillStyle = "#ff7058";
    g.beginPath();
    g.arc(-1, -9.4, 0.8, 0, TAU);
    g.arc(1, -9.4, 0.8, 0, TAU);
    g.fill();
    // trompa
    g.strokeStyle = PALETTE.sting;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, 8);
    g.lineTo(0, 19);
    g.stroke();
    g.fillStyle = "#ffd6a0";
    g.beginPath();
    g.arc(0, 19, 0.9, 0, TAU);
    g.fill();
    g.strokeStyle = PALETTE.goldHi;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-1, -11);
    g.quadraticCurveTo(-4, -15, -3.4, -18);
    g.moveTo(1, -11);
    g.quadraticCurveTo(4, -15, 3.4, -18);
    g.stroke();
  });
}

function makeSpider(dpr: number): Sprite {
  return makeSprite(dpr, 64, 62, 32, 32, (g) => {
    shaded(g, 0, 6, 11, 12, "#5db586", "#1f5236", "#06140c", 0, 0.3);
    // marca dorada del abdomen con brillo
    const mark = g.createLinearGradient(0, 2, 0, 13);
    mark.addColorStop(0, "#fff0c0");
    mark.addColorStop(1, PALETTE.gold);
    g.fillStyle = mark;
    g.beginPath();
    g.moveTo(0, 1.5);
    g.lineTo(3.6, 8.5);
    g.lineTo(0, 13.5);
    g.lineTo(-3.6, 8.5);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(60, 30, 5, 0.6)";
    g.lineWidth = 0.7;
    g.stroke();
    shaded(g, 0, -8, 6.6, 5.6, "#79c99a", PALETTE.mossMid, "#0c2316", 0, 0.3);
    g.fillStyle = "#ff7058";
    for (const [x, y, r] of [
      [-2.6, -9.4, 1.25],
      [2.6, -9.4, 1.25],
      [-1.1, -11.2, 0.8],
      [1.1, -11.2, 0.8],
    ]) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.strokeStyle = PALETTE.gold;
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(-2, -12.6);
    g.lineTo(-3.2, -15);
    g.moveTo(2, -12.6);
    g.lineTo(3.2, -15);
    g.stroke();
  });
}

function makeScorpion(dpr: number): Sprite {
  return makeSprite(dpr, 72, 76, 36, 44, (g) => {
    g.lineCap = "round";
    g.lineJoin = "round";
    // cola segmentada
    g.strokeStyle = "#7a5a22";
    g.lineWidth = 3.4;
    g.beginPath();
    g.moveTo(6, -4);
    g.quadraticCurveTo(16, -18, 4, -22);
    g.quadraticCurveTo(-2, -24, 0, -16);
    g.stroke();
    g.strokeStyle = PALETTE.gold;
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = "rgba(60, 35, 5, 0.6)";
    g.lineWidth = 0.9;
    g.setLineDash([2, 3]);
    g.stroke();
    g.setLineDash([]);
    // aguijón
    g.fillStyle = PALETTE.sting;
    g.beginPath();
    g.moveTo(-2.6, -15);
    g.quadraticCurveTo(-5, -10, 0, -8);
    g.quadraticCurveTo(2.4, -12, 2.6, -16);
    g.closePath();
    g.fill();
    shaded(g, 0, -16.4, 2.6, 2.6, "#ffe0b0", PALETTE.sting, "#8d2e28", 0, 0.3);
    // cuerpo acorazado
    shaded(g, 0, 2, 14, 9, "#6fb98c", PALETTE.mossMid, "#07170e", 0, 0.28);
    g.strokeStyle = "rgba(228, 177, 90, 0.75)";
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(-9, -3);
    g.quadraticCurveTo(0, 0, 9, -3);
    g.moveTo(-11, 2);
    g.quadraticCurveTo(0, 5, 11, 2);
    g.moveTo(-9, 7);
    g.quadraticCurveTo(0, 9.5, 9, 7);
    g.stroke();
    g.fillStyle = PALETTE.goldHi;
    g.beginPath();
    g.arc(-4, 0, 1.1, 0, TAU);
    g.arc(4, 0, 1.1, 0, TAU);
    g.fill();
  });
}

function makeQueen(dpr: number): Sprite {
  return makeSprite(dpr, 90, 92, 45, 50, (g) => {
    g.lineCap = "round";
    // abdomen con bandas luminosas
    shaded(g, 0, 8, 12.5, 18.5, "#6fb98c", PALETTE.moss, "#06140c", 0, 0.28);
    g.save();
    ell(g, 0, 8, 12.5, 18.5);
    g.clip();
    for (const [y, a] of [
      [1, 0.9],
      [7, 0.75],
      [13, 0.6],
      [19, 0.45],
    ]) {
      const band = g.createLinearGradient(-12, 0, 12, 0);
      band.addColorStop(0, "rgba(228, 177, 90, 0.1)");
      band.addColorStop(0.5, `rgba(246, 226, 180, ${a})`);
      band.addColorStop(1, "rgba(228, 177, 90, 0.1)");
      g.strokeStyle = band;
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(-13, y);
      g.quadraticCurveTo(0, y + 4, 13, y);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = PALETTE.gold;
    g.lineWidth = 1.8;
    ell(g, 0, 8, 12.5, 18.5);
    g.stroke();
    // tórax + cabeza + corona
    shaded(g, 0, -11, 9, 7.4, "#8ad9a6", PALETTE.mossHi, "#0f3822", 0, 0.3);
    g.strokeStyle = PALETTE.gold;
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = PALETTE.gold;
    g.beginPath();
    g.moveTo(-6, -17);
    g.lineTo(-4.4, -23);
    g.lineTo(-2, -18);
    g.lineTo(0, -25);
    g.lineTo(2, -18);
    g.lineTo(4.4, -23);
    g.lineTo(6, -17);
    g.closePath();
    g.fill();
    g.fillStyle = PALETTE.goldHi;
    for (const x of [-4.4, 0, 4.4]) {
      g.beginPath();
      g.arc(x, x === 0 ? -25 : -23, 1, 0, TAU);
      g.fill();
    }
    g.fillStyle = "#ff7058";
    g.beginPath();
    g.arc(-3, -12.4, 1.5, 0, TAU);
    g.arc(3, -12.4, 1.5, 0, TAU);
    g.fill();
    g.strokeStyle = PALETTE.goldHi;
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(-2, -18);
    g.quadraticCurveTo(-8, -26, -7, -32);
    g.moveTo(2, -18);
    g.quadraticCurveTo(8, -26, 7, -32);
    g.stroke();
    // aguijón
    g.fillStyle = PALETTE.sting;
    g.beginPath();
    g.moveTo(0, 25);
    g.lineTo(4, 34);
    g.lineTo(0, 32);
    g.lineTo(-4, 34);
    g.closePath();
    g.fill();
  });
}

function makePickup(dpr: number, kind: PickupKind): Sprite {
  return makeSprite(dpr, 32, 32, 16, 16, (g) => {
    const col = kind === "heal" ? PALETTE.leaf : PALETTE.gold;
    const grad = g.createLinearGradient(0, -10, 0, 10);
    grad.addColorStop(0, "#14301f");
    grad.addColorStop(1, "#06120b");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(7.5, 0);
    g.lineTo(0, 10);
    g.lineTo(-7.5, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = 1.7;
    g.stroke();
    g.strokeStyle = "rgba(255, 255, 255, 0.5)";
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-5.4, -2);
    g.lineTo(0, -7.6);
    g.stroke();
    g.fillStyle = kind === "heal" ? PALETTE.leaf : PALETTE.goldHi;
    g.strokeStyle = PALETTE.goldHi;
    if (kind === "heal") {
      g.fillRect(-1.3, -4.6, 2.6, 9.2);
      g.fillRect(-4.6, -1.3, 9.2, 2.6);
    } else if (kind === "abanico") {
      g.lineWidth = 1.1;
      g.beginPath();
      for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
        g.moveTo(0, 3.4);
        g.lineTo(Math.sin(a) * 5.6, 3.4 - Math.cos(a) * 6);
      }
      g.stroke();
    } else {
      g.beginPath();
      g.arc(0, 0, 2.6, 0, TAU);
      g.fill();
      g.lineWidth = 0.9;
      g.beginPath();
      g.arc(0, 0, 4.6, 0, TAU);
      g.stroke();
    }
  });
}

/* ------------------------------ fotograma ------------------------------ */

export function drawWorld(ctx: Ctx, world: World) {
  const { w, h } = world;
  const a = getAssets(ctx, w, h, world.dpr);
  const t = world.time + world.alpha * STEP;
  const q = world.quality;
  const calm = world.reduced;

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  // el fondo se compone a resolución CSS (suave y barato) y se sube de una vez al lienzo real
  drawBackground(a.bctx, world, a, t, q);
  ctx.drawImage(a.buf, 0, 0, w, h);
  drawGrass(ctx, a, w, h, t, q);

  ctx.save();
  if (world.shake > 0.2 && !calm) {
    const s = world.shake;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }

  drawEntities(ctx, world, a, t, q);
  ctx.restore();

  ctx.globalAlpha = 1;
  if (world.hurt > 0) {
    ctx.globalAlpha = Math.min(1, world.hurt * (calm ? 0.35 : 0.95));
    ctx.drawImage(a.hurtVig, 0, 0, w, h);
  }
  if (world.flash > 0) {
    ctx.globalAlpha = Math.min(0.4, world.flash * (calm ? 0.12 : 0.3));
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawBackground(ctx: Ctx, world: World, a: Assets, t: number, q: 0 | 1 | 2) {
  const { w, h, scroll } = world;
  ctx.drawImage(a.bg, 0, 0, w, h);

  ctx.globalCompositeOperation = "lighter";
  if (q >= 1) {
    ctx.globalAlpha = 0.34 + Math.sin(t * 0.45) * 0.12;
    ctx.drawImage(a.shafts, Math.sin(t * 0.2) * 6, 0, w, h);
  }
  ctx.globalCompositeOperation = "source-over";

  drawTileY(ctx, a.far, scroll * 6, w, h, 0.9);
  if (q >= 2) {
    ctx.globalCompositeOperation = "lighter";
    drawTileX(ctx, a.fog, t * 8, w, h, 0.7);
    ctx.globalCompositeOperation = "source-over";
  }
  drawTileY(ctx, a.mid, scroll * 13, w, h, 1);

  drawFireflies(ctx, world, a, t, q);

  if (q >= 1) drawTileY(ctx, a.near, scroll * 26, w, h, q >= 2 ? 0.8 : 0.6);

  ctx.globalAlpha = 1;
  ctx.drawImage(a.vignette, 0, 0, w, h);
}

function drawFireflies(ctx: Ctx, world: World, a: Assets, t: number, q: 0 | 1 | 2) {
  const { w, h, scroll, motes } = world;
  ctx.globalCompositeOperation = "lighter";
  const n =
    q === 2
      ? motes.length
      : q === 1
        ? Math.ceil(motes.length * 0.6)
        : Math.ceil(motes.length * 0.35);
  for (let i = 0; i < n; i++) {
    const m = motes[i];
    const y = wrap(m.y + scroll * (6 + m.z * 22) + Math.sin(t * 0.5 + m.p * 2) * 8, h + 40) - 20;
    const x = m.x + Math.sin(t * 0.6 + m.p) * (10 + m.z * 12);
    // parpadeo tipo luciérnaga: encendido suave con pausas
    const pulse = Math.sin(t * (1.1 + m.z * 0.8) + m.p * 3);
    const lit = Math.max(0, pulse * 1.4 - 0.15);
    const alpha = 0.18 + Math.min(1, lit) * 0.82;
    ctx.globalAlpha = alpha * (0.55 + m.z * 0.45);
    blit(ctx, a.glow[m.tone], x, y, 0.22 + m.z * 0.32);
  }
  if (q >= 1) {
    // polen: motas minúsculas, dos lotes de alpha, un solo path por lote
    const count = q === 2 ? 48 : 20;
    const p = a.pollen;
    ctx.fillStyle = "#f6e2b4";
    for (let batch = 0; batch < 2; batch++) {
      ctx.globalAlpha = batch === 0 ? 0.22 : 0.42;
      ctx.beginPath();
      for (let i = batch; i < count; i += 2) {
        const z = p[i * 3 + 2];
        const x = p[i * 3] * w + Math.sin(t * (0.3 + z * 0.5) + i) * (8 + z * 14);
        const y = wrap(p[i * 3 + 1] * h + scroll * (4 + z * 18) + t * 6, h + 12) - 6;
        const s = 0.9 + z * 1.2;
        ctx.rect(x, y, s, s);
      }
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/** Hierba mecida por el viento en dos filas (lejana y cercana), un path por fila. */
function drawGrass(ctx: Ctx, a: Assets, w: number, h: number, t: number, q: 0 | 1 | 2) {
  const row = (
    grad: CanvasGradient,
    count: number,
    ht: number,
    bw: number,
    speed: number,
    seed: number,
  ) => {
    ctx.fillStyle = grad;
    ctx.beginPath();
    const stepX = (w + 20) / count;
    for (let i = 0; i < count; i++) {
      const x = -10 + i * stepX + ((i * 37 + seed) % 11);
      const hh = ht * (0.55 + (((i * 53 + seed) % 17) / 17) * 0.75);
      const gust =
        Math.sin(t * speed + i * 0.55 + seed) * 5 + Math.sin(t * speed * 0.37 + i * 0.13) * 4;
      ctx.moveTo(x - bw, h + 2);
      ctx.quadraticCurveTo(x + gust * 0.25, h - hh * 0.6, x + gust, h - hh);
      ctx.quadraticCurveTo(x + gust * 0.35 + bw * 0.8, h - hh * 0.55, x + bw, h + 2);
    }
    ctx.fill();
  };
  const dense = q === 2 ? 1 : q === 1 ? 0.75 : 0.5;
  row(a.grassFar, Math.round((w / 11) * dense), 52, 3.4, 1.15, 3);
  row(a.grassNear, Math.round((w / 15) * dense), 36, 4.2, 1.6, 9);
}

function drawEntities(ctx: Ctx, world: World, a: Assets, t: number, q: 0 | 1 | 2) {
  const al = world.alpha;

  for (const pulse of world.pulses) drawPulse(ctx, a, pulse);
  for (const ring of world.rings) drawRing(ctx, a, ring);
  for (const pickup of world.pickups) drawPickup(ctx, a, pickup, t);

  for (const enemy of world.enemies) {
    if (!enemy.dead) drawEnemy(ctx, a, enemy, t, al);
  }

  drawShots(ctx, a, world, al);

  if (world.player.alive && world.mode !== "over") drawBeetle(ctx, a, world.player, t, al);

  drawBits(ctx, a, world.bits, q);
  for (const floater of world.floaters) drawFloater(ctx, floater);
  if (world.bannerT > 0 && world.banner) drawBanner(ctx, world);
}

function drawBeetle(ctx: Ctx, a: Assets, player: Player, t: number, al: number) {
  const x = lerp(player.px, player.x, al);
  const y = lerp(player.py, player.y, al) + Math.sin(t * 3) * 1.5;
  const inv = player.invuln > 0;
  const base = inv ? 0.5 + (Math.sin(t * 28) * 0.5 + 0.5) * 0.5 : 1;

  // aura bioluminiscente
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = (0.24 + Math.sin(t * 2.4) * 0.06) * base;
  blit(ctx, a.glow.leaf, x, y + 2, 1.35);
  ctx.globalAlpha = 0.14 * base;
  blit(ctx, a.glow.gold, x, y - 6, 1.0);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(player.bank);

  // chorros del propulsor + estela de chispas
  const flick = 0.65 + Math.sin(t * 42) * 0.35;
  ctx.globalAlpha = flick * base;
  blit(ctx, a.glow.leaf, -6, 17, 0.62 + flick * 0.12);
  blit(ctx, a.glow.leaf, 6, 17, 0.62 + flick * 0.12);
  for (let i = 0; i < 5; i++) {
    const k = (t * 2.6 + i * 0.2) % 1;
    ctx.globalAlpha = (1 - k) * 0.55 * base;
    blit(
      ctx,
      a.glow.leaf,
      Math.sin(i * 2.1 + t * 3) * 3.2 + (i % 2 ? 4 : -4),
      18 + k * 30,
      0.18 + (1 - k) * 0.16,
    );
  }
  ctx.globalCompositeOperation = "source-over";

  // alas membranosas: aleteo rápido, más amplio al moverse
  const amp = 0.3 + Math.min(1, player.spd / 300) * 0.22;
  const flap = Math.sin(t * 58) * amp;
  ctx.globalAlpha = 0.62 * base;
  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.translate(side * 4, -3);
    ctx.scale(side, 1);
    ctx.rotate(-0.15 - 0.2 - flap);
    blit(ctx, a.wing, 0, 0);
    ctx.restore();
  }

  ctx.globalAlpha = base;
  blit(ctx, a.beetle, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawEnemy(ctx: Ctx, a: Assets, enemy: Enemy, t: number, al: number) {
  const x = lerp(enemy.px, enemy.x, al);
  const y = lerp(enemy.py, enemy.y, al);
  const kind = enemy.kind;
  const spr = a.enemy[kind];

  // brillo bioluminiscente por especie
  ctx.globalCompositeOperation = "lighter";
  const pulse = 0.5 + Math.sin(t * 3 + enemy.phase) * 0.5;
  if (kind === "queen") {
    ctx.globalAlpha = 0.34 + pulse * 0.12;
    blit(ctx, a.glow.gold, x, y, 3.1);
    ctx.globalAlpha = 0.16 + pulse * 0.1;
    blit(ctx, a.glow.sting, x, y + 14, 1.8);
  } else if (kind === "scorpion") {
    ctx.globalAlpha = 0.22 + pulse * 0.08;
    blit(ctx, a.glow.sting, x, y, 1.6);
    ctx.globalAlpha = 0.5 + pulse * 0.4;
    blit(ctx, a.glow.sting, x, y - 16, 0.5);
  } else if (kind === "spider") {
    ctx.globalAlpha = 0.2 + pulse * 0.1;
    blit(ctx, a.glow.gold, x, y + 6, 1.3);
  } else {
    ctx.globalAlpha = 0.18 + pulse * 0.08;
    blit(ctx, a.glow.leaf, x, y, kind === "ant" ? 0.95 : 1.05);
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(x, y);
  if (kind === "ant") antLegs(ctx, t);
  else if (kind === "mosquito") mosquitoWings(ctx, t);
  else if (kind === "spider") spiderLegs(ctx, t);
  else if (kind === "scorpion") scorpionClaws(ctx, t);
  else queenWings(ctx, t);
  blit(ctx, spr, 0, 0);
  if (kind === "mosquito") {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.6 + pulse * 0.4;
    blit(ctx, a.glow.sting, 0, 19, 0.28);
  } else if (kind === "queen") {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 + Math.sin(t * 8 + enemy.phase) * 0.4;
    blit(ctx, a.glow.sting, 0, 32, 0.7);
  }
  if (enemy.hit && enemy.hit > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, enemy.hit) * 0.75;
    blit(ctx, spr, 0, 0);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  if (enemy.hp < enemy.maxHp) drawHpBar(ctx, enemy, x, y);
}

function drawHpBar(ctx: Ctx, enemy: Enemy, x: number, y: number) {
  const queen = enemy.kind === "queen";
  const bw = queen ? 58 : 24;
  const by = y - (queen ? 54 : enemy.r + 10);
  const bx = x - bw / 2;
  ctx.fillStyle = "rgba(2, 8, 5, 0.75)";
  ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
  ctx.fillStyle = PALETTE.line;
  ctx.fillRect(bx, by, bw, 3);
  ctx.fillStyle = queen ? PALETTE.gold : PALETTE.leaf;
  ctx.fillRect(bx, by, bw * Math.max(0, enemy.hp / enemy.maxHp), 3);
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.fillRect(bx, by, bw * Math.max(0, enemy.hp / enemy.maxHp), 1);
}

function antLegs(ctx: Ctx, t: number) {
  ctx.strokeStyle = "#8fb09b";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const swing = Math.sin(t * 14 + i) * 3;
    const y = -6 + i * 6;
    ctx.moveTo(-4, y);
    ctx.lineTo(-8, y + 1 + swing * 0.5);
    ctx.lineTo(-12, y + 5 + swing);
    ctx.moveTo(4, y);
    ctx.lineTo(8, y + 1 - swing * 0.5);
    ctx.lineTo(12, y + 5 - swing);
  }
  ctx.stroke();
}

function mosquitoWings(ctx: Ctx, t: number) {
  const flap = Math.sin(t * 36) * 0.5;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "rgba(182, 242, 122, 0.55)";
  ctx.strokeStyle = "rgba(220, 255, 200, 0.7)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(-8, -3, 9, 3, -0.6 + flap, 0, TAU);
  ctx.ellipse(8, -3, 9, 3, 0.6 - flap, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function spiderLegs(ctx: Ctx, t: number) {
  ctx.strokeStyle = "#7ea48b";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const wave = Math.sin(t * 9 + i) * 3;
    const y0 = -6 + i * 4;
    for (let side = -1; side <= 1; side += 2) {
      ctx.moveTo(side * 5, y0);
      ctx.lineTo(side * (16 + i), y0 - 6 + wave);
      ctx.lineTo(side * (20 + (i % 2) * 3), y0 + 8);
    }
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(228, 177, 90, 0.5)";
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

function scorpionClaws(ctx: Ctx, t: number) {
  const pinch = Math.sin(t * 4) * 2;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-8, -2);
  ctx.lineTo(-18, -8 + pinch);
  ctx.lineTo(-22, -4);
  ctx.moveTo(8, -2);
  ctx.lineTo(18, -8 - pinch);
  ctx.lineTo(22, -4);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 240, 200, 0.6)";
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.strokeStyle = "#a9873e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const sw = Math.sin(t * 7 + i) * 2;
    ctx.moveTo(-10, 2 + i * 3);
    ctx.lineTo(-17, 6 + i * 3 + sw);
    ctx.moveTo(10, 2 + i * 3);
    ctx.lineTo(17, 6 + i * 3 - sw);
  }
  ctx.stroke();
}

function queenWings(ctx: Ctx, t: number) {
  const flap = Math.sin(t * 18) * 0.35;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(246, 226, 180, 0.38)";
  ctx.strokeStyle = "rgba(255, 245, 210, 0.7)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(-20, -7, 18, 6.5, -0.5 + flap, 0, TAU);
  ctx.ellipse(20, -7, 18, 6.5, 0.5 - flap, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(246, 226, 180, 0.25)";
  ctx.beginPath();
  ctx.ellipse(-16, 3, 13, 4.4, -0.2 + flap * 0.5, 0, TAU);
  ctx.ellipse(16, 3, 13, 4.4, 0.2 - flap * 0.5, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function drawShots(ctx: Ctx, a: Assets, world: World, al: number) {
  const { shots } = world;
  // 1) todo aditivo: halos de enemigos y balas amigas (un solo cambio de modo)
  ctx.globalCompositeOperation = "lighter";
  for (const shot of shots) {
    const x = lerp(shot.px, shot.x, al);
    const y = lerp(shot.py, shot.y, al);
    if (shot.friendly) {
      const ang = Math.atan2(shot.vy, shot.vx) + Math.PI / 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(a.bolt.c, -a.bolt.ox, -a.bolt.oy, a.bolt.w, a.bolt.h);
      ctx.restore();
    } else {
      const s = shot.r / 4.5;
      ctx.globalAlpha = 0.22;
      blit(ctx, a.glow.sting, x - shot.vx * 0.05, y - shot.vy * 0.05, 0.5 * s);
      ctx.globalAlpha = 0.4;
      blit(ctx, a.glow.sting, x - shot.vx * 0.026, y - shot.vy * 0.026, 0.62 * s);
      ctx.globalAlpha = 0.65;
      blit(ctx, a.glow.sting, x, y, 1.05 * s);
    }
  }
  ctx.globalCompositeOperation = "source-over";
  // 2) orbes enemigos con borde oscuro, encima del halo
  ctx.globalAlpha = 1;
  for (const shot of shots) {
    if (shot.friendly) continue;
    const x = lerp(shot.px, shot.x, al);
    const y = lerp(shot.py, shot.y, al);
    blit(ctx, a.orb, x, y, shot.r / 4.5);
  }
}

function drawPickup(ctx: Ctx, a: Assets, pickup: Pickup, t: number) {
  if (pickup.life < 2 && Math.sin(t * 16) > 0) return;
  const tone: Tone = pickup.kind === "heal" ? "leaf" : "gold";
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.5 + Math.sin(t * 5 + pickup.x) * 0.15;
  blit(ctx, a.glow[tone], pickup.x, pickup.y, 1.1);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(pickup.x, pickup.y);
  ctx.rotate(t);
  blit(ctx, a.pickup[pickup.kind], 0, 0);
  ctx.restore();
  // órbita pequeña
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.8;
  blit(ctx, a.glow[tone], pickup.x + Math.cos(t * 4) * 13, pickup.y + Math.sin(t * 4) * 13, 0.18);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

function drawBits(ctx: Ctx, a: Assets, bits: Bit[], q: 0 | 1 | 2) {
  ctx.globalCompositeOperation = "lighter";
  const skip = q === 2 ? 1 : q === 1 ? 2 : 3;
  for (let i = 0; i < bits.length; i += skip) {
    const bit = bits[i];
    const k = Math.max(0, bit.life / bit.max);
    ctx.globalAlpha = Math.min(1, k * 1.4);
    blit(ctx, a.glow[bit.tone], bit.x, bit.y, (bit.size * 2.2 * (0.35 + k * 0.65)) / 16 + 0.08);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawFloater(ctx: Ctx, floater: Floater) {
  const k = Math.max(0, floater.life / floater.max);
  const pop = 1 + Math.max(0, k - 0.82) * 2.2;
  ctx.globalAlpha = Math.min(1, k * 1.6);
  ctx.font = `700 ${(13 * pop).toFixed(1)}px Oxanium, sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(2, 8, 5, 0.8)";
  ctx.strokeText(floater.text, floater.x, floater.y);
  ctx.fillStyle = TONE[floater.tone];
  ctx.fillText(floater.text, floater.x, floater.y);
  ctx.globalAlpha = 1;
}

function drawRing(ctx: Ctx, a: Assets, ring: Ring) {
  const k = 1 - ring.life / ring.max;
  const ease = 1 - (1 - k) * (1 - k);
  const diameter = ring.size * (0.5 + ease * 1.6);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.pow(1 - k, 1.4) * 0.9;
  blit(ctx, a.ring[ring.tone], ring.x, ring.y, diameter / 128);
  ctx.globalAlpha = Math.pow(1 - k, 2.2) * 0.55;
  blit(ctx, a.glow[ring.tone], ring.x, ring.y, (ring.size / 64) * (0.9 + ease * 0.5));
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawPulse(ctx: Ctx, a: Assets, pulse: Pulse) {
  const k = 1 - pulse.life / pulse.max;
  const radius = 20 + k * 210;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = (1 - k) * 0.55;
  blit(ctx, a.glow.leaf, pulse.x, pulse.y, (radius / 32) * 1.1);
  ctx.globalAlpha = 1 - k;
  blit(ctx, a.ring.leaf, pulse.x, pulse.y, (radius * 2.2) / 128);
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = PALETTE.leaf;
  ctx.globalAlpha = (1 - k) * 0.9;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pulse.x, pulse.y, radius, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBanner(ctx: Ctx, world: World) {
  const k = Math.min(1, world.bannerT);
  const intro = Math.min(1, (1.5 - world.bannerT) * 5);
  const y = world.h * 0.38;
  const cx = world.w / 2;
  ctx.globalAlpha = k;
  ctx.textAlign = "center";
  ctx.font = `560 ${(26 + 4 * Math.min(1, intro)).toFixed(1)}px Fraunces, Palatino, serif`;
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(2, 8, 5, 0.75)";
  ctx.strokeText(world.banner, cx, y);
  ctx.fillStyle = PALETTE.goldHi;
  ctx.fillText(world.banner, cx, y);
  // filetes dorados a ambos lados
  const half = ctx.measureText(world.banner).width / 2;
  const reach = 34 * intro;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 1;
  ctx.globalAlpha = k * 0.7;
  ctx.beginPath();
  ctx.moveTo(cx - half - 12, y - 9);
  ctx.lineTo(cx - half - 12 - reach, y - 9);
  ctx.moveTo(cx + half + 12, y - 9);
  ctx.lineTo(cx + half + 12 + reach, y - 9);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
