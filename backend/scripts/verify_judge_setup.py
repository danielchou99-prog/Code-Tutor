"""Verify the trusted Judge path without printing or saving hidden test data."""

from __future__ import annotations

import json
from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.compiler import DockerCompiler
from app.config import settings
from app.judge import SupabaseJudgeStore, normalize_output


CPP_SOLUTION = """#include <iostream>

int main() {
    long long a, b;
    std::cin >> a >> b;
    std::cout << a + b << '\\n';
    return 0;
}
"""

PYTHON_SOLUTION = """a, b = map(int, input().split())
print(a + b)
"""


def main() -> int:
    if not settings.supabase_url or not settings.supabase_server_key:
        print(json.dumps({"ready": False, "reason": "judge_database_not_configured"}))
        return 1

    store = SupabaseJudgeStore(settings.supabase_url, settings.supabase_server_key)
    problem_rows = store._request(
        "GET",
        "problems?published=eq.true&select=id&order=id.asc&limit=1",
    ).json()
    if not isinstance(problem_rows, list) or not problem_rows:
        print(json.dumps({"ready": False, "reason": "published_problem_missing"}))
        return 1
    problem = store.get_problem(str(problem_rows[0]["id"]))
    if not problem.groups or not problem.groups[0].cases:
        print(json.dumps({"ready": False, "reason": "judge_cases_missing"}))
        return 1

    hidden_case = problem.groups[0].cases[0]
    compiler = DockerCompiler(settings)
    results: dict[str, dict[str, object]] = {}
    for language, source in (("cpp", CPP_SOLUTION), ("python", PYTHON_SOLUTION)):
        run_result = compiler.run(source, hidden_case.input, language=language)
        results[language] = {
            "status": run_result.status,
            "output_matches": normalize_output(run_result.stdout)
            == normalize_output(hidden_case.expected_output),
        }

    ready = all(
        result["status"] == "accepted" and result["output_matches"] is True
        for result in results.values()
    )
    print(
        json.dumps(
            {
                "ready": ready,
                "problem_id": problem.problem_id,
                "groups": len(problem.groups),
                "cases": problem.total_cases,
                "results": results,
            },
            ensure_ascii=True,
        )
    )
    return 0 if ready else 1


if __name__ == "__main__":
    raise SystemExit(main())
