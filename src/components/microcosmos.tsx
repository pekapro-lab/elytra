import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { MicroGame } from "@/game/engine";
import { WEAPON_LABEL, type HudSnapshot } from "@/game/types";

const INITIAL: HudSnapshot = {
  mode: "title",
  paused: false,
  muted: false,
  score: 0,
  hi: 0,
  hp: 100,
  maxHp: 100,
  wave: 1,
  combo: 0,
  weapon: "aguijon",
  weaponLeft: 0,
  bombRatio: 1,
  bombLeft: 0,
  newRecord: false,
  showHint: true,
};

export function Microcosmos() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<MicroGame | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new MicroGame(canvas, setHud);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const hpPct = Math.max(0, Math.round((hud.hp / hud.maxHp) * 100));
  const low = hud.hp > 0 && hud.hp / hud.maxHp < 0.35;

  return (
    <div className="relative h-dvh overflow-hidden bg-bg-deep text-fg">
      <aside className="pointer-events-none absolute inset-y-0 left-0 hidden w-[calc((100%-32rem)/2)] flex-col items-end justify-end px-10 py-12 lg:flex">
        <div className="w-full max-w-52 text-right">
          <p className="font-display text-3xl italic leading-none text-fg">Elytra</p>
          <p className="mt-2 text-xs tracking-widest text-gold">MICROCOSMOS</p>
          <p className="mt-6 text-sm text-muted">Oleada {hud.mode === "title" ? "—" : hud.wave}</p>
          <p className="mt-1 text-sm text-fg">{WEAPON_LABEL[hud.weapon]}</p>
        </div>
      </aside>

      <div className="relative mx-auto h-full w-full max-w-lg select-none lg:border-x lg:border-line">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          aria-label="Elytra, campo de juego"
        />

        {hud.mode === "playing" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col">
            <header className="glass-hud m-3 rounded-2xl px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-lg italic leading-none text-fg">Elytra</p>
                <div className="flex items-center gap-2">
                  <IconButton
                    label={hud.muted ? "Activar sonido" : "Silenciar"}
                    onClick={() => gameRef.current?.toggleMute()}
                  >
                    {hud.muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                  </IconButton>
                  <IconButton label="Pausa" onClick={() => gameRef.current?.togglePause()}>
                    <Pause className="size-5" />
                  </IconButton>
                </div>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs tracking-widest text-muted">PUNTOS</p>
                  <p className="glow-gold text-2xl font-semibold tabular-nums leading-none text-gold">{hud.score}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs tracking-widest text-muted">OLEADA {hud.wave}</p>
                  <p className="text-sm tabular-nums text-fg">Récord {hud.hi}</p>
                </div>
              </div>
              <div className="hp-track mt-2 h-2 overflow-hidden rounded-full bg-moss" aria-hidden="true">
                <div
                  className={`hp-fill h-full rounded-full ${low ? "hp-low" : ""}`}
                  style={{ width: `${hpPct}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                <span>Vida {hud.hp}</span>
                <span>
                  {WEAPON_LABEL[hud.weapon]}
                  {hud.weapon !== "aguijon" ? ` ${Math.ceil(hud.weaponLeft)}s` : ""}
                  {hud.combo >= 2 ? ` · racha ×${hud.combo}` : ""}
                </span>
              </div>
            </header>

            <div className="flex-1" />

            <footer className="safe-b pointer-events-none flex items-end justify-between gap-3 px-3">
              <button
                type="button"
                className={`bomb-btn pointer-events-auto min-h-12 min-w-28 rounded-full px-5 text-sm font-semibold ${
                  hud.bombLeft > 0 ? "text-muted" : "bomb-ready text-bg"
                }`}
                style={{ ["--charge" as string]: `${Math.round(hud.bombRatio * 100)}%` }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  gameRef.current?.bomb();
                }}
              >
                {hud.bombLeft > 0 ? `Espora ${Math.ceil(hud.bombLeft)}` : "Espora"}
              </button>
              {hud.showHint && (
                <p className="pb-3 text-right text-xs text-gold-hi">Arrastra para volar</p>
              )}
            </footer>
          </div>
        )}

        {hud.mode === "title" && (
          <div className="absolute inset-0 flex flex-col justify-end p-3">
            <section className="rise glass-card rounded-2xl px-5 py-6">
              <p className="text-xs tracking-widest text-gold">MICROCOSMOS</p>
              <h1 className="title-glow mt-2 font-display text-5xl italic leading-none text-fg">Elytra</h1>
              <div className="title-rule mt-3" aria-hidden="true" />
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Disparo vertical. El escarabajo aguanta; el jardín, no.
              </p>
              <p className="mt-4 text-sm text-gold">
                {hud.hi > 0 ? `Récord ${hud.hi}` : "Sin récord"}
              </p>
              <button
                type="button"
                className="btn-gold mt-4 min-h-12 w-full rounded-full px-6 text-base font-semibold text-bg"
                onClick={() => gameRef.current?.play()}
              >
                Jugar
              </button>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Flechas o WASD. Disparo automático. Espacio, espora. En el móvil, arrastra.
              </p>
            </section>
          </div>
        )}

        {hud.mode === "over" && (
          <div className="absolute inset-0 flex flex-col justify-end p-3">
            <section className="rise glass-card rounded-2xl px-5 py-6">
              <p className="text-xs tracking-widest text-muted">ELYTRA</p>
              <h2 className="mt-1 font-display text-4xl italic text-fg">Fin de partida</h2>
              <p className="mt-4 text-xs tracking-widest text-muted">PUNTOS</p>
              <p className="glow-gold text-4xl font-semibold tabular-nums text-gold">{hud.score}</p>
              <p className="mt-2 text-sm text-fg">
                Oleada {hud.wave}
                <span className="text-muted"> · récord {hud.hi}</span>
              </p>
              {hud.newRecord && <p className="mt-2 text-sm text-gold">Nuevo récord.</p>}
              <button
                type="button"
                className="btn-gold mt-4 min-h-12 w-full rounded-full px-6 text-base font-semibold text-bg"
                onClick={() => gameRef.current?.play()}
              >
                Reintentar
              </button>
            </section>
          </div>
        )}

        {hud.paused && hud.mode === "playing" && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-deep/55 p-6">
            <section className="glass-card w-full max-w-xs rounded-2xl px-5 py-5 text-center">
              <h2 className="font-display text-3xl italic">Pausa</h2>
              <p className="mt-2 text-sm text-muted">P para continuar.</p>
              <button
                type="button"
                className="btn-gold mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 font-semibold text-bg"
                onClick={() => gameRef.current?.togglePause()}
              >
                <Play className="size-4" />
                Continuar
              </button>
            </section>
          </div>
        )}
      </div>

      <aside className="pointer-events-none absolute inset-y-0 right-0 hidden w-[calc((100%-32rem)/2)] flex-col justify-end px-10 py-12 lg:flex">
        <div className="w-full max-w-52 text-sm leading-relaxed text-muted">
          <p className="text-xs tracking-widest text-gold">CONTROLES</p>
          <p className="mt-3"><span className="text-fg">A ←</span> izquierda</p>
          <p className="mt-1"><span className="text-fg">D →</span> derecha</p>
          <p className="mt-1"><span className="text-fg">W S</span> altura</p>
          <p className="mt-1"><span className="text-fg">Espacio</span> espora</p>
        </div>
      </aside>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="icon-btn pointer-events-auto inline-flex size-11 items-center justify-center rounded-full text-fg"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
