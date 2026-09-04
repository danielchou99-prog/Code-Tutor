from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from app.auth import AuthenticatedUser, get_current_user
from app.main import app, get_problem_admin_store, is_problem_admin, require_problem_admin
from app.problem_admin import AdminProblem, AdminProblemCreate, AdminProblemSummary
from app.problem_admin import (
    ProblemAdminUnavailable,
    ProblemIdCollision,
    SupabaseProblemAdminStore,
    generate_problem_id,
)
from app.test_generation import GenerationVersionMetadata


def problem_payload() -> dict[str, object]:
    return {
        "id": "a001",
        "title": {"zh": "測試星球", "en": "Test Planet"},
        "summary": {"zh": "測試摘要", "en": "Test summary"},
        "description": [{"zh": "測試題意", "en": "Test statement"}],
        "input_format": {"zh": "輸入", "en": "Input"},
        "output_format": {"zh": "輸出", "en": "Output"},
        "constraints": [{"zh": "N ≥ 1", "en": "N >= 1"}],
        "starter_code": {"cpp": "int main() {}", "python": "print('hello')"},
        "difficulty": "easy",
        "time_limit_ms": 1000,
        "memory_limit_mb": 256,
        "published": False,
        "tags": [{"slug": "implementation", "label_zh": "實作", "label_en": "Implementation"}],
        "samples": [{"input": "1", "output": "1", "explanation": None}],
        "test_groups": [
            {
                "name": {"zh": "完整測資", "en": "Full tests"},
                "condition": {"zh": "無額外限制", "en": "No additional constraints"},
                "score_percent": 100,
                "cases": [{"input": "1", "expected_output": "1"}],
            }
        ],
    }


class FakeAdminStore:
    def __init__(self) -> None:
        self.problem = AdminProblem.model_validate(problem_payload())

    def list_problems(self) -> list[AdminProblemSummary]:
        return [
            AdminProblemSummary(
                id=self.problem.id,
                title=self.problem.title,
                difficulty=self.problem.difficulty,
                published=self.problem.published,
                updated_at="2026-08-24T00:00:00Z",
            )
        ]

    def get_problem(self, problem_id: str) -> AdminProblem:
        assert problem_id == self.problem.id
        return self.problem

    def save_problem(self, problem: AdminProblem) -> AdminProblem:
        self.problem = problem
        return problem

    def create_problem(self, content: AdminProblemCreate) -> AdminProblem:
        self.problem = AdminProblem(id="z999", **content.model_dump())
        return self.problem

    def save_generation_version(self, problem_id, payload, created_by):
        assert problem_id == self.problem.id
        assert created_by == admin.user_id
        assert payload.generator.source == "private generator"
        return GenerationVersionMetadata(
            version=payload.version,
            generator_language=payload.generator.language,
            reference_language=payload.reference_solution.language,
            has_validator=payload.validator is not None,
            created_at="2026-08-25T00:00:00Z",
        )


student = AuthenticatedUser(user_id="student-1", email="student@example.com")
admin = AuthenticatedUser(user_id="admin-1", email="admin@example.com")


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_problem_scores_must_add_up_to_100() -> None:
    payload = problem_payload()
    payload["test_groups"][0]["score_percent"] = 90  # type: ignore[index]
    with pytest.raises(ValidationError, match="add up to 100"):
        AdminProblem.model_validate(payload)


def test_problem_id_accepts_exact_random_format() -> None:
    payload = problem_payload()
    payload["id"] = "a001"
    assert AdminProblem.model_validate(payload).id == "a001"


def test_legacy_problem_id_remains_readable_during_migration_rollout() -> None:
    payload = problem_payload()
    payload["id"] = "1001"

    assert AdminProblem.model_validate(payload).id == "1001"


def test_generated_problem_id_has_one_letter_and_three_digits() -> None:
    generated = {generate_problem_id() for _ in range(100)}

    assert generated
    assert all(len(problem_id) == 4 for problem_id in generated)
    assert all(problem_id[0].islower() and problem_id[0].isascii() for problem_id in generated)
    assert all(problem_id[1:].isdigit() for problem_id in generated)


