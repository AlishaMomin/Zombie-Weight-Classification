from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from flask import Flask, jsonify, request
from flask_cors import CORS

from firebase_client import get_db


def _now_utc_iso() -> str:
  return datetime.now(timezone.utc).isoformat()


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

VALID_AVATARS = {"scout", "defence", "patrol", "medic", "drone", "engineer"}
VALID_DIFFICULTIES = {"Easy", "Medium", "Hard"}


def _iso_to_display_date(value: str | None) -> str:
  if not value:
    return ""
  try:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt.date().isoformat()
  except ValueError:
    return value


def _player_payload(snapshot) -> Dict[str, Any]:
  data = snapshot.to_dict() or {}
  return {
    "id": snapshot.id,
    "name": data.get("name", ""),
    "age": data.get("age"),
    "avatar": data.get("avatar"),
    "createdAt": data.get("createdAt"),
    "updatedAt": data.get("updatedAt"),
  }


def _leaderboard_payload(snapshot) -> Dict[str, Any]:
  data = snapshot.to_dict() or {}
  return {
    "name": data.get("name", ""),
    "age": str(data.get("age", "")),
    "score": int(data.get("score") or 0),
    "acc": int(data.get("acc") or 0),
    "date": data.get("date") or _iso_to_display_date(data.get("createdAt")),
    "avatar": data.get("avatar"),
    "playerId": data.get("playerId"),
    "sessionId": data.get("sessionId"),
  }


def _session_payload(snapshot, include_rounds: bool = False) -> Dict[str, Any]:
  data = snapshot.to_dict() or {}
  payload: Dict[str, Any] = {
    "id": snapshot.id,
    "playerId": data.get("playerId"),
    "avatar": data.get("avatar"),
    "startedAt": data.get("startedAt"),
    "endedAt": data.get("endedAt"),
    "totalScore": int(data.get("totalScore") or 0),
    "avgAccuracy": int(data.get("avgAccuracy") or 0),
    "roundCount": int(data.get("roundCount") or 0),
  }
  if include_rounds:
    rounds: List[Dict[str, Any]] = []
    for doc in snapshot.reference.collection("rounds").order_by("roundNumber").stream():
      round_data = doc.to_dict() or {}
      rounds.append(
        {
          "roundNumber": int(round_data.get("roundNumber") or 0),
          "sceneName": round_data.get("sceneName", ""),
          "difficulty": round_data.get("difficulty", ""),
          "weights": round_data.get("weights") or {},
          "timingMs": int(round_data.get("timingMs") or 0),
          "results": round_data.get("results") or {},
          "botUsed": round_data.get("botUsed"),
          "loggedAt": round_data.get("loggedAt"),
        }
      )
    payload["rounds"] = rounds
  return payload


@app.get("/api/health")
def health():
  return jsonify(
    {
      "status": "ok",
      "service": "zombie-backend",
      "timestamp": _now_utc_iso(),
      "hasFirebaseCredentials": bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS")),
    }
  )


@app.get("/api/leaderboard")
def get_leaderboard():
  limit = request.args.get("limit", default=10, type=int) or 10
  limit = max(1, min(limit, 50))
  db = get_db()
  docs = db.collection("leaderboard").order_by("score", direction="DESCENDING").limit(limit).stream()
  return jsonify({"items": [_leaderboard_payload(doc) for doc in docs]})


@app.get("/api/player/<player_id>")
def get_player(player_id: str):
  db = get_db()
  snapshot = db.collection("players").document(player_id).get()
  if not snapshot.exists:
    return jsonify({"error": "player not found"}), 404
  return jsonify(_player_payload(snapshot))


@app.get("/api/session/<session_id>")
def get_session(session_id: str):
  include_rounds = request.args.get("includeRounds", "").lower() in {"1", "true", "yes"}
  db = get_db()
  snapshot = db.collection("sessions").document(session_id).get()
  if not snapshot.exists:
    return jsonify({"error": "session not found"}), 404
  return jsonify(_session_payload(snapshot, include_rounds=include_rounds))


@app.get("/api/session/<session_id>/rounds")
def get_session_rounds(session_id: str):
  db = get_db()
  sess_ref = db.collection("sessions").document(session_id)
  if not sess_ref.get().exists:
    return jsonify({"error": "session not found"}), 404
  docs = sess_ref.collection("rounds").order_by("roundNumber").stream()
  items = []
  for doc in docs:
    round_data = doc.to_dict() or {}
    items.append(
      {
        "roundNumber": int(round_data.get("roundNumber") or 0),
        "sceneName": round_data.get("sceneName", ""),
        "difficulty": round_data.get("difficulty", ""),
        "weights": round_data.get("weights") or {},
        "timingMs": int(round_data.get("timingMs") or 0),
        "results": round_data.get("results") or {},
        "botUsed": round_data.get("botUsed"),
        "loggedAt": round_data.get("loggedAt"),
      }
    )
  return jsonify({"items": items})


