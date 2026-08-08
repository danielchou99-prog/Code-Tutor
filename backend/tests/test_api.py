from fastapi.testclient import TestClient

from app.compiler import CompilerUnavailable
from app.main import app, get_compiler
from app.models import RunResponse


class FakeCompiler:
    def is_available(self) -> bool:
        return True

    def run(self, code: str, stdin: str) -> RunResponse:
        return RunResponse(
            status="accepted",
            stdout="15\n",
            exit_code=0,
            duration_ms=42,
        )


class UnavailableCompiler:
    def is_available(self) -> bool:
        return False

    def run(self, code: str, stdin: str) -> RunResponse:
        raise CompilerUnavailable("Docker Desktop is not running.")


client = TestClient(app)


def test_health_reports_compiler_availability() -> None:
    app.dependency_overrides[get_compiler] = FakeCompiler
    response = client.get("/health")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "compiler_available": True}


def test_run_returns_compiler_result() -> None:
    app.dependency_overrides[get_compiler] = FakeCompiler
    response = client.post(
        "/api/run",
        json={"code": "int main() {}", "stdin": "", "language": "cpp"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    assert response.json()["stdout"] == "15\n"


def test_run_rejects_empty_code() -> None:
    response = client.post("/api/run", json={"code": "", "stdin": ""})

    assert response.status_code == 422


def test_run_returns_503_when_docker_is_unavailable() -> None:
    app.dependency_overrides[get_compiler] = UnavailableCompiler
    response = client.post("/api/run", json={"code": "int main() {}"})
    app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["status"] == "service_unavailable"
