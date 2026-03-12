import React, { useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
type RawCharType = "z" | "h";
type CanvasCharType = RawCharType | "r";

type RawFeatures = { s: number; w: number; b: number };
type Weights = { s: number; w: number; b: number };

type RawChar = { x: number; y: number; t: RawCharType; f: RawFeatures };

type RoundConfig = {
  name: string;
  difficulty: "Easy" | "Medium" | "Hard";
  color: string;
  textColor: string;
  tip: string;
  chars: RawChar[];
};

type NarrLine = { sp: "Commander" | "AI System"; tx: string };
type NarrBlock = { lines: NarrLine[] };

type CanvasState = "alive" | "eliminated" | "wrongly-hit" | "saved";
type AvatarId =
  | "scout"
  | "defence"
  | "patrol"
  | "medic"
  | "drone"
  | "engineer";

type CanvasChar = {
  id?: number;
  x: number;
  y: number;
  type: CanvasCharType;
  f?: RawFeatures;
  state: CanvasState;
  flash: number;
};

type EliminationResult = {
  correct: number;
  missed: number;
  wrong: number;
  acc: number;
  score: number;
};

type WeightChangeEvent = {
  weightChange: { key: keyof Weights; val: number };
};

type GameEvent = EliminationResult | WeightChangeEvent;

type LeaderboardEntry = {
  name: string;
  age: string;
  score: number;
  acc: number;
  date: string;
};

// ── Game Data ─────────────────────────────────────────────────────────────────
const ROUNDS_DATA: RoundConfig[] = [
  {
    name: "The Park",
    difficulty: "Easy",
    color: "#1a3a1a",
    textColor: "#4a8",
    tip: "Zombies move slow and look pale. High weights on Skin + Walk should work!",
    chars: [
      { x: 0.09, y: 0.22, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.2, y: 0.28, t: "z", f: { s: 1, w: 1, b: 0 } },
      { x: 0.07, y: 0.52, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.18, y: 0.6, t: "z", f: { s: 0, w: 1, b: 1 } },
      { x: 0.65, y: 0.18, t: "h", f: { s: 0, w: 0, b: 0 } },
      { x: 0.78, y: 0.24, t: "h", f: { s: 0, w: 0, b: 0 } },
      { x: 0.68, y: 0.46, t: "h", f: { s: 1, w: 0, b: 0 } },
      { x: 0.8, y: 0.52, t: "h", f: { s: 0, w: 0, b: 0 } }
    ]
  },
  {
    name: "The Mall",
    difficulty: "Medium",
    color: "#3a2a00",
    textColor: "#fa0",
    tip: "Some humans look suspicious! Body temperature is your secret weapon here.",
    chars: [
      { x: 0.09, y: 0.2, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.2, y: 0.35, t: "z", f: { s: 0, w: 1, b: 1 } },
      { x: 0.07, y: 0.55, t: "z", f: { s: 1, w: 0, b: 1 } },
      { x: 0.18, y: 0.7, t: "z", f: { s: 0, w: 0, b: 1 } },
      { x: 0.65, y: 0.18, t: "h", f: { s: 1, w: 1, b: 0 } },
      { x: 0.78, y: 0.28, t: "h", f: { s: 0, w: 0, b: 0 } },
      { x: 0.68, y: 0.5, t: "h", f: { s: 1, w: 0, b: 0 } },
      { x: 0.8, y: 0.6, t: "h", f: { s: 0, w: 1, b: 0 } },
      { x: 0.72, y: 0.75, t: "h", f: { s: 0, w: 0, b: 0 } }
    ]
  },
  {
    name: "The Hospital",
    difficulty: "Hard",
    color: "#3a0000",
    textColor: "#f55",
    tip: "Maximum chaos! Doctors look cold, patients shuffle. Trust body temp!",
    chars: [
      { x: 0.08, y: 0.18, t: "z", f: { s: 0, w: 1, b: 1 } },
      { x: 0.19, y: 0.3, t: "z", f: { s: 1, w: 0, b: 1 } },
      { x: 0.06, y: 0.5, t: "z", f: { s: 1, w: 1, b: 0 } },
      { x: 0.17, y: 0.65, t: "z", f: { s: 0, w: 0, b: 1 } },
      { x: 0.22, y: 0.8, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.65, y: 0.15, t: "h", f: { s: 1, w: 1, b: 0 } },
      { x: 0.78, y: 0.22, t: "h", f: { s: 0, w: 1, b: 0 } },
      { x: 0.68, y: 0.45, t: "h", f: { s: 1, w: 0, b: 0 } },
      { x: 0.8, y: 0.55, t: "h", f: { s: 0, w: 0, b: 0 } },
      { x: 0.72, y: 0.72, t: "h", f: { s: 1, w: 1, b: 0 } }
    ]
  }
];

const NARRATIONS: NarrBlock[] = [
  {
    lines: [
      {
        sp: "Commander",
        tx: "Welcome, Cadet! The city is under zombie attack. You control our AI defense system."
      },
      {
        sp: "Commander",
        tx: "Your job: tune the AI by setting WEIGHTS for each zombie feature."
      },
      {
        sp: "AI System",
        tx: "I use 3 features: pale Skin, slow Walk, and cold Body Temp. They build a zombie score!"
      },
      {
        sp: "Commander",
        tx: "Set the weights wisely, then press ELIMINATE. Let's see what you've got!"
      }
    ]
  },
  {
    lines: [
      {
        sp: "Commander",
        tx: "Good work! The zombies moved to the Mall. Things just got trickier."
      },
      {
        sp: "AI System",
        tx: "WARNING: Some humans here have pale skin too. Watch for false positives!"
      },
      {
        sp: "Commander",
        tx: "A false positive = AI calls someone a zombie when they're not. Be careful!"
      }
    ]
  },
  {
    lines: [
      {
        sp: "Commander",
        tx: "Final mission! The Hospital is overrun. Doctors look cold, patients shuffle..."
      },
      {
        sp: "AI System",
        tx: "This is the hardest classification problem yet. Every decision matters."
      },
      {
        sp: "Commander",
        tx: "Show me your mastery. The city's fate is in your hands, Cadet!"
      }
    ]
  }
];

const TILE = 32;

// ── Storage helper with localStorage fallback ────────────────────────────────
const storageApi = {
  async get(key: string) {
    const anyWindow = window as any;
    if (anyWindow.storage?.get) {
      return anyWindow.storage.get(key);
    }
    const v = window.localStorage.getItem(key);
    return v ? { value: v } : null;
  },
  async set(key: string, value: string) {
    const anyWindow = window as any;
    if (anyWindow.storage?.set) {
      return anyWindow.storage.set(key, value);
    }
    window.localStorage.setItem(key, value);
    return undefined;
  }
};

async function loadLB(): Promise<LeaderboardEntry[]> {
  try {
    const r = await storageApi.get("zai-lb2");
    return r ? (JSON.parse(r.value) as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

async function saveLB(d: LeaderboardEntry[]): Promise<void> {
  try {
    await storageApi.set("zai-lb2", JSON.stringify(d));
  } catch {
    // ignore
  }
}

// ── Canvas Game Component ─────────────────────────────────────────────────────
type GameCanvasProps = {
  round: number;
  weights: Weights;
  onEvent: (evt: GameEvent) => void;
  playerName: string;
  avatar: AvatarId;
  onOpenLeaderboard: () => void;
};

function GameCanvas({
  round,
  weights,
  onEvent,
  playerName,
  avatar,
  onOpenLeaderboard
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const charsRef = useRef<CanvasChar[]>([]);
  const animRef = useRef<number | null>(null);
  const phaseRef = useRef<"idle" | "running" | "done">("idle");
  const [showHint, setShowHint] = useState(false);

  const spawnChars = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const rd = ROUNDS_DATA[round];
    charsRef.current = [
      { x: cw * 0.44, y: ch * 0.22, type: "r", state: "alive", flash: 0 },
      { x: cw * 0.43, y: ch * 0.52, type: "r", state: "alive", flash: 0 },
      { x: cw * 0.44, y: ch * 0.8, type: "r", state: "alive", flash: 0 },
      ...rd.chars.map((c, i) => ({
        id: i,
        type: c.t,
        f: c.f,
        x: c.x * cw,
        y: c.y * ch,
        state: "alive" as CanvasState,
        flash: 0
      }))
    ];
  }, [round]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const el = containerRef.current;
    if (canvas && el) {
      canvas.width = el.clientWidth;
      canvas.height = el.clientHeight;
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    spawnChars();
    const onResize = () => {
      resizeCanvas();
      spawnChars();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resizeCanvas, spawnChars]);

  const drawBg = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const W = Math.ceil(w / TILE) + 1;
    const H = Math.ceil(h / TILE) + 1;
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const isDirt = c < Math.floor(W * 0.38);
        if (!isDirt) {
          ctx.fillStyle = "#4a8f32";
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
          ctx.strokeStyle = "#3d7a28";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
          if ((c + r) % 3 === 0) {
            ctx.fillStyle = "#3d7a28";
            ctx.fillRect(c * TILE + 8, r * TILE + 8, 5, 3);
          }
          if ((c * 3 + r) % 5 === 0) {
            ctx.fillStyle = "#5aa040";
            ctx.fillRect(c * TILE + 4, r * TILE + 14, 6, 4);
          }
        } else {
          ctx.fillStyle = "#7a5228";
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
          ctx.strokeStyle = "#5e3e1e";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
          if ((c + r * 2) % 4 === 0) {
            ctx.fillStyle = "#6a4420";
            ctx.fillRect(c * TILE + 6, r * TILE + 6, 7, 5);
          }
        }
      }
    }
    [
      [w * 0.55, 70],
      [w * 0.7, 130],
      [w * 0.62, 210],
      [w * 0.75, 290],
      [w * 0.58, 350]
    ].forEach(([fx, fy]) => {
      if (fx < w) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(fx, fy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f9c";
        ctx.beginPath();
        ctx.arc(fx, fy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  };

  const drawZombie = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: CanvasState,
    flash: number
  ) => {
    ctx.save();
    ctx.globalAlpha = state === "eliminated" ? 0.3 : 1;
    ctx.translate(x, y);
    const r = flash > 0 ? 255 : 220;
    const g = flash > 0 ? Math.floor(60 * (1 - flash)) : 30;
    const b2 = flash > 0 ? Math.floor(60 * (1 - flash)) : 30;
    ctx.fillStyle = `rgb(${r},${g},${b2})`;
    ctx.beginPath();
    ctx.arc(0, -30, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-7, -18, 14, 22);
    ctx.fillRect(-20, -16, 13, 5);
    ctx.fillRect(7, -16, 13, 5);
    ctx.fillRect(-8, 4, 6, 20);
    ctx.fillRect(2, 4, 6, 20);
    ctx.restore();
  };

  const drawHuman = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: CanvasState
  ) => {
    ctx.save();
    ctx.globalAlpha = state === "wrongly-hit" ? 0.3 : 1;
    ctx.translate(x, y);
    ctx.fillStyle = "#e8c89a";
    ctx.beginPath();
    ctx.arc(0, -32, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a3a1a";
    ctx.beginPath();
    ctx.arc(0, -36, 9, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#7a9ab5";
    ctx.fillRect(-10, -22, 20, 24);
    ctx.fillStyle = "#5a7a95";
    ctx.fillRect(-10, -22, 20, 5);
    ctx.fillStyle = "#7a9ab5";
    ctx.fillRect(-22, -28, 12, 6);
    ctx.fillRect(10, -28, 12, 6);
    ctx.fillStyle = "#e8c89a";
    ctx.beginPath();
    ctx.arc(-22, -25, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(22, -25, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a5a8a";
    ctx.fillRect(-8, 2, 7, 20);
    ctx.fillRect(1, 2, 7, 20);
    ctx.restore();
  };

  const drawRobot = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#c8e8f8";
    ctx.strokeStyle = "#4a9ab5";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -40, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(0, -28);
    ctx.stroke();
    ctx.fillStyle = "#ddf0fa";
    ctx.fillRect(-14, -28, 28, 22);
    ctx.strokeRect(-14, -28, 28, 22);
    ctx.fillStyle = "#1a9edd";
    ctx.beginPath();
    ctx.arc(-6, -18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-6, -18, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -18, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a9ab5";
    ctx.fillRect(-7, -10, 14, 3);
    ctx.fillStyle = "#b0d8e8";
    ctx.fillRect(-20, -24, 7, 4);
    ctx.fillRect(13, -24, 7, 4);
    ctx.fillStyle = "#c8e8f8";
    ctx.strokeStyle = "#4a9ab5";
    ctx.fillRect(-12, -6, 9, 18);
    ctx.strokeRect(-12, -6, 9, 18);
    ctx.fillRect(3, -6, 9, 18);
    ctx.strokeRect(3, -6, 9, 18);
    ctx.restore();
  };

  const drawIcon = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    state: CanvasState
  ) => {
    ctx.save();
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (state === "eliminated") {
      ctx.fillStyle = "#ff3333";
      ctx.fillText("✕", x, y - 52);
    } else if (state === "wrongly-hit") {
      ctx.fillStyle = "#ffaa00";
      ctx.fillText("!", x, y - 52);
    } else if (state === "saved") {
      ctx.fillStyle = "#44ff44";
      ctx.fillText("✓", x, y - 52);
    }
    ctx.restore();
  };

  useEffect(() => {
    const loop = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawBg(ctx, canvas.width, canvas.height);
      charsRef.current.forEach((c) => {
        if (c.type === "z") drawZombie(ctx, c.x, c.y, c.state, c.flash);
        else if (c.type === "h") drawHuman(ctx, c.x, c.y, c.state);
        else drawRobot(ctx, c.x, c.y);
        if (c.state !== "alive" && c.type !== "r") {
          drawIcon(ctx, c.x, c.y, c.state);
        }
      });
      animRef.current = window.requestAnimationFrame(loop);
    };
    animRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (animRef.current !== null) {
        window.cancelAnimationFrame(animRef.current);
      }
    };
  }, []);

  const handleEliminate = () => {
    if (phaseRef.current !== "idle") return;
    phaseRef.current = "running";
    const w = weights;
    const targets = charsRef.current.filter((c) => c.type !== "r");
    let i = 0;
    const iv = window.setInterval(() => {
      if (i >= targets.length) {
        window.clearInterval(iv);
        window.setTimeout(() => {
          let correct = 0;
          let missed = 0;
          let wrong = 0;
          targets.forEach((c) => {
            if (c.state === "eliminated" || c.state === "saved") correct += 1;
            else if (c.state === "alive") missed += 1;
            else if (c.state === "wrongly-hit") wrong += 1;
          });
          const acc = Math.round((correct / targets.length) * 100);
          const score = Math.max(0, correct * 10 - missed * 15 - wrong * 15);
          phaseRef.current = "done";
          onEvent({ correct, missed, wrong, acc, score });
        }, 700);
        return;
      }
      const c = targets[i];
      const max = w.s + w.w + w.b || 1;
      const raw =
        (c.f?.s ?? 0) * w.s +
        (c.f?.w ?? 0) * w.w +
        (c.f?.b ?? 0) * w.b;
      const sc = (raw / max) * 10;
      c.state =
        sc >= 5
          ? c.type === "z"
            ? "eliminated"
            : "wrongly-hit"
          : c.type === "h"
          ? "saved"
          : "alive";
      c.flash = 1;
      const fl = window.setInterval(() => {
        c.flash = Math.max(0, c.flash - 0.12);
        if (c.flash <= 0) window.clearInterval(fl);
      }, 40);
      i += 1;
    }, 280);
  };

  const rd = ROUNDS_DATA[round];
  const avatarEmoji =
    avatar === "scout"
      ? "🤖"
      : avatar === "defence"
      ? "🛡️"
      : avatar === "patrol"
      ? "🛰️"
      : avatar === "medic"
      ? "⚕️"
      : avatar === "drone"
      ? "🚁"
      : "🛠️";

  return (
    <div
      style={{
        background: "#000",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Courier New', monospace"
      }}
    >
      <div
        style={{
          background: "#111",
          borderBottom: "1px solid #1e1e1e",
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            style={{
              color: "#ff3333",
              fontWeight: "bold",
              fontSize: 12,
              letterSpacing: 2
            }}
          >
            🧟 ROUND {round + 1}/3 — {rd.name.toUpperCase()}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            justifyContent: "center",
            maxWidth: 260
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#1a1a1a",
              border: "1px solid #333",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16
            }}
          >
            {avatarEmoji}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              maxWidth: 210,
              overflow: "hidden"
            }}
          >
            <span
              style={{
                color: "#eee",
                fontSize: 11,
                fontWeight: "bold",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden"
              }}
            >
              {playerName || "Cadet"}
            </span>
            <span
              style={{
                color: "#666",
                fontSize: 10
              }}
            >
              Player
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 2
          }}
        >
          <button
            type="button"
            onClick={onOpenLeaderboard}
            style={{
              fontSize: 10,
              color: "#ffdd77",
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer"
            }}
          >
            <span>🏆</span>
            <span style={{ textDecoration: "underline" }}>Leaderboard</span>
          </button>
          <div
            style={{
              fontSize: 10,
              padding: "3px 10px",
              borderRadius: 20,
              background: rd.color,
              color: rd.textColor
            }}
          >
            {rd.difficulty}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", height: 500 }}>
        <div
          ref={containerRef}
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            minWidth: 0
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              display: "block",
              width: "100%",
              height: "100%"
            }}
          />
        </div>

        <div
          style={{
            width: 228,
            background: "#111",
            display: "flex",
            flexDirection: "column",
            padding: 14,
            gap: 12,
            borderLeft: "1px solid #1e1e1e",
            flexShrink: 0
          }}
        >
          <div
            style={{
              color: "#ff9900",
              fontSize: 10,
              letterSpacing: 2,
              fontWeight: "bold"
            }}
          >
            AI DETECTION WEIGHTS
          </div>

          {[
            { id: "s" as const, label: "Skin" },
            { id: "w" as const, label: "Walk" },
            { id: "b" as const, label: "Body\nTemp." }
          ].map((f) => (
            <div key={f.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 5
                }}
              >
                <span
                  style={{
                    color: "#ddd",
                    fontSize: 13,
                    fontWeight: "bold",
                    whiteSpace: "pre-line",
                    lineHeight: 1.2
                  }}
                >
                  {f.label}
                </span>
                <span
                  style={{
                    color: "#ff9900",
                    fontSize: 13,
                    fontWeight: "bold",
                    background: "#120f00",
                    padding: "2px 8px",
                    borderRadius: 4
                  }}
                >
                  {weights[f.id]}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={weights[f.id]}
                onChange={(e) => {
                  setShowHint(true);
                  onEvent({
                    weightChange: {
                      key: f.id,
                      val: Number(e.target.value)
                    }
                  });
                }}
                style={{
                  width: "100%",
                  accentColor: "#e33",
                  cursor: "pointer"
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 9,
                  color: "#888",
                  marginTop: 2
                }}
              >
                <span>low</span>
                <span>high</span>
              </div>
            </div>
          ))}

          {showHint && (
            <div
              style={{
                background: "#1a1200",
                border: "1px solid #4a3800",
                borderRadius: 8,
                padding: "6px 8px",
                fontSize: 10,
                lineHeight: 1.4,
                color: "#ffbb55",
                marginTop: 2
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: 1,
                  color: "#ff9900",
                  marginBottom: 4
                }}
              >
                WEIGHT HINT
              </div>
              <div>
                {round === 0 &&
                  "Round 1: Try moving one slider at a time and watch how the mix of zombies and humans changes."}
                {round === 1 &&
                  "Round 2: Some humans now share zombie-looking clues. What happens if you turn one clue up too high?"}
                {round === 2 &&
                  "Round 3: The data is messy. Sometimes turning a feature down can be just as powerful as turning it up."}
              </div>
            </div>
          )}

          <button
            onClick={handleEliminate}
            style={{
              width: "100%",
              padding: "11px 0",
              background: "#cc2200",
              color: "#fff",
              border: "none",
              borderRadius: 24,
              fontSize: 13,
              fontWeight: "bold",
              cursor: "pointer",
              fontFamily: "'Courier New', monospace",
              marginTop: "auto"
            }}
          >
            ⚡ Eliminate Zombies!!
          </button>
        </div>
      </div>

      <div
        style={{
          background: "#111",
          borderTop: "2px solid #1e1e1e",
          height: 90,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 60,
          marginTop: 18
        }}
      >
        <BotItem Bot={ScoutBot} label="Scout bot" />
        <BotItem Bot={DefenceBot} label="Defence bot" />
        <BotItem Bot={PatrolBot} label="Patrol bot" />
      </div>
    </div>
  );
}

