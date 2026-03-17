import os
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore


_db: Optional[firestore.Client] = None


def get_db() -> firestore.Client:
  """
  Return a singleton Firestore client.

  Looks for GOOGLE_APPLICATION_CREDENTIALS env var or a local
  service account file path, then initializes firebase_admin once.
  """
  global _db

  if _db is not None:
    return _db

  if not firebase_admin._apps:
    cred: Optional[credentials.Base] = None

    # Prefer explicit GOOGLE_APPLICATION_CREDENTIALS env var
    sa_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if sa_path and os.path.exists(sa_path):
      cred = credentials.Certificate(sa_path)

    # Fallback: look for a local serviceAccountKey.json in backend dir
    if cred is None:
      here = os.path.dirname(os.path.abspath(__file__))
      default_sa = os.path.join(here, "serviceAccountKey.json")
      if os.path.exists(default_sa):
        cred = credentials.Certificate(default_sa)

    if cred is not None:
      firebase_admin.initialize_app(cred)
    else:
      # Last resort: rely on application default credentials
      firebase_admin.initialize_app()

  _db = firestore.client()
  return _db


