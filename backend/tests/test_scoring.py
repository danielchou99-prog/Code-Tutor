from app.judge import JudgeCase, JudgeGroup
from app.scoring import ScoreCalculator, normalize_output, outputs_match


def group(order: int, percent: int, *points: int) -> JudgeGroup:
    return JudgeGroup(
        group_order=order,
        score_percent=percent,
        cases=tuple(JudgeCase(input="", expected_output="", score_points=p) for p in points),
    )


GROUPS = [group(1, 40, 20, 20), group(2, 60, 30, 30)]


def test_normalize_output_ignores_trailing_whitespace_and_blank_lines():
    assert normalize_output("a \r\nb\r\n\r\n") == "a\nb"
    assert outputs_match("1 2\n", "1 2")
    assert not outputs_match("1 2", "1  2")


def test_all_passed_is_accepted_with_full_score():
    summary = ScoreCalculator().calculate(GROUPS, [[True, True], [True, True]])
    assert (summary.status, summary.score, summary.max_score) == ("accepted", 100, 100)
    assert summary.passed_cases == summary.total_cases == 4
    assert [g.status for g in summary.groups] == ["passed", "passed"]


def test_all_failed_is_wrong_answer_with_zero_score():
    summary = ScoreCalculator().calculate(GROUPS, [[False, False], [False, False]])
    assert (summary.status, summary.score, summary.passed_cases) == ("wrong_answer", 0, 0)
    assert [g.status for g in summary.groups] == ["failed", "failed"]


def test_partial_pass_awards_individual_case_points():
    summary = ScoreCalculator().calculate(GROUPS, [[True, False], [True, True]])
    assert summary.status == "wrong_answer"
    assert summary.score == 20 + 60
    assert [g.earned_score for g in summary.groups] == [20, 60]
    assert [g.status for g in summary.groups] == ["failed", "passed"]


def test_fatal_error_marks_remaining_cases_and_groups_not_run():
    summary = ScoreCalculator().calculate(GROUPS, [[True]], fatal_status="timeout")
    assert summary.status == "timeout"
    assert summary.score == 20
    assert summary.passed_cases == 1 and summary.total_cases == 4
    assert [g.status for g in summary.groups] == ["failed", "not_run"]
    assert summary.groups[1].total_cases == 2


def test_max_score_follows_case_points_not_hard_coded_100():
    summary = ScoreCalculator().calculate([group(1, 100, 7, 3)], [[True, True]])
    assert (summary.score, summary.max_score) == (10, 10)
