"""Add a Supabase Auth user UUID to the local problem-admin allowlist."""

from __future__ import annotations

import argparse
from pathlib import Path
from uuid import UUID


ENV_NAME = "CODE_TUTOR_ADMIN_USER_IDS"
EMAIL_ENV_NAME = "CODE_TUTOR_ADMIN_EMAILS"


def update_env_file(path: Path, env_name: str, value: str) -> None:
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    updated: list[str] = []
    replaced = False
    for line in lines:
        if line.startswith(f"{env_name}="):
            existing = [item.strip() for item in line.split("=", 1)[1].split(",") if item.strip()]
            values = list(dict.fromkeys([*existing, value]))
            updated.append(f"{env_name}={','.join(values)}")
            replaced = True
        else:
            updated.append(line)
    if not replaced:
        if updated and updated[-1]:
            updated.append("")
        updated.append(f"{env_name}={value}")
    path.write_text("\n".join(updated) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", help="Add a verified Supabase Auth email fallback.")
    args = parser.parse_args()
    env_path = Path(__file__).resolve().parents[1] / ".env"

    if args.email:
        email = args.email.strip().casefold()
        if "@" not in email or email.startswith("@") or email.endswith("@"):
            raise SystemExit("The value is not a valid email address.")
        update_env_file(env_path, EMAIL_ENV_NAME, email)
        print("Problem administrator email fallback saved to ignored backend/.env. Restart FastAPI to apply it.")
        return

    raw_user_id = input("Paste your Supabase Auth user UUID: ").strip()
    try:
        user_id = str(UUID(raw_user_id))
    except ValueError as error:
        raise SystemExit("The value is not a valid UUID.") from error

    update_env_file(env_path, ENV_NAME, user_id)
    print("Problem administrator UUID saved to ignored backend/.env. Restart FastAPI to apply it.")


if __name__ == "__main__":
    main()
