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

## Security boundary

User code is never executed directly on the host. The runner requires Docker and applies network, memory, CPU, process, filesystem, timeout, and output limits. If Docker is unavailable, the API returns HTTP 503.
