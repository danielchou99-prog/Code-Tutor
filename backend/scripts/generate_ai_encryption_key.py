from argparse import ArgumentParser
from pathlib import Path

from cryptography.fernet import Fernet


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        values[name.strip()] = value.strip()
    return values


def set_env_values(path: Path, updates: dict[str, str]) -> None:
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    remaining = dict(updates)
    updated_lines: list[str] = []
    for line in lines:
        if "=" not in line or line.lstrip().startswith("#"):
            updated_lines.append(line)
            continue
        name = line.split("=", 1)[0].strip()
        if name in remaining:
            updated_lines.append(f"{name}={remaining.pop(name)}")
        else:
            updated_lines.append(line)
    if remaining and updated_lines and updated_lines[-1] != "":
        updated_lines.append("")
    updated_lines.extend(f"{name}={value}" for name, value in remaining.items())
    temporary_path = path.with_suffix(f"{path.suffix}.tmp")
    temporary_path.write_text("\n".join(updated_lines).rstrip() + "\n", encoding="utf-8")
    temporary_path.replace(path)


def configure_environment() -> None:
    frontend_env = PROJECT_DIR / "frontend" / ".env.local"
    backend_env = BACKEND_DIR / ".env"
    frontend_values = read_env(frontend_env)
    backend_values = read_env(backend_env)
    publishable_key = frontend_values.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    if not publishable_key:
        raise SystemExit("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing from frontend/.env.local")
    encryption_key = backend_values.get("CODE_TUTOR_AI_ENCRYPTION_KEY")
    if not encryption_key:
        encryption_key = Fernet.generate_key().decode("ascii")
    else:
        Fernet(encryption_key.encode("ascii"))
    set_env_values(
        backend_env,
        {
            "CODE_TUTOR_SUPABASE_PUBLISHABLE_KEY": publishable_key,
            "CODE_TUTOR_AI_ENCRYPTION_KEY": encryption_key,
        },
    )
    print("AI environment configured in backend/.env; secret values were not displayed.")


if __name__ == "__main__":
    parser = ArgumentParser(description="Generate or configure the Code Tutor AI encryption key.")
    parser.add_argument(
        "--configure",
        action="store_true",
        help="Copy the Supabase publishable key and safely configure backend/.env.",
    )
    arguments = parser.parse_args()
    if arguments.configure:
        configure_environment()
    else:
        print(Fernet.generate_key().decode("ascii"))
