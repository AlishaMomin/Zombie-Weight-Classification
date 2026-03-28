from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt
from werkzeug.security import check_password_hash, generate_password_hash

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-insecure-set-JWT_SECRET-in-production")
JWT_ALG = "HS256"
# Long-lived token; client clears on logout.
JWT_EXPIRES_DAYS = 365


def hash_password(plain: str) -> str:
  return generate_password_hash(plain)


def verify_password_hash(stored_hash: str, plain: str) -> bool:
  return check_password_hash(stored_hash, plain)


def issue_token(player_id: str) -> str:
  exp = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRES_DAYS)
  payload: Dict[str, Any] = {"sub": player_id, "exp": exp}
  return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_player_id(token: str) -> Optional[str]:
  try:
    decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    sub = decoded.get("sub")
    return str(sub) if sub else None
  except jwt.PyJWTError:
    return None
