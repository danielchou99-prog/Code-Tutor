from __future__ import annotations

from collections import defaultdict
import hashlib
from typing import Any, Literal
from urllib.parse import quote

import httpx
from pydantic import BaseModel, Field, field_validator, model_validator

from .ai_connections import secure_http_request
from .test_generation import (
    GeneratedCasesResponse,
    GenerationBatchResponse,
    GeneratedCasePreview,
    GenerationVersionMetadata,
    GenerationVersionUpload,
    StoredGenerationVersion,
)


class ProblemAdminUnavailable(RuntimeError):
    """Raised when the trusted problem administration store cannot be used."""


class LocalizedText(BaseModel):
    zh: str = Field(max_length=4_000)
    en: str = Field(max_length=4_000)

    @field_validator("zh", "en")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()


class AdminTag(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=60)
    label_zh: str = Field(min_length=1, max_length=40)
    label_en: str = Field(min_length=1, max_length=60)


class AdminSample(BaseModel):
    input: str = Field(max_length=65_536)
    output: str = Field(max_length=65_536)
    explanation: LocalizedText | None = None


class AdminTestCase(BaseModel):
    input: str = Field(max_length=65_536)
    expected_output: str = Field(max_length=65_536)
    source_kind: Literal["manual", "generated"] = "manual"
    generator_version: str | None = Field(default=None, max_length=40)
    generator_seed: int | None = None
    input_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    generation_strategy: Literal[
        "manual", "basic", "boundary", "extreme", "special",
        "duplicate", "ordered", "large_random"
    ] = "manual"

    @model_validator(mode="after")
    def validate_generation_metadata(self) -> "AdminTestCase":
        if self.source_kind == "manual":
            self.generator_version = None
            self.generator_seed = None
            self.input_sha256 = None
            self.generation_strategy = "manual"
        elif not (
            self.generator_version is not None
            and self.generator_seed is not None
            and self.input_sha256 is not None
        ):
            raise ValueError("Generated cases require version, seed, and input hash metadata.")
        return self


class AdminTestGroup(BaseModel):
    name: LocalizedText
    condition: LocalizedText
    score_percent: int = Field(ge=1, le=100)
    cases: list[AdminTestCase] = Field(min_length=1, max_length=500)


class AdminStarterCode(BaseModel):
    cpp: str = Field(max_length=65_536)
    python: str = Field(max_length=65_536)


class AdminProblem(BaseModel):
    id: str = Field(pattern=r"^(?:[0-9]{4,12}|[a-z][0-9]{3,11})$")
    title: LocalizedText
    summary: LocalizedText
    description: list[LocalizedText] = Field(min_length=1, max_length=30)
    input_format: LocalizedText
    output_format: LocalizedText
    constraints: list[LocalizedText] = Field(max_length=30)
    starter_code: AdminStarterCode
    difficulty: Literal["easy", "medium", "hard"]
    time_limit_ms: int = Field(ge=100, le=10_000)
    memory_limit_mb: int = Field(ge=16, le=1_024)
    published: bool = False
    tags: list[AdminTag] = Field(max_length=8)
    samples: list[AdminSample] = Field(min_length=1, max_length=20)
    test_groups: list[AdminTestGroup] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def validate_problem(self) -> "AdminProblem":
        if sum(group.score_percent for group in self.test_groups) != 100:
            raise ValueError("Test group scores must add up to 100.")
        tag_slugs = [tag.slug for tag in self.tags]
        if len(tag_slugs) != len(set(tag_slugs)):
            raise ValueError("Tag slugs must be unique.")
        public_text_is_complete = (
            bool(self.title.zh and self.title.en)
            and bool(self.summary.zh and self.summary.en)
            and any(item.zh and item.en for item in self.description)
            and bool(self.input_format.zh and self.input_format.en)
            and bool(self.output_format.zh and self.output_format.en)
            and bool(self.tags)
            and all(
                group.name.zh
                and group.name.en
                and group.condition.zh
                and group.condition.en
                for group in self.test_groups
            )
        )
        if self.published and not public_text_is_complete:
            self.published = False
        return self


class AdminProblemSummary(BaseModel):
    id: str
    title: LocalizedText
    difficulty: Literal["easy", "medium", "hard"]
    published: bool
    updated_at: str


class AdminStatusResponse(BaseModel):
    is_admin: bool