def test_create_problem_retries_id_collision(monkeypatch) -> None:
    store = SupabaseProblemAdminStore("https://project.supabase.co", "sb_secret_test")
    candidates = iter(["a001", "b002"])
    attempted: list[str] = []

    monkeypatch.setattr("app.problem_admin.generate_problem_id", lambda: next(candidates))

    def fake_save(problem: AdminProblem, *, create_only: bool) -> AdminProblem:
        assert create_only is True
        attempted.append(problem.id)
        if problem.id == "a001":
            raise ProblemIdCollision("collision")
        return problem

    monkeypatch.setattr(store, "_save_problem", fake_save)
    payload = problem_payload()
    payload.pop("id")

    created = store.create_problem(AdminProblemCreate.model_validate(payload))

    assert created.id == "b002"
    assert attempted == ["a001", "b002"]


def test_update_problem_does_not_create_a_missing_row(monkeypatch) -> None:
    class EmptyResponse:
        @staticmethod
        def json():
            return []

    store = SupabaseProblemAdminStore("https://project.supabase.co", "sb_secret_test")
    monkeypatch.setattr(store, "_request", lambda *args, **kwargs: EmptyResponse())

    with pytest.raises(ProblemAdminUnavailable, match="does not exist"):
        store.save_problem(AdminProblem.model_validate(problem_payload()))


def test_admin_create_api_assigns_id() -> None:
    store = FakeAdminStore()
    app.dependency_overrides[require_problem_admin] = lambda: admin
    app.dependency_overrides[get_problem_admin_store] = lambda: store
    payload = problem_payload()
    payload.pop("id")

    response = TestClient(app).post("/api/admin/problems", json=payload)

    assert response.status_code == 201
    assert response.json()["id"] == "z999"


def test_incomplete_public_content_can_be_saved_as_unpublished() -> None:
    payload = problem_payload()
    payload.update(
        {
            "title": {"zh": "", "en": ""},
            "summary": {"zh": "", "en": ""},
            "description": [{"zh": "", "en": ""}],
            "input_format": {"zh": "", "en": ""},
            "output_format": {"zh": "", "en": ""},
            "constraints": [{"zh": "", "en": ""}],
            "published": True,
            "tags": [],
        }
    )
    payload["test_groups"][0]["name"] = {"zh": "", "en": ""}  # type: ignore[index]
    payload["test_groups"][0]["condition"] = {"zh": "", "en": ""}  # type: ignore[index]

    problem = AdminProblem.model_validate(payload)

    assert problem.title.zh == ""
    assert problem.tags == []
    assert problem.published is False


def test_admin_api_accepts_incomplete_problem_update() -> None:
    store = FakeAdminStore()
    app.dependency_overrides[require_problem_admin] = lambda: admin
    app.dependency_overrides[get_problem_admin_store] = lambda: store
    payload = problem_payload()
    payload["title"] = {"zh": "", "en": ""}
    payload["description"] = [{"zh": "", "en": ""}]
    payload["tags"] = []
    payload["published"] = True

    response = TestClient(app).put("/api/admin/problems/a001", json=payload)

    assert response.status_code == 200
    assert response.json()["title"] == {"zh": "", "en": ""}
    assert response.json()["tags"] == []
    assert response.json()["published"] is False


def test_problem_with_missing_english_translation_stays_unpublished() -> None:
    payload = problem_payload()
    payload["title"] = {"zh": "完整中文題名", "en": ""}
    payload["published"] = True

    problem = AdminProblem.model_validate(payload)

    assert problem.published is False


def test_complete_problem_can_publish_without_legacy_constraints() -> None:
    payload = problem_payload()
    payload["constraints"] = []
    payload["published"] = True

    problem = AdminProblem.model_validate(payload)

    assert problem.constraints == []
    assert problem.published is True


@pytest.mark.parametrize(
    "invalid_id",
    ["A001", "a01", "aa001", "a001-x", "abc"],
)
def test_problem_id_rejects_invalid_external_formats(invalid_id: str) -> None:
    payload = problem_payload()
    payload["id"] = invalid_id
    with pytest.raises(ValidationError):
        AdminProblem.model_validate(payload)


def test_regular_user_cannot_list_admin_problems() -> None:
    app.dependency_overrides[get_current_user] = lambda: student
    response = TestClient(app).get("/api/admin/problems")
    assert response.status_code == 403
    assert "administrator" in response.json()["detail"].lower()


