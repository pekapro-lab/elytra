export const PALETTE = {
  bg: "#07140c",
  bgDeep: "#040a07",
  canopy: "#0e2418",
  moss: "#173526",
  mossMid: "#234833",
  mossHi: "#3d7a52",
  leaf: "#b6f27a",
  leafDeep: "#6ea84a",
  gold: "#e4b15a",
  goldHi: "#f6e2b4",
  sting: "#e25b45",
  stingDeep: "#8d2e28",
  fg: "#f4efe4",
  muted: "#9bb3a2",
  line: "#2a4636",
} as const;

export type Tone = "gold" | "leaf" | "sting" | "fg" | "muted";

export type Mode = "title" | "playing" | "over";

export type Kind = "ant" | "mosquito" | "spider" | "scorpion" | "queen";

export type Weapon = "aguijon" | "abanico" | "pulso";

export type PickupKind = "heal" | "abanico" | "pulso";

export interface Player {
  x: number;
  y: number;
  /** Posición del paso anterior (solo para interpolar el dibujo). */
  px?: number;
  py?: number;
  r: number;
  hp: number;
  maxHp: number;
  bank: number;
  invuln: number;
  spd: number;
  alive: boolean;
}

export interface Enemy {
  kind: Kind;
  x: number;
  y: number;
  px?: number;
  py?: number;
  /** Destello visual al recibir daño (0..1). */
  hit?: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  r: number;
  phase: number;
  shoot: number;
  aux: number;
  score: number;
  dead: boolean;
}

export interface Shot {
  x: number;
  y: number;
  px?: number;
  py?: number;
  vx: number;
  vy: number;
  r: number;
  friendly: boolean;
  dmg: number;
  life: number;
}

export interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  tone: Tone;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
  max: number;
  tone: Tone;
}

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  vy: number;
  life: number;
}

export interface Ring {
  x: number;
  y: number;
  life: number;
  max: number;
  size: number;
  tone: Tone;
}

export interface Pulse {
  x: number;
  y: number;
  life: number;
  max: number;
}

export interface Leaf {
  x: number;
  y: number;
  s: number;
  rot: number;
  layer: number;
}

export interface Mote {
  x: number;
  y: number;
  z: number;
  p: number;
  tone: Tone;
}

export interface Spawn {
  delay: number;
  kind: Kind;
  x: number;
}

export interface HudSnapshot {
  mode: Mode;
  paused: boolean;
  muted: boolean;
  score: number;
  hi: number;
  hp: number;
  maxHp: number;
  wave: number;
  combo: number;
  weapon: Weapon;
  weaponLeft: number;
  bombRatio: number;
  bombLeft: number;
  newRecord: boolean;
  showHint: boolean;
}

export const HI_KEY = "microcosmos-record-v1";

export const WEAPON_LABEL: Record<Weapon, string> = {
  aguijon: "Aguijón",
  abanico: "Abanico",
  pulso: "Pulso",
};
