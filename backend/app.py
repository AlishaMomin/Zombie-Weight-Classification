from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

import psycopg2
from flask import Flask, jsonify, request
from flask_cors import CORS
from psycopg2.extras import Json

from ai_classifier import (
  classify_batch,
  feedback_message,
  focus_from_weights,
  model_summary,
)
from db import DatabaseConfigError, get_db


def _now_utc() -> datetime:
  return datetime.now(timezone.utc)


def _now_utc_iso() -> str:
  return _now_utc().isoformat()


def _serialize(value: Any) -> Any:
  if isinstance(value, datetime):
    return value.isoformat()
  if isinstance(value, dict):
    return {k: _serialize(v) for k, v in value.items()}
  if isinstance(value, list):
    return [_serialize(v) for v in value]
  return value


VALID_AVATARS = {"scout", "defence", "patrol", "medic", "drone", "engineer"}
VALID_DIFFICULTIES = {"Easy", "Medium", "Hard"}

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


@app.errorhandler(DatabaseConfigError)
def handle_db_config_error(error: DatabaseConfigError):
  return jsonify({"error": str(error)}), 500


@app.errorhandler(psycopg2.Error)
def handle_psycopg_error(error: psycopg2.Error):
  app.logger.exception("Database error", exc_info=error)
  return jsonify({"error": "Database request failed"}), 500


def _display_name_from_player_row(row: Dict[str, Any]) -> str:
  first = (row.get("name") or "").strip()
  last = (row.get("last_name") or "").strip()
  return f"{first} {last}".strip() if last else first


def _player_payload(row: Dict[str, Any]) -> Dict[str, Any]:
  return {
    "id": row["player_id"],
    "name": row["name"],
    "lastName": row.get("last_name") or "",
    "avatar": row["avatar"],
    "createdAt": _serialize(row["created_at"]),
    "updatedAt": _serialize(row["updated_at"]),
  }


def _leaderboard_payload(row: Dict[str, Any]) -> Dict[str, Any]:
  return {
    "name": row["name"],
    "score": int(row["score"]),
    "acc": int(row["acc"]),
    "date": row["date"],
    "avatar": row["avatar"],
    "playerId": row["player_id"],
    "sessionId": row["session_id"],
  }


def _round_payload(row: Dict[str, Any]) -> Dict[str, Any]:
  return {
    "roundNumber": int(row["round_number"]),
    "sceneName": row["scene_name"],
    "difficulty": row["difficulty"],
    "weights": row["weights"] or {},
    "timingMs": int(row["timing_ms"]),
    "results": row["results"] or {},
    "botUsed": row["bot_used"],
    "loggedAt": _serialize(row["logged_at"]),
  }


def _session_payload(row: Dict[str, Any], rounds: List[Dict[str, Any]] | None = None) -> Dict[str, Any]:
  payload: Dict[str, Any] = {
    "id": row["session_id"],
    "playerId": row["player_id"],
    "avatar": row["avatar"],
    "startedAt": _serialize(row["started_at"]),
    "endedAt": _serialize(row["ended_at"]),
    "totalScore": int(row["total_score"]),
    "avgAccuracy": int(row["avg_accuracy"]),
    "roundCount": int(row["round_count"]),
    "status": row["status"],
  }
  if rounds is not None:
    payload["rounds"] = rounds
  return payload


def _get_session_or_404(cur, session_id: str) -> Dict[str, Any]:
  cur.execute("SELECT * FROM sessions WHERE session_id = %s", (session_id,))
  row = cur.fetchone()
  if not row:
    raise LookupError("session not found")
  return row


def _get_player_or_404(cur, player_id: str) -> Dict[str, Any]:
  cur.execute("SELECT * FROM players WHERE player_id = %s", (player_id,))
  row = cur.fetchone()
  if not row:
    raise LookupError("player not found")
  return row


@app.route("/")
def home():
  return {"message": "Zombie API is running"}


@app.get("/api/ai/model")
def ai_model_info():
  """Domain priors and feature definitions used by the weighted classifier."""
  return jsonify(model_summary())