// ── Bots ──────────────────────────────────────────────────────────────────────
type BotItemProps = {
  Bot: React.ComponentType;
  label: string;
};

function BotItem({ Bot, label }: BotItemProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4
      }}
    >
      <Bot />
      <div
        style={{
          color: "#555",
          fontSize: 10,
          fontFamily: "'Courier New', monospace"
        }}
      >
        {label}
      </div>
    </div>
  );
}

function ScoutBot() {
  return (
    <svg width="44" height="54" viewBox="0 0 48 58">
      <circle
        cx="24"
        cy="6"
        r="5"
        fill="#c8e8f8"
        stroke="#4a9ab5"
        strokeWidth="1.5"
      />
      <line x1="24" y1="11" x2="24" y2="16" stroke="#4a9ab5" strokeWidth="1.5" />
      <rect
        x="10"
        y="16"
        width="28"
        height="22"
        rx="6"
        fill="#ddf0fa"
        stroke="#4a9ab5"
        strokeWidth="1.5"
      />
      <circle cx="18" cy="25" r="5" fill="#22aadd" />
      <circle cx="18" cy="25" r="2.5" fill="#fff" />
      <circle cx="30" cy="25" r="5" fill="#22aadd" />
      <circle cx="30" cy="25" r="2.5" fill="#fff" />
      <rect x="15" y="32" width="18" height="3.5" rx="1.8" fill="#4a9ab5" />
      <rect x="4" y="22" width="7" height="4" rx="2" fill="#b0d8ea" />
      <rect x="37" y="22" width="7" height="4" rx="2" fill="#b0d8ea" />
      <rect
        x="12"
        y="38"
        width="9"
        height="18"
        rx="4"
        fill="#c8e8f8"
        stroke="#4a9ab5"
        strokeWidth="1"
      />
      <rect
        x="27"
        y="38"
        width="9"
        height="18"
        rx="4"
        fill="#c8e8f8"
        stroke="#4a9ab5"
        strokeWidth="1"
      />
    </svg>
  );
}

