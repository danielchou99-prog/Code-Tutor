from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Literal, Protocol

from pydantic import BaseModel, Field, model_validator

from .compiler import CompilerService, CompilerUnavailable
from .models import RunResponse


ProgramLanguage = Literal["cpp", "python"]
GenerationStrategy = Literal[
    "basic",
    "boundary",
    "extreme",
    "special",
    "duplicate",
    "ordered",
    "large_random",
]


class TestGenerationError(RuntimeError):
    """A generated batch failed a safety or quality check."""


class PrivateProgram(BaseModel):
    language: ProgramLanguage
    source: str = Field(min_length=1, max_length=65_536)


class GenerationVersionUpload(BaseModel):
    version: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$")
    generator: PrivateProgram
    reference_solution: PrivateProgram
    validator: PrivateProgram | None = None


class GenerationVersionMetadata(BaseModel):
    version: str
    generator_language: ProgramLanguage
    reference_language: ProgramLanguage
    has_validator: bool
    created_at: str


class StoredGenerationVersion(BaseModel):
    metadata: GenerationVersionMetadata
    generator_source: str
    reference_source: str
    validator_language: ProgramLanguage | None = None
    validator_source: str | None = None


class GenerationStrategyAllocation(BaseModel):
    strategy: GenerationStrategy
    count: int = Field(ge=1, le=100)


class GenerateCasesRequest(BaseModel):
    version: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$")
    count: int = Field(ge=1, le=100)
    first_seed: int = Field(default=1, ge=0, le=2_147_483_647)
    group_order: int = Field(default=1, ge=1, le=20)
    strategy_allocations: list[GenerationStrategyAllocation] = Field(
        default_factory=list, max_length=7
    )

    @model_validator(mode="after")
    def validate_strategy_allocations(self) -> "GenerateCasesRequest":
        if not self.strategy_allocations:
            self.strategy_allocations = [
                GenerationStrategyAllocation(strategy="basic", count=self.count)
            ]
        strategies = [item.strategy for item in self.strategy_allocations]
        if len(strategies) != len(set(strategies)):
            raise ValueError("Generation strategies must be unique.")
        if sum(item.count for item in self.strategy_allocations) != self.count:
            raise ValueError("Strategy allocation counts must equal the requested count.")
        return self
class GeneratedTestCase(BaseModel):
    input: str
    expected_output: str
    source_kind: Literal["generated"] = "generated"
    generator_version: str
    generator_seed: int
    input_sha256: str
    generation_strategy: GenerationStrategy


class GenerationQualityReport(BaseModel):
    requested: int
    accepted: int
    attempted: int
    discarded_invalid: int = 0
    discarded_duplicate: int = 0
    duplicate_inputs: int = 0
    total_input_bytes: int
    largest_input_bytes: int
    validator_enabled: bool
    strategy_counts: dict[str, int]


class GeneratedCasePreview(BaseModel):
    case_order: int
    generator_seed: int
    generation_strategy: GenerationStrategy
    input_sha256: str
    input_bytes: int
    output_bytes: int


class GenerationBatchResponse(BaseModel):
    batch_id: str
    cases: list[GeneratedCasePreview]
    report: GenerationQualityReport


class ApplyGenerationBatchRequest(BaseModel):
    group_order: int = Field(ge=1, le=20)
    replace_existing: bool = True


class ApplyGenerationBatchResponse(BaseModel):
    batch_id: str
    applied_cases: int


class GeneratedCasesResponse(BaseModel):
    cases: list[GeneratedTestCase]
    report: GenerationQualityReport


class GenerationVersionStore(Protocol):
    def save_generation_version(
        self, problem_id: str, payload: GenerationVersionUpload, created_by: str
    ) -> GenerationVersionMetadata: ...

    def list_generation_versions(
        self, problem_id: str
    ) -> list[GenerationVersionMetadata]: ...

    def get_generation_version(
        self, problem_id: str, version: str
    ) -> StoredGenerationVersion: ...