@app.post("/api/ai/classify")
def ai_classify():
  """
  Weighted zombie/human classification using user-provided feature weights.
  Does not require a database.
  """
  data: Dict[str, Any] = request.get_json(force=True, silent=True) or {}
  weights = data.get("weights") or {}
  targets = data.get("targets")
  if not isinstance(targets, list):
    return jsonify({"error": "targets must be a list"}), 400

  try:
    threshold = float(data.get("threshold") or 5)
  except (TypeError, ValueError):
    return jsonify({"error": "threshold must be a number"}), 400
  threshold = max(0.0, min(10.0, threshold))

  try:
    scale = float(data.get("scale") or 10)
  except (TypeError, ValueError):
    return jsonify({"error": "scale must be a number"}), 400

  results = classify_batch(targets, weights, threshold=threshold, scale=scale)
  return jsonify(
    {
      "threshold": threshold,
      "scale": scale,
      "focus": focus_from_weights(weights),
      "results": [
        {
          "id": r.id,
          "score": r.score,
          "predictedZombie": r.predicted_zombie,
        }
        for r in results
      ],
      "model": model_summary(),
    }
  )


@app.post("/api/ai/feedback")
def ai_feedback():
  """
  Receives current slider weights from the frontend so the backend knows which
  features the player is emphasizing. Optionally logs to `events` when DB is available.
  """
  data: Dict[str, Any] = request.get_json(force=True, silent=True) or {}
  weights = data.get("weights") or {}
  focus = focus_from_weights(weights)
  message = feedback_message(focus)

  last_feature = data.get("lastAdjustedFeature")
  if last_feature is not None and last_feature not in {"skin", "walk", "temp"}:
    last_feature = None

  payload = {
    "focus": focus,
    "message": message,
    "lastAdjustedFeature": last_feature,
  }

  session_id = (data.get("sessionId") or "").strip() or None
  player_id = (data.get("playerId") or "").strip() or None
  try:
    round_number = int(data.get("round") or 0)
  except (TypeError, ValueError):
    round_number = 0

  if session_id:
    try:
      with get_db() as conn:
        with conn.cursor() as cur:
          cur.execute(
            """
            INSERT INTO events (
              player_id, session_id, round_number, event_type, feature, value, meta, created_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            """,
            (
              player_id,
              session_id,
              round_number or None,
              "ai_weight_feedback",
              last_feature,
              None,
              Json(
                {
                  "weights": {
                    "skin": int(weights.get("skin") or 0),
                    "walk": int(weights.get("walk") or 0),
                    "temp": int(weights.get("temp") or 0),
                  },
                  "focus": focus,
                }
              ),
            ),
          )
    except DatabaseConfigError:
      pass
    except Exception:
      app.logger.exception("ai_feedback log failed")

  return jsonify(payload)


@app.get("/api/health")
def health():
  with get_db():
    pass
  return jsonify(
    {
      "status": "ok",
      "service": "zombie-backend",
      "timestamp": _now_utc_iso(),
      "database": "postgresql",
    }
  )


@app.get("/api/leaderboard")
def get_leaderboard():
  limit = request.args.get("limit", default=10, type=int) or 10
  limit = max(1, min(limit, 50))
  with get_db() as conn:
    with conn.cursor() as cur:
      cur.execute(
        """
        SELECT session_id, player_id, name, avatar, score, acc, date
        FROM leaderboard
        ORDER BY score DESC, acc DESC, created_at ASC
        LIMIT %s
        """,
        (limit,),
      )
      rows = cur.fetchall()
  return jsonify({"items": [_leaderboard_payload(row) for row in rows]})


@app.get("/api/player/<player_id>")
def get_player(player_id: str):
  with get_db() as conn:
    with conn.cursor() as cur:
      try:
        row = _get_player_or_404(cur, player_id)
      except LookupError:
        return jsonify({"error": "player not found"}), 404
  return jsonify(_player_payload(row))