def test_admin_can_be_matched_by_verified_jwt_email() -> None:
    assert is_problem_admin(
        admin,
        user_ids=frozenset(),
        emails=frozenset({"admin@example.com"}),
    )
    assert not is_problem_admin(
        student,
        user_ids=frozenset(),
        emails=frozenset({"admin@example.com"}),
    )


def test_admin_can_list_read_and_save_problem() -> None:
    store = FakeAdminStore()
    app.dependency_overrides[require_problem_admin] = lambda: admin
    app.dependency_overrides[get_problem_admin_store] = lambda: store
    client = TestClient(app)

    list_response = client.get("/api/admin/problems")
    assert list_response.status_code == 200
    assert list_response.json()[0]["title"]["zh"] == "測試星球"

    read_response = client.get("/api/admin/problems/a001")
    assert read_response.status_code == 200
    assert read_response.json()["test_groups"][0]["cases"][0]["input"] == "1"

    payload = problem_payload()
    payload["title"] = {"zh": "新題名", "en": "New title"}
    save_response = client.put("/api/admin/problems/a001", json=payload)
    assert save_response.status_code == 200
    assert save_response.json()["title"]["zh"] == "新題名"


def test_path_problem_id_must_match_payload() -> None:
    store = FakeAdminStore()
    app.dependency_overrides[require_problem_admin] = lambda: admin
    app.dependency_overrides[get_problem_admin_store] = lambda: store
    response = TestClient(app).put("/api/admin/problems/z999", json=problem_payload())
    assert response.status_code == 422


def test_generation_version_response_never_echoes_private_source() -> None:
    store = FakeAdminStore()
    app.dependency_overrides[require_problem_admin] = lambda: admin
    app.dependency_overrides[get_problem_admin_store] = lambda: store
    payload = {
        "version": "v1",
        "generator": {"language": "python", "source": "private generator"},
        "reference_solution": {"language": "cpp", "source": "private reference"},
        "validator": None,
    }

    response = TestClient(app).put(
        "/api/admin/problems/a001/generation-versions/v1", json=payload
    )

    assert response.status_code == 200
    assert response.json()["version"] == "v1"
    assert "source" not in response.text
    assert "private" not in response.text


def test_missing_generation_strategy_reports_required_migration(monkeypatch) -> None:
    class MissingColumnResponse:
        status_code = 400

        @staticmethod
        def json():
            return {
                "code": "42703",
                "message": "column problem_test_cases.generation_strategy does not exist",
            }

    monkeypatch.setattr(
        "app.problem_admin.secure_http_request",
        lambda *args, **kwargs: MissingColumnResponse(),
    )
    store = SupabaseProblemAdminStore("https://project.supabase.co", "sb_secret_test")

    with pytest.raises(ProblemAdminUnavailable, match="202608250003"):
        store._request("GET", "problem_test_cases?select=generation_strategy")


def test_legacy_problem_id_constraint_reports_latest_migration(monkeypatch) -> None:
    class LegacyConstraintResponse:
        status_code = 400

        @staticmethod
        def json():
            return {
                "code": "23514",
                "message": 'new row violates check constraint "problems_id_check"',
            }

    monkeypatch.setattr(
        "app.problem_admin.secure_http_request",
        lambda *args, **kwargs: LegacyConstraintResponse(),
    )
    store = SupabaseProblemAdminStore("https://project.supabase.co", "sb_secret_test")

    with pytest.raises(ProblemAdminUnavailable, match="random problem ID migration"):
        store._request("POST", "problems", json=[])


def test_problem_primary_key_collision_has_a_distinct_error(monkeypatch) -> None:
    class DuplicateResponse:
        status_code = 409

        @staticmethod
        def json():
            return {
                "code": "23505",
                "message": 'duplicate key value violates unique constraint "problems_pkey"',
            }

    monkeypatch.setattr(
        "app.problem_admin.secure_http_request",
        lambda *args, **kwargs: DuplicateResponse(),
    )
    store = SupabaseProblemAdminStore("https://project.supabase.co", "sb_secret_test")

    with pytest.raises(ProblemIdCollision):
        store._request("POST", "problems", json=[])
