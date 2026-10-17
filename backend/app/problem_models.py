"""Problem, sample and hidden-test data models shared by the admin store and the editor API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Points a hidden test case is worth unless an administrator sets another value.
DEFAULT_CASE_POINTS = 5


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
    score_points: int = Field(default=DEFAULT_CASE_POINTS, ge=0, le=100)
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

    @model_validator(mode="before")
    @classmethod
    def distribute_legacy_group_score(cls, value: Any) -> Any:
        if not isinstance(value, dict) or not isinstance(value.get("cases"), list):
            return value
        cases = value["cases"]
        if not cases or not all(isinstance(case, dict) for case in cases):
            return value
        if all("score_points" not in case for case in cases):
            total = int(value.get("score_percent", 0))
            base, remainder = divmod(total, len(cases))
            value = {**value, "cases": [
                {**case, "score_points": base + (1 if index < remainder else 0)}
                for index, case in enumerate(cases)
            ]}
        else:
            value = {**value, "cases": [
                {"score_points": DEFAULT_CASE_POINTS, **case} for case in cases
            ]}
        return value


class AdminStarterCode(BaseModel):
    cpp: str = Field(max_length=65_536)
    python: str = Field(max_length=65_536)


class AdminProblemContent(BaseModel):
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
    def validate_problem(self) -> "AdminProblemContent":
        if sum(group.score_percent for group in self.test_groups) != 100:
            raise ValueError("Test group scores must add up to 100.")
        if any(
            sum(case.score_points for case in group.cases) != group.score_percent
            for group in self.test_groups
        ):
            raise ValueError("Each group score must equal the sum of its case scores.")
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


class AdminProblemCreate(AdminProblemContent):
    pass


class AdminProblem(AdminProblemContent):
    # Legacy IDs remain readable during the deployment-to-migration window.
    # Create always allocates the exact four-character format, and the database
    # migration ultimately enforces it for every stored problem.
    id: str = Field(pattern=r"^(?:[0-9]{4,12}|[a-z][0-9]{3,11})$")


class AdminProblemSummary(BaseModel):
    id: str
    title: LocalizedText
    difficulty: Literal["easy", "medium", "hard"]
    published: bool
    updated_at: str


class AdminStatusResponse(BaseModel):
    is_admin: bool