@app.get("/api/session/<session_id>")
def get_session(session_id: str):
  include_rounds = request.args.get("includeRounds", "").lower() in {"1", "true", "yes"}
  with get_db() as conn:
    with conn.cursor() as cur:
      try:
        session_row = _get_session_or_404(cur, session_id)
      except LookupError:
        return jsonify({"error": "session not found"}), 404

      rounds: List[Dict[str, Any]] | None = None
      if include_rounds:
        cur.execute(
          """
          SELECT round_number, scene_name, difficulty, weights, timing_ms, results, bot_used, logged_at
          FROM rounds
          WHERE session_id = %s
          ORDER BY round_number ASC
          """,
          (session_id,),
        )
        rounds = [_round_payload(row) for row in cur.fetchall()]
  return jsonify(_session_payload(session_row, rounds=rounds))


@app.get("/api/session/<session_id>/rounds")
def get_session_rounds(session_id: str):
  with get_db() as conn:
    with conn.cursor() as cur:
      try:
        _get_session_or_404(cur, session_id)
      except LookupError:
        return jsonify({"error": "session not found"}), 404
      cur.execute(
        """
        SELECT round_number, scene_name, difficulty, weights, timing_ms, results, bot_used, logged_at
        FROM rounds
        WHERE session_id = %s
        ORDER BY round_number ASC
        """,
        (session_id,),
      )
      items = [_round_payload(row) for row in cur.fetchall()]
  return jsonify({"items": items})


@app.get("/api/session/<session_id>/survey")
def get_session_survey(session_id: str):
  with get_db() as conn:
    with conn.cursor() as cur:
      try:
        _get_session_or_404(cur, session_id)
      except LookupError:
        return jsonify({"error": "session not found"}), 404
      cur.execute("SELECT * FROM surveys WHERE session_id = %s", (session_id,))
      row = cur.fetchone()
      if not row:
        return jsonify({"error": "survey not found"}), 404
  return jsonify(
    {
      "q1_graph_meaning": row["q1_graph_meaning"],
      "q2_weight_fairness": row["q2_weight_fairness"],
      "q3_weights_affect_fairness": row["q3_weights_affect_fairness"],
      "q4_ai_label_group": row["q4_ai_label_group"],
      "q5_weight_definition": row["q5_weight_definition"],
      "q6_confidence": ""
      if row["q6_confidence"] is None
      else str(row["q6_confidence"]),
      "q7_decision_confidence": int(row["q7_decision_confidence"] or 0),
      "submittedAt": _serialize(row["submitted_at"]),
    }
  )


@app.post("/api/player")
def create_player():
  data = request.get_json(force=True, silent=True) or {}
  name = (data.get("name") or "").strip()
  last_name = (data.get("lastName") or data.get("last_name") or "").strip()
  avatar = data.get("avatar") or "scout"

  if not name:
    return jsonify({"error": "name is required"}), 400
  if not last_name:
    return jsonify({"error": "lastName is required"}), 400
  if avatar not in VALID_AVATARS:
    return jsonify({"error": "invalid avatar"}), 400

  player_id = (data.get("playerId") or str(uuid.uuid4())).strip()

  with get_db() as conn:
    with conn.cursor() as cur:
      cur.execute(
        """
        INSERT INTO players (player_id, name, last_name, avatar, created_at, updated_at)
        VALUES (%s, %s, %s, %s, NOW(), NOW())
        ON CONFLICT (player_id) DO UPDATE
        SET name = EXCLUDED.name,
            last_name = EXCLUDED.last_name,
            avatar = EXCLUDED.avatar,
            updated_at = NOW()
        RETURNING *
        """,
        (player_id, name, last_name, avatar),
      )
      row = cur.fetchone()

  return jsonify({"playerId": player_id, "player": _player_payload(row)})


