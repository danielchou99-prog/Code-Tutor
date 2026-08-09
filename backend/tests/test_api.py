from concurrent.futures import ThreadPoolExecutor
from threading import Event, Lock

from fastapi.testclient import TestClient

from app.compiler import CompilerUnavailable
from app.main import (
    app,
    get_compiler,
    get_execution_gate,
    get_rate_limiter,
)
from app.models import RunResponse
from app.protection import ExecutionGate, InMemoryRateLimiter


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


class BlockingCompiler:
    def __init__(self) -> None:
        self.started = Event()
        self.release = Event()
        self._lock = Lock()
        self._active = 0
        self.max_active = 0

    def is_available(self) -> bool:
        return True

    def run(self, code: str, stdin: str) -> RunResponse:
        with self._lock:
            self._active += 1
            self.max_active = max(self.max_active, self._active)
        self.started.set()
        assert self.release.wait(timeout=2)
        with self._lock:
            self._active -= 1
        return RunResponse(status="accepted", stdout="ok", exit_code=0)


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


def test_run_returns_429_when_client_exceeds_rate_limit() -> None:
    limiter = InMemoryRateLimiter(max_requests=1, window_seconds=60)
    app.dependency_overrides[get_compiler] = FakeCompiler
    app.dependency_overrides[get_rate_limiter] = lambda: limiter

    first = client.post("/api/run", json={"code": "int main() {}"})
    second = client.post("/api/run", json={"code": "int main() {}"})
    app.dependency_overrides.clear()

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.headers["Retry-After"] == "60"
    assert second.json()["status"] == "rate_limited"


def test_run_returns_503_when_execution_queue_is_full() -> None:
    gate = ExecutionGate(max_concurrent=1, max_queued=0, wait_timeout_seconds=0.01)
    assert gate.try_enter() is True
    assert gate.wait_for_execution() is True
    app.dependency_overrides[get_compiler] = FakeCompiler
    app.dependency_overrides[get_execution_gate] = lambda: gate

    response = client.post("/api/run", json={"code": "int main() {}"})
    app.dependency_overrides.clear()
    gate.leave_execution()
    gate.leave()

    assert response.status_code == 503
    assert response.headers["Retry-After"] == "1"
    assert response.json()["status"] == "server_busy"


def test_run_limits_concurrent_compiler_executions() -> None:
    compiler = BlockingCompiler()
    gate = ExecutionGate(max_concurrent=1, max_queued=1, wait_timeout_seconds=1)
    limiter = InMemoryRateLimiter(max_requests=100, window_seconds=60)
    app.dependency_overrides[get_compiler] = lambda: compiler
    app.dependency_overrides[get_execution_gate] = lambda: gate
    app.dependency_overrides[get_rate_limiter] = lambda: limiter

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(
            client.post, "/api/run", json={"code": "int main() {}"}
        )
        assert compiler.started.wait(timeout=1)
        second = executor.submit(
            client.post, "/api/run", json={"code": "int main() {}"}
        )
        compiler.release.set()
        responses = [first.result(timeout=2), second.result(timeout=2)]

    app.dependency_overrides.clear()

    assert [response.status_code for response in responses] == [200, 200]
    assert compiler.max_active == 1
