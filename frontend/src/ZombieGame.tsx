import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const WEIGHT_TO_API: Record<keyof Weights, "skin" | "walk" | "temp"> = {
  s: "skin",
  w: "walk",
  b: "temp"
};

type GameEvent = EliminationResult | WeightChangeEvent;

type LeaderboardEntry = {
  name: string;
  score: number;
  acc: number;
  date: string;
};

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD
    ? "https://zombie-weight-classification.onrender.com"
    : "http://localhost:5000")
).replace(/\/$/, "");

const ASSET_BASE = import.meta.env.BASE_URL;
const assetUrl = (file: string) =>
  `${ASSET_BASE}${file
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/")}`;

/** Space for the fixed theme toggle in `App.tsx` (top-right) so headers don’t overlap. */
const HEADER_RIGHT_SAFE_PX = 168;

/** Survey Q2: multi-select; ids persisted comma-separated in `q2_weight_fairness`. */
const SURVEY_Q2_OPTIONS = [
  {
    id: "ignore_pandas",
    label:
      "Ignore the pandas: Just let the robot keep looking at turtles and hope it eventually figures it out."
  },
  {
    id: "weight_pandas",
    label:
      'Give pandas "extra points" (Weight): Tell the robot that finding a panda is 20 times more important than finding a turtle, so it pays extra close attention to them.'
  },
  {
    id: "delete_turtles",
    label:
      "Delete the turtle photos: Throw away the turtle pictures so the robot has almost nothing left to study."
  },
  {
    id: "stop_robot",
    label: "Stop the robot: Turn it off so it doesn't have to learn anything else."
  }
] as const;

// ── Game Data ─────────────────────────────────────────────────────────────────
const ROUNDS_DATA: RoundConfig[] = [
  {
    name: "The Park",
    difficulty: "Easy",
    color: "#1a3a1a",
    textColor: "#4a8",
    tip: "Every zombie reads cold, slow, and pale. Every human reads warm, fast, and not pale — tune weights to separate the two groups.",
    chars: [
      { x: 0.09, y: 0.22, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.2, y: 0.28, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.07, y: 0.52, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.18, y: 0.6, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.65, y: 0.18, t: "h", f: { s: 0, w: 0, b: 0 } },
      { x: 0.78, y: 0.24, t: "h", f: { s: 0, w: 0, b: 0 } },
      { x: 0.68, y: 0.46, t: "h", f: { s: 0, w: 0, b: 0 } },
      { x: 0.8, y: 0.52, t: "h", f: { s: 0, w: 0, b: 0 } }
    ]
  },
  {
    name: "The Mall",
    difficulty: "Medium",
    color: "#3a2a00",
    textColor: "#fa0",
    tip: "Zombies still match the full pattern. Some humans are pale only — they stay warm and fast, so temp and walk can save you.",
    chars: [
      { x: 0.09, y: 0.2, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.2, y: 0.35, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.07, y: 0.55, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.18, y: 0.7, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.65, y: 0.18, t: "h", f: { s: 1, w: 0, b: 0 } },
      { x: 0.78, y: 0.28, t: "h", f: { s: 0, w: 0, b: 0 } },
      { x: 0.68, y: 0.5, t: "h", f: { s: 1, w: 0, b: 0 } },
      { x: 0.8, y: 0.6, t: "h", f: { s: 0, w: 0, b: 0 } },
      { x: 0.72, y: 0.75, t: "h", f: { s: 0, w: 0, b: 0 } }
    ]
  },
  {
    name: "The Hospital",
    difficulty: "Hard",
    color: "#3a0000",
    textColor: "#f55",
    tip: "Misleading humans each show only ONE zombie-like cue (cold, slow, or pale). No human matches the full zombie signature — combine weights to tell them apart.",
    chars: [
      { x: 0.08, y: 0.18, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.19, y: 0.3, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.06, y: 0.5, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.17, y: 0.65, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.22, y: 0.8, t: "z", f: { s: 1, w: 1, b: 1 } },
      { x: 0.65, y: 0.15, t: "h", f: { s: 0, w: 0, b: 1 } },
      { x: 0.78, y: 0.22, t: "h", f: { s: 0, w: 1, b: 0 } },
      { x: 0.68, y: 0.45, t: "h", f: { s: 1, w: 0, b: 0 } },
      { x: 0.8, y: 0.55, t: "h", f: { s: 0, w: 0, b: 0 } },
      { x: 0.72, y: 0.72, t: "h", f: { s: 0, w: 0, b: 0 } }
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
    const res = await fetch(`${API_BASE}/api/leaderboard?limit=10`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items)) {
        return data.items as LeaderboardEntry[];
      }
    }
  } catch {
    // fallback to local cache below
  }
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

async function fetchJsonOrThrow(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return null;
}

const AUTH_TOKEN_KEY = "zai-token";

function fetchJsonAuthed(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const t = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (t) {
    headers.set("Authorization", `Bearer ${t}`);
  }
  return fetchJsonOrThrow(url, { ...init, headers });
}

// ── Canvas Game Component ─────────────────────────────────────────────────────
export type ZombieUiTheme = "dark" | "light";

type GameCanvasProps = {
  round: number;
  weights: Weights;
  onEvent: (evt: GameEvent) => void;
  playerName: string;
  avatar: AvatarId;
  onOpenLeaderboard: () => void;
  onSelectAvatar: (id: AvatarId) => void;
  timerMs: number;
  theme: ZombieUiTheme;
};

