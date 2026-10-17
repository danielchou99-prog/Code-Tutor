from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "supabase"
    / "migrations"
    / "202609040001_individual_test_scoring.sql"
)


def test_migration_adds_private_case_and_batch_scores() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "alter table public.problem_test_cases" in sql
    assert "alter table public.problem_generation_batch_cases" in sql
    assert sql.count("score_points smallint not null default 5") == 2


def test_apply_rpc_accepts_scores_and_keeps_hidden_tables_private() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "p_case_scores smallint[]" in sql
    assert "cardinality(p_case_scores) <> v_batch_count" in sql
    assert "coalesce(p_case_scores[batch_cases.case_order], batch_cases.score_points)" in sql
    assert "to service_role" in sql
    assert "authenticated" in sql