class SupabaseProblemAdminStore:
    def __init__(self, supabase_url: str, server_key: str, timeout_seconds: float = 10) -> None:
        self.rest_url = f"{supabase_url.rstrip('/')}/rest/v1"
        self.server_key = server_key
        self.timeout_seconds = timeout_seconds

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        headers = {"apikey": self.server_key, "Content-Type": "application/json"}
        if not self.server_key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.server_key}"
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        prefer: str | None = None,
    ) -> httpx.Response:
        try:
            response = secure_http_request(
                method,
                f"{self.rest_url}/{path}",
                headers=self._headers(prefer),
                json=json,
                timeout=self.timeout_seconds,
            )
        except httpx.RequestError as error:
            raise ProblemAdminUnavailable("The problem database is unavailable.") from error
        if response.status_code >= 400:
            try:
                database_error = response.json()
            except ValueError:
                database_error = {}
            error_code = str(database_error.get("code", ""))
            error_message = str(database_error.get("message", ""))
            if error_code == "42703" and "generation_strategy" in error_message:
                raise ProblemAdminUnavailable(
                    "Supabase is missing the hidden-test quality schema. Run "
                    "202608250003_hidden_test_quality_and_judge_metrics.sql, then save again."
                )
            if error_code == "23514" and "problems_id_check" in error_message:
                raise ProblemAdminUnavailable(
                    "Supabase still accepts numeric problem IDs only. Run "
                    "202608250005_repair_problem_id_constraint.sql, then save again."
                )
            raise ProblemAdminUnavailable("The problem database rejected the admin request.")
        return response

    def list_problems(self) -> list[AdminProblemSummary]:
        response = self._request(
            "GET",
            "problems?select=id,title,difficulty,published,updated_at&order=id.asc",
        )
        return [AdminProblemSummary.model_validate(row) for row in response.json()]

    def get_problem(self, problem_id: str) -> AdminProblem:
        encoded_id = quote(problem_id, safe="")
        problem_rows = self._request(
            "GET",
            "problems"
            f"?id=eq.{encoded_id}&select=id,title,summary,description,input_format,output_format,"
            "constraints_text,starter_code,difficulty,time_limit_ms,memory_limit_mb,published&limit=1",
        ).json()
        if not isinstance(problem_rows, list) or not problem_rows:
            raise ProblemAdminUnavailable("The requested problem does not exist.")

        tag_links = self._request(
            "GET",
            f"problem_tag_links?problem_id=eq.{encoded_id}&select=tag_slug",
        ).json()
        tag_slugs = [str(row["tag_slug"]) for row in tag_links]
        tags: list[dict[str, Any]] = []
        if tag_slugs:
            encoded_slugs = ",".join(quote(slug, safe="-") for slug in tag_slugs)
            tags = self._request(
                "GET",
                f"problem_tags?slug=in.({encoded_slugs})&select=slug,label_zh,label_en&order=slug.asc",
            ).json()

        samples = self._request(
            "GET",
            "problem_samples"
            f"?problem_id=eq.{encoded_id}&select=input,output,explanation,sample_order&order=sample_order.asc",
        ).json()
        groups = self._request(
            "GET",
            "problem_test_groups"
            f"?problem_id=eq.{encoded_id}&select=id,name,condition,score_percent,group_order&order=group_order.asc",
        ).json()
        group_ids = [str(group["id"]) for group in groups]
        cases_by_group: dict[str, list[dict[str, str]]] = defaultdict(list)
        if group_ids:
            encoded_group_ids = ",".join(quote(group_id, safe="-") for group_id in group_ids)
            case_rows = self._request(
                "GET",
                "problem_test_cases"
                f"?group_id=in.({encoded_group_ids})&select=group_id,input,expected_output,case_order,"
                "source_kind,generator_version,generator_seed,input_sha256,generation_strategy"
                "&order=group_id.asc,case_order.asc",
            ).json()
            for case in case_rows:
                cases_by_group[str(case["group_id"])].append(
                    {
                        "input": str(case["input"]),
                        "expected_output": str(case["expected_output"]),
                        "source_kind": case.get("source_kind") or "manual",
                        "generator_version": case.get("generator_version"),
                        "generator_seed": case.get("generator_seed"),
                        "input_sha256": case.get("input_sha256"),
                        "generation_strategy": case.get("generation_strategy") or "manual",
                    }
                )

        problem = dict(problem_rows[0])
        constraints = problem.pop("constraints_text")
        return AdminProblem.model_validate(
            {
                **problem,
                "constraints": constraints,
                "tags": tags,
                "samples": [
                    {"input": row["input"], "output": row["output"], "explanation": row.get("explanation")}
                    for row in samples
                ],
                "test_groups": [
                    {
                        "name": row["name"],
                        "condition": row["condition"],
                        "score_percent": row["score_percent"],
                        "cases": cases_by_group[str(row["id"])],
                    }
                    for row in groups
                ],
            }
        )

    def save_problem(self, problem: AdminProblem) -> AdminProblem:
        desired_published = problem.published
        problem_row = {
            "id": problem.id,
            "title": problem.title.model_dump(),
            "summary": problem.summary.model_dump(),
            "description": [item.model_dump() for item in problem.description],
            "input_format": problem.input_format.model_dump(),
            "output_format": problem.output_format.model_dump(),
            "constraints_text": [item.model_dump() for item in problem.constraints],
            "starter_code": problem.starter_code.model_dump(),
            "difficulty": problem.difficulty,
            "time_limit_ms": problem.time_limit_ms,
            "memory_limit_mb": problem.memory_limit_mb,
            # Keep a partially written problem away from students if any of the
            # following child-table requests fail. Publishing is the final step.
            "published": False,
        }
        self._request(
            "POST",
            "problems?on_conflict=id",
            json=[problem_row],
            prefer="resolution=merge-duplicates,return=minimal",
        )
        if problem.tags:
            self._request(
                "POST",
                "problem_tags?on_conflict=slug",
                json=[tag.model_dump() for tag in problem.tags],
                prefer="resolution=merge-duplicates,return=minimal",
            )

        encoded_id = quote(problem.id, safe="")
        self._request("DELETE", f"problem_tag_links?problem_id=eq.{encoded_id}")
        self._request("DELETE", f"problem_samples?problem_id=eq.{encoded_id}")
        self._request("DELETE", f"problem_test_groups?problem_id=eq.{encoded_id}")

        if problem.tags:
            self._request(
                "POST",
                "problem_tag_links",
                json=[{"problem_id": problem.id, "tag_slug": tag.slug} for tag in problem.tags],
                prefer="return=minimal",
            )
        self._request(
            "POST",
            "problem_samples",
            json=[
                {
                    "problem_id": problem.id,
                    "sample_order": index,
                    "input": sample.input,
                    "output": sample.output,
                    "explanation": sample.explanation.model_dump() if sample.explanation else None,
                }
                for index, sample in enumerate(problem.samples, start=1)
            ],
            prefer="return=minimal",
        )

        for group_order, group in enumerate(problem.test_groups, start=1):
            group_rows = self._request(
                "POST",
                "problem_test_groups",
                json=[
                    {
                        "problem_id": problem.id,
                        "group_order": group_order,
                        "name": group.name.model_dump(),
                        "condition": group.condition.model_dump(),
                        "test_case_count": len(group.cases),
                        "score_percent": group.score_percent,
                    }
                ],
                prefer="return=representation",
            ).json()
            group_id = str(group_rows[0]["id"])
            self._request(
                "POST",
                "problem_test_cases",
                json=[
                    {
                        "group_id": group_id,
                        "case_order": case_order,
                        "input": case.input,
                        "expected_output": case.expected_output,
                        "source_kind": case.source_kind,
                        "generator_version": case.generator_version,
                        "generator_seed": case.generator_seed,
                        "input_sha256": case.input_sha256,
                        "generation_strategy": case.generation_strategy,
                    }
                    for case_order, case in enumerate(group.cases, start=1)
                ],
                prefer="return=minimal",
            )
        self._request(
            "PATCH",
            f"problems?id=eq.{encoded_id}",
            json={"published": desired_published},
            prefer="return=minimal",
        )
        return self.get_problem(problem.id)

    def save_generation_version(
        self,
        problem_id: str,
        payload: GenerationVersionUpload,
        created_by: str,
    ) -> GenerationVersionMetadata:
        validator = payload.validator
        rows = self._request(
            "POST",
            "problem_generation_versions",
            json=[
                {
                    "problem_id": problem_id,
                    "version": payload.version,
                    "generator_language": payload.generator.language,
                    "generator_source": payload.generator.source,
                    "reference_language": payload.reference_solution.language,
                    "reference_source": payload.reference_solution.source,
                    "validator_language": validator.language if validator else None,
                    "validator_source": validator.source if validator else None,
                    "created_by": created_by,
                }
            ],
            prefer="return=representation",
        ).json()
        if not isinstance(rows, list) or not rows:
            raise ProblemAdminUnavailable("The generation version could not be saved.")
        return self._generation_metadata(rows[0])

    def list_generation_versions(self, problem_id: str) -> list[GenerationVersionMetadata]:
        encoded_id = quote(problem_id, safe="")
        rows = self._request(
            "GET",
            "problem_generation_versions"
            f"?problem_id=eq.{encoded_id}&select=version,generator_language,reference_language,"
            "validator_language,created_at&order=created_at.desc",
        ).json()
        return [self._generation_metadata(row) for row in rows]

    def get_generation_version(
        self, problem_id: str, version: str
    ) -> StoredGenerationVersion:
        encoded_id = quote(problem_id, safe="")
        encoded_version = quote(version, safe="")
        rows = self._request(
            "GET",
            "problem_generation_versions"
            f"?problem_id=eq.{encoded_id}&version=eq.{encoded_version}&select=version,"
            "generator_language,generator_source,reference_language,reference_source,"
            "validator_language,validator_source,created_at&limit=1",
        ).json()
        if not isinstance(rows, list) or not rows:
            raise ProblemAdminUnavailable("The requested generation version does not exist.")
        row = rows[0]
        return StoredGenerationVersion(
            metadata=self._generation_metadata(row),
            generator_source=str(row["generator_source"]),
            reference_source=str(row["reference_source"]),
            validator_language=row.get("validator_language"),
            validator_source=row.get("validator_source"),
        )

    def existing_input_hashes(self, problem_id: str) -> set[str]:
        encoded_id = quote(problem_id, safe="")
        groups = self._request(
            "GET",
            f"problem_test_groups?problem_id=eq.{encoded_id}&select=id",
        ).json()
        group_ids = [str(group["id"]) for group in groups]
        if not group_ids:
            return set()
        encoded_group_ids = ",".join(quote(group_id, safe="-") for group_id in group_ids)
        rows = self._request(
            "GET",
            "problem_test_cases"
            f"?group_id=in.({encoded_group_ids})&select=input,input_sha256",
        ).json()
        return {
            str(row.get("input_sha256"))
            if row.get("input_sha256")
            else hashlib.sha256(str(row.get("input", "")).encode("utf-8")).hexdigest()
            for row in rows
        }

    def save_generation_batch(
        self,
        problem_id: str,
        generator_version: str,
        generated: GeneratedCasesResponse,
        created_by: str,
    ) -> GenerationBatchResponse:
        batch_rows = self._request(
            "POST",
            "problem_generation_batches",
            json=[
                {
                    "problem_id": problem_id,
                    "generator_version": generator_version,
                    "requested_count": generated.report.requested,
                    "accepted_count": generated.report.accepted,
                    "attempted_count": generated.report.attempted,
                    "quality_report": generated.report.model_dump(),
                    "created_by": created_by,
                }
            ],
            prefer="return=representation",
        ).json()
        if not isinstance(batch_rows, list) or not batch_rows:
            raise ProblemAdminUnavailable("The generated batch could not be saved.")
        batch_id = str(batch_rows[0]["id"])
        try:
            self._request(
                "POST",
                "problem_generation_batch_cases",
                json=[
                    {
                        "batch_id": batch_id,
                        "case_order": index,
                        "input": case.input,
                        "expected_output": case.expected_output,
                        "generation_strategy": case.generation_strategy,
                        "generator_seed": case.generator_seed,
                        "input_sha256": case.input_sha256,
                        "input_bytes": len(case.input.encode("utf-8")),
                        "output_bytes": len(case.expected_output.encode("utf-8")),
                    }
                    for index, case in enumerate(generated.cases, start=1)
                ],
                prefer="return=minimal",
            )
        except ProblemAdminUnavailable:
            self._request(
                "DELETE", f"problem_generation_batches?id=eq.{quote(batch_id, safe='-')}"
            )
            raise
        previews = [
            GeneratedCasePreview(
                case_order=index,
                generator_seed=case.generator_seed,
                generation_strategy=case.generation_strategy,
                input_sha256=case.input_sha256,
                input_bytes=len(case.input.encode("utf-8")),
                output_bytes=len(case.expected_output.encode("utf-8")),
            )
            for index, case in enumerate(generated.cases, start=1)
        ]
        return GenerationBatchResponse(
            batch_id=batch_id,
            cases=previews,
            report=generated.report,
        )

    def apply_generation_batch(
        self, batch_id: str, group_order: int, replace_existing: bool
    ) -> int:
        response = self._request(
            "POST",
            "rpc/apply_problem_generation_batch",
            json={
                "p_batch_id": batch_id,
                "p_group_order": group_order,
                "p_replace_existing": replace_existing,
            },
        )
        try:
            return int(response.json())
        except (TypeError, ValueError) as error:
            raise ProblemAdminUnavailable(
                "The generated batch returned an invalid apply result."
            ) from error

    @staticmethod
    def _generation_metadata(row: dict[str, Any]) -> GenerationVersionMetadata:
        return GenerationVersionMetadata(
            version=str(row["version"]),
            generator_language=row["generator_language"],
            reference_language=row["reference_language"],
            has_validator=bool(row.get("validator_source") or row.get("validator_language")),
            created_at=str(row["created_at"]),
        )