function GameCanvas({
  round,
  weights,
  onEvent,
  playerName,
  avatar,
  onOpenLeaderboard,
  onSelectAvatar,
  timerMs,
  theme
}: GameCanvasProps) {
  const isLight = theme === "light";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const charsRef = useRef<CanvasChar[]>([]);
  const animRef = useRef<number | null>(null);
  const phaseRef = useRef<"idle" | "running" | "done">("idle");
  const [showHint, setShowHint] = useState(false);

  const drawRobotVariant = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      if (avatar === "defence") {
        // Defence bot style (yellow, chunky)
        ctx.fillStyle = "#f5d040";
        ctx.strokeStyle = "#b08000";
        ctx.lineWidth = 1.5;
        ctx.fillRect(-14, -26, 28, 24);
        ctx.strokeRect(-14, -26, 28, 24);
        ctx.fillStyle = "#f0c030";
        ctx.fillRect(-18, -32, 8, 8);
        ctx.fillRect(10, -32, 8, 8);
        ctx.fillStyle = "#b08000";
        ctx.fillRect(-10, -20, 8, 6);
        ctx.fillRect(2, -20, 8, 6);
        ctx.fillStyle = "#8a6000";
        ctx.fillRect(-10, -6, 20, 4);
        ctx.fillStyle = "#f0c030";
        ctx.fillRect(-12, -2, 8, 18);
        ctx.fillRect(4, -2, 8, 18);
      } else if (avatar === "patrol") {
        // Patrol bot style (grey base with wheels)
        ctx.fillStyle = "#d0eaf8";
        ctx.strokeStyle = "#4a9ab5";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, -36, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ddf0fa";
        ctx.fillRect(-14, -30, 28, 22);
        ctx.strokeRect(-14, -30, 28, 22);
        ctx.fillStyle = "#22aadd";
        ctx.beginPath();
        ctx.arc(-6, -22, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(6, -22, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(-6, -22, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(6, -22, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#4a9ab5";
        ctx.fillRect(-8, -15, 16, 3);
        ctx.fillStyle = "#666";
        ctx.beginPath();
        ctx.arc(-8, -4, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(8, -4, 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Scout/default bot uses base robot style at this position
        drawRobot(ctx, 0, 0);
      }
      ctx.restore();
    },
    [avatar]
  );

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
      const t = performance.now() / 600;
      charsRef.current.forEach((c) => {
        if (c.type === "z") {
          drawZombie(ctx, c.x, c.y, c.state, c.flash);
        } else if (c.type === "h") {
          drawHuman(ctx, c.x, c.y, c.state);
        } else {
          // draw active bot body
          drawRobotVariant(ctx, c.x, c.y);
          // Extra flair based on selected bot
          if (avatar === "defence") {
            // Shield on the zombie side (left) that gently pulses
            const pulse = 0.8 + 0.2 * Math.sin(t * 2);
            ctx.save();
            ctx.translate(c.x - 26, c.y - 10);
            ctx.scale(pulse, pulse);
            ctx.fillStyle = "rgba(120,200,255,0.25)";
            ctx.beginPath();
            ctx.arc(0, 10, 24, Math.PI / 2, (3 * Math.PI) / 2);
            ctx.lineTo(0, 34);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#55bbee";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 10, 24, Math.PI / 2, (3 * Math.PI) / 2);
            ctx.stroke();
            ctx.restore();
          } else if (avatar === "patrol") {
            // Blaster aiming toward zombies (left) with a moving beam
            ctx.save();
            ctx.translate(c.x - 12, c.y - 16);
            ctx.fillStyle = "#ffdd55";
            ctx.fillRect(-14, -3, 14, 6);
            const beamOffset = (t % 1) * 40;
            ctx.fillStyle = "rgba(255,80,80,0.7)";
            ctx.fillRect(-32, -1, 18, 2);
            ctx.fillStyle = "rgba(255,160,160,0.8)";
            ctx.beginPath();
            ctx.arc(-14 - beamOffset, -0.5, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (avatar === "scout") {
            // Rotating radar line above the bot
            ctx.save();
            ctx.translate(c.x, c.y - 46);
            ctx.strokeStyle = "#66ffcc";
            ctx.lineWidth = 2;
            ctx.beginPath();
            const angle = t * 2;
            ctx.moveTo(0, 0);
            ctx.lineTo(26 * Math.cos(angle), 26 * Math.sin(angle));
            ctx.stroke();
            ctx.restore();
          }
        }
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
  }, [avatar, drawBg, drawHuman, drawZombie, drawRobotVariant]);

  const handleEliminate = () => {
    if (phaseRef.current !== "idle") return;
    phaseRef.current = "running";
    const w = weights;
    const targets = charsRef.current.filter((c) => c.type !== "r");

    const applyLocal = (c: CanvasChar, predictedZombie: boolean) => {
      c.state =
        predictedZombie
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
    };

    const localPredictedZombie = (c: CanvasChar) => {
      const max = w.s + w.w + w.b || 1;
      const raw =
        (c.f?.s ?? 0) * w.s +
        (c.f?.w ?? 0) * w.w +
        (c.f?.b ?? 0) * w.b;
      const sc = (raw / max) * 10;
      return sc >= 5;
    };

    const runInterval = (
      predMap: Map<number, boolean> | null
    ) => {
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
        const id = c.id;
        let predictedZombie: boolean;
        if (
          predMap &&
          id !== undefined &&
          predMap.has(id)
        ) {
          predictedZombie = predMap.get(id)!;
        } else {
          predictedZombie = localPredictedZombie(c);
        }
        applyLocal(c, predictedZombie);
        i += 1;
      }, 280);
    };

    void (async () => {
      let predMap: Map<number, boolean> | null = null;
      try {
        const res = await fetch(`${API_BASE}/api/ai/classify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            round: round + 1,
            weights: { skin: w.s, walk: w.w, temp: w.b },
            targets: targets.map((c) => ({
              id: c.id,
              features: {
                s: c.f?.s ?? 0,
                w: c.f?.w ?? 0,
                b: c.f?.b ?? 0
              }
            }))
          })
        });
        if (res.ok) {
          const data = (await res.json()) as {
            results?: Array<{ id: number; predictedZombie: boolean }>;
          };
          const rows = data.results;
          if (Array.isArray(rows) && rows.length > 0) {
            predMap = new Map(
              rows.map((r) => [r.id, r.predictedZombie])
            );
          }
        }
      } catch {
        predMap = null;
      }
      runInterval(predMap);
    })();
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

  const safeMs = Math.max(0, timerMs);
  const totalSeconds = Math.floor(safeMs / 1000);
  const msPart = Math.floor(safeMs % 1000);
  const secondsPart = totalSeconds % 60;
  const minutesPart = Math.floor(totalSeconds / 60) % 60;
  const hoursPart = Math.floor(totalSeconds / 3600);
  const pad2 = (n: number) => n.toString().padStart(2, "0");
  const pad3 = (n: number) => n.toString().padStart(3, "0");
  const timerText = `${pad2(hoursPart)}:${pad2(minutesPart)}:${pad2(
    secondsPart
  )}:${pad3(msPart)}`;

  const gc = {
    outerBg: isLight ? "#d4d4d4" : "#000",
    headerBg: isLight ? "#ececec" : "#111",
    headerBorder: isLight ? "#b8b8b8" : "#1e1e1e",
    avatarRingBg: isLight ? "#fafafa" : "#1a1a1a",
    avatarRingBorder: isLight ? "#888" : "#444",
    nameMain: isLight ? "#111" : "#eee",
    nameMuted: isLight ? "#555" : "#aaaaaa",
    sidebarBg: isLight ? "#e2e2e2" : "#111",
    sidebarBorder: isLight ? "#b0b0b0" : "#1e1e1e",
    sliderLabel: isLight ? "#111" : "#fff",
    sliderLowHigh: isLight ? "#666" : "#aaa",
    weightPillBg: isLight ? "#fff3cd" : "#120f00",
    bottomBarBg: isLight ? "#dedede" : "#111",
    bottomBarTopBorder: isLight ? "#b0b0b0" : "#1e1e1e",
    timerBg: isLight ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.7)",
    timerBorder: isLight ? "#999" : "#222",
    timerColor: isLight ? "#1a1a1a" : "#ccc",
    diffGold: isLight ? "#6a4800" : "#ffdd77",
    lbLink: isLight ? "#5a4000" : "#ffdd77",
    weightNum: isLight ? "#8a5a00" : "#ffcc66",
    hintBg: isLight ? "#fff6e8" : "#1a1200",
    hintBorder: isLight ? "#e0c090" : "#4a3800",
    hintTitle: isLight ? "#cc7700" : "#ff9900",
    hintBody: isLight ? "#5a4010" : "#ffbb55",
    botLabel: isLight ? "#444444" : "#cccccc"
  };

  return (
    <div
      style={{
        background: gc.outerBg,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Courier New', monospace",
        position: "relative"
      }}
    >
      <div
        style={{
          background: gc.headerBg,
          borderBottom: `1px solid ${gc.headerBorder}`,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 16,
          paddingRight: 16 + HEADER_RIGHT_SAFE_PX,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            style={{
              color: isLight ? "#cc2222" : "#ff3333",
              fontWeight: "bold",
              fontSize: 16,
              letterSpacing: 2
            }}
          >
            🧟 ROUND {round + 1}/3 — {rd.name.toUpperCase()}{" "}
            <span
              style={{
                color: gc.diffGold,
                fontSize: 14
              }}
            >
              ({rd.difficulty.toUpperCase()})
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flex: 1,
            justifyContent: "center",
            maxWidth: 260
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: gc.avatarRingBg,
              border: `1px solid ${gc.avatarRingBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22
            }}
          >
            {avatarEmoji}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              maxWidth: 210,
              overflow: "hidden",
              alignItems: "center",
              textAlign: "center"
            }}
          >
            <span
              style={{
                color: gc.nameMain,
                fontSize: 15,
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
                color: gc.nameMuted,
                fontSize: 13
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
            gap: 2,
            flexShrink: 0
          }}
        >
          <button
            type="button"
            onClick={onOpenLeaderboard}
            style={{
              fontSize: 13,
              color: gc.lbLink,
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            <span>🏆</span>
            <span style={{ textDecoration: "underline" }}>Leaderboard</span>
          </button>
          {/* difficulty now shown inline next to round title */}
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
            background: gc.sidebarBg,
            display: "flex",
            flexDirection: "column",
            padding: 14,
            gap: 12,
            borderLeft: `1px solid ${gc.sidebarBorder}`,
            flexShrink: 0
          }}
        >
          <div
            style={{
              color: "#ff9900",
              fontSize: 12,
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
                    color: gc.sliderLabel,
                    fontSize: 15,
                    fontWeight: "bold",
                    whiteSpace: "pre-line",
                    lineHeight: 1.2
                  }}
                >
                  {f.label}
                </span>
                <span
                  style={{
                    color: gc.weightNum,
                    fontSize: 15,
                    fontWeight: "bold",
                    background: gc.weightPillBg,
                    padding: "2px 10px",
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
                  fontSize: 10,
                  color: gc.sliderLowHigh,
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
                fontSize: 12,
                lineHeight: 1.4,
                color: "#ffbb55",
                marginTop: 2
              }}
            >
              <div
                style={{
                  fontSize: 12,
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
          background: gc.bottomBarBg,
          borderTop: `2px solid ${gc.bottomBarTopBorder}`,
          height: 90,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 60,
          marginTop: 12,
          position: "relative",
          padding: "0 18px",
          boxSizing: "border-box"
        }}
      >
        <button
          type="button"
          onClick={() => onSelectAvatar("scout")}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            opacity: avatar === "scout" ? 1 : 0.6,
            transform: avatar === "scout" ? "scale(1.05)" : "scale(1)"
          }}
        >
          <BotItem Bot={ScoutBot} label="Scout bot" labelColor={gc.botLabel} />
        </button>
        <button
          type="button"
          onClick={() => onSelectAvatar("defence")}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            opacity: avatar === "defence" ? 1 : 0.6,
            transform: avatar === "defence" ? "scale(1.05)" : "scale(1)"
          }}
        >
          <BotItem Bot={DefenceBot} label="Defence bot" labelColor={gc.botLabel} />
        </button>
        <button
          type="button"
          onClick={() => onSelectAvatar("patrol")}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            opacity: avatar === "patrol" ? 1 : 0.6,
            transform: avatar === "patrol" ? "scale(1.05)" : "scale(1)"
          }}
        >
          <BotItem Bot={PatrolBot} label="Patrol bot" labelColor={gc.botLabel} />
        </button>

        {/* Bottom-right round timer (theme toggle lives top-right in App) */}
        <div
          style={{
            position: "absolute",
            right: 18,
            bottom: 10,
            padding: "4px 10px",
            borderRadius: 12,
            background: gc.timerBg,
            border: `1px solid ${gc.timerBorder}`,
            fontSize: 18,
            color: gc.timerColor,
            textAlign: "right",
            lineHeight: 1.3
          }}
        >
          <div style={{ fontSize: 18, letterSpacing: 1 }}>TIME:</div>
          <div>{timerText}</div>
        </div>
      </div>
    </div>
  );
}

// ── Bots ──────────────────────────────────────────────────────────────────────
type BotItemProps = {
  Bot: React.ComponentType;
  label: string;
  labelColor?: string;
};

