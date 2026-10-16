import { PALETTE } from "./types";
import type { Bit, Enemy, Floater, Leaf, Mote, Pickup, Player, Pulse, Shot, Tone } from "./types";

export interface World {
  w: number;
  h: number;
  scroll: number;
  time: number;
  shake: number;
  flash: number;
  leaves: Leaf[];
  motes: Mote[];
  player: Player;
  enemies: Enemy[];
  shots: Shot[];
  bits: Bit[];
  floaters: Floater[];
  pickups: Pickup[];
  pulses: Pulse[];
  banner: string;
  bannerT: number;
  mode: "title" | "playing" | "over";
  reduced: boolean;
}

const TONE: Record<Tone, string> = {
  gold: PALETTE.gold,
  leaf: PALETTE.leaf,
  sting: PALETTE.sting,
  fg: PALETTE.fg,
  muted: PALETTE.muted,
};

export function drawWorld(ctx: CanvasRenderingContext2D, world: World) {
  const { w, h } = world;
  ctx.clearRect(0, 0, w, h);
  drawGarden(ctx, world);

  ctx.save();
  if (world.shake > 0.2 && !world.reduced) {
    const s = world.shake;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }

  for (const pulse of world.pulses) drawPulse(ctx, pulse);
  for (const pickup of world.pickups) drawPickup(ctx, pickup, world.time);
  for (const shot of world.shots) drawShot(ctx, shot);
  for (const enemy of world.enemies) {
    if (!enemy.dead) drawEnemy(ctx, enemy, world.time);
  }
  if (world.player.alive && world.mode !== "over") drawBeetle(ctx, world.player, world.time);
  for (const bit of world.bits) drawBit(ctx, bit);
  for (const floater of world.floaters) drawFloater(ctx, floater);
  if (world.bannerT > 0 && world.banner) drawBanner(ctx, world);
  ctx.restore();

  if (world.flash > 0) {
    ctx.fillStyle = `rgba(228, 177, 90, ${world.flash * 0.28})`;
    ctx.fillRect(0, 0, w, h);
  }

  const edge = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h * 0.5, h * 0.72);
  edge.addColorStop(0, "rgba(4, 10, 7, 0)");
  edge.addColorStop(1, "rgba(4, 10, 7, 0.55)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
}

function drawGarden(ctx: CanvasRenderingContext2D, world: World) {
  const { w, h, scroll, time } = world;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#06110c");
  sky.addColorStop(0.45, PALETTE.bg);
  sky.addColorStop(1, "#030806");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const moon = ctx.createRadialGradient(w * 0.74, h * 0.14, 4, w * 0.74, h * 0.14, w * 0.28);
  moon.addColorStop(0, "rgba(246, 226, 180, 0.55)");
  moon.addColorStop(0.18, "rgba(228, 177, 90, 0.16)");
  moon.addColorStop(1, "rgba(228, 177, 90, 0)");
  ctx.fillStyle = moon;
  ctx.fillRect(0, 0, w, h);

  for (const leaf of world.leaves) {
    if (leaf.layer !== 0) continue;
    const y = wrap(leaf.y + scroll * 16, h + 180) - 90;
    paintLeaf(ctx, leaf.x, y, leaf.s, leaf.rot + scroll * 0.01, 0.28);
  }

  ctx.strokeStyle = "rgba(42, 70, 54, 0.45)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const x = ((i * 97 + w * 0.15) % w);
    const y0 = wrap(i * 140 + scroll * 28, h + 80) - 40;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.bezierCurveTo(x + 12, y0 + 40, x - 16, y0 + 90, x + 4, y0 + 160);
    ctx.stroke();
  }

  for (const leaf of world.leaves) {
    if (leaf.layer === 0) continue;
    const y = wrap(leaf.y + scroll * 42, h + 200) - 100;
    paintLeaf(ctx, leaf.x, y, leaf.s * 1.05, leaf.rot, 0.55);
  }

  for (const mote of world.motes) {
    const y = wrap(mote.y + scroll * (14 + mote.z * 36), h + 30) - 10;
    const x = mote.x + Math.sin(time * 0.7 + mote.p) * 10;
    const a = 0.25 + (Math.sin(time * 2.2 + mote.p) * 0.5 + 0.5) * 0.6;
    ctx.globalAlpha = a;
    ctx.fillStyle = TONE[mote.tone];
    ctx.beginPath();
    ctx.arc(x, y, mote.z > 0.6 ? 2.1 : 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function paintLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  rot: number,
  alpha: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE.canopy;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.72, -s * 0.35, s * 0.5, s * 0.5, 0, s);
  ctx.bezierCurveTo(-s * 0.5, s * 0.5, -s * 0.72, -s * 0.35, 0, -s);
  ctx.fill();
  ctx.strokeStyle = PALETTE.mossHi;
  ctx.globalAlpha = alpha * 0.7;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.8);
  ctx.lineTo(0, s * 0.75);
  ctx.stroke();
  ctx.restore();
}