function DefenceBot() {
  return (
    <svg width="44" height="54" viewBox="0 0 48 58">
      <rect
        x="16"
        y="2"
        width="7"
        height="8"
        rx="2"
        fill="#f0c030"
        stroke="#b08000"
        strokeWidth="1.2"
      />
      <rect
        x="25"
        y="2"
        width="7"
        height="8"
        rx="2"
        fill="#f0c030"
        stroke="#b08000"
        strokeWidth="1.2"
      />
      <rect
        x="10"
        y="10"
        width="28"
        height="26"
        rx="4"
        fill="#f5d040"
        stroke="#b08000"
        strokeWidth="1.5"
      />
      <rect x="14" y="18" width="9" height="7" rx="1.5" fill="#b08000" />
      <rect x="25" y="18" width="9" height="7" rx="1.5" fill="#b08000" />
      <rect x="14" y="29" width="20" height="4" rx="2" fill="#8a6000" />
      <rect
        x="3"
        y="18"
        width="8"
        height="4"
        rx="2"
        fill="#f0c030"
        stroke="#b08000"
        strokeWidth="1"
      />
      <rect
        x="37"
        y="18"
        width="8"
        height="4"
        rx="2"
        fill="#f0c030"
        stroke="#b08000"
        strokeWidth="1"
      />
      <rect
        x="12"
        y="36"
        width="8"
        height="20"
        rx="3"
        fill="#f0c030"
        stroke="#b08000"
        strokeWidth="1"
      />
      <rect
        x="28"
        y="36"
        width="8"
        height="20"
        rx="3"
        fill="#f0c030"
        stroke="#b08000"
        strokeWidth="1"
      />
      <circle cx="14" cy="56" r="3" fill="#e03030" />
      <circle cx="34" cy="56" r="3" fill="#e03030" />
    </svg>
  );
}

