from fastapi.testclient import TestClient

from app.worker_main import worker_app


def test_worker_rejects_missing_internal_token() -> None:
    response = TestClient(worker_app).post(
        "/internal/judge",
        json={
            "user_id": "student-1",
            "problem_id": "1001",
            "request": {"code": "int main() {}", "language": "cpp"},
        },
    )

    assert response.status_code == 401
    assert "code" not in response.text


def test_worker_health_does_not_expose_configuration() -> None:
    response = TestClient(worker_app).get("/health")

    assert response.status_code == 200
    assert set(response.json()) == {"status", "compiler_available"}
    assert "key" not in response.text.lower()