@app.post("/api/session/start")
def start_session():
  data = request.get_json(force=True, silent=True) or {}
  player_id = (data.get("playerId") or "").strip()
  avatar = data.get("avatar") or "scout"

  if not player_id:
    return jsonify({"error": "playerId is required"}), 400
  if avatar not in VALID_AVATARS:
    return jsonify({"error": "invalid avatar"}), 400

  session_id = str(uuid.uuid4())
  with get_db() as conn:
    with conn.cursor() as cur:
      try:
        _get_player_or_404(cur, player_id)
      except LookupError:
        return jsonify({"error": "player not found"}), 404
      cur.execute(
        """
        INSERT INTO sessions (
          session_id, player_id, avatar, started_at, ended_at,
          total_score, avg_accuracy, round_count, status
        )
        VALUES (%s, %s, %s, NOW(), NULL, 0, 0, 0, 'active')
        RETURNING *
        """,
        (session_id, player_id, avatar),
      )
      row = cur.fetchone()

  return jsonify({"sessionId": session_id, "session": _session_payload(row)})


@app.post("/api/session/<session_id>/round")
def log_round(session_id: str):
  data: Dict[str, Any] = request.get_json(force=True, silent=True) or {}
  try:
    round_number = int(data.get("roundNumber") or 0)
  except (TypeError, ValueError):
    return jsonify({"error": "roundNumber must be a number"}), 400
  if round_number <= 0:
    return jsonify({"error": "roundNumber must be >= 1"}), 400

  scene_name = data.get("sceneName") or ""
  difficulty = data.get("difficulty") or ""
  if difficulty and difficulty not in VALID_DIFFICULTIES:
    return jsonify({"error": "invalid difficulty"}), 400

  try:
    timing_ms = int(data.get("timingMs") or 0)
  except (TypeError, ValueError):
    return jsonify({"error": "timingMs must be a number"}), 400

  weights = data.get("weights") or {}
  results = data.get("results") or {}
  bot_used = data.get("botUsed") or None
  if bot_used and bot_used not in VALID_AVATARS:
    return jsonify({"error": "invalid botUsed"}), 400

  weights_payload = {
    "skin": int(weights.get("skin") or 0),
    "walk": int(weights.get("walk") or 0),
    "temp": int(weights.get("temp") or 0),
  }
  results_payload = {
    "correct": int(results.get("correct") or 0),
    "missed": int(results.get("missed") or 0),
    "wrong": int(results.get("wrong") or 0),
    "accuracy": int(results.get("accuracy") or 0),
    "score": int(results.get("score") or 0),
  }

  with get_db() as conn:
    with conn.cursor() as cur:
      try:
        _get_session_or_404(cur, session_id)
      except LookupError:
        return jsonify({"error": "session not found"}), 404

      cur.execute(
        """
        INSERT INTO rounds (
          session_id, round_number, scene_name, difficulty,
          weights, timing_ms, results, bot_used, logged_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (session_id, round_number) DO UPDATE
        SET scene_name = EXCLUDED.scene_name,
            difficulty = EXCLUDED.difficulty,
            weights = EXCLUDED.weights,
            timing_ms = EXCLUDED.timing_ms,
            results = EXCLUDED.results,
            bot_used = EXCLUDED.bot_used,
            logged_at = NOW()
        """,
        (
          session_id,
          round_number,
          scene_name,
          difficulty,
          Json(weights_payload),
          timing_ms,
          Json(results_payload),
          bot_used,
        ),
      )
      cur.execute(
        """
        UPDATE sessions
        SET round_count = GREATEST(round_count, %s)
        WHERE session_id = %s
        """,
        (round_number, session_id),
      )

  return jsonify({"status": "ok"})


