from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Mapping, MutableMapping, Tuple

# Domain knowledge the model is "trained" on (educational priors):
# Zombies: pale skin (s), slow walk (w), cold body (b).
# Humans: not pale, fast, warm — so low s, w, b in sensor space.
ZOMBIE_TRUTH: Dict[str, float] = {"s": 1.0, "w": 1.0, "b": 1.0}
HUMAN_TRUTH: Dict[str, float] = {"s": 0.0, "w": 0.0, "b": 0.0}

FeatureKey = Literal["s", "w", "b"]


def _clamp_weights(w: Mapping[str, Any]) -> Tuple[float, float, float]:
  def _f(key: str) -> float:
    try:
      v = float(w.get(key) or 0)
    except (TypeError, ValueError):
      return 0.0
    return max(0.0, min(10.0, v))

  return _f("skin"), _f("walk"), _f("temp")


def _features(f: Mapping[str, Any]) -> Tuple[float, float, float]:
  def _b(key: FeatureKey) -> float:
    try:
      v = float(f.get(key) or 0)
    except (TypeError, ValueError):
      return 0.0
    return 0.0 if v <= 0 else 1.0

  return _b("s"), _b("w"), _b("b")


@dataclass(frozen=True)
class ClassifyResult:
  id: int | None
  score: float
  predicted_zombie: bool


def zombie_score(
  features: Mapping[str, Any],
  weights: Mapping[str, Any],
  *,
  scale: float = 10.0,
) -> float:
  """
  Weighted linear score in [0, scale]. Same rule as the original client:
  sum(feature_i * weight_i) / sum(weights) * scale, with binary features.
  """
  s, w, b = _features(features)
  ws, ww, wb = _clamp_weights(weights)
  denom = ws + ww + wb
  if denom <= 0:
    return 0.0
  raw = s * ws + w * ww + b * wb
  return (raw / denom) * scale


def classify_one(
  features: Mapping[str, Any],
  weights: Mapping[str, Any],
  *,
  threshold: float = 5.0,
  scale: float = 10.0,
) -> Tuple[float, bool]:
  sc = zombie_score(features, weights, scale=scale)
  return sc, sc >= threshold


def classify_batch(
  targets: List[Mapping[str, Any]],
  weights: Mapping[str, Any],
  *,
  threshold: float = 5.0,
  scale: float = 10.0,
) -> List[ClassifyResult]:
  out: List[ClassifyResult] = []
  for t in targets:
    fid = t.get("id")
    try:
      iid = int(fid) if fid is not None else None
    except (TypeError, ValueError):
      iid = None
    feats = t.get("features") or {}
    sc, pred = classify_one(feats, weights, threshold=threshold, scale=scale)
    out.append(ClassifyResult(id=iid, score=round(sc, 4), predicted_zombie=pred))
  return out


def focus_from_weights(weights: Mapping[str, Any]) -> Dict[str, Any]:
  """Relative emphasis of each sensor from user sliders (for feedback)."""
  ws, ww, wb = _clamp_weights(weights)
  total = ws + ww + wb
  if total <= 0:
    return {
      "skin": 0.33,
      "walk": 0.33,
      "temp": 0.33,
      "primary": "balanced",
    }
  skin_share = ws / total
  walk_share = ww / total
  temp_share = wb / total
  shares = {"skin": round(skin_share, 4), "walk": round(walk_share, 4), "temp": round(temp_share, 4)}
  primary = max(shares, key=lambda k: shares[k])
  # tie → balanced
  mx = shares[primary]
  if len([k for k in shares if abs(shares[k] - mx) < 0.05]) > 1:
    primary = "balanced"
  return {**shares, "primary": primary}


def feedback_message(focus: Mapping[str, Any]) -> str:
  primary = str(focus.get("primary") or "balanced")
  if primary == "balanced":
    return "Sliders are balanced — the AI treats pale skin, walk speed, and body temp equally when they fire."
  if primary == "skin":
    return "You are emphasizing pale skin most — the AI will react strongly to paleness vs non-paleness."
  if primary == "walk":
    return "You are emphasizing slow walk most — the AI will lean on movement speed as the main zombie cue."
  return "You are emphasizing cold body temp most — the AI will lean on thermal readings first."


def model_summary() -> Dict[str, Any]:
  return {
    "zombiePrototype": ZOMBIE_TRUTH,
    "humanPrototype": HUMAN_TRUTH,
    "features": {
      "s": "Pale skin (1) vs healthy tone (0)",
      "w": "Slow shambling walk (1) vs fast human gait (0)",
      "b": "Cold body temperature (1) vs warm (0)",
    },
    "rule": "Score = weighted sum of binary features, normalized by sum of weights, scaled to 0–10; "
    "predict zombie if score >= threshold (default 5).",
  }
