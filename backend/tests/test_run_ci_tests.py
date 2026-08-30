from scripts.run_ci_tests import ANNOTATION_LIMIT, escape_workflow_command, failure_annotation, sanitize_output


def test_sanitize_output_redacts_supported_secret_shapes() -> None:
    source = (
        "gsk_test_key_that_must_not_escape "
        "sb_secret_example_that_must_not_escape "
        "Authorization: Bearer private-value"
    )

    result = sanitize_output(source)

    assert "test_key_that_must_not_escape" not in result
    assert "example_that_must_not_escape" not in result
    assert "private-value" not in result
    assert result == "gsk_[REDACTED] sb_secret_[REDACTED] Authorization: Bearer [REDACTED]"


def test_failure_annotation_uses_tail_limits_size_and_escapes_newlines() -> None:
    output = "\n".join(f"failure line {index} with 100%" for index in range(500))

    result = failure_annotation(output)

    assert len(result) <= ANNOTATION_LIMIT * 2
    assert "failure line 0" not in result
    assert "failure line 499" in result
    assert "%25" in result
    assert "%0A" in result


def test_escape_workflow_command_encodes_control_characters() -> None:
    assert escape_workflow_command("a%b\r\nc") == "a%25b%0D%0Ac"