function drawBeetle(ctx: CanvasRenderingContext2D, player: Player, time: number) {
  ctx.save();
  ctx.translate(player.x, player.y + Math.sin(time * 3) * 1.5);
  ctx.rotate(player.bank);
  if (player.invuln > 0) ctx.globalAlpha = 0.45 + (Math.sin(time * 28) * 0.5 + 0.5) * 0.55;

  const flick = 0.65 + Math.sin(time * 42) * 0.35;
  const jet = ctx.createLinearGradient(0, 8, 0, 28);
  jet.addColorStop(0, PALETTE.leaf);
  jet.addColorStop(1, "rgba(182, 242, 122, 0)");
  ctx.fillStyle = jet;
  ctx.globalAlpha *= flick;
  ctx.beginPath();
  ctx.ellipse(-6, 16, 3.2, 9, 0, 0, Math.PI * 2);
  ctx.ellipse(6, 16, 3.2, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = player.invuln > 0 ? ctx.globalAlpha : 1;
  if (player.invuln > 0) ctx.globalAlpha = 0.55 + Math.sin(time * 28) * 0.25;

  const shell = ctx.createLinearGradient(-16, -18, 12, 16);
  shell.addColorStop(0, PALETTE.mossHi);
  shell.addColorStop(0.45, PALETTE.mossMid);
  shell.addColorStop(1, PALETTE.moss);

  const wing = (side: number) => {
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.quadraticCurveTo(side * 24, -6, side * 14, 14);
    ctx.quadraticCurveTo(side * 6, 8, 0, 4);
    ctx.closePath();
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(side * 3, -8);
    ctx.quadraticCurveTo(side * 12, 0, side * 6, 10);
    ctx.strokeStyle = PALETTE.leafDeep;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  wing(-1);
  wing(1);

  ctx.fillStyle = PALETTE.gold;
  ctx.fillRect(-0.7, -14, 1.4, 18);

  ctx.fillStyle = PALETTE.mossMid;
  ctx.beginPath();
  ctx.ellipse(0, -16, 6.5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold;
  ctx.stroke();

  ctx.strokeStyle = PALETTE.goldHi;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-3, -20);
  ctx.quadraticCurveTo(-10, -30, -7, -34);
  ctx.moveTo(3, -20);
  ctx.quadraticCurveTo(10, -30, 7, -34);
  ctx.stroke();

  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(-2.4, -17, 1.5, 0, Math.PI * 2);
  ctx.arc(2.4, -17, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.fg;
  ctx.beginPath();
  ctx.arc(-2, -17.4, 0.55, 0, Math.PI * 2);
  ctx.arc(2.8, -17.4, 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = PALETTE.goldHi;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-4, -12);
  ctx.lineTo(-9, -8);
  ctx.moveTo(4, -12);
  ctx.lineTo(9, -8);
  ctx.stroke();

  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, time: number) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  if (enemy.kind === "ant") drawAnt(ctx, time);
  else if (enemy.kind === "mosquito") drawMosquito(ctx, time);
  else if (enemy.kind === "spider") drawSpider(ctx, time);
  else if (enemy.kind === "scorpion") drawScorpion(ctx, time);
  else drawQueen(ctx, time, enemy);
  ctx.restore();

  if (enemy.hp < enemy.maxHp) {
    const bw = enemy.kind === "queen" ? 54 : 22;
    const y = enemy.y - (enemy.kind === "queen" ? 48 : enemy.r + 8);
    ctx.fillStyle = PALETTE.line;
    ctx.fillRect(enemy.x - bw / 2, y, bw, 3);
    ctx.fillStyle = enemy.kind === "queen" ? PALETTE.gold : PALETTE.leaf;
    ctx.fillRect(enemy.x - bw / 2, y, bw * Math.max(0, enemy.hp / enemy.maxHp), 3);
  }
}

function drawAnt(ctx: CanvasRenderingContext2D, time: number) {
  ctx.strokeStyle = PALETTE.muted;
  ctx.lineWidth = 1.3;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const swing = Math.sin(time * 14 + i) * 3;
    const y = -6 + i * 6;
    ctx.beginPath();
    ctx.moveTo(-4, y);
    ctx.lineTo(-11, y + 4 + swing);
    ctx.moveTo(4, y);
    ctx.lineTo(11, y + 4 - swing);
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.mossMid;
  ctx.beginPath();
  ctx.ellipse(0, 7, 5, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.mossHi;
  ctx.beginPath();
  ctx.ellipse(0, -1, 3.6, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -8, 3.2, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.moveTo(-1.5, -10);
  ctx.quadraticCurveTo(-6, -16, -4, -18);
  ctx.moveTo(1.5, -10);
  ctx.quadraticCurveTo(6, -16, 4, -18);
  ctx.stroke();
}

function drawMosquito(ctx: CanvasRenderingContext2D, time: number) {
  const flap = Math.sin(time * 36) * 0.5;
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = PALETTE.leaf;
  ctx.beginPath();
  ctx.ellipse(-7, -2, 8, 3.2, -0.6 + flap, 0, Math.PI * 2);
  ctx.ellipse(7, -2, 8, 3.2, 0.6 - flap, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = PALETTE.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-2, 2);
  ctx.lineTo(-8, 10);
  ctx.moveTo(2, 2);
  ctx.lineTo(8, 10);
  ctx.moveTo(-1, 6);
  ctx.lineTo(-6, 14);
  ctx.moveTo(1, 6);
  ctx.lineTo(6, 14);
  ctx.stroke();
  ctx.fillStyle = PALETTE.mossHi;
  ctx.beginPath();
  ctx.ellipse(0, -2, 2.2, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.sting;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 5);
  ctx.lineTo(0, 16);
  ctx.stroke();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(0, -8, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpider(ctx: CanvasRenderingContext2D, time: number) {
  ctx.strokeStyle = PALETTE.muted;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (let i = 0; i < 4; i++) {
    const wave = Math.sin(time * 9 + i) * 3;
    const y0 = -6 + i * 4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 5, y0);
      ctx.lineTo(side * (16 + i), y0 - 6 + wave);
      ctx.lineTo(side * (20 + (i % 2) * 3), y0 + 8);
      ctx.stroke();
    }
  }
  const body = ctx.createRadialGradient(-3, 2, 2, 0, 5, 14);
  body.addColorStop(0, PALETTE.mossHi);
  body.addColorStop(1, PALETTE.canopy);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 6, 11, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(3.5, 9);
  ctx.lineTo(0, 13);
  ctx.lineTo(-3.5, 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.mossMid;
  ctx.beginPath();
  ctx.ellipse(0, -8, 6.5, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.sting;
  ctx.beginPath();
  ctx.arc(-2.5, -9, 1.2, 0, Math.PI * 2);
  ctx.arc(2.5, -9, 1.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawScorpion(ctx: CanvasRenderingContext2D, time: number) {
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  const pinch = Math.sin(time * 4) * 2;
  ctx.beginPath();
  ctx.moveTo(-8, -2);
  ctx.lineTo(-18, -8 + pinch);
  ctx.lineTo(-22, -4);
  ctx.moveTo(8, -2);
  ctx.lineTo(18, -8 - pinch);
  ctx.lineTo(22, -4);
  ctx.stroke();
  ctx.fillStyle = PALETTE.mossMid;
  ctx.beginPath();
  ctx.ellipse(0, 2, 14, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(6, -4);
  ctx.quadraticCurveTo(16, -18, 4, -22);
  ctx.quadraticCurveTo(-2, -24, 0, -16);
  ctx.stroke();
  ctx.fillStyle = PALETTE.sting;
  ctx.beginPath();
  ctx.arc(0, -16, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.goldHi;
  ctx.beginPath();
  ctx.arc(-4, 0, 1.1, 0, Math.PI * 2);
  ctx.arc(4, 0, 1.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawQueen(ctx: CanvasRenderingContext2D, time: number, enemy: Enemy) {
  const flap = Math.sin(time * 18) * 0.35;
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = PALETTE.goldHi;
  ctx.beginPath();
  ctx.ellipse(-18, -6, 16, 6, -0.5 + flap, 0, Math.PI * 2);
  ctx.ellipse(18, -6, 16, 6, 0.5 - flap, 0, Math.PI * 2);
  ctx.ellipse(-14, 2, 12, 4, -0.2, 0, Math.PI * 2);
  ctx.ellipse(14, 2, 12, 4, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = PALETTE.moss;
  ctx.beginPath();
  ctx.ellipse(0, 8, 12, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 2;
  ctx.stroke();
  for (const y of [2, 8, 14]) {
    ctx.beginPath();
    ctx.moveTo(-8, y);
    ctx.quadraticCurveTo(0, y + 3, 8, y);
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.mossHi;
  ctx.beginPath();
  ctx.ellipse(0, -12, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold;
  ctx.stroke();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(-3, -13, 1.5, 0, Math.PI * 2);
  ctx.arc(3, -13, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.goldHi;
  ctx.beginPath();
  ctx.moveTo(-2, -18);
  ctx.lineTo(-6, -28);
  ctx.moveTo(2, -18);
  ctx.lineTo(6, -28);
  ctx.stroke();
  const sting = 0.6 + Math.sin(time * 8 + enemy.phase) * 0.4;
  ctx.globalAlpha = sting;
  ctx.fillStyle = PALETTE.sting;
  ctx.beginPath();
  ctx.moveTo(0, 24);
  ctx.lineTo(4, 32);
  ctx.lineTo(-4, 32);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawShot(ctx: CanvasRenderingContext2D, shot: Shot) {
  if (shot.friendly) {
    ctx.strokeStyle = PALETTE.goldHi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shot.x, shot.y);
    ctx.lineTo(shot.x - shot.vx * 0.03, shot.y - shot.vy * 0.03);
    ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.ellipse(shot.x, shot.y, 2.2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const g = ctx.createRadialGradient(shot.x, shot.y, 0, shot.x, shot.y, shot.r * 2);
  g.addColorStop(0, PALETTE.goldHi);
  g.addColorStop(0.4, PALETTE.sting);
  g.addColorStop(1, "rgba(226, 91, 69, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(shot.x, shot.y, shot.r * 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawPickup(ctx: CanvasRenderingContext2D, pickup: Pickup, time: number) {
  const blink = pickup.life < 2 && Math.sin(time * 16) > 0;
  if (blink) return;
  ctx.save();
  ctx.translate(pickup.x, pickup.y);
  ctx.rotate(time);
  ctx.strokeStyle = pickup.kind === "heal" ? PALETTE.leaf : PALETTE.gold;
  ctx.fillStyle = PALETTE.bg;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(6, 0);
  ctx.lineTo(0, 8);
  ctx.lineTo(-6, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = pickup.kind === "heal" ? PALETTE.leaf : PALETTE.goldHi;
  if (pickup.kind === "heal") {
    ctx.fillRect(-1.2, -4, 2.4, 8);
    ctx.fillRect(-4, -1.2, 8, 2.4);
  } else if (pickup.kind === "abanico") {
    ctx.beginPath();
    ctx.arc(0, 2, 3.2, Math.PI, 0);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBit(ctx: CanvasRenderingContext2D, bit: Bit) {
  ctx.globalAlpha = Math.max(0, bit.life / bit.max);
  ctx.fillStyle = TONE[bit.tone];
  ctx.fillRect(bit.x, bit.y, bit.size, bit.size);
  ctx.globalAlpha = 1;
}

function drawFloater(ctx: CanvasRenderingContext2D, floater: Floater) {
  ctx.globalAlpha = Math.max(0, floater.life / floater.max);
  ctx.fillStyle = TONE[floater.tone];
  ctx.font = "600 13px Oxanium, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(floater.text, floater.x, floater.y);
  ctx.globalAlpha = 1;
}

function drawPulse(ctx: CanvasRenderingContext2D, pulse: Pulse) {
  const k = 1 - pulse.life / pulse.max;
  ctx.strokeStyle = PALETTE.leaf;
  ctx.globalAlpha = pulse.life / pulse.max;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(pulse.x, pulse.y, 20 + k * 210, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBanner(ctx: CanvasRenderingContext2D, world: World) {
  ctx.globalAlpha = Math.min(1, world.bannerT);
  ctx.fillStyle = PALETTE.goldHi;
  ctx.font = '560 28px Fraunces, Palatino, serif';
  ctx.textAlign = "center";
  ctx.fillText(world.banner, world.w / 2, world.h * 0.38);
  ctx.globalAlpha = 1;
}

function wrap(v: number, m: number) {
  return ((v % m) + m) % m;
}
