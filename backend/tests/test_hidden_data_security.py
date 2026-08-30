from app.ai_tutor import TutorPrompt, build_messages
from app.test_generation import (
    GeneratedCasePreview,
    GenerationBatchResponse,
    GenerationQualityReport,
)


def test_generation_batch_api_shape_never_contains_hidden_values() -> None:
    response = GenerationBatchResponse(
        batch_id="00000000-0000-0000-0000-000000000001",
        cases=[
            GeneratedCasePreview(
                case_order=1,
                generator_seed=7,
                generation_strategy="boundary",
                input_sha256="a" * 64,
                input_bytes=10,
                output_bytes=2,
            )
        ],
        report=GenerationQualityReport(
            requested=1,
            accepted=1,
            attempted=2,
            total_input_bytes=10,
            largest_input_bytes=10,
            validator_enabled=True,
            strategy_counts={"boundary": 1},
        ),
    )

    serialized = response.model_dump_json()
    assert '"input"' not in serialized
    assert "expected_output" not in serialized
    assert "generator_source" not in serialized
    assert "reference_source" not in serialized


def test_ai_judge_context_contains_aggregate_summary_only() -> None:
    messages = build_messages(
        TutorPrompt(
            action="common_errors",
            code="print(1)",
            error_output="",
            question="",
            language="zh-Hant",
            programming_language="python",
            judge_summary={
                "status": "wrong_answer",
                "score": 50,
                "passed_cases": 5,
                "total_cases": 10,
                "duration_ms": 40,
                "peak_memory_kb": 1024,
                "groups": [],
            },
        )
    )
    context = messages[-1]["content"]

    assert "wrong_answer" in context
    assert "expected_output" not in context
    assert '"input"' not in context


def test_ai_test_strategy_prompt_forbids_private_sources_and_answers() -> None:
    messages = build_messages(
        TutorPrompt(
            action="test_strategy",
            code="",
            error_output="",
            question='{"title":"矩陣總和","constraints":["1 <= n <= 100"]}',
            language="zh-Hant",
        )
    )
    system = messages[0]["content"]

    assert "do not generate expected outputs" in system.lower()
    assert "generator or reference source" in system.lower()
