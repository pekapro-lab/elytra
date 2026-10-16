import { MicroGame } from "./engine";
import { WEAPON_LABEL, type HudSnapshot } from "./types";

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("Falta el lienzo");

const title = document.querySelector<HTMLElement>("#title")!;
const playing = document.querySelector<HTMLElement>("#playing")!;
const over = document.querySelector<HTMLElement>("#over")!;
const pause = document.querySelector<HTMLElement>("#pause")!;
const scoreEl = document.querySelector<HTMLElement>("#score")!;
const waveEl = document.querySelector<HTMLElement>("#wave")!;
const hiEl = document.querySelector<HTMLElement>("#hi")!;
const hpText = document.querySelector<HTMLElement>("#hp-text")!;
const hpBar = document.querySelector<HTMLElement>("#hp-bar")!;
const weaponEl = document.querySelector<HTMLElement>("#weapon")!;
const bombBtn = document.querySelector<HTMLButtonElement>("#bomb")!;
const hint = document.querySelector<HTMLElement>("#hint")!;
const muteBtn = document.querySelector<HTMLButtonElement>("#mute")!;
const titleHi = document.querySelector<HTMLElement>("#title-hi")!;
const overScore = document.querySelector<HTMLElement>("#over-score")!;
const overMeta = document.querySelector<HTMLElement>("#over-meta")!;
const overRecord = document.querySelector<HTMLElement>("#over-record")!;
const sideWave = document.querySelector<HTMLElement>("#side-wave")!;
const sideWeapon = document.querySelector<HTMLElement>("#side-weapon")!;

function paint(hud: HudSnapshot) {
  title.hidden = hud.mode !== "title";
  playing.hidden = hud.mode !== "playing";
  over.hidden = hud.mode !== "over";
  pause.hidden = !(hud.paused && hud.mode === "playing");
  scoreEl.textContent = String(hud.score);
  waveEl.textContent = String(hud.wave);
  hiEl.textContent = String(hud.hi);
  const pct = Math.max(0, Math.round((hud.hp / hud.maxHp) * 100));
  hpBar.style.width = `${pct}%`;
  hpBar.dataset.low = hud.hp > 0 && hud.hp / hud.maxHp < 0.35 ? "1" : "0";
  hpText.textContent = `Vida ${hud.hp}`;
  const extra = hud.weapon !== "aguijon" ? ` ${Math.ceil(hud.weaponLeft)}s` : "";
  const combo = hud.combo >= 2 ? ` · racha ×${hud.combo}` : "";
  weaponEl.textContent = `${WEAPON_LABEL[hud.weapon]}${extra}${combo}`;
  bombBtn.textContent = hud.bombLeft > 0 ? `Espora ${Math.ceil(hud.bombLeft)}` : "Espora";
  bombBtn.dataset.cool = hud.bombLeft > 0 ? "1" : "0";
  hint.hidden = !hud.showHint;
  muteBtn.textContent = hud.muted ? "Sonido" : "Silencio";
  muteBtn.setAttribute("aria-label", hud.muted ? "Activar sonido" : "Silenciar");
  titleHi.textContent = hud.hi > 0 ? `Récord ${hud.hi}` : "Sin récord";
  overScore.textContent = String(hud.score);
  overMeta.textContent = `Oleada ${hud.wave} · récord ${hud.hi}`;
  overRecord.hidden = !hud.newRecord;
  sideWave.textContent = `Oleada ${hud.mode === "title" ? "—" : hud.wave}`;
  sideWeapon.textContent = WEAPON_LABEL[hud.weapon];
}

const game = new MicroGame(canvas, paint);

document.querySelector("#play")?.addEventListener("click", () => game.play());
document.querySelector("#again")?.addEventListener("click", () => game.play());
document.querySelector("#resume")?.addEventListener("click", () => game.togglePause());
document.querySelector("#pause-btn")?.addEventListener("click", () => game.togglePause());
muteBtn.addEventListener("click", () => game.toggleMute());
bombBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  game.bomb();
});