function PatrolBot() {
  return (
    <svg width="48" height="58" viewBox="0 0 54 62">
      <circle
        cx="22"
        cy="6"
        r="4.5"
        fill="#d0eaf8"
        stroke="#4a9ab5"
        strokeWidth="1.3"
      />
      <line x1="22" y1="10.5" x2="22" y2="15" stroke="#4a9ab5" strokeWidth="1.3" />
      <rect
        x="8"
        y="15"
        width="28"
        height="22"
        rx="6"
        fill="#ddf0fa"
        stroke="#4a9ab5"
        strokeWidth="1.5"
      />
      <ellipse cx="17" cy="24" rx="4.5" ry="4.5" fill="#22aadd" />
      <ellipse cx="17" cy="24" rx="2" ry="2" fill="#fff" />
      <ellipse cx="27" cy="24" rx="4.5" ry="4.5" fill="#22aadd" />
      <ellipse cx="27" cy="24" rx="2" ry="2" fill="#fff" />
      <rect x="2" y="21" width="7" height="4" rx="2" fill="#aad0e8" />
      <rect x="35" y="21" width="7" height="4" rx="2" fill="#aad0e8" />
      <rect x="13" y="30" width="18" height="4" rx="2" fill="#4a9ab5" />
      <rect
        x="12"
        y="37"
        width="10"
        height="14"
        rx="3"
        fill="#d0eaf8"
        stroke="#4a9ab5"
        strokeWidth="1"
      />
      <rect x="22" y="42" width="6" height="10" rx="2" fill="#888" />
      <ellipse
        cx="20"
        cy="56"
        rx="5"
        ry="4"
        fill="#666"
        stroke="#444"
        strokeWidth="1"
      />
      <ellipse
        cx="32"
        cy="56"
        rx="5"
        ry="4"
        fill="#666"
        stroke="#444"
        strokeWidth="1"
      />
      <rect x="18" y="52" width="16" height="3" rx="1" fill="#555" />
    </svg>
  );
}

