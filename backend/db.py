from __future__ import annotations

import os
from contextlib import contextmanager
from threading import Lock
from typing import Iterator

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor


load_dotenv()


class DatabaseConfigError(RuntimeError):
  pass


_schema_lock = Lock()
_schema_ready = False


def _get_database_url() -> str:
  database_url = os.getenv("DATABASE_URL", "").strip()
  if not database_url:
    raise DatabaseConfigError(
      "DATABASE_URL is not configured. Add your Render PostgreSQL connection string."
    )
  return database_url


def _ensure_schema(conn) -> None:
  global _schema_ready
  if _schema_ready:
    return

  with _schema_lock:
    if _schema_ready:
      return

    with conn.cursor() as cur:
      cur.execute(
        """
        CREATE TABLE IF NOT EXISTS players (
          player_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          last_name TEXT NOT NULL DEFAULT '',
          avatar TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS sessions (
          session_id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
          avatar TEXT NOT NULL,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ended_at TIMESTAMPTZ,
          total_score INTEGER NOT NULL DEFAULT 0,
          avg_accuracy INTEGER NOT NULL DEFAULT 0,
          round_count INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS rounds (
          id BIGSERIAL PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
          round_number INTEGER NOT NULL,
          scene_name TEXT NOT NULL DEFAULT '',
          difficulty TEXT NOT NULL DEFAULT '',
          weights JSONB NOT NULL DEFAULT '{}'::jsonb,
          timing_ms INTEGER NOT NULL DEFAULT 0,
          results JSONB NOT NULL DEFAULT '{}'::jsonb,
          bot_used TEXT,
          logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS surveys (
          session_id TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
          q1_graph_meaning TEXT NOT NULL DEFAULT '',
          q2_weight_fairness TEXT NOT NULL DEFAULT '',
          q3_weights_affect_fairness TEXT NOT NULL DEFAULT '',
          q4_ai_label_group TEXT NOT NULL DEFAULT '',
          q5_weight_definition TEXT NOT NULL DEFAULT '',
          q6_confidence TEXT NOT NULL DEFAULT '',
          q7_decision_confidence INTEGER NOT NULL DEFAULT 0,
          submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS events (
          id BIGSERIAL PRIMARY KEY,
          player_id TEXT,
          session_id TEXT,
          round_number INTEGER,
          event_type TEXT NOT NULL,
          feature TEXT,
          value TEXT,
          meta JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_rounds_session_id ON rounds(session_id);
        CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
        """
      )
      cur.execute(
        """
        DO $migrate_q6$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'surveys'
              AND column_name = 'q6_confidence'
              AND data_type = 'integer'
          ) THEN
            ALTER TABLE surveys ALTER COLUMN q6_confidence DROP DEFAULT;
            ALTER TABLE surveys
              ALTER COLUMN q6_confidence TYPE TEXT USING q6_confidence::text;
            ALTER TABLE surveys ALTER COLUMN q6_confidence SET DEFAULT '';
          END IF;
        END
        $migrate_q6$;
        """
      )
      cur.execute(
        "ALTER TABLE surveys ADD COLUMN IF NOT EXISTS q7_decision_confidence INTEGER NOT NULL DEFAULT 0"
      )
      cur.execute("ALTER TABLE players DROP COLUMN IF EXISTS age")
      cur.execute(
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT ''"
      )
      cur.execute(
        "ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash TEXT"
      )
      cur.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_players_login_unique
        ON players (lower(trim(name)), lower(trim(last_name)))
        WHERE password_hash IS NOT NULL
        """
      )
      # Allow multiple rows per (session_id, round_number) so each replay is stored.
      cur.execute(
        "ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_session_id_round_number_key"
      )
      cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_rounds_session_round_time
        ON rounds (session_id, round_number, logged_at)
        """
      )
    conn.commit()
    _schema_ready = True


@contextmanager
def get_db() -> Iterator[psycopg2.extensions.connection]:
  conn = psycopg2.connect(_get_database_url(), cursor_factory=RealDictCursor)
  try:
    _ensure_schema(conn)
    yield conn
    conn.commit()
  except Exception:
    conn.rollback()
    raise
  finally:
    conn.close()
