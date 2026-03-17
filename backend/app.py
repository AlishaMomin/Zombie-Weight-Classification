from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from flask import Flask, jsonify, request
from flask_cors import CORS

from firebase_client import get_db


def _now_utc_iso() -> str:
  return datetime.now(timezone.utc).isoformat()


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


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

  db = get_db()
  player_id = data.get("playerId") or str(uuid.uuid4())

  doc_ref = db.collection("players").document(player_id)
  doc_ref.set(
    {
      "name": name,
      "age": age_val,
      "avatar": avatar,
      "updatedAt": _now_utc_iso(),
      "createdAt": _now_utc_iso(),
    },
    merge=True,
  )

  return jsonify({"playerId": player_id})


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

  db = get_db()
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
    }
  )

  return jsonify({"sessionId": session_id})


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
  round_number = int(data.get("roundNumber") or 0)
  if round_number <= 0:
    return jsonify({"error": "roundNumber must be >= 1"}), 400

  db = get_db()
  sess_ref = db.collection("sessions").document(session_id)
  if not sess_ref.get().exists:
    return jsonify({"error": "session not found"}), 404

  scene_name = data.get("sceneName") or ""
  difficulty = data.get("difficulty") or ""
  weights = data.get("weights") or {}
  timing_ms = int(data.get("timingMs") or 0)
  results = data.get("results") or {}
  bot_used = data.get("botUsed") or None

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
    },
    merge=True,
  )

  return jsonify({"status": "ok"})


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
  survey_ref.set(
    {
      "q1_graph_meaning": data.get("q1_graph_meaning") or "",
      "q2_weight_fairness": data.get("q2_weight_fairness") or "",
      "q3_weights_affect_fairness": data.get("q3_weights_affect_fairness") or "",
      "q4_ai_label_group": data.get("q4_ai_label_group") or "",
      "q5_weight_definition": data.get("q5_weight_definition") or "",
      "q6_confidence": int(data.get("q6_confidence") or 0),
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

