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
- `POST /api/run`: validates, compiles, and runs one C++ source file.
- `WS /api/run/interactive`: keeps an isolated C++ process alive for streamed output and multi-round stdin.

## Security boundary

User code is never executed directly on the host. Both batch and interactive runners require Docker and apply network, memory, CPU, process, filesystem, timeout, output, rate, and concurrency limits. Interactive containers are force-removed when the WebSocket closes. If Docker is unavailable, the HTTP API returns 503 and the WebSocket returns a structured error.