@app.get("/api/session/<session_id>/survey")
def get_session_survey(session_id: str):
  db = get_db()
  sess_ref = db.collection("sessions").document(session_id)
  if not sess_ref.get().exists:
    return jsonify({"error": "session not found"}), 404
  snapshot = sess_ref.collection("surveys").document("post_game").get()
  if not snapshot.exists:
    return jsonify({"error": "survey not found"}), 404
  return jsonify(snapshot.to_dict() or {})


@app.post("/api/player")
def create_player():
  """
  Create or update a player document.

  Body:
  {
    "name": "Alex",
    "age": 12,
    "avatar": "scout"
  }
  """
  data = request.get_json(force=True, silent=True) or {}
  name = (data.get("name") or "").strip()
  age = data.get("age")
  avatar = data.get("avatar") or "scout"

  if not name:
    return jsonify({"error": "name is required"}), 400
  try:
    age_val = int(age)
  except (TypeError, ValueError):
    return jsonify({"error": "age must be a number"}), 400
  if age_val < 5 or age_val > 18:
    return jsonify({"error": "age must be between 5 and 18"}), 400
  if avatar not in VALID_AVATARS:
    return jsonify({"error": "invalid avatar"}), 400

  db = get_db()
  player_id = data.get("playerId") or str(uuid.uuid4())

  doc_ref = db.collection("players").document(player_id)
  existing = doc_ref.get()
  created_at = (existing.to_dict() or {}).get("createdAt") if existing.exists else _now_utc_iso()
  doc_ref.set(
    {
      "name": name,
      "age": age_val,
      "avatar": avatar,
      "updatedAt": _now_utc_iso(),
      "createdAt": created_at,
    },
    merge=True,
  )

  return jsonify({"playerId": player_id, "player": _player_payload(doc_ref.get())})


@app.post("/api/session/start")
def start_session():
  """
  Start a new game session for a player.

  Body:
  {
    "playerId": "...",
    "avatar": "scout"
  }
  """
  data = request.get_json(force=True, silent=True) or {}
  player_id = (data.get("playerId") or "").strip()
  avatar = data.get("avatar") or "scout"

  if not player_id:
    return jsonify({"error": "playerId is required"}), 400
  if avatar not in VALID_AVATARS:
    return jsonify({"error": "invalid avatar"}), 400

  db = get_db()
  player_snapshot = db.collection("players").document(player_id).get()
  if not player_snapshot.exists:
    return jsonify({"error": "player not found"}), 404
  session_id = str(uuid.uuid4())
  sess_ref = db.collection("sessions").document(session_id)
  sess_ref.set(
    {
      "playerId": player_id,
      "avatar": avatar,
      "startedAt": _now_utc_iso(),
      "endedAt": None,
      "totalScore": 0,
      "avgAccuracy": 0,
      "roundCount": 0,
      "status": "active",
    }
  )

  return jsonify({"sessionId": session_id, "session": _session_payload(sess_ref.get())})


@app.post("/api/session/<session_id>/round")
def log_round(session_id: str):
  """
  Log data for a single round in a session.

  Body example:
  {
    "roundNumber": 1,
    "sceneName": "The Park",
    "difficulty": "Easy",
    "weights": { "skin": 7, "walk": 4, "temp": 5 },
    "timingMs": 12345,
    "results": {
      "correct": 6,
      "missed": 1,
      "wrong": 1,
      "accuracy": 75,
      "score": 45
    },
    "botUsed": "defence"
  }
  """
  data: Dict[str, Any] = request.get_json(force=True, silent=True) or {}
  try:
    round_number = int(data.get("roundNumber") or 0)
  except (TypeError, ValueError):
    return jsonify({"error": "roundNumber must be a number"}), 400
  if round_number <= 0:
    return jsonify({"error": "roundNumber must be >= 1"}), 400

  db = get_db()
  sess_ref = db.collection("sessions").document(session_id)
  if not sess_ref.get().exists:
    return jsonify({"error": "session not found"}), 404

  scene_name = data.get("sceneName") or ""
  difficulty = data.get("difficulty") or ""
  weights = data.get("weights") or {}
  if difficulty and difficulty not in VALID_DIFFICULTIES:
    return jsonify({"error": "invalid difficulty"}), 400
  try:
    timing_ms = int(data.get("timingMs") or 0)
  except (TypeError, ValueError):
    return jsonify({"error": "timingMs must be a number"}), 400
  results = data.get("results") or {}
  bot_used = data.get("botUsed") or None
  if bot_used and bot_used not in VALID_AVATARS:
    return jsonify({"error": "invalid botUsed"}), 400

  round_ref = sess_ref.collection("rounds").document(str(round_number))
  round_ref.set(
    {
      "roundNumber": round_number,
      "sceneName": scene_name,
      "difficulty": difficulty,
      "weights": {
        "skin": int(weights.get("skin") or 0),
        "walk": int(weights.get("walk") or 0),
        "temp": int(weights.get("temp") or 0),
      },
      "timingMs": timing_ms,
      "results": {
        "correct": int(results.get("correct") or 0),
        "missed": int(results.get("missed") or 0),
        "wrong": int(results.get("wrong") or 0),
        "accuracy": int(results.get("accuracy") or 0),
        "score": int(results.get("score") or 0),
      },
      "botUsed": bot_used,
      "loggedAt": _now_utc_iso(),
    }
  )

  sess_ref.set({"roundCount": max(round_number, int((sess_ref.get().to_dict() or {}).get("roundCount") or 0))}, merge=True)

  return jsonify({"status": "ok"})


