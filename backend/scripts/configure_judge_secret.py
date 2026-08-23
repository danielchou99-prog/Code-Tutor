from getpass import getpass
from pathlib import Path


ENV_NAME = "CODE_TUTOR_SUPABASE_SECRET_KEY"


def update_env_file(path: Path, secret: str) -> None:
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    replacement = f"{ENV_NAME}={secret}"
    updated: list[str] = []
    replaced = False
    for line in lines:
        if line.startswith(f"{ENV_NAME}="):
            if not replaced:
                updated.append(replacement)
                replaced = True
            continue
        updated.append(line)
    if not replaced:
        if updated and updated[-1]:
            updated.append("")
        updated.append(replacement)
    path.write_text("\n".join(updated) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    secret = getpass("Paste the Supabase sb_secret_ key (input is hidden): ").strip()
    if not secret.startswith("sb_secret_") or len(secret) < 24:
        raise SystemExit("The value does not look like a Supabase sb_secret_ key.")

    env_path = Path(__file__).resolve().parents[1] / ".env"
    update_env_file(env_path, secret)
    print("Judge Secret key saved to ignored backend/.env. The key was not printed.")


if __name__ == "__main__":
    main()
