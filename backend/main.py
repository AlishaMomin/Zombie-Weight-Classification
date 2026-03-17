from __future__ import annotations

from typing import List, Literal, Optional

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.linear_model import LogisticRegression


class Weights(BaseModel):
    s: int = Field(ge=0, le=10)
    w: int = Field(ge=0, le=10)
    b: int = Field(ge=0, le=10)


class Features(BaseModel):
    s: int = Field(ge=0, le=1)
    w: int = Field(ge=0, le=1)
    b: int = Field(ge=0, le=1)


class Sample(BaseModel):
    id: Optional[int] = None
    f: Features


class PredictRequest(BaseModel):
    weights: Weights
    samples: List[Sample]
    threshold: float = Field(default=0.5, ge=0.0, le=1.0)


class PredictItem(BaseModel):
    id: Optional[int] = None
    p_zombie: float
    label: Literal["zombie", "human"]


class PredictResponse(BaseModel):
    threshold: float
    items: List[PredictItem]


def _train_base_model() -> LogisticRegression:
    """
    Train a simple classifier that matches the game's world:
    - Zombies always have: pale skin (s=1), slow walk (w=1), cold body temp (b=1)
    - Humans are usually normal (0,0,0), but can sometimes share ONE clue (e.g. pale skin)

    The student slider weights are applied at inference time by scaling features.
    """
    rng = np.random.default_rng(0)

    # Build a small synthetic dataset that matches the game rules:
    # - Zombies are ALWAYS cold (b=1), but skin/speed can vary slightly.
    # - Humans are typically warm+fast, but later levels introduce pale/slow/cold humans.
    n_h = 600
    n_z = 250

    # Humans: mostly warm+fast (w=0, b=0), with a minority having ONE confusing clue.
    # These rates roughly reflect: Level 2 (some pale humans) + Level 3 (some pale/cold/slow humans).
    h_s = (rng.random(n_h) < 0.22).astype(np.float32)  # some pale humans
    h_w = (rng.random(n_h) < 0.12).astype(np.float32)  # some slow humans
    h_b = (rng.random(n_h) < 0.12).astype(np.float32)  # some cold humans (hospital round)
    X_h = np.stack([h_s, h_w, h_b], axis=1)
    y_h = np.zeros(n_h, dtype=np.int32)

    # Zombies: ALWAYS cold; usually slow and pale, but can vary slightly.
    z_s = (rng.random(n_z) < 0.85).astype(np.float32)  # sometimes not pale
    z_w = (rng.random(n_z) < 0.85).astype(np.float32)  # sometimes not slow
    z_b = np.ones(n_z, dtype=np.float32)
    X_z = np.stack([z_s, z_w, z_b], axis=1)
    y_z = np.ones(n_z, dtype=np.int32)

    X = np.concatenate([X_h, X_z], axis=0)
    y = np.concatenate([y_h, y_z], axis=0)

    model = LogisticRegression(solver="lbfgs", random_state=0)
    model.fit(X, y)
    return model


MODEL = _train_base_model()

app = FastAPI(title="Zombie AI Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    weights = np.array([req.weights.s, req.weights.w, req.weights.b], dtype=np.float32)
    # Prevent divide-by-zero / dead weights; keep scaling meaningful
    weights = np.clip(weights, 0.0, 10.0)

    X = np.array([[s.f.s, s.f.w, s.f.b] for s in req.samples], dtype=np.float32)
    Xw = X * weights  # student-controlled weighting

    p = MODEL.predict_proba(Xw)[:, 1]
    items: List[PredictItem] = []
    for sample, pz in zip(req.samples, p):
        items.append(
            PredictItem(
                id=sample.id,
                p_zombie=float(pz),
                label="zombie" if pz >= req.threshold else "human",
            )
        )
    return PredictResponse(threshold=req.threshold, items=items)