@app.post("/api/session/<session_id>/finish")
def finish_session(session_id: str):
  data = request.get_json(force=True, silent=True) or {}
  total_score = int(data.get("totalScore") or 0)
  avg_accuracy = int(data.get("avgAccuracy") or 0)

  with get_db() as conn:
    with conn.cursor() as cur:
      try:
        _get_session_or_404(cur, session_id)
      except LookupError:
        return jsonify({"error": "session not found"}), 404

      cur.execute(
        """
        UPDATE sessions
        SET total_score = %s,
            avg_accuracy = %s,
            ended_at = NOW(),
            status = 'finished'
        WHERE session_id = %s
        RETURNING *
        """,
        (total_score, avg_accuracy, session_id),
      )
      session_row = cur.fetchone()

      cur.execute(
        """
        SELECT p.player_id, p.name, p.last_name, s.avatar
        FROM sessions s
        JOIN players p ON p.player_id = s.player_id
        WHERE s.session_id = %s
        """,
        (session_id,),
      )
      player_row = cur.fetchone()

      leaderboard_date = _now_utc().date().isoformat()
      display_name = _display_name_from_player_row(player_row)
      cur.execute(
        """
        INSERT INTO leaderboard (
          session_id, player_id, name, avatar, score, acc, date, created_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (session_id) DO UPDATE
        SET player_id = EXCLUDED.player_id,
            name = EXCLUDED.name,
            avatar = EXCLUDED.avatar,
            score = EXCLUDED.score,
            acc = EXCLUDED.acc,
            date = EXCLUDED.date
        RETURNING session_id, player_id, name, avatar, score, acc, date
        """,
        (
          session_id,
          player_row["player_id"],
          display_name,
          player_row["avatar"],
          total_score,
          avg_accuracy,
          leaderboard_date,
        ),
      )
      leaderboard_row = cur.fetchone()

  return jsonify({"status": "ok", "leaderboardEntry": _leaderboard_payload(leaderboard_row)})


@app.post("/api/session/<session_id>/survey")
def save_survey(session_id: str):
  data: Dict[str, Any] = request.get_json(force=True, silent=True) or {}
  raw_q6 = data.get("q6_confidence")
  if isinstance(raw_q6, (int, float)):
    q6_text = str(int(raw_q6))
  elif raw_q6 is None:
    q6_text = ""
  else:
    q6_text = str(raw_q6).strip()

  try:
    q7_conf = int(data.get("q7_decision_confidence"))
  except (TypeError, ValueError):
    q7_conf = 0
  if q7_conf < 1 or q7_conf > 10:
    return jsonify({"error": "q7_decision_confidence must be between 1 and 10"}), 400

  with get_db() as conn:
    with conn.cursor() as cur:
      try:
        _get_session_or_404(cur, session_id)
      except LookupError:
        return jsonify({"error": "session not found"}), 404

      cur.execute(
        """
        INSERT INTO surveys (
          session_id,
          q1_graph_meaning,
          q2_weight_fairness,
          q3_weights_affect_fairness,
          q4_ai_label_group,
          q5_weight_definition,
          q6_confidence,
          submitted_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (session_id) DO UPDATE
        SET q1_graph_meaning = EXCLUDED.q1_graph_meaning,
            q2_weight_fairness = EXCLUDED.q2_weight_fairness,
            q3_weights_affect_fairness = EXCLUDED.q3_weights_affect_fairness,
            q4_ai_label_group = EXCLUDED.q4_ai_label_group,
            q5_weight_definition = EXCLUDED.q5_weight_definition,
            q6_confidence = EXCLUDED.q6_confidence,
            submitted_at = NOW()
        """,
        (
          session_id,
          data.get("q1_graph_meaning") or "",
          data.get("q2_weight_fairness") or "",
          data.get("q3_weights_affect_fairness") or "",
          data.get("q4_ai_label_group") or "",
          data.get("q5_weight_definition") or "",
          q6_text,
        ),
      )

  return jsonify({"status": "ok"})


@app.post("/api/event")
def log_event():
  data: Dict[str, Any] = request.get_json(force=True, silent=True) or {}
  event_type = data.get("type") or ""
  if not event_type:
    return jsonify({"error": "type is required"}), 400

  with get_db() as conn:
    with conn.cursor() as cur:
      cur.execute(
        """
        INSERT INTO events (
          player_id, session_id, round_number, event_type, feature, value, meta, created_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
        """,
        (
          data.get("playerId"),
          data.get("sessionId"),
          data.get("roundNumber"),
          event_type,
          data.get("feature"),
          None if data.get("value") is None else str(data.get("value")),
          Json(data.get("meta") or {}),
        ),
      )

  return jsonify({"status": "ok"})


if __name__ == "__main__":
  app.run(host="0.0.0.0", port=5000, debug=True)