@dataclass
class HiddenTestGenerationService:
    store: GenerationVersionStore
    compiler: CompilerService
    max_case_bytes: int = 65_536

    def generate(self, problem_id: str, request: GenerateCasesRequest) -> GeneratedCasesResponse:
        version = self.store.get_generation_version(problem_id, request.version)
        candidate_specs: list[tuple[int, GenerationStrategy]] = []
        next_seed = request.first_seed
        for allocation in request.strategy_allocations:
            for _ in range(allocation.count * 2):
                candidate_specs.append((next_seed, allocation.strategy))
                next_seed += 1
        seeds = [seed for seed, _strategy in candidate_specs]
        generated_inputs = self._run_program_batch(
            "Generator",
            version.generator_source,
            [
                f"{seed}\n{strategy}\n{request.group_order}\n"
                for seed, strategy in candidate_specs
            ],
            version.metadata.generator_language,
            seeds,
        )
        existing_hash_loader = getattr(self.store, "existing_input_hashes", None)
        seen_hashes = (
            set(existing_hash_loader(problem_id)) if callable(existing_hash_loader) else set()
        )
        eligible: list[tuple[int, GenerationStrategy, str, str, int]] = []
        discarded_invalid = 0
        discarded_duplicate = 0

        for (seed, strategy), generated in zip(
            candidate_specs, generated_inputs, strict=True
        ):
            input_bytes = len(generated.encode("utf-8"))
            if not generated.strip() or input_bytes > self.max_case_bytes:
                discarded_invalid += 1
                continue

            input_hash = hashlib.sha256(generated.encode("utf-8")).hexdigest()
            if input_hash in seen_hashes:
                discarded_duplicate += 1
                continue
            seen_hashes.add(input_hash)
            eligible.append((seed, strategy, generated, input_hash, input_bytes))

        if version.validator_source and version.validator_language:
            validator_results = self._run_results_batch(
                version.validator_source,
                [item[2] for item in eligible],
                version.validator_language,
            )
            validated: list[tuple[int, GenerationStrategy, str, str, int]] = []
            for candidate, result in zip(eligible, validator_results, strict=True):
                seed = candidate[0]
                if result.status == "accepted":
                    validated.append(candidate)
                elif result.status == "runtime_error" and result.exit_code == 1:
                    discarded_invalid += 1
                else:
                    detail = result.stderr[:500].strip() or result.status
                    raise TestGenerationError(
                        f"Validator failed for seed {seed}: {detail}"
                    )
            eligible = validated

        accepted: list[tuple[int, GenerationStrategy, str, str, int]] = []
        for allocation in request.strategy_allocations:
            matches = [item for item in eligible if item[1] == allocation.strategy]
            if len(matches) < allocation.count:
                raise TestGenerationError(
                    f"Only {len(matches)} valid {allocation.strategy} cases were produced; "
                    f"{allocation.count} are required. Adjust the Generator or Validator."
                )
            accepted.extend(matches[: allocation.count])

        expected_outputs = self._run_program_batch(
            "Reference Solution",
            version.reference_source,
            [item[2] for item in accepted],
            version.metadata.reference_language,
            [item[0] for item in accepted],
        )

        cases = [
            GeneratedTestCase(
                input=generated,
                expected_output=expected,
                generator_version=version.metadata.version,
                generator_seed=seed,
                input_sha256=input_hash,
                generation_strategy=strategy,
            )
            for (seed, strategy, generated, input_hash, _input_bytes), expected in zip(
                accepted, expected_outputs, strict=True
            )
        ]
        input_sizes = [item[4] for item in accepted]
        strategy_counts = {
            allocation.strategy: allocation.count
            for allocation in request.strategy_allocations
        }

        return GeneratedCasesResponse(
            cases=cases,
            report=GenerationQualityReport(
                requested=request.count,
                accepted=len(cases),
                attempted=len(candidate_specs),
                discarded_invalid=discarded_invalid,
                discarded_duplicate=discarded_duplicate,
                duplicate_inputs=discarded_duplicate,
                total_input_bytes=sum(input_sizes),
                largest_input_bytes=max(input_sizes, default=0),
                validator_enabled=version.metadata.has_validator,
                strategy_counts=strategy_counts,
            ),
        )

    def _run_results_batch(
        self,
        source: str,
        stdins: list[str],
        language: ProgramLanguage,
    ) -> list[RunResponse]:
        batch_runner = getattr(self.compiler, "run_many", None)
        try:
            results = (
                batch_runner(source, stdins, language)
                if callable(batch_runner)
                else [self.compiler.run(source, stdin, language=language) for stdin in stdins]
            )
        except CompilerUnavailable as error:
            raise TestGenerationError("The isolated compiler is unavailable.") from error
        if len(results) != len(stdins):
            raise TestGenerationError("The private program returned an incomplete batch.")
        return results

    def _run_program_batch(
        self,
        label: str,
        source: str,
        stdins: list[str],
        language: ProgramLanguage,
        seeds: list[int],
        *,
        require_output: bool = True,
    ) -> list[str]:
        results = self._run_results_batch(source, stdins, language)

        outputs: list[str] = []
        for seed, result in zip(seeds, results, strict=True):
            if result.status != "accepted":
                detail = result.stderr[:500].strip() or result.status
                raise TestGenerationError(f"{label} failed for seed {seed}: {detail}")
            if result.truncated:
                raise TestGenerationError(f"{label} exceeded the output limit for seed {seed}.")
            if require_output and not result.stdout.strip():
                raise TestGenerationError(f"{label} produced no output for seed {seed}.")
            outputs.append(result.stdout)
        return outputs
