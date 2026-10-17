"""Write the FastAPI OpenAPI document to a file (used to generate frontend types)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: export_openapi.py <output.json>")
    Path(sys.argv[1]).write_text(json.dumps(app.openapi(), indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