function BotItem({ Bot, label, labelColor = "#ccc" }: BotItemProps) {
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
          color: labelColor,
          fontSize: 15,
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
type Screen =
  | "auth"
  | "intro"
  | "tutorial"
  | "narration"
  | "game"
  | "roundResult"
  | "leaderboard"
  | "survey_q1"   // After Round 1: cats/dogs/plants group label (MC + image)
  | "survey_q1b"  // After Q1: training intro text
  | "survey_q2"   // After Round 1: turtle/panda imbalance (multi-select)
  | "survey_q2b"  // After Q2: "Great job thinking" text
  | "survey_q3"   // After Round 2: weighted classification & fairness (MC)
  | "survey_q4"   // After Round 2: self-driving rare class weight (MC)
  | "survey_q5"   // After Round 3: slider prioritization (image + open text)
  | "survey_q6"   // After Round 3: explain "weight" to a friend (open text)
  | "survey_q7";  // After Q6: AI decision confidence (slider 1–10)

type ZombieGameProps = {
  theme?: ZombieUiTheme;
};

const ZombieGame: React.FC<ZombieGameProps> = ({ theme = "dark" }) => {
  const [screen, setScreen] = useState<Screen>("auth");
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameErr, setNameErr] = useState("");
  const displayName = useMemo(
    () => `${firstName.trim()} ${lastName.trim()}`.trim(),
    [firstName, lastName]
  );
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
  const roundGameStartRef = useRef<number | null>(null);
  const [roundGameDurations, setRoundGameDurations] = useState<number[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboardOverlay, setShowLeaderboardOverlay] = useState(false);
  const [gameTimerMs, setGameTimerMs] = useState(0);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastWeightApiFeature, setLastWeightApiFeature] = useState<
    "skin" | "walk" | "temp" | null
  >(null);
  const [ansQ1, setAnsQ1] = useState<string | null>(null);
  const [ansQ2, setAnsQ2] = useState<string[]>([]);
  const [ansQ3, setAnsQ3] = useState<string | null>(null);
  const [ansQ4, setAnsQ4] = useState<string | null>(null);
  const [ansQ5, setAnsQ5] = useState("");
  const [ansQ6, setAnsQ6] = useState("");
  const [ansQ7, setAnsQ7] = useState(5);
  const [surveyError, setSurveyError] = useState("");

  useEffect(() => {
    loadLB().then(setLeaderboard);
  }, []);

  useEffect(() => {
    void (async () => {
      const t = window.localStorage.getItem(AUTH_TOKEN_KEY);
      if (!t) {
        setScreen("auth");
        setAuthReady(true);
        return;
      }
      try {
        const me = await fetchJsonOrThrow(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${t}` }
        });
        const p = me.player as { id: string; name: string; lastName: string };
        setFirstName(p.name);
        setLastName(p.lastName);
        setPlayerId(p.id);
        setScreen("intro");
      } catch {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
        setScreen("auth");
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  // Send slider state to the Python AI so it knows which features you emphasize.
  useEffect(() => {
    if (screen !== "game") return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await fetchJsonOrThrow(`${API_BASE}/api/ai/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: sessionId ?? undefined,
              playerId: playerId ?? undefined,
              round: round + 1,
              weights: {
                skin: weights.s,
                walk: weights.w,
                temp: weights.b
              },
              lastAdjustedFeature: lastWeightApiFeature ?? undefined
            })
          });
        } catch {
          // offline / no backend
        }
      })();
    }, 450);
    return () => window.clearTimeout(t);
  }, [
    screen,
    sessionId,
    playerId,
    round,
    weights.s,
    weights.w,
    weights.b,
    lastWeightApiFeature
  ]);

  const applyAuthSuccess = (data: {
    token: string;
    playerId: string;
    player: { name: string; lastName?: string };
  }) => {
    window.localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    setPlayerId(data.playerId);
    setFirstName(data.player.name);
    setLastName((data.player.lastName ?? "").trim());
    setAuthError("");
    setPassword("");
    setConfirmPassword("");
    setScreen("intro");
  };

  const handleAuthRegister = async () => {
    setAuthError("");
    if (!firstName.trim() || !lastName.trim()) {
      setAuthError("Enter first name and last initial.");
      return;
    }
    if (password.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    try {
      const data = await fetchJsonOrThrow(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: firstName.trim(),
          lastName: lastName.trim().slice(0, 1),
          password
        })
      });
      applyAuthSuccess(data as {
        token: string;
        playerId: string;
        player: { name: string; lastName?: string };
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setAuthError(
        msg.includes("409")
          ? "An account with this name already exists. Try logging in."
          : "Registration failed. Check your connection or try logging in."
      );
    }
  };

  const handleAuthLogin = async () => {
    setAuthError("");
    if (!firstName.trim() || !lastName.trim() || !password) {
      setAuthError("Enter first name, last initial, and password.");
      return;
    }
    try {
      const data = await fetchJsonOrThrow(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: firstName.trim(),
          lastName: lastName.trim().slice(0, 1),
          password
        })
      });
      applyAuthSuccess(data as {
        token: string;
        playerId: string;
        player: { name: string; lastName?: string };
      });
    } catch {
      setAuthError("Invalid name or password.");
    }
  };

  const handleStart = async () => {
    if (!avatar) {
      setNameErr("Please choose your bot avatar!");
      return;
    }
    const t = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!playerId || !t) {
      setNameErr("Please sign in.");
      setScreen("auth");
      return;
    }
    setNameErr("");
    setRound(0);
    setNarrLine(0);
    setNarrDone(false);
    setRoundScores([]);
    setRoundResult(null);
    setSurveyError("");
    setAnsQ1(null); setAnsQ2([]); setAnsQ3(null);
    setAnsQ4(null); setAnsQ5(""); setAnsQ6(""); setAnsQ7(5);
    setLastWeightApiFeature(null);
    try {
      const sData = await fetchJsonAuthed(`${API_BASE}/api/session/start`, {
        method: "POST",
        body: JSON.stringify({ playerId, avatar })
      });
      setSessionId(sData.sessionId as string);
    } catch {
      setNameErr("Could not start session. Sign in again.");
      setScreen("auth");
      return;
    }
    setScreen("tutorial");
  };

  const continueFromTutorial = () => {
    setNarrLine(0);
    setNarrDone(false);
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

  // Tick timer while on main game screen
  useEffect(() => {
    if (screen !== "game") {
      setGameTimerMs(0);
      return;
    }
    // start if not already started
    if (roundGameStartRef.current === null) {
      roundGameStartRef.current = performance.now();
    }
    const id = window.setInterval(() => {
      if (roundGameStartRef.current !== null) {
        setGameTimerMs(performance.now() - roundGameStartRef.current);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [screen, round]);

  const handleGameEvent = (evt: GameEvent) => {
    if ("weightChange" in evt) {
      setLastWeightApiFeature(WEIGHT_TO_API[evt.weightChange.key]);
      setWeights((w) => ({
        ...w,
        [evt.weightChange.key]: evt.weightChange.val
      }));
      return;
    }
    // Stop main-game timer for this round
    if (roundGameStartRef.current !== null) {
      const dur = performance.now() - roundGameStartRef.current;
      setRoundGameDurations((prev) => {
        const next = [...prev];
        next[round] = dur;
        return next;
      });
      roundGameStartRef.current = null;
      setGameTimerMs(dur);
    }
    setRoundResult(evt);
    setScreen("roundResult");

    const sid = sessionId;
    const rd = ROUNDS_DATA[round];
    if (sid) {
      void (async () => {
        try {
          await fetchJsonAuthed(`${API_BASE}/api/session/${sid}/round`, {
            method: "POST",
            body: JSON.stringify({
              roundNumber: round + 1,
              sceneName: rd.name,
              difficulty: rd.difficulty,
              weights: {
                skin: weights.s,
                walk: weights.w,
                temp: weights.b
              },
              timingMs: Math.round(roundGameDurations[round] ?? gameTimerMs),
              results: {
                correct: evt.correct,
                missed: evt.missed,
                wrong: evt.wrong,
                accuracy: evt.acc,
                score: evt.score
              },
              botUsed: avatar || "scout"
            })
          });
        } catch {
        }
      })();
    }
  };

  const handleNextRound = () => {
    if (!roundResult) return;
    setRoundScores((prev) => [...prev, roundResult!]);
    setRoundResult(null);
    setSurveyError("");
    if (round === 0) {
      setScreen("survey_q1");
    } else if (round === 1) {
      setScreen("survey_q3");
    } else {
      setScreen("survey_q5");
    }
  };

  const handleReplayRound = () => {
    setRoundResult(null);
    setSurveyError("");
    setGameTimerMs(0);
    roundGameStartRef.current = null;
    setScreen("game");
  };

  const logoutAndGoAuth = () => {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setPlayerId(null);
    setSessionId(null);
    setFirstName("");
    setLastName("");
    setPassword("");
    setConfirmPassword("");
    setRound(0);
    setNarrLine(0);
    setNarrDone(false);
    setRoundScores([]);
    setRoundResult(null);
    setWeights({ s: 7, w: 4, b: 5 });
    setLastWeightApiFeature(null);
    setSurveyError("");
    setAnsQ1(null); setAnsQ2([]); setAnsQ3(null);
    setAnsQ4(null); setAnsQ5(""); setAnsQ6(""); setAnsQ7(5);
    setAvatar(null);
    setShowAvatarPicker(false);
    setAuthError("");
    setAuthMode("login");
    setScreen("auth");
  };

  /** New `sessionId` = new row in `sessions` (and surveys/leaderboard) for this playthrough—same player, distinct run. */
  const playAgainFullGame = async () => {
    setRound(0);
    setNarrLine(0);
    setNarrDone(false);
    setRoundScores([]);
    setRoundResult(null);
    setRoundGameDurations([]);
    setSurveyError("");
    setAnsQ1(null); setAnsQ2([]); setAnsQ3(null);
    setAnsQ4(null); setAnsQ5(""); setAnsQ6(""); setAnsQ7(5);
    setSessionId(null);
    setLastWeightApiFeature(null);
    roundGameStartRef.current = null;
    setGameTimerMs(0);
    const t = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!playerId || !t) {
      setScreen("auth");
      return;
    }
    const av = avatar || "scout";
    try {
      const sData = await fetchJsonAuthed(`${API_BASE}/api/session/start`, {
        method: "POST",
        body: JSON.stringify({ playerId, avatar: av })
      });
      setSessionId(sData.sessionId as string);
    } catch {
      setScreen("auth");
      return;
    }
    setScreen("tutorial");
  };

  const continueQ1 = () => {
    if (!ansQ1) {
      setSurveyError("Please select an answer before continuing.");
      return;
    }
    setSurveyError("");
    setScreen("survey_q1b");
  };

  const continueQ1b = () => {
    setSurveyError("");
    setScreen("survey_q2");
  };

  const continueQ2 = () => {
    if (ansQ2.length === 0) {
      setSurveyError("Please select at least one option before continuing.");
      return;
    }
    setSurveyError("");
    setScreen("survey_q2b");
  };

  const continueQ2b = () => {
    setSurveyError("");
    setRound((r) => r + 1);
    setNarrLine(0);
    setNarrDone(false);
    setScreen("narration");
  };

  const continueQ3 = () => {
    if (!ansQ3) {
      setSurveyError("Please select an answer before continuing.");
      return;
    }
    setSurveyError("");
    setScreen("survey_q4");
  };

  const continueQ4 = () => {
    if (!ansQ4) {
      setSurveyError("Please select an answer before continuing.");
      return;
    }
    setSurveyError("");
    setRound((r) => r + 1);
    setNarrLine(0);
    setNarrDone(false);
    setScreen("narration");
  };

  const continueQ5 = () => {
    if (!ansQ5.trim()) {
      setSurveyError("Please answer this question before continuing.");
      return;
    }
    setSurveyError("");
    setScreen("survey_q6");
  };

  const continueQ6 = () => {
    if (!ansQ6.trim()) {
      setSurveyError("Please answer this question before continuing.");
      return;
    }
    setSurveyError("");
    setScreen("survey_q7");
  };

  const continueQ7 = async () => {
    setSurveyError("");
    const scores = roundScores;
    const total = scores.reduce((s, r) => s + r.score, 0);
    const avgAcc =
      scores.length > 0
        ? Math.round(scores.reduce((s, r) => s + r.acc, 0) / scores.length)
        : 0;
    try {
      const sid = sessionId;
      if (sid) {
        await fetchJsonAuthed(`${API_BASE}/api/session/${sid}/survey`, {
          method: "POST",
          body: JSON.stringify({
            q1_graph_meaning: ansQ1,
            q2_weight_fairness: [...ansQ2].sort().join(","),
            q3_weights_affect_fairness: ansQ3,
            q4_ai_label_group: ansQ4,
            q5_weight_definition: ansQ5,
            q6_confidence: ansQ6,
            q7_decision_confidence: ansQ7
          })
        });
        await fetchJsonAuthed(`${API_BASE}/api/session/${sid}/finish`, {
          method: "POST",
          body: JSON.stringify({ totalScore: total, avgAccuracy: avgAcc })
        });
        const lbData = await fetchJsonOrThrow(`${API_BASE}/api/leaderboard?limit=10`);
        if (Array.isArray(lbData.items)) {
          setLeaderboard(lbData.items);
          await saveLB(lbData.items);
          setScreen("leaderboard");
          return;
        }
      }
    } catch {
    }
    const entry: LeaderboardEntry = {
      name: displayName,
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
  };

  const S: React.CSSProperties = useMemo(
    () => ({
      fontFamily: "'Courier New', monospace",
      minHeight: "100vh",
      boxSizing: "border-box",
      ...(theme === "light"
        ? { background: "#f0f0f0", color: "#1a1a1a" }
        : { background: "#0a0a0a" })
    }),
    [theme]
  );

  /** Text & surfaces for light vs dark (keep accents red/orange readable on both). */
  const tc = useMemo(() => {
    if (theme === "light") {
      return {
        subtitle: "#5a5a5a",
        body: "#1a1a1a",
        bodySoft: "#2a2a2a",
        panel: "#ffffff",
        panel2: "#f5f5f5",
        panel3: "#ececec",
        panelBorder: "#c4c4c4",
        panelBorder2: "#b8b8b8",
        inputBg: "#ffffff",
        inputText: "#111111",
        inputBorder: "#888888",
        label: "#333333",
        labelMuted: "#4a4a4a",
        avatarBtnBg: "#f0f0f0",
        avatarBtnBorder: "#999999",
        pickerWrapBg: "#f2f2f2",
        pickerWrapBorder: "#cccccc",
        pickerItemBg: "#ffffff",
        pickerItemBorder: "#bbbbbb",
        pickerItemBgSel: "#fff4e6",
        pickerItemBorderSel: "#ff9900",
        pickerLabelIdle: "#555555",
        pickerLabelSel: "#8a4a00",
        introBlurbOrange: "#cc7700",
        viewLbText: "#333333",
        viewLbBorder: "#bbbbbb",
        tutorialPanel: "#ffffff",
        tutorialPanelBorder: "#c8c8c8",
        tutorialHead: "#111111",
        tutorialSub: "#555555",
        videoWell: "#eaeaea",
        videoWellBorder: "#cccccc",
        tipBgEven: "#f6f6f6",
        tipBgOdd: "#fff8f0",
        tipBorder: "#dddddd",
        tipNumBg: "#ffe8cc",
        tipNumBorder: "rgba(255,153,0,0.35)",
        tipNumText: "#7a4a00",
        tipText: "#1a1a1a",
        narrBarBg: "#f0f0f0",
        narrBarBorder: "#c8c8c8",
        narrRound: "#444444",
        briefingMeta: "#555555",
        bubbleBg: "#f7f7f7",
        bubbleBorderCmd: "#a8c8a8",
        bubbleBorderAi: "#a8b8d8",
        typewriter: "#1a1a1a",
        narrSkipBgOff: "#e8e8e8",
        narrSkipTextOff: "#777777",
        narrSkipBorderOff: "#bbbbbb",
        surveyHeaderQ: "#444444",
        surveyCardBg: "#ffffff",
        surveyCardBorder: "#c8c8c8",
        surveyDotIdle: "#cccccc",
        mcIdle: "#333333",
        mcSel: "#8a5a00",
        mcBgSel: "#fff4e0",
        mcBorderSel: "rgba(255,153,0,0.35)",
        surveyErrorBg: "#fdeaea",
        surveyErrorBorder: "#e0a0a0",
        surveyErrorText: "#9a2020",
        textareaBg: "#ffffff",
        textareaBorder: "#888888",
        textareaText: "#111111",
        hintMuted: "#555555",
        overlayScrim: "rgba(0,0,0,0.45)",
        lbName: "#1a1a1a",
        lbNameYou: "#8a4a00",
        lbSub: "#555555",
        lbEmpty: "#888888",
        roundResultTitle: "#111111",
        roundResultSub: "#555555",
        statLabel: "#444444",
        perfHeader: "#8a4a00",
        perfSub: "#666666",
        roundNameMuted: "#555555",
        zaiRed: "#cc2222",
        avatarTitle: "#1a1a1a",
        surveyQAccent: "#6a4500",
        surveyBody: "#333333",
        surveyList: "#333333",
        surveyMuted: "#666666",
        surveyHint: "#444444",
        surveySliderEnd: "#444444",
        surveyValueBold: "#8a5a00",
        imageWellBg: "#eaeaea",
        imageWellBorder: "#c8c8c8",
        missionTipBg: "#fff8e8",
        missionTipBorder: "#e0c878",
        missionTipBody: "#5a4810",
        narrDotIdle: "#cccccc",
        replayBg: "#f2ede0",
        replayText: "#6b5500",
        replayBorder: "#a09050",
        lessonBg: "#e6f2fa",
        lessonBorder: "#90b8d8",
        lessonHead: "#256090",
        lessonText: "#1a4058",
        rrCardBg: "#ffffff",
        rrCardBorder: "#c8c8c8",
        rrStatBox: "#f4f4f4",
        rrStatBoxBorder: "#d8d8d8",
        rrStatLabel: "#555555",
        rrAccSection: "#f4f4f4",
        rrAccSectionBorder: "#d8d8d8",
        rrTrack: "#e0e0e0",
        lbFullHeaderBg: "#f0f0f0",
        lbFullHeaderBorder: "#c8c8c8",
        lbPerfOuter: "#ffffff",
        lbPerfBorder: "rgba(255,153,0,0.35)",
        lbStatTile: "#f6f6f6",
        lbRoundRow: "#f6f6f6",
        lbRoundName: "#333333",
        lbRoundAcc: "#555555",
        lbAllTime: "#555555",
        lbEmptyMsg: "#888888",
        lbRowBg: "#ffffff",
        lbRowBgYou: "#fff4e6",
        lbRowBorder: "#dddddd",
        lbRowBorderYou: "rgba(255,153,0,0.35)",
        lbNameOther: "#333333",
        overlayModalBg: "#ffffff",
        overlayModalBorder: "#c8c8c8",
        overlaySection: "#f6f6f6",
        overlaySectionBorder: "#dddddd",
        overlayCloseText: "#555555",
        overlayCloseBorder: "#aaaaaa",
        overlayMuted: "#555555",
        overlayRowYou: "#fff4e6",
        overlayRowOther: "#f8f8f8",
        overlayRowBorder: "#dddddd",
        overlayMedal: "#444444"
      };
    }
    return {
      subtitle: "#adadad",
      body: "#d0d0d0",
      bodySoft: "#d0d0d0",
      panel: "#1b1b1b",
      panel2: "#151515",
      panel3: "#181818",
      panelBorder: "#555555",
      panelBorder2: "#333333",
      inputBg: "#101010",
      inputText: "#ffffff",
      inputBorder: "#666666",
      label: "#d5d5d5",
      labelMuted: "#d0d0d0",
      avatarBtnBg: "#202020",
      avatarBtnBorder: "#8a8a8a",
      pickerWrapBg: "#151515",
      pickerWrapBorder: "#222222",
      pickerItemBg: "#181818",
      pickerItemBorder: "#333333",
      pickerItemBgSel: "#261400",
      pickerItemBorderSel: "#ff9900",
      pickerLabelIdle: "#777777",
      pickerLabelSel: "#ffdd88",
      introBlurbOrange: "#ff9900",
      viewLbText: "#bcbcbc",
      viewLbBorder: "#222222",
      tutorialPanel: "#111111",
      tutorialPanelBorder: "#222222",
      tutorialHead: "#ffffff",
      tutorialSub: "#999999",
      videoWell: "#050505",
      videoWellBorder: "#222222",
      tipBgEven: "#171717",
      tipBgOdd: "#14100a",
      tipBorder: "#2a2a2a",
      tipNumBg: "#261400",
      tipNumBorder: "rgba(255,153,0,0.27)",
      tipNumText: "#ffcc66",
      tipText: "#dddddd",
      narrBarBg: "#111111",
      narrBarBorder: "#1e1e1e",
      narrRound: "#adadad",
      briefingMeta: "#9a9a9a",
      bubbleBg: "#111111",
      bubbleBorderCmd: "#2a3a2a",
      bubbleBorderAi: "#1a2a3a",
      typewriter: "#dddddd",
      narrSkipBgOff: "#1a1a1a",
      narrSkipTextOff: "#555555",
      narrSkipBorderOff: "#333333",
      surveyHeaderQ: "#adadad",
      surveyCardBg: "#111111",
      surveyCardBorder: "#222222",
      surveyDotIdle: "#333333",
      mcIdle: "#cccccc",
      mcSel: "#ffdd88",
      mcBgSel: "#1a1000",
      mcBorderSel: "rgba(255,153,0,0.27)",
      surveyErrorBg: "#220909",
      surveyErrorBorder: "#553333",
      surveyErrorText: "#ff7a7a",
      textareaBg: "#0a0a0a",
      textareaBorder: "#333333",
      textareaText: "#eeeeee",
      hintMuted: "#d8d8d8",
      overlayScrim: "rgba(0,0,0,0.7)",
      lbName: "#dddddd",
      lbNameYou: "#ffdd88",
      lbSub: "#c6c6c6",
      lbEmpty: "#adadad",
      roundResultTitle: "#ffffff",
      roundResultSub: "#adadad",
      statLabel: "#bcbcbc",
      perfHeader: "#ff9900",
      perfSub: "#9a9a9a",
      roundNameMuted: "#adadad",
      zaiRed: "#ff3333",
      avatarTitle: "#eeeeee",
      surveyQAccent: "#ffdd77",
      surveyBody: "#cccccc",
      surveyList: "#cccccc",
      surveyMuted: "#aaaaaa",
      surveyHint: "#d8d8d8",
      surveySliderEnd: "#d0d0d0",
      surveyValueBold: "#ffcc66",
      imageWellBg: "#000000",
      imageWellBorder: "#222222",
      missionTipBg: "#0f0d00",
      missionTipBorder: "#3a2f00",
      missionTipBody: "#cc9900",
      narrDotIdle: "#222222",
      replayBg: "#1a1a1a",
      replayText: "#ffdd77",
      replayBorder: "#665200",
      lessonBg: "#0a1520",
      lessonBorder: "#1a3a5a",
      lessonHead: "#4a9ab5",
      lessonText: "#7ab5d5",
      rrCardBg: "#111111",
      rrCardBorder: "#222222",
      rrStatBox: "#0a0a0a",
      rrStatBoxBorder: "#1e1e1e",
      rrStatLabel: "#adadad",
      rrAccSection: "#0a0a0a",
      rrAccSectionBorder: "#1e1e1e",
      rrTrack: "#1a1a1a",
      lbFullHeaderBg: "#111111",
      lbFullHeaderBorder: "#1e1e1e",
      lbPerfOuter: "#111111",
      lbPerfBorder: "#ff990030",
      lbStatTile: "#0a0a0a",
      lbRoundRow: "#0a0a0a",
      lbRoundName: "#bbbbbb",
      lbRoundAcc: "#adadad",
      lbAllTime: "#9a9a9a",
      lbEmptyMsg: "#adadad",
      lbRowBg: "#111111",
      lbRowBgYou: "#130f00",
      lbRowBorder: "#1e1e1e",
      lbRowBorderYou: "#ff990044",
      lbNameOther: "#bbbbbb",
      overlayModalBg: "#111111",
      overlayModalBorder: "#333333",
      overlaySection: "#181818",
      overlaySectionBorder: "#333333",
      overlayCloseText: "#aaaaaa",
      overlayCloseBorder: "#444444",
      overlayMuted: "#d8d8d8",
      overlayRowYou: "#181000",
      overlayRowOther: "#151515",
      overlayRowBorder: "#222222",
      overlayMedal: "#d0d0d0"
    };
  }, [theme]);

  if (!authReady) {
    return (
      <div
        style={{
          ...S,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh"
        }}
      >
        <div style={{ color: theme === "light" ? "#555" : "#888", fontSize: 14 }}>
          Loading…
        </div>
      </div>
    );
  }

  if (screen === "auth") {
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
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 44, marginBottom: 6 }}>🧟</div>
          <div
            style={{
              fontSize: 22,
              fontWeight: "bold",
              color: tc.zaiRed,
              letterSpacing: 2
            }}
          >
            ZOMBIE AI ACADEMY
          </div>
          <div style={{ fontSize: 11, color: tc.subtitle, marginTop: 6 }}>
            Sign in or create an account
          </div>
        </div>
        <div
          style={{
            background: tc.panel,
            border: `1px solid ${tc.panelBorder}`,
            borderRadius: 12,
            padding: "22px 24px",
            width: "100%",
            maxWidth: 380
          }}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
              }}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border:
                  authMode === "login"
                    ? `1px solid ${tc.introBlurbOrange}`
                    : `1px solid ${tc.panelBorder2}`,
                background: authMode === "login" ? tc.mcBgSel : "transparent",
                color: authMode === "login" ? tc.mcSel : tc.body,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: "bold"
              }}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("register");
                setAuthError("");
              }}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 8,
                border:
                  authMode === "register"
                    ? `1px solid ${tc.introBlurbOrange}`
                    : `1px solid ${tc.panelBorder2}`,
                background: authMode === "register" ? tc.mcBgSel : "transparent",
                color: authMode === "register" ? tc.mcSel : tc.body,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: "bold"
              }}
            >
              Register
            </button>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: tc.label, fontSize: 11, marginBottom: 4 }}>FIRST NAME</div>
            <input
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                setAuthError("");
              }}
              placeholder="e.g. Alex"
              autoComplete="given-name"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: tc.inputBg,
                border: `1px solid ${tc.inputBorder}`,
                borderRadius: 8,
                color: tc.inputText,
                fontSize: 14,
                boxSizing: "border-box",
                fontFamily: "'Courier New',monospace"
              }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: tc.label, fontSize: 11, marginBottom: 4 }}>LAST NAME INITIAL</div>
            <input
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value.slice(0, 1));
                setAuthError("");
              }}
              placeholder="e.g. R"
              maxLength={1}
              autoComplete="family-name"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: tc.inputBg,
                border: `1px solid ${tc.inputBorder}`,
                borderRadius: 8,
                color: tc.inputText,
                fontSize: 14,
                boxSizing: "border-box",
                fontFamily: "'Courier New',monospace"
              }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: tc.label, fontSize: 11, marginBottom: 4 }}>PASSWORD</div>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setAuthError("");
              }}
              placeholder={authMode === "register" ? "At least 8 characters" : "Your password"}
              autoComplete={authMode === "register" ? "new-password" : "current-password"}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: tc.inputBg,
                border: `1px solid ${tc.inputBorder}`,
                borderRadius: 8,
                color: tc.inputText,
                fontSize: 14,
                boxSizing: "border-box",
                fontFamily: "'Courier New',monospace"
              }}
            />
          </div>
          {authMode === "register" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: tc.label, fontSize: 11, marginBottom: 4 }}>
                CONFIRM PASSWORD
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setAuthError("");
                }}
                placeholder="Repeat password"
                autoComplete="new-password"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: tc.inputBg,
                  border: `1px solid ${tc.inputBorder}`,
                  borderRadius: 8,
                  color: tc.inputText,
                  fontSize: 14,
                  boxSizing: "border-box",
                  fontFamily: "'Courier New',monospace"
                }}
              />
            </div>
          )}
          {authError && (
            <div
              style={{
                color: tc.surveyErrorText,
                fontSize: 12,
                marginBottom: 10,
                background: tc.surveyErrorBg,
                border: `1px solid ${tc.surveyErrorBorder}`,
                borderRadius: 8,
                padding: "8px 10px"
              }}
            >
              {authError}
            </div>
          )}
          <button
            type="button"
            onClick={authMode === "register" ? handleAuthRegister : handleAuthLogin}
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
            {authMode === "register" ? "CREATE ACCOUNT →" : "LOG IN →"}
          </button>
        </div>
      </div>
    );
  }

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
              color: tc.zaiRed,
              letterSpacing: 3
            }}
          >
            ZOMBIE AI
          </div>
          <div
            style={{
              fontSize: 11,
              color: tc.subtitle,
              letterSpacing: 5,
              marginTop: 4
            }}
          >
            DETECTION ACADEMY
          </div>
        </div>
        <div
          style={{
            background: tc.panel,
            border: `1px solid ${tc.panelBorder}`,
            borderRadius: 12,
            padding: "28px 30px",
            width: "100%",
            maxWidth: 360
          }}
        >
          <div
            style={{
              color: tc.body,
              fontSize: 12,
              lineHeight: 1.8,
              marginBottom: 20
            }}
          >
            Train an AI to detect zombies using{" "}
            <span style={{ color: tc.introBlurbOrange }}>weighted classification</span>.
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
                border: `2px solid ${tc.avatarBtnBorder}`,
                background: tc.avatarBtnBg,
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
                color: tc.avatarTitle,
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
            <div style={{ color: tc.bodySoft, fontSize: 10 }}>
              Avatar
            </div>
            {showAvatarPicker && (
              <div
                style={{
                  marginTop: 8,
                  padding: 8,
                  borderRadius: 8,
                  border: `1px solid ${tc.pickerWrapBorder}`,
                  background: tc.pickerWrapBg,
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
                          ? `1px solid ${tc.pickerItemBorderSel}`
                          : `1px solid ${tc.pickerItemBorder}`,
                        background: isSelected ? tc.pickerItemBgSel : tc.pickerItemBg,
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
                          color: isSelected ? tc.pickerLabelSel : tc.pickerLabelIdle
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
          <div
            style={{
              color: tc.body,
              fontSize: 12,
              marginBottom: 14,
              textAlign: "center",
              lineHeight: 1.5
            }}
          >
            Signed in as{" "}
            <span style={{ fontWeight: "bold", color: tc.label }}>
              {displayName || "Cadet"}
            </span>
          </div>
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
          <button
            type="button"
            onClick={logoutAndGoAuth}
            style={{
              marginTop: 10,
              width: "100%",
              background: "transparent",
              border: "none",
              color: tc.viewLbText,
              fontSize: 11,
              cursor: "pointer",
              textDecoration: "underline"
            }}
          >
            Sign out
          </button>
        </div>
        {leaderboard.length > 0 && (
          <button
            onClick={() => setScreen("leaderboard")}
            style={{
              marginTop: 14,
              background: "transparent",
              border: `1px solid ${tc.viewLbBorder}`,
              color: tc.viewLbText,
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

  // TUTORIAL
  if (screen === "tutorial") {
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
        <div
          style={{
            width: "100%",
            maxWidth: 920,
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: 20
          }}
        >
          <div
            style={{
              background: tc.tutorialPanel,
              border: `1px solid ${tc.tutorialPanelBorder}`,
              borderRadius: 14,
              padding: "22px 24px"
            }}
          >
            <div
              style={{
                color: tc.zaiRed,
                fontSize: 12,
                fontWeight: "bold",
                letterSpacing: 2,
                marginBottom: 8
              }}
            >
              TUTORIAL
            </div>
            <div
              style={{
                color: tc.tutorialHead,
                fontSize: 22,
                fontWeight: "bold",
                marginBottom: 10
              }}
            >
              Watch before Round 1
            </div>
            <div
              style={{
                color: tc.tutorialSub,
                fontSize: 13,
                lineHeight: 1.7,
                marginBottom: 18
              }}
            >
              Quick video overview of how the mission and training tools work.
            </div>
            <div
              style={{
                background: tc.videoWell,
                border: `1px solid ${tc.videoWellBorder}`,
                borderRadius: 12,
                padding: 12,
                marginBottom: 12
              }}
            >
              <video
                controls
                style={{
                  width: "100%",
                  borderRadius: 10,
                  background: "#000",
                  minHeight: 320
                }}
              >
                <source src={assetUrl("tutorial.mp4")} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>

          <div
            style={{
              background: tc.tutorialPanel,
              border: `1px solid ${tc.tutorialPanelBorder}`,
              borderRadius: 14,
              padding: "22px 20px",
              display: "flex",
              flexDirection: "column"
            }}
          >
            <div
              style={{
                color: tc.introBlurbOrange,
                fontSize: 12,
                fontWeight: "bold",
                letterSpacing: 2,
                marginBottom: 14
              }}
            >
              Instructions
            </div>
            {[
              "Read mission debriefings to prepare for each level!",
              "Train bots by changing sliders!",
              "Save humanity and eliminate all Zombies!!"
            ].map((tip, i) => (
              <div
                key={tip}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  background: i % 2 === 0 ? tc.tipBgEven : tc.tipBgOdd,
                  border: `1px solid ${tc.tipBorder}`,
                  borderRadius: 12,
                  padding: "12px 12px",
                  marginBottom: 10
                }}
              >
                <div
                  style={{
                    minWidth: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: tc.tipNumBg,
                    border: `1px solid ${tc.tipNumBorder}`,
                    color: tc.tipNumText,
                    fontSize: 12,
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {i + 1}
                </div>
                <div
                  style={{
                    color: tc.tipText,
                    fontSize: 13,
                    lineHeight: 1.6
                  }}
                >
                  {tip}
                </div>
              </div>
            ))}

            <button
              onClick={continueFromTutorial}
              style={{
                width: "100%",
                marginTop: "auto",
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
              CONTINUE TO BRIEFING →
            </button>
          </div>
        </div>
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
            background: tc.narrBarBg,
            borderBottom: `1px solid ${tc.narrBarBorder}`,
            paddingTop: 12,
            paddingBottom: 12,
            paddingLeft: 20,
            paddingRight: 20 + HEADER_RIGHT_SAFE_PX,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            boxSizing: "border-box"
          }}
        >
          <div
            style={{
              color: tc.zaiRed,
              fontWeight: "bold",
              fontSize: 13,
              letterSpacing: 2,
              flexShrink: 0
            }}
          >
            ZOMBIE AI ACADEMY
          </div>
          <div
            style={{
              color: tc.narrRound,
              fontSize: 11,
              textAlign: "right",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
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
              color: "#9a9a9a",
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
                  background: tc.bubbleBg,
                  border: `1px solid ${isCmd ? tc.bubbleBorderCmd : tc.bubbleBorderAi}`,
                  borderRadius: 12,
                  padding: "14px 18px",
                  minHeight: 70
                }}
              >
                <div
                  style={{
                    color: tc.typewriter,
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
                background: tc.missionTipBg,
                border: `1px solid ${tc.missionTipBorder}`,
                borderRadius: 10,
                padding: "12px 18px",
                maxWidth: 540,
                width: "100%"
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: tc.introBlurbOrange,
                  letterSpacing: 2,
                  marginBottom: 5
                }}
              >
                💡 MISSION TIP
              </div>
              <div
                style={{
                  color: tc.missionTipBody,
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
                  background: i <= narrLine ? tc.zaiRed : tc.narrDotIdle
                }}
              />
            ))}
          </div>

          <button
            onClick={handleNarrNext}
            style={{
              padding: "11px 36px",
              background: narrDone ? "#cc2200" : tc.narrSkipBgOff,
              color: narrDone ? "#fff" : tc.narrSkipTextOff,
              border: `1px solid ${narrDone ? "#cc2200" : tc.narrSkipBorderOff}`,
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

  // ── SURVEY SCREENS ──────────────────────────────────────────────────────────
  const surveyCard = (step: number, total: number, children: React.ReactNode) => (
    <div style={{ ...S, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div style={{ width: "100%", maxWidth: 640, fontFamily: "'Courier New', monospace" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
            paddingRight: HEADER_RIGHT_SAFE_PX,
            gap: 8,
            boxSizing: "border-box"
          }}
        >
          <div
            style={{
              color: tc.zaiRed,
              fontSize: 11,
              fontWeight: "bold",
              letterSpacing: 2,
              flexShrink: 0
            }}
          >
            ZOMBIE AI ACADEMY
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {Array.from({ length: total }, (_, i) => (
              <div
                key={String(i)}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: i < step ? "#ff9900" : tc.surveyDotIdle
                }}
              />
            ))}
          </div>
          <div style={{ color: tc.surveyHeaderQ, fontSize: 11, flexShrink: 0 }}>Q{step}/{total}</div>
        </div>
        <div
          style={{
            background: tc.surveyCardBg,
            border: `1px solid ${tc.surveyCardBorder}`,
            borderRadius: 12,
            padding: "24px 28px"
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );

  const continueBtn = (onClick: () => void, label = "Continue →") => (
    <div style={{ textAlign: "right", marginTop: 20 }}>
      <button onClick={onClick} style={{ padding: "10px 28px", background: "#cc2200", color: "#fff", borderRadius: 8, border: "none", fontSize: 14, fontWeight: "bold", cursor: "pointer", fontFamily: "'Courier New', monospace" }}>
        {label}
      </button>
    </div>
  );

  const surveyErrorMsg = surveyError ? (
    <div
      style={{
        marginTop: 12,
        color: tc.surveyErrorText,
        fontSize: 12,
        background: tc.surveyErrorBg,
        border: `1px solid ${tc.surveyErrorBorder}`,
        borderRadius: 8,
        padding: "8px 10px"
      }}
    >
      {surveyError}
    </div>
  ) : null;

  const mcOption = (name: string, value: string, current: string | null, set: (v: string) => void) => (
    <label
      key={value}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        color: current === value ? tc.mcSel : tc.mcIdle,
        marginBottom: 8,
        cursor: "pointer",
        background: current === value ? tc.mcBgSel : "transparent",
        borderRadius: 6,
        padding: "6px 8px",
        border: current === value ? `1px solid ${tc.mcBorderSel}` : "1px solid transparent"
      }}
    >
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => { set(value); setSurveyError(""); }} style={{ accentColor: "#ff9900" }} />
      <span>{value}</span>
    </label>
  );

  const toggleQ2Option = (id: string) => {
    setAnsQ2((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setSurveyError("");
  };

  const mcCheckboxOption = (id: string, label: string) => {
    const on = ansQ2.includes(id);
    return (
      <label
        key={id}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          fontSize: 13,
          color: on ? tc.mcSel : tc.mcIdle,
          marginBottom: 8,
          cursor: "pointer",
          background: on ? tc.mcBgSel : "transparent",
          borderRadius: 6,
          padding: "6px 8px",
          border: on ? `1px solid ${tc.mcBorderSel}` : "1px solid transparent"
        }}
      >
        <input
          type="checkbox"
          checked={on}
          onChange={() => toggleQ2Option(id)}
          style={{ accentColor: "#ff9900", marginTop: 3, flexShrink: 0 }}
        />
        <span>{label}</span>
      </label>
    );
  };

  // Q1 — After Round 1: AI group label for mixed image (MC)
  if (screen === "survey_q1") {
    return surveyCard(
      1,
      7,
      <>
        <div style={{ color: tc.surveyQAccent, fontSize: 15, fontWeight: "bold", marginBottom: 12 }}>
          An AI model is trained to identify and label groups of images. It has been specifically trained on three
          distinct categories: &ldquo;Cats,&rdquo; &ldquo;Dogs,&rdquo; and &ldquo;Plants.&rdquo; If you provide the AI
          with the image below, which contains a mixture of all three, what label is it most likely to assign to the
          entire group?
        </div>
        <div
          style={{
            background: tc.imageWellBg,
            borderRadius: 10,
            padding: 10,
            border: `1px solid ${tc.imageWellBorder}`,
            marginBottom: 14,
            textAlign: "center"
          }}
        >
          <img src={assetUrl("survey-image-1.png")} alt="Scene with cats, dogs, and plants" style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain" }} />
        </div>
        {["Cats", "Dogs", "Plants"].map((opt) => mcOption("q1", opt, ansQ1, setAnsQ1))}
        {surveyErrorMsg}
        {continueBtn(continueQ1)}
      </>
    );
  }

  // Text screen after Q1 submission
  if (screen === "survey_q1b") {
    return surveyCard(
      2,
      7,
      <>
        <div style={{ color: tc.surveyBody, fontSize: 14, marginBottom: 12 }}>
          Awesome! The next levels are a bit tricky, so let&apos;s complete some training before we get to it.
        </div>
        {continueBtn(continueQ1b)}
      </>
    );
  }

  // Q2 — After Round 1: turtle/panda class imbalance (multi-select)
  if (screen === "survey_q2") {
    return surveyCard(
      2,
      7,
      <>
        <div style={{ color: tc.surveyQAccent, fontSize: 15, fontWeight: "bold", marginBottom: 10 }}>
          The Situation: Imagine you are teaching a robot to recognize animals. You give the robot a big box of photos
          to study:
        </div>
        <ul
          style={{
            color: tc.surveyList,
            fontSize: 14,
            lineHeight: 1.5,
            margin: "0 0 14px 0",
            paddingLeft: 22
          }}
        >
          <li>100 pictures of Turtles 🐢</li>
          <li>Only 5 pictures of Pandas 🐼</li>
        </ul>
        <div style={{ color: tc.surveyMuted, fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
          Because there are so many turtles, the robot starts to think everything is a turtle! It keeps missing the
          pandas because it hasn&apos;t seen them enough.
        </div>
        <div style={{ color: tc.surveyQAccent, fontSize: 15, fontWeight: "bold", marginBottom: 8 }}>
          Question: If you want the robot to become an expert at spotting those 5 pandas, which of these
          &ldquo;tricks&rdquo; would help the most?
        </div>
        <div style={{ color: tc.surveyHint, fontSize: 12, marginBottom: 10 }}>Select all that apply.</div>
        {SURVEY_Q2_OPTIONS.map((o) => mcCheckboxOption(o.id, o.label))}
        {surveyErrorMsg}
        {continueBtn(continueQ2)}
      </>
    );
  }

  // Text screen after Q2 submission
  if (screen === "survey_q2b") {
    return surveyCard(
      3,
      7,
      <>
        <div style={{ color: tc.surveyBody, fontSize: 14, marginBottom: 12 }}>
          Great job thinking! On to the next level!!
        </div>
        {continueBtn(continueQ2b)}
      </>
    );
  }

  // Q3 — After Round 2: why weighted classification helps fairness (MC)
  if (screen === "survey_q3") {
    return surveyCard(
      3,
      7,
      <>
        <div style={{ color: tc.surveyQAccent, fontSize: 15, fontWeight: "bold", marginBottom: 14 }}>
          Why does weighted classification help improve fairness in predictions?
        </div>
        {[
          "It allows for customization in feature recognition",
          "It removes some data from the dataset",
          "It makes the computer run faster",
          "It guesses the answers randomly"
        ].map((opt) => mcOption("q3", opt, ansQ3, setAnsQ3))}
        {surveyErrorMsg}
        {continueBtn(continueQ3)}
      </>
    );
  }

  // Q4 — After Round 2: self-driving imbalance — which class needs higher weight (MC)
  if (screen === "survey_q4") {
    return surveyCard(
      4,
      7,
      <>
        <div style={{ color: tc.surveyQAccent, fontSize: 15, fontWeight: "bold", marginBottom: 14 }}>
          Imagine a self-driving car is being trained to recognize objects on the road. The computer sees 1,000 pictures
          of Empty Roads and only 2 pictures of People Crossing. If we want to make sure the car never misses a person,
          which class needs a much higher weight?
        </div>
        {[
          "Empty Roads: Because there are more of them, the car should focus on them.",
          "People Crossing: Because they are rare but much more important to get right.",
          "Both should be equal: Because all pictures are just pixels to a computer.",
          "Neither: The car will figure it out on its own without weights."
        ].map((opt) => mcOption("q4", opt, ansQ4, setAnsQ4))}
        {surveyErrorMsg}
        {continueBtn(continueQ4)}
      </>
    );
  }

  // Q5 — After Round 3: interpret feature-weight sliders (image + open text)
  if (screen === "survey_q5") {
    return surveyCard(
      5,
      7,
      <>
        <div style={{ color: tc.surveyQAccent, fontSize: 15, fontWeight: "bold", marginBottom: 12 }}>
          Based on these sliders, what is this image telling us about how the AI prioritizes information to classify
          something?
        </div>
        <div
          style={{
            background: tc.imageWellBg,
            borderRadius: 10,
            padding: 10,
            border: `1px solid ${tc.imageWellBorder}`,
            marginBottom: 14,
            textAlign: "center"
          }}
        >
          <img
            src={assetUrl("post survey 2.png")}
            alt="Feature weights: Skin, Walk, and Body Temp sliders with values 7, 4, and 10"
            style={{ maxWidth: "100%", maxHeight: 260, objectFit: "contain" }}
          />
        </div>
        <textarea
          value={ansQ5}
          onChange={(e) => {
            setAnsQ5(e.target.value);
            setSurveyError("");
          }}
          placeholder="Type your answer here..."
          style={{
            width: "100%",
            minHeight: 100,
            background: tc.textareaBg,
            borderRadius: 8,
            border: `1px solid ${tc.textareaBorder}`,
            color: tc.textareaText,
            padding: "8px 10px",
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
            boxSizing: "border-box",
            resize: "vertical"
          }}
        />
        {surveyErrorMsg}
        {continueBtn(continueQ5)}
      </>
    );
  }

  // Q6 — After Round 3: explain weight in AI (open text)
  if (screen === "survey_q6") {
    return surveyCard(
      6,
      7,
      <>
        <div style={{ color: tc.surveyQAccent, fontSize: 15, fontWeight: "bold", marginBottom: 14 }}>
          If I had to explain to my friend what &lsquo;weight&rsquo; is in AI, I would tell them that it means...
        </div>
        <textarea
          value={ansQ6}
          onChange={(e) => {
            setAnsQ6(e.target.value);
            setSurveyError("");
          }}
          placeholder="Type your answer here..."
          style={{
            width: "100%",
            minHeight: 120,
            background: tc.textareaBg,
            borderRadius: 8,
            border: `1px solid ${tc.textareaBorder}`,
            color: tc.textareaText,
            padding: "8px 10px",
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
            boxSizing: "border-box",
            resize: "vertical"
          }}
        />
        {surveyErrorMsg}
        {continueBtn(continueQ6)}
      </>
    );
  }

  // Q7 — Confidence in understanding AI decisions (slider 1–10)
  if (screen === "survey_q7") {
    return surveyCard(
      7,
      7,
      <>
        <div style={{ color: tc.surveyQAccent, fontSize: 15, fontWeight: "bold", marginBottom: 12 }}>
          How confident are you in understanding how AI makes decisions?
        </div>
        <div style={{ color: tc.surveyHint, fontSize: 12, marginBottom: 16 }}>
          Scale: 1 = not confident at all &mdash; 10 = very confident. There is no wrong answer.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: tc.surveySliderEnd }}>1</span>
          <input
            type="range"
            min={1}
            max={10}
            value={ansQ7}
            onChange={(e) => {
              setAnsQ7(Number(e.target.value));
              setSurveyError("");
            }}
            style={{ flex: 1, accentColor: "#ff9900" }}
          />
          <span style={{ fontSize: 12, color: tc.surveySliderEnd }}>10</span>
        </div>
        <div style={{ fontSize: 16, color: tc.surveyValueBold, fontWeight: "bold", marginBottom: 20 }}>
          Your answer: {ansQ7} / 10
        </div>
        {surveyErrorMsg}
        {continueBtn(continueQ7, "Finish & See Leaderboard \u2192")}
      </>
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
          playerName={displayName}
          avatar={avatar || "scout"}
          onOpenLeaderboard={() => setShowLeaderboardOverlay(true)}
          onSelectAvatar={(id) => setAvatar(id)}
          timerMs={gameTimerMs}
          theme={theme}
        />
        {showLeaderboardOverlay && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: tc.overlayScrim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50
            }}
          >
            <div
              style={{
                background: tc.overlayModalBg,
                borderRadius: 12,
                border: `1px solid ${tc.overlayModalBorder}`,
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
                    border: `1px solid ${tc.overlayCloseBorder}`,
                    borderRadius: 999,
                    color: tc.overlayCloseText,
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
                    background: tc.overlaySection,
                    borderRadius: 8,
                    padding: "10px 12px",
                    border: `1px solid ${tc.overlaySectionBorder}`,
                    marginBottom: 12
                  }}
                >
                  <div
                    style={{
                      color: tc.overlayMuted,
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
                      color: tc.lbName
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
                  color: tc.lbSub,
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
                    color: tc.lbEmpty,
                    fontSize: 12,
                    textAlign: "center",
                    padding: 16
                  }}
                >
                  No entries yet. Finish all 3 rounds to record a score.
                </div>
              ) : (
                leaderboard.slice(0, 5).map((e, i) => {
                  const isMe = e.name === displayName;
                  const medal =
                    i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
                  return (
                    <div
                      key={e.name + i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        background: isMe ? tc.overlayRowYou : tc.overlayRowOther,
                        borderRadius: 8,
                        padding: "6px 10px",
                        marginBottom: 4,
                        border: `1px solid ${isMe ? tc.lbRowBorderYou : tc.overlayRowBorder}`,
                        gap: 8
                      }}
                    >
                      <div
                        style={{
                          width: 26,
                          textAlign: "center",
                          fontSize: 14,
                          color: tc.overlayMedal
                        }}
                      >
                        {medal}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            color: isMe ? tc.lbNameYou : tc.lbName,
                            fontSize: 12
                          }}
                        >
                          {e.name}
                          {isMe ? " (you)" : ""}
                        </div>
                        <div
                          style={{
                            color: tc.lbSub,
                            fontSize: 10
                          }}
                        >
                          {e.score} pts • {e.acc}%
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
          <div style={{ fontSize: 20, color: tc.roundResultTitle, fontWeight: "bold" }}>
            Round {round + 1} Complete!
          </div>
          <div style={{ color: tc.roundResultSub, fontSize: 11, marginTop: 4 }}>
            {ROUNDS_DATA[round].name}
          </div>
        </div>
        <div
          style={{
            background: tc.rrCardBg,
            border: `1px solid ${tc.rrCardBorder}`,
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
                  background: tc.rrStatBox,
                  borderRadius: 8,
                  padding: "12px 8px",
                  textAlign: "center",
                  border: `1px solid ${tc.rrStatBoxBorder}`
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
                    color: tc.rrStatLabel,
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
              background: tc.rrAccSection,
              borderRadius: 8,
              padding: "10px 14px",
              border: `1px solid ${tc.rrAccSectionBorder}`,
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
              <span style={{ color: tc.statLabel, fontSize: 12 }}>Accuracy</span>
              <span style={{ color: accCol, fontWeight: "bold" }}>
                {roundResult.acc}%
              </span>
            </div>
            <div
              style={{
                background: tc.rrTrack,
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
            <span style={{ color: tc.statLabel, fontSize: 13 }}>Round score</span>
            <span
              style={{
                color: tc.perfHeader,
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
            background: tc.lessonBg,
            border: `1px solid ${tc.lessonBorder}`,
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
              color: tc.lessonHead,
              letterSpacing: 2,
              marginBottom: 5
            }}
          >
            🧠 ML LESSON
          </div>
          <div
            style={{
              color: tc.lessonText,
              fontSize: 12,
              lineHeight: 1.7
            }}
          >
            {lesson}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={handleReplayRound}
            style={{
              padding: "12px 28px",
              background: tc.replayBg,
              color: tc.replayText,
              border: `1px solid ${tc.replayBorder}`,
              borderRadius: 8,
              fontSize: 14,
              fontWeight: "bold",
              cursor: "pointer",
              fontFamily: "'Courier New',monospace",
              letterSpacing: 1
            }}
          >
            Replay ↺
          </button>
          <button
            onClick={handleNextRound}
            style={{
              padding: "12px 30px",
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
            Continue →
          </button>
        </div>
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
      leaderboard.findIndex((e) => e.name === displayName && e.score === myTotal) +
      1;

    return (
      <div style={{ ...S, paddingBottom: "2rem" }}>
        <div
          style={{
            background: tc.lbFullHeaderBg,
            borderBottom: `1px solid ${tc.lbFullHeaderBorder}`,
            padding: "16px 20px",
            textAlign: "center"
          }}
        >
          <div style={{ fontSize: 26, marginBottom: 4 }}>🏆</div>
          <div
            style={{
              fontSize: 18,
              color: tc.perfHeader,
              fontWeight: "bold",
              letterSpacing: 3
            }}
          >
            LEADERBOARD
          </div>
          <div
            style={{
              color: tc.perfSub,
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
                background: tc.lbPerfOuter,
                border: `1px solid ${tc.lbPerfBorder}`,
                borderRadius: 12,
                padding: "16px 18px",
                marginBottom: 18
              }}
            >
              <div
                style={{
                  color: tc.perfHeader,
                  fontSize: 10,
                  letterSpacing: 2,
                  marginBottom: 10
                }}
              >
                YOUR PERFORMANCE — {displayName.toUpperCase()}
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
                      background: tc.lbStatTile,
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
                        color: tc.perfSub,
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
                    background: tc.lbRoundRow,
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
                    <div style={{ color: tc.lbRoundName, fontSize: 12 }}>
                      {ROUNDS_DATA[i].name}
                    </div>
                    <div style={{ color: tc.lbRoundAcc, fontSize: 10 }}>
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
              color: tc.lbAllTime,
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
                color: tc.lbEmptyMsg,
                textAlign: "center",
                padding: 28,
                fontSize: 12
              }}
            >
              No entries yet. Be the first!
            </div>
          ) : (
            leaderboard.map((e, i) => {
              const isMe = e.name === displayName && e.score === myTotal;
              const medal =
                i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
              return (
                <div
                  key={e.name + i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: isMe ? tc.lbRowBgYou : tc.lbRowBg,
                    border: `1px solid ${isMe ? tc.lbRowBorderYou : tc.lbRowBorder}`,
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
                      color: tc.statLabel,
                      fontWeight: "bold"
                    }}
                  >
                    {medal}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        color: isMe ? tc.lbNameYou : tc.lbNameOther,
                        fontSize: 13,
                        fontWeight: isMe ? "bold" : "normal"
                      }}
                    >
                      {e.name}
                      {isMe ? " ← you" : ""}
                    </div>
                    <div
                      style={{
                        color: tc.perfSub,
                        fontSize: 10
                      }}
                    >
                      {e.acc}% avg · {e.date}
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
              type="button"
              onClick={() => void playAgainFullGame()}
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
            <button
              type="button"
              onClick={logoutAndGoAuth}
              style={{
                flex: 1,
                padding: "12px 0",
                background: "transparent",
                color: tc.viewLbText,
                border: `1px solid ${tc.viewLbBorder}`,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: "bold",
                cursor: "pointer",
                fontFamily: "'Courier New',monospace"
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ZombieGame;





