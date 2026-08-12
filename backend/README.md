# Code Tutor Backend

FastAPI backend for compiler execution and future AI tutoring APIs.

## Local setup

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for the generated API documentation.

## Endpoints

- `GET /health`: reports API and Docker compiler availability.
- `GET /api/auth/me`: verifies a Supabase JWT and returns the authenticated identity.
- `GET /api/ai/connection`: returns the signed-in user's Groq connection status.
- `PUT /api/ai/connection`: validates and encrypts a Groq API key before saving it.
- `DELETE /api/ai/connection`: removes the signed-in user's encrypted Groq key.
- `POST /api/run`: validates and runs an isolated C++ or Python project.
- `WS /api/run/interactive`: keeps an isolated C++ or Python process alive for streamed output and multi-round stdin.

## Security boundary

User code is never executed directly on the host. Both batch and interactive runners require Docker and apply network, memory, CPU, process, filesystem, timeout, output, rate, and concurrency limits. Interactive containers are force-removed when the WebSocket closes. If Docker is unavailable, the HTTP API returns 503 and the WebSocket returns a structured error.

Set `CODE_TUTOR_SUPABASE_URL` to the public Supabase Project URL to enable account verification. The Backend verifies JWTs with Supabase JWKS and does not need a Secret/service_role key.

AI connections additionally require `CODE_TUTOR_SUPABASE_PUBLISHABLE_KEY` and a
Fernet key in `CODE_TUTOR_AI_ENCRYPTION_KEY`. For local development, run
`python scripts/generate_ai_encryption_key.py --configure`; it copies the
publishable key from `frontend/.env.local`, generates the encryption key, and
updates the ignored `backend/.env` without printing either value. Keep the
encryption key only in `backend/.env` or a deployment secret store, and never commit it. The backend uses the user's
verified JWT with Supabase RLS; it does not use a Secret/service-role key.
