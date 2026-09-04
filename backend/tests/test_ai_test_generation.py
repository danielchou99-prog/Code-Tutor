from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest

from app.ai_test_generation import (
    AiAutoGenerateRequest,
    AiGroupBlueprint,
    AiHiddenTestError,
    AiHiddenTestGenerationService,
    AiTestBlueprint,
    _boundary_evidence,
    required_boundary_values,
)
from app.auth import AuthenticatedUser
from app.main import (
    app,
    get_ai_hidden_test_generation_service,
    get_problem_admin_store,
    require_problem_admin,
)
from app.models import RunResponse
from app.problem_admin import AdminProblem
from app.test_generation import GenerationVersionMetadata, StoredGenerationVersion


def problem() -> AdminProblem:
    localized = lambda zh, en="": {"zh": zh, "en": en}
    return AdminProblem(
        id="1001",
        title=localized("加一"),
        summary=localized("將輸入加一"),
        description=[localized("讀取整數 n 並輸出 n + 1。")],
        input_format=localized("一個整數 n。"),
        output_format=localized("輸出 n + 1。"),
        constraints=[localized("1 ≤ n ≤ 10^6")],
        starter_code={"cpp": "", "python": ""},
        difficulty="easy",
        time_limit_ms=1000,
        memory_limit_mb=64,
        published=False,
        tags=[{"slug": "math", "label_zh": "數學", "label_en": "Math"}],
        samples=[{"input": "1\n", "output": "2\n", "explanation": None}],
        test_groups=[
            {
                "name": localized("第一組"),
                "condition": localized("1 ≤ n ≤ 100"),
                "score_percent": 40,
                "cases": [{"input": "1\n", "expected_output": "2\n"}],
            },
            {
                "name": localized("第二組"),
                "condition": localized("無額外限制"),
                "score_percent": 60,
                "cases": [{"input": "1\n", "expected_output": "2\n"}],
            },
        ],
    )


class FakeKeyStore:
    def get_encrypted_key(self, user):
        return "encrypted"


class FakeCipher:
    def decrypt(self, value):
        assert value == "encrypted"
        return "secret-key"


class FakeProvider:
    def __init__(self):
        self.payload = None

    def create_blueprint(self, api_key, problem_payload):
        assert api_key == "secret-key"
        self.payload = problem_payload
        return AiTestBlueprint(
            generator={"language": "python", "source": "generator"},
            reference_solution={"language": "python", "source": "reference"},
            validator=None,
            groups=[
                AiGroupBlueprint(group_order=1, strategies=["boundary", "basic"]),
                AiGroupBlueprint(group_order=2, strategies=["boundary", "large_random"]),
            ],
        )


class FakeCompiler:
    def run_many(self, code, stdins, language="cpp"):
        if code == "reference":
            return [
                RunResponse(status="accepted", stdout=f"{int(stdin.strip()) + 1}\n")
                for stdin in stdins
            ]
        if code == "generator":
            results = []
            for stdin in stdins:
                seed, strategy, group_order = stdin.splitlines()
                if strategy == "boundary":
                    maximum = 100 if group_order == "1" else 1_000_000
                    value = maximum - (int(seed) % 2)
                else:
                    value = int(seed) + int(group_order) * 10
                results.append(RunResponse(status="accepted", stdout=f"{value}\n"))
            return results
        raise AssertionError(code)


class FakeStore:
    def __init__(self):
        self.version = None
        self.saved_batches = []

    def save_generation_version(self, problem_id, payload, created_by):
        self.version = StoredGenerationVersion(
            metadata=GenerationVersionMetadata(
                version=payload.version,
                generator_language=payload.generator.language,
                reference_language=payload.reference_solution.language,
                has_validator=payload.validator is not None,
                created_at="2026-09-04T00:00:00Z",
            ),
            generator_source=payload.generator.source,
            reference_source=payload.reference_solution.source,
        )
        return self.version.metadata

    def get_generation_version(self, problem_id, version):
        assert self.version.metadata.version == version
        return self.version

    def existing_input_hashes(self, problem_id):
        return set()

    def save_generation_batch(self, problem_id, generator_version, generated, created_by):
        batch_id = f"batch-{len(self.saved_batches) + 1}"
        self.saved_batches.append(generated)
        return SimpleNamespace(batch_id=batch_id)


class FakeEndpointService:
    def generate(self, user, stored_problem, request):
        assert user.user_id == "admin"
        assert stored_problem.id == "1001"
        assert request.cases_per_group == 4
        return {
            "version": "ai-test",
            "replace_existing": True,
            "groups": [
                {
                    "group_order": 1,
                    "batch_id": "batch-1",
                    "requested": 4,
                    "accepted": 4,
                    "attempted": 8,
                    "discarded_invalid": 0,
                    "discarded_duplicate": 0,
                    "strategy_counts": {"boundary": 1, "basic": 3},
                    "boundary": {
                        "target_value": 100,
                        "actual_value": 100,
                        "tolerance": 1,
                        "generator_seed": 1,
                    },
                }
            ],
        }


def test_extracts_group_boundary_then_falls_back_to_global_limit() -> None:
    assert required_boundary_values(problem()) == {1: 100.0, 2: 1_000_000.0}


def test_ai_generation_covers_every_group_and_boundary() -> None:
    provider = FakeProvider()
    store = FakeStore()
    service = AiHiddenTestGenerationService(
        FakeKeyStore(), FakeCipher(), provider, store, FakeCompiler()
    )

    result = service.generate(
        AuthenticatedUser(user_id="admin", access_token="token"),
        problem(),
        AiAutoGenerateRequest(cases_per_group=4, first_seed=20),
    )

    assert len(result.groups) == 2
    assert [group.accepted for group in result.groups] == [4, 4]
    assert result.groups[0].boundary.actual_value == 100
    assert result.groups[1].boundary.actual_value == 1_000_000
    assert provider.payload["groups"][1]["required_boundary_value"] == 1_000_000
    assert all("cases" not in group for group in provider.payload["groups"])


def test_boundary_evidence_rejects_a_batch_that_does_not_reach_limit() -> None:
    case = SimpleNamespace(
        generation_strategy="boundary", input="500000\n", generator_seed=1
    )
    with pytest.raises(AiHiddenTestError, match="Boundary coverage failed"):
        _boundary_evidence([case], 1_000_000)


def test_ai_generation_endpoint_uses_saved_problem_and_admin() -> None:
    store = SimpleNamespace(get_problem=lambda problem_id: problem())
    app.dependency_overrides[require_problem_admin] = lambda: AuthenticatedUser(
        user_id="admin", access_token="token"
    )
    app.dependency_overrides[get_problem_admin_store] = lambda: store
    app.dependency_overrides[get_ai_hidden_test_generation_service] = lambda: FakeEndpointService()
    try:
        response = TestClient(app).post(
            "/api/admin/problems/1001/generate-tests/ai",
            json={"cases_per_group": 4, "first_seed": 1, "replace_existing": True},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["groups"][0]["boundary"]["actual_value"] == 100
