# Zombie-Weight-Classification

## Run (frontend + AI backend)

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173/`).

### Python AI backend (scikit-learn)

```bash
cd backend
python -m venv .venv

# Windows PowerShell:
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The game will call the backend when you press **Eliminate**. If the backend is not running, the game falls back to the original local scoring rule.