import hashlib

from app.models import RunResponse
from app.test_generation import (
    GenerateCasesRequest,
    GenerationVersionMetadata,
    HiddenTestGenerationService,
    StoredGenerationVersion,
    TestGenerationError as GenerationFailure,
)
import pytest


class FakeGenerationStore:
    def __init__(self, *, generator_source: str = "generator") -> None:
        self.version = StoredGenerationVersion(
            metadata=GenerationVersionMetadata(
                version="v1",
                generator_language="python",
                reference_language="cpp",
                has_validator=True,
                created_at="2026-08-25T00:00:00Z",
            ),
            generator_source=generator_source,
            reference_source="reference",
            validator_language="python",
            validator_source="validator",
        )
        self.existing_hashes: set[str] = set()

    def get_generation_version(self, problem_id: str, version: str) -> StoredGenerationVersion:
        assert problem_id == "1001"
        assert version == "v1"
        return self.version

    def existing_input_hashes(self, problem_id: str) -> set[str]:
        assert problem_id == "1001"
        return self.existing_hashes


class FakeCompiler:
    def is_available(self) -> bool:
        return True

    def run(self, code: str, stdin: str, files=None, language: str = "cpp") -> RunResponse:
        if code == "generator":
            seed = int(stdin.splitlines()[0])
            return RunResponse(status="accepted", stdout=f"1 1\n{seed}\n")
        if code == "duplicate-generator":
            return RunResponse(status="accepted", stdout="1\n")
        if code == "validator":
            return RunResponse(status="accepted")
        if code == "reference":
            return RunResponse(status="accepted", stdout=f"answer:{stdin.splitlines()[-1]}\n")
        raise AssertionError(code)


class FakeBatchCompiler(FakeCompiler):
    def __init__(self) -> None:
        self.batch_calls: list[tuple[str, int, str]] = []
        self.validator_rejected_inputs: set[str] = set()

    def run(self, code: str, stdin: str, files=None, language: str = "cpp") -> RunResponse:
        raise AssertionError("The batch path must not fall back to per-case compilation.")

    def run_many(self, code: str, stdins: list[str], language: str = "cpp") -> list[RunResponse]:
        self.batch_calls.append((code, len(stdins), language))
        if code == "generator":
            return [
                RunResponse(status="accepted", stdout=f"1 1\n{int(stdin.splitlines()[0])}\n")
                for stdin in stdins
            ]
        if code == "validator":
            return [
                RunResponse(status="runtime_error", exit_code=1)
                if stdin in self.validator_rejected_inputs
                else RunResponse(status="accepted")
                for stdin in stdins
            ]
        if code == "reference":
            return [
                RunResponse(status="accepted", stdout=f"answer:{stdin.splitlines()[-1]}\n")
                for stdin in stdins
            ]
        raise AssertionError(code)


def test_generation_is_deterministic_and_records_provenance() -> None:
    service = HiddenTestGenerationService(FakeGenerationStore(), FakeCompiler())
    request = GenerateCasesRequest(version="v1", count=2, first_seed=40)

    first = service.generate("1001", request)
    second = service.generate("1001", request)

    assert first == second
    assert [case.generator_seed for case in first.cases] == [40, 41]
    assert all(case.generator_version == "v1" for case in first.cases)
    assert all(len(case.input_sha256) == 64 for case in first.cases)
    assert first.report.validator_enabled is True


def test_duplicate_generated_inputs_are_rejected() -> None:
    service = HiddenTestGenerationService(
        FakeGenerationStore(generator_source="duplicate-generator"), FakeCompiler()
    )

    with pytest.raises(GenerationFailure, match="Only 1 valid basic"):
        service.generate("1001", GenerateCasesRequest(version="v1", count=2, first_seed=1))


def test_phase_two_generates_100_cases_with_three_compilations() -> None:
    compiler = FakeBatchCompiler()
    service = HiddenTestGenerationService(FakeGenerationStore(), compiler)

    result = service.generate(
        "1001", GenerateCasesRequest(version="v1", count=100, first_seed=1_000)
    )

    assert len(result.cases) == 100
    assert result.report.accepted == 100
    assert [call[:2] for call in compiler.batch_calls] == [
        ("generator", 200),
        ("validator", 200),
        ("reference", 100),
    ]
    assert result.cases[0].generator_seed == 1_000
    assert result.cases[-1].generator_seed == 1_099


def test_generation_rejects_more_than_100_cases() -> None:
    with pytest.raises(ValueError):
        GenerateCasesRequest(version="v1", count=101, first_seed=1)


def test_generation_discards_validator_rejections_and_fills_quota() -> None:
    compiler = FakeBatchCompiler()
    compiler.validator_rejected_inputs = {"1 1\n40\n", "1 1\n41\n"}
    service = HiddenTestGenerationService(FakeGenerationStore(), compiler)

    result = service.generate(
        "1001", GenerateCasesRequest(version="v1", count=2, first_seed=40)
    )

    assert [case.generator_seed for case in result.cases] == [42, 43]
    assert result.report.discarded_invalid == 2


def test_generation_discards_inputs_already_saved_in_database() -> None:
    store = FakeGenerationStore()
    store.existing_hashes = {
        hashlib.sha256("1 1\n40\n".encode("utf-8")).hexdigest()
    }
    service = HiddenTestGenerationService(store, FakeBatchCompiler())

    result = service.generate(
        "1001", GenerateCasesRequest(version="v1", count=1, first_seed=40)
    )

    assert result.cases[0].generator_seed == 41
    assert result.report.discarded_duplicate == 1


def test_strategy_allocations_must_total_requested_count() -> None:
    with pytest.raises(ValueError, match="must equal"):
        GenerateCasesRequest(
            version="v1",
            count=3,
            strategy_allocations=[{"strategy": "boundary", "count": 2}],
        )
