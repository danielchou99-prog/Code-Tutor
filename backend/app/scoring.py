"""Single source of truth for output comparison, scoring and the final verdict."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING

from .models import JudgeGroupResult, JudgeStatus

if TYPE_CHECKING:
    from .judge import JudgeGroup


def normalize_output(value: str) -> str:
    lines = [line.rstrip() for line in value.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def outputs_match(actual: str, expected: str) -> bool:
    return normalize_output(actual) == normalize_output(expected)


@dataclass(frozen=True)
class ScoreSummary:
    groups: list[JudgeGroupResult]
    score: int
    max_score: int
    passed_cases: int
    total_cases: int
    status: JudgeStatus


class ScoreCalculator:
    """Turns per-case pass/fail results into group results, a score and a verdict.

    `executed[i]` holds the pass/fail result of every case actually run in group `i`.
    Groups after the last entry (or cases after a fatal error) count as not run.
    """

    def calculate(
        self,
        groups: Sequence[JudgeGroup],
        executed: Sequence[Sequence[bool]],
        fatal_status: JudgeStatus | None = None,
    ) -> ScoreSummary:
        results: list[JudgeGroupResult] = []
        passed_cases = 0
        for index, group in enumerate(groups):
            outcomes = executed[index] if index < len(executed) else None
            if outcomes is None:
                results.append(
                    JudgeGroupResult(
                        group_order=group.group_order,
                        score_percent=group.score_percent,
                        earned_score=0,
                        passed_cases=0,
                        total_cases=len(group.cases),
                        status="not_run",
                    )
                )
                continue

            group_passed = sum(1 for passed in outcomes if passed)
            earned = sum(case.score_points for case, passed in zip(group.cases, outcomes) if passed)
            passed_cases += group_passed
            # A fatal error stops judging inside one group, so every earlier group ran fully.
            group_complete = group_passed == len(group.cases)
            failure_kind: JudgeStatus | None = None
            if not group_complete:
                is_last_executed = index == len(executed) - 1
                failure_kind = fatal_status if fatal_status is not None and is_last_executed else "wrong_answer"
            results.append(
                JudgeGroupResult(
                    group_order=group.group_order,
                    score_percent=group.score_percent,
                    earned_score=earned,
                    passed_cases=group_passed,
                    total_cases=len(group.cases),
                    status="passed" if group_complete else "failed",
                    failure_kind=failure_kind,
                )
            )

        total_cases = sum(len(group.cases) for group in groups)
        status: JudgeStatus = (
            fatal_status
            if fatal_status is not None
            else "accepted"
            if passed_cases == total_cases
            else "wrong_answer"
        )
        return ScoreSummary(
            groups=results,
            score=sum(group.earned_score for group in results),
            max_score=sum(case.score_points for group in groups for case in group.cases),
            passed_cases=passed_cases,
            total_cases=total_cases,
            status=status,
        )
