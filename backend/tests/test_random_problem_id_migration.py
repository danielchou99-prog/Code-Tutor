from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "supabase"
    / "migrations"
    / "202609030001_random_problem_ids.sql"
)


def test_random_problem_id_migration_preserves_every_problem_relationship() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")
    referencing_tables = {
        "problem_tag_links": "cascade",
        "problem_samples": "cascade",
        "problem_test_groups": "cascade",
        "submissions": "restrict",
        "problem_code_drafts": "cascade",
        "problem_generation_versions": "cascade",
        "problem_generation_batches": "cascade",
    }

    for table, delete_action in referencing_tables.items():
        assert f"alter table public.{table}" in sql
        assert f"{table}_problem_id_fkey" in sql
        table_section = sql.split(f"alter table public.{table}", 2)[-1]
        assert "on update cascade" in table_section
        assert f"on delete {delete_action}" in table_section


def test_random_problem_id_migration_is_transactional_and_idempotent() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")

    assert sql.startswith("-- Convert every existing problem ID")
    assert "begin;" in sql
    assert sql.rstrip().endswith("commit;")
    assert "if not exists (select 1 from public.problem_id_aliases) then" in sql
    assert "check (id ~ '^[a-z][0-9]{3}$')" in sql
    assert "problem_id_aliases_new_id_fkey" in sql