// ── Typewriter ────────────────────────────────────────────────────────────────
type TypewriterProps = {
  text: string;
  onDone?: () => void;
};

function Typewriter({ text, onDone }: TypewriterProps) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const iv = window.setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        window.clearInterval(iv);
        setDone(true);
        if (onDoneRef.current) {
          onDoneRef.current();
        }
      }
    }, 26);
    return () => window.clearInterval(iv);
  }, [text]);

  return (
    <span>
      {displayed}
      {!done && (
        <span
          style={{ color: "#ff9900", animation: "blink .7s infinite" }}
        >
          ▌
        </span>
      )}
    </span>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
type Screen = "intro" | "narration" | "game" | "roundResult" | "leaderboard";

const ZombieGame: React.FC = () => {
  const [screen, setScreen] = useState<Screen>("intro");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [avatar, setAvatar] = useState<AvatarId | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [round, setRound] = useState(0);
  const [narrLine, setNarrLine] = useState(0);
  const [narrDone, setNarrDone] = useState(false);
  const [weights, setWeights] = useState<Weights>({ s: 7, w: 4, b: 5 });
  const [roundResult, setRoundResult] = useState<EliminationResult | null>(
    null
  );
  const [roundScores, setRoundScores] = useState<EliminationResult[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboardOverlay, setShowLeaderboardOverlay] = useState(false);

  useEffect(() => {
    loadLB().then(setLeaderboard);
  }, []);

  const handleStart = () => {
    if (!avatar) {
      setNameErr("Please choose your bot avatar!");
      return;
    }
    if (!name.trim()) {
      setNameErr("Please enter your name!");
      return;
    }
    const ageNum = Number(age);
    if (!ageNum || ageNum < 5 || ageNum > 18) {
      setNameErr("Please enter a valid age (5–18)!");
      return;
    }
    setNameErr("");
    setRound(0);
    setNarrLine(0);
    setNarrDone(false);
    setRoundScores([]);
    setRoundResult(null);
    setScreen("narration");
  };

  const handleNarrNext = () => {
    const lines = NARRATIONS[round].lines;
    if (!narrDone) {
      setNarrDone(true);
      return;
    }
    if (narrLine < lines.length - 1) {
      setNarrLine((l) => l + 1);
      setNarrDone(false);
    } else {
      setScreen("game");
    }
  };

  const handleGameEvent = (evt: GameEvent) => {
    if ("weightChange" in evt) {
      setWeights((w) => ({
        ...w,
        [evt.weightChange.key]: evt.weightChange.val
      }));
      return;
    }
    setRoundResult(evt);
    setScreen("roundResult");
  };

  const handleNextRound = async () => {
    if (!roundResult) return;
    const newScores = [...roundScores, roundResult];
    setRoundScores(newScores);
    if (round < 2) {
      setRound((r) => r + 1);
      setNarrLine(0);
      setNarrDone(false);
      setRoundResult(null);
      setWeights({ s: 7, w: 4, b: 5 });
      setScreen("narration");
    } else {
      const total = newScores.reduce((s, r) => s + r.score, 0);
      const avgAcc = Math.round(
        newScores.reduce((s, r) => s + r.acc, 0) / newScores.length
      );
      const entry: LeaderboardEntry = {
        name,
        age,
        score: total,
        acc: avgAcc,
        date: new Date().toLocaleDateString()
      };
      const updated = [...leaderboard, entry]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      setLeaderboard(updated);
      await saveLB(updated);
      setScreen("leaderboard");
    }
  };

  const restart = () => {
    setScreen("intro");
    setName("");
    setAge("");
    setRound(0);
    setNarrLine(0);
    setNarrDone(false);
    setRoundScores([]);
    setRoundResult(null);
    setWeights({ s: 7, w: 4, b: 5 });
  };

  const S: React.CSSProperties = {
    fontFamily: "'Courier New', monospace",
    background: "#0a0a0a",
    minHeight: 620
  };

  // INTRO
  if (screen === "intro") {
    return (
      <div
        style={{
          ...S,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem"
        }}
      >
        <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🧟</div>
          <div
            style={{
              fontSize: 30,
              fontWeight: "bold",
              color: "#ff3333",
              letterSpacing: 3
            }}
          >
            ZOMBIE AI
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#444",
              letterSpacing: 5,
              marginTop: 4
            }}
          >
            DETECTION ACADEMY
          </div>
        </div>
        <div
          style={{
            background: "#111",
            border: "1px solid #222",
            borderRadius: 12,
            padding: "28px 30px",
            width: "100%",
            maxWidth: 360
          }}
        >
          <div
            style={{
              color: "#555",
              fontSize: 12,
              lineHeight: 1.8,
              marginBottom: 20
            }}
          >
            Train an AI to detect zombies using{" "}
            <span style={{ color: "#ff9900" }}>weighted classification</span>.
            3 rounds.
          </div>
          <div
            style={{
              marginBottom: 16,
              display: "flex",
              flexDirection: "column",
              alignItems: "center"
            }}
          >
            <button
              type="button"
              onClick={() => setShowAvatarPicker((v) => !v)}
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                border: "2px solid #555",
                background: "#111",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                cursor: "pointer",
                marginBottom: 6
              }}
            >
              {avatar
                ? (avatar === "scout"
                    ? "🤖"
                    : avatar === "defence"
                    ? "🛡️"
                    : avatar === "patrol"
                    ? "🛰️"
                    : avatar === "medic"
                    ? "⚕️"
                    : avatar === "drone"
                    ? "🚁"
                    : "🛠️")
                : "?"}
            </button>
            <div
              style={{
                color: "#eee",
                fontSize: 11,
                fontWeight: "bold",
                marginBottom: 2
              }}
            >
              {avatar === "scout"
                ? "Scout Bot"
                : avatar === "defence"
                ? "Defence Bot"
                : avatar === "patrol"
                ? "Patrol Bot"
                : avatar === "medic"
                ? "Medic Bot"
                : avatar === "drone"
                ? "Recon Drone"
                : avatar === "engineer"
                ? "Engineer Bot"
                : "Tap to choose your bot"}
            </div>
            <div style={{ color: "#777", fontSize: 10 }}>
              Avatar
            </div>
            {showAvatarPicker && (
              <div
                style={{
                  marginTop: 8,
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #222",
                  background: "#151515",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 6
                }}
              >
                {[
                  { id: "scout" as AvatarId, label: "Scout", emoji: "🤖" },
                  { id: "defence" as AvatarId, label: "Defence", emoji: "🛡️" },
                  { id: "patrol" as AvatarId, label: "Patrol", emoji: "🛰️" },
                  { id: "medic" as AvatarId, label: "Medic", emoji: "⚕️" },
                  { id: "drone" as AvatarId, label: "Drone", emoji: "🚁" },
                  { id: "engineer" as AvatarId, label: "Engineer", emoji: "🛠️" }
                ].map((opt) => {
                  const isSelected = avatar === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setAvatar(opt.id);
                        setShowAvatarPicker(false);
                      }}
                      style={{
                        padding: "6px 4px",
                        borderRadius: 6,
                        border: isSelected
                          ? "1px solid #ff9900"
                          : "1px solid #333",
                        background: isSelected ? "#261400" : "#181818",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2
                      }}
                    >
                      <div style={{ fontSize: 18 }}>{opt.emoji}</div>
                      <div
                        style={{
                          fontSize: 9,
                          color: isSelected ? "#ffdd88" : "#777"
                        }}
                      >
                        {opt.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                color: "#555",
                fontSize: 11,
                letterSpacing: 1,
                marginBottom: 6
              }}
            >
              YOUR NAME
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
              placeholder="e.g. Alex"
              style={{
                display: "block",
                width: "100%",
                padding: "10px 14px",
                background: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: 8,
                color: "#fff",
                fontSize: 14,
                fontFamily: "'Courier New',monospace",
                outline: "none",
                boxSizing: "border-box"
              }}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                color: "#555",
                fontSize: 11,
                letterSpacing: 1,
                marginBottom: 6
              }}
            >
              YOUR AGE
            </div>
            <input
              value={age}
              onChange={(e) => setAge(e.target.value)}
              type="number"
              min={5}
              max={18}
              placeholder="e.g. 12"
              style={{
                display: "block",
                width: "100%",
                padding: "10px 14px",
                background: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: 8,
                color: "#fff",
                fontSize: 14,
                fontFamily: "'Courier New',monospace",
                outline: "none",
                boxSizing: "border-box"
              }}
            />
          </div>
          {/* old inline avatar row removed */}
          {nameErr && (
            <div
              style={{
                color: "#f55",
                fontSize: 12,
                marginBottom: 10
              }}
            >
              {nameErr}
            </div>
          )}
          <button
            onClick={handleStart}
            style={{
              width: "100%",
              padding: "12px 0",
              background: "#cc2200",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: "bold",
              cursor: "pointer",
              fontFamily: "'Courier New',monospace",
              letterSpacing: 1
            }}
          >
            BEGIN MISSION →
          </button>
        </div>
        {leaderboard.length > 0 && (
          <button
            onClick={() => setScreen("leaderboard")}
            style={{
              marginTop: 14,
              background: "transparent",
              border: "1px solid #222",
              color: "#555",
              padding: "8px 20px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "'Courier New',monospace"
            }}
          >
            View Leaderboard 🏆
          </button>
        )}
      </div>
    );
  }

  // NARRATION
  if (screen === "narration") {
    const narr = NARRATIONS[round];
    const line = narr.lines[narrLine];
    const isCmd = line.sp === "Commander";
    const isLast = narrLine === narr.lines.length - 1;
    const rd = ROUNDS_DATA[round];

    return (
      <div style={{ ...S, display: "flex", flexDirection: "column" }}>
        <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
        <div
          style={{
            background: "#111",
            borderBottom: "1px solid #1e1e1e",
            padding: "12px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div
            style={{
              color: "#ff3333",
              fontWeight: "bold",
              fontSize: 13,
              letterSpacing: 2
            }}
          >
            ZOMBIE AI ACADEMY
          </div>
          <div style={{ color: "#444", fontSize: 11 }}>
            Round {round + 1}/3 — {rd.name}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            gap: 20
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#333",
              letterSpacing: 3
            }}
          >
            BRIEFING — {rd.difficulty.toUpperCase()}
          </div>
          <div
            style={{
              display: "flex",
              gap: 18,
              alignItems: "flex-start",
              width: "100%",
              maxWidth: 540
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: 58,
                height: 58,
                borderRadius: "50%",
                background: isCmd ? "#1a2a1a" : "#1a1a2a",
                border: `2px solid ${isCmd ? "#4a8f32" : "#4a9ab5"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26
              }}
            >
              {isCmd ? "🎖️" : "🤖"}
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 10,
                  color: isCmd ? "#4a8f32" : "#4a9ab5",
                  letterSpacing: 2,
                  marginBottom: 7
                }}
              >
                {line.sp.toUpperCase()}
              </div>
              <div
                style={{
                  background: "#111",
                  border: `1px solid ${isCmd ? "#2a3a2a" : "#1a2a3a"}`,
                  borderRadius: 12,
                  padding: "14px 18px",
                  minHeight: 70
                }}
              >
                <div
                  style={{
                    color: "#ddd",
                    fontSize: 13,
                    lineHeight: 1.8
                  }}
                >
                  <Typewriter
                    key={`${round}-${narrLine}`}
                    text={line.tx}
                    onDone={() => setNarrDone(true)}
                  />
                </div>
              </div>
            </div>
          </div>

          {isLast && narrDone && (
            <div
              style={{
                background: "#0f0d00",
                border: "1px solid #3a2f00",
                borderRadius: 10,
                padding: "12px 18px",
                maxWidth: 540,
                width: "100%"
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#ff9900",
                  letterSpacing: 2,
                  marginBottom: 5
                }}
              >
                💡 MISSION TIP
              </div>
              <div
                style={{
                  color: "#cc9900",
                  fontSize: 12,
                  lineHeight: 1.7
                }}
              >
                {rd.tip}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            {narr.lines.map((_, i) => (
              <div
                key={String(i)}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: i <= narrLine ? "#ff3333" : "#222"
                }}
              />
            ))}
          </div>

          <button
            onClick={handleNarrNext}
            style={{
              padding: "11px 36px",
              background: narrDone ? "#cc2200" : "#1a1a1a",
              color: narrDone ? "#fff" : "#555",
              border: `1px solid ${narrDone ? "#cc2200" : "#333"}`,
              borderRadius: 8,
              fontSize: 14,
              fontWeight: "bold",
              cursor: "pointer",
              fontFamily: "'Courier New',monospace",
              letterSpacing: 1,
              transition: "all .2s"
            }}
          >
            {!narrDone ? "SKIP ▶" : isLast ? "START ROUND →" : "NEXT →"}
          </button>
        </div>
      </div>
    );
  }

  // GAME
  if (screen === "game") {
    return (
      <div style={S}>
        <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
        <GameCanvas
          round={round}
          weights={weights}
          onEvent={handleGameEvent}
          playerName={name}
          avatar={avatar || "scout"}
          onOpenLeaderboard={() => setShowLeaderboardOverlay(true)}
        />
        {showLeaderboardOverlay && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50
            }}
          >
            <div
              style={{
                background: "#111",
                borderRadius: 12,
                border: "1px solid #333",
                padding: "18px 20px",
                width: "100%",
                maxWidth: 420,
                fontFamily: "'Courier New', monospace"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10
                }}
              >
                <div
                  style={{
                    color: "#ff9900",
                    fontSize: 13,
                    fontWeight: "bold",
                    letterSpacing: 2
                  }}
                >
                  🏆 LEADERBOARD
                </div>
                <button
                  type="button"
                  onClick={() => setShowLeaderboardOverlay(false)}
                  style={{
                    background: "transparent",
                    border: "1px solid #444",
                    borderRadius: 999,
                    color: "#aaa",
                    fontSize: 11,
                    padding: "4px 10px",
                    cursor: "pointer"
                  }}
                >
                  Close
                </button>
              </div>

              {roundScores.length > 0 && (
                <div
                  style={{
                    background: "#181818",
                    borderRadius: 8,
                    padding: "10px 12px",
                    border: "1px solid #333",
                    marginBottom: 12
                  }}
                >
                  <div
                    style={{
                      color: "#888",
                      fontSize: 11,
                      marginBottom: 4
                    }}
                  >
                    Your totals so far
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "#ddd"
                    }}
                  >
                    <span>
                      Score:{" "}
                      {roundScores.reduce((s, r) => s + r.score, 0)} pts
                    </span>
                    <span>
                      Avg acc:{" "}
                      {Math.round(
                        roundScores.reduce((s, r) => s + r.acc, 0) /
                          roundScores.length
                      )}
                      %
                    </span>
                  </div>
                </div>
              )}

              <div
                style={{
                  color: "#666",
                  fontSize: 10,
                  letterSpacing: 2,
                  marginBottom: 6
                }}
              >
                TOP SCORES
              </div>
              {leaderboard.length === 0 ? (
                <div
                  style={{
                    color: "#444",
                    fontSize: 12,
                    textAlign: "center",
                    padding: 16
                  }}
                >
                  No entries yet. Finish all 3 rounds to record a score.
                </div>
              ) : (
                leaderboard.slice(0, 5).map((e, i) => {
                  const isMe = e.name === name;
                  const medal =
                    i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
                  return (
                    <div
                      key={e.name + i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        background: isMe ? "#181000" : "#151515",
                        borderRadius: 8,
                        padding: "6px 10px",
                        marginBottom: 4,
                        border: isMe
                          ? "1px solid #ff990055"
                          : "1px solid #222",
                        gap: 8
                      }}
                    >
                      <div
                        style={{
                          width: 26,
                          textAlign: "center",
                          fontSize: 14,
                          color: "#777"
                        }}
                      >
                        {medal}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            color: isMe ? "#ffdd88" : "#ddd",
                            fontSize: 12
                          }}
                        >
                          {e.name}
                          {isMe ? " (you)" : ""}
                        </div>
                        <div
                          style={{
                            color: "#666",
                            fontSize: 10
                          }}
                        >
                          {e.score} pts • {e.acc}% • Age {e.age}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ROUND RESULT
  if (screen === "roundResult" && roundResult) {
    const stars = roundResult.acc >= 80 ? 3 : roundResult.acc >= 60 ? 2 : 1;
    const accCol = roundResult.acc >= 80 ? "#4a8" : roundResult.acc >= 60 ? "#fa0" : "#e44";
    const lesson =
      roundResult.missed > 0 && roundResult.wrong > 0
        ? "Both false negatives (missed zombies) and false positives (humans hit). Classic precision vs recall tradeoff!"
        : roundResult.missed > 0
        ? "False negatives: zombies slipped through. Raise zombie feature weights or lower threshold."
        : roundResult.wrong > 0
        ? "False positives: humans got caught. Reduce weights on features humans share with zombies."
        : "Perfect decision boundary! Your weights cleanly separated all zombies from humans. 🎯";
    return (
      <div
        style={{
          ...S,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem"
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>
            {"⭐".repeat(stars)}
            {"☆".repeat(3 - stars)}
          </div>
          <div style={{ fontSize: 20, color: "#fff", fontWeight: "bold" }}>
            Round {round + 1} Complete!
          </div>
          <div style={{ color: "#444", fontSize: 11, marginTop: 4 }}>
            {ROUNDS_DATA[round].name}
          </div>
        </div>
        <div
          style={{
            background: "#111",
            border: "1px solid #222",
            borderRadius: 12,
            padding: 22,
            width: "100%",
            maxWidth: 420,
            marginBottom: 16
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
              marginBottom: 18
            }}
          >
            {[
              { n: roundResult.correct, label: "Correct", col: "#4af" },
              { n: roundResult.missed, label: "Missed", col: "#f44" },
              { n: roundResult.wrong, label: "Humans Hit", col: "#fa0" }
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: "#0a0a0a",
                  borderRadius: 8,
                  padding: "12px 8px",
                  textAlign: "center",
                  border: "1px solid #1e1e1e"
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: "bold",
                    color: s.col
                  }}
                >
                  {s.n}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "#444",
                    marginTop: 3
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              background: "#0a0a0a",
              borderRadius: 8,
              padding: "10px 14px",
              border: "1px solid #1e1e1e",
              marginBottom: 14
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 5
              }}
            >
              <span style={{ color: "#555", fontSize: 12 }}>Accuracy</span>
              <span style={{ color: accCol, fontWeight: "bold" }}>
                {roundResult.acc}%
              </span>
            </div>
            <div
              style={{
                background: "#1a1a1a",
                borderRadius: 4,
                height: 7,
                overflow: "hidden"
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${roundResult.acc}%`,
                  background: accCol,
                  borderRadius: 4
                }}
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <span style={{ color: "#555", fontSize: 13 }}>Round score</span>
            <span
              style={{
                color: "#ff9900",
                fontSize: 20,
                fontWeight: "bold"
              }}
            >
              +{roundResult.score} pts
            </span>
          </div>
        </div>
        <div
          style={{
            background: "#0a1520",
            border: "1px solid #1a3a5a",
            borderRadius: 10,
            padding: "12px 18px",
            maxWidth: 420,
            width: "100%",
            marginBottom: 22
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "#4a9ab5",
              letterSpacing: 2,
              marginBottom: 5
            }}
          >
            🧠 ML LESSON
          </div>
          <div
            style={{
              color: "#7ab5d5",
              fontSize: 12,
              lineHeight: 1.7
            }}
          >
            {lesson}
          </div>
        </div>
        <button
          onClick={handleNextRound}
          style={{
            padding: "12px 40px",
            background: "#cc2200",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: "bold",
            cursor: "pointer",
            fontFamily: "'Courier New',monospace",
            letterSpacing: 1
          }}
        >
          {round < 2
            ? `Next: ${ROUNDS_DATA[round + 1].name} →`
            : "See Leaderboard 🏆"}
        </button>
      </div>
    );
  }

  // LEADERBOARD
  if (screen === "leaderboard") {
    const myTotal = roundScores.reduce((s, r) => s + r.score, 0);
    const myAvgAcc =
      roundScores.length > 0
        ? Math.round(
            roundScores.reduce((s, r) => s + r.acc, 0) / roundScores.length
          )
        : 0;
    const myRank =
      leaderboard.findIndex((e) => e.name === name && e.score === myTotal) + 1;

    return (
      <div style={{ ...S, paddingBottom: "2rem" }}>
        <div
          style={{
            background: "#111",
            borderBottom: "1px solid #1e1e1e",
            padding: "16px 20px",
            textAlign: "center"
          }}
        >
          <div style={{ fontSize: 26, marginBottom: 4 }}>🏆</div>
          <div
            style={{
              fontSize: 18,
              color: "#ff9900",
              fontWeight: "bold",
              letterSpacing: 3
            }}
          >
            LEADERBOARD
          </div>
          <div
            style={{
              color: "#333",
              fontSize: 10,
              marginTop: 3,
              letterSpacing: 3
            }}
          >
            ZOMBIE AI ACADEMY
          </div>
        </div>
        <div
          style={{
            padding: "18px 16px",
            maxWidth: 520,
            margin: "0 auto"
          }}
        >
          {roundScores.length > 0 && (
            <div
              style={{
                background: "#111",
                border: "1px solid #ff990030",
                borderRadius: 12,
                padding: "16px 18px",
                marginBottom: 18
              }}
            >
              <div
                style={{
                  color: "#ff9900",
                  fontSize: 10,
                  letterSpacing: 2,
                  marginBottom: 10
                }}
              >
                YOUR PERFORMANCE — {name.toUpperCase()}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                  marginBottom: 14
                }}
              >
                {[
                  {
                    v: `${myTotal}pts`,
                    l: "Total Score",
                    c: "#ff9900"
                  },
                  {
                    v: `${myAvgAcc}%`,
                    l: "Avg Accuracy",
                    c: "#4af"
                  },
                  {
                    v: myRank > 0 ? `#${myRank}` : "—",
                    l: "Your Rank",
                    c: "#f5f"
                  }
                ].map((s) => (
                  <div
                    key={s.l}
                    style={{
                      background: "#0a0a0a",
                      borderRadius: 8,
                      padding: "10px 6px",
                      textAlign: "center"
                    }}
                  >
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: "bold",
                        color: s.c
                      }}
                    >
                      {s.v}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: "#333",
                        marginTop: 3
                      }}
                    >
                      {s.l}
                    </div>
                  </div>
                ))}
              </div>
              {roundScores.map((r, i) => (
                <div
                  key={String(i)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "#0a0a0a",
                    borderRadius: 8,
                    padding: "8px 12px",
                    marginBottom: 6,
                    gap: 10
                  }}
                >
                  <div style={{ fontSize: 14 }}>
                    {"⭐".repeat(r.acc >= 80 ? 3 : r.acc >= 60 ? 2 : 1)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#bbb", fontSize: 12 }}>
                      {ROUNDS_DATA[i].name}
                    </div>
                    <div style={{ color: "#444", fontSize: 10 }}>
                      Accuracy: {r.acc}%
                    </div>
                  </div>
                  <div
                    style={{
                      color: "#ff9900",
                      fontWeight: "bold",
                      fontSize: 13
                    }}
                  >
                    +{r.score}pts
                  </div>
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              color: "#333",
              fontSize: 10,
              letterSpacing: 2,
              marginBottom: 9
            }}
          >
            ALL-TIME TOP 10
          </div>
          {leaderboard.length === 0 ? (
            <div
              style={{
                color: "#222",
                textAlign: "center",
                padding: 28,
                fontSize: 12
              }}
            >
              No entries yet. Be the first!
            </div>
          ) : (
            leaderboard.map((e, i) => {
              const isMe = e.name === name && e.score === myTotal;
              const medal =
                i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
              return (
                <div
                  key={e.name + i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: isMe ? "#130f00" : "#111",
                    border: `1px solid ${
                      isMe ? "#ff990044" : "#1e1e1e"
                    }`,
                    borderRadius: 8,
                    padding: "9px 14px",
                    marginBottom: 6,
                    gap: 12
                  }}
                >
                  <div
                    style={{
                      width: 26,
                      textAlign: "center",
                      fontSize: i < 3 ? 15 : 12,
                      color: "#555",
                      fontWeight: "bold"
                    }}
                  >
                    {medal}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        color: isMe ? "#ff9900" : "#bbb",
                        fontSize: 13,
                        fontWeight: isMe ? "bold" : "normal"
                      }}
                    >
                      {e.name}
                      {isMe ? " ← you" : ""}
                    </div>
                    <div
                      style={{
                        color: "#333",
                        fontSize: 10
                      }}
                    >
                      Age {e.age} · {e.acc}% avg · {e.date}
                    </div>
                  </div>
                  <div
                    style={{
                      color: "#ff9900",
                      fontWeight: "bold",
                      fontSize: 14
                    }}
                  >
                    {e.score}pts
                  </div>
                </div>
              );
            })
          )}
          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 22
            }}
          >
            <button
              onClick={restart}
              style={{
                flex: 1,
                padding: "12px 0",
                background: "#cc2200",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: "bold",
                cursor: "pointer",
                fontFamily: "'Courier New',monospace"
              }}
            >
              Play Again 🔄
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ZombieGame;

