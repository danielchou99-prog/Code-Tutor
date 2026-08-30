from __future__ import annotations

import os
import re
import subprocess
import sys


SECRET_PATTERNS = (
    (re.compile(r"gsk_[A-Za-z0-9_-]+"), "gsk_[REDACTED]"),
    (re.compile(r"sb_secret_[A-Za-z0-9_-]+"), "sb_secret_[REDACTED]"),
    (
        re.compile(
            r"eyJ[A-Za-z0-9_-]{20,}\."
            r"[A-Za-z0-9_-]{20,}\."
            r"[A-Za-z0-9_-]{20,}"
        ),
        "[JWT_REDACTED]",
    ),
    (re.compile(r"(?i)(Authorization:\s*Bearer\s+)\S+"), r"\1[REDACTED]"),
)
ANNOTATION_LIMIT = 8_000


def sanitize_output(value: str) -> str:
    sanitized = value
    for pattern, replacement in SECRET_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


def escape_workflow_command(value: str) -> str:
    return (
        value.replace("%", "%25")
        .replace("\r", "%0D")
        .replace("\n", "%0A")
    )


def failure_annotation(output: str) -> str:
    tail = "\n".join(sanitize_output(output).splitlines()[-120:])
    if len(tail) > ANNOTATION_LIMIT:
        tail = tail[-ANNOTATION_LIMIT:]
    return escape_workflow_command(tail)


def main() -> int:
    completed = subprocess.run(
        [sys.executable, "-m", "pytest", *sys.argv[1:]],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    print(completed.stdout, end="")
    if completed.returncode != 0 and os.getenv("GITHUB_ACTIONS") == "true":
        annotation = failure_annotation(completed.stdout)
        print(f"::error title=Backend pytest failed::{annotation}")
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