@app.post("/api/session/<session_id>/finish")
def finish_session(session_id: str):
  """
  Mark a session as finished and store summary scores.

  Body:
  {
    "totalScore": 120,
    "avgAccuracy": 82
  }
  """
  data = request.get_json(force=True, silent=True) or {}
  total_score = int(data.get("totalScore") or 0)
  avg_accuracy = int(data.get("avgAccuracy") or 0)

  db = get_db()
  sess_ref = db.collection("sessions").document(session_id)
  if not sess_ref.get().exists:
    return jsonify({"error": "session not found"}), 404

  sess_ref.set(
    {
      "totalScore": total_score,
      "avgAccuracy": avg_accuracy,
      "endedAt": _now_utc_iso(),
      "status": "finished",
    },
    merge=True,
  )

  session_snapshot = sess_ref.get()
  session_data = session_snapshot.to_dict() or {}
  player_id = session_data.get("playerId")
  player_snapshot = db.collection("players").document(player_id).get() if player_id else None
  player_data = player_snapshot.to_dict() if player_snapshot and player_snapshot.exists else {}
  entry = {
    "playerId": player_id,
    "sessionId": session_id,
    "name": player_data.get("name", "Player"),
    "age": player_data.get("age", ""),
    "avatar": session_data.get("avatar"),
    "score": total_score,
    "acc": avg_accuracy,
    "date": datetime.now().date().isoformat(),
    "createdAt": _now_utc_iso(),
  }
  db.collection("leaderboard").document(session_id).set(entry, merge=True)

  return jsonify({"status": "ok", "leaderboardEntry": entry})


@app.post("/api/session/<session_id>/survey")
def save_survey(session_id: str):
  """
  Store all 6 post-game survey answers for a session.

  Body:
  {
    "q1_graph_meaning": "...",
    "q2_weight_fairness": "Dogs",
    "q3_weights_affect_fairness": "Yes, because ...",
    "q4_ai_label_group": "Cats",
    "q5_weight_definition": "...",
    "q6_confidence": 7
  }
  """
  data: Dict[str, Any] = request.get_json(force=True, silent=True) or {}

  db = get_db()
  sess_ref = db.collection("sessions").document(session_id)
  if not sess_ref.get().exists:
    return jsonify({"error": "session not found"}), 404

  survey_ref = sess_ref.collection("surveys").document("post_game")
  q6_confidence = int(data.get("q6_confidence") or 0)
  if q6_confidence < 1 or q6_confidence > 10:
    return jsonify({"error": "q6_confidence must be between 1 and 10"}), 400
  survey_ref.set(
    {
      "q1_graph_meaning": data.get("q1_graph_meaning") or "",
      "q2_weight_fairness": data.get("q2_weight_fairness") or "",
      "q3_weights_affect_fairness": data.get("q3_weights_affect_fairness") or "",
      "q4_ai_label_group": data.get("q4_ai_label_group") or "",
      "q5_weight_definition": data.get("q5_weight_definition") or "",
      "q6_confidence": q6_confidence,
      "submittedAt": _now_utc_iso(),
    }
  )

  return jsonify({"status": "ok"})


@app.post("/api/event")
def log_event():
  """
  Optional analytics-style events endpoint.

  Body:
  {
    "playerId": "...",
    "sessionId": "...",
    "roundNumber": 1,
    "type": "slider_change",
    "feature": "skin",
    "value": 7,
    "meta": {...}
  }
  """
  data: Dict[str, Any] = request.get_json(force=True, silent=True) or {}
  event_type = data.get("type") or ""
  if not event_type:
    return jsonify({"error": "type is required"}), 400

  db = get_db()
  ev_ref = db.collection("events").document()
  payload = {
    "type": event_type,
    "playerId": data.get("playerId"),
    "sessionId": data.get("sessionId"),
    "roundNumber": data.get("roundNumber"),
    "feature": data.get("feature"),
    "value": data.get("value"),
    "meta": data.get("meta") or {},
    "createdAt": _now_utc_iso(),
  }
  ev_ref.set(payload)

  return jsonify({"status": "ok"})


if __name__ == "__main__":
  # Local development entrypoint
  app.run(host="0.0.0.0", port=5000, debug=True)

