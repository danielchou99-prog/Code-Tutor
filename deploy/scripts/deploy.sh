#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
project_root="$(cd -- "${script_dir}/../.." && pwd -P)"

if [[ "$project_root" == "/" || ! -f "${project_root}/frontend/package-lock.json" || ! -f "${project_root}/backend/requirements.txt" ]]; then
    echo "Refusing to deploy: the Code Tutor project root could not be verified." >&2
    exit 1
fi

for command_name in npm python3 docker curl; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Required command is missing: ${command_name}" >&2
        exit 1
    fi
done

frontend_env="${CODE_TUTOR_FRONTEND_ENV_FILE:-/etc/code-tutor/frontend.env}"
if [[ ! -r "$frontend_env" ]]; then
    echo "Frontend environment file is not readable: ${frontend_env}" >&2
    exit 1
fi
if grep -Eq 'YOUR_|GENERATE_' "$frontend_env"; then
    echo "Frontend environment file still contains placeholder values." >&2
    exit 1
fi

echo "Installing and building the frontend..."
(
    cd "${project_root}/frontend"
    set -a
    # shellcheck disable=SC1090
    source "$frontend_env"
    set +a
    npm ci
    npm run lint
    npm run build
)

echo "Preparing the Python backend..."
if [[ ! -x "${project_root}/backend/.venv/bin/python" ]]; then
    python3 -m venv "${project_root}/backend/.venv"
fi
"${project_root}/backend/.venv/bin/python" -m pip install --disable-pip-version-check -r "${project_root}/backend/requirements.txt"
"${project_root}/backend/.venv/bin/python" -m compileall -q "${project_root}/backend/app"

echo "Building the isolated compiler image..."
docker build --pull --tag code-tutor-compiler:local "${project_root}/compiler"

if [[ "${1:-}" == "--restart" ]]; then
    echo "Restarting Code Tutor services..."
    sudo systemctl restart code-tutor-worker code-tutor-api code-tutor-frontend
    sleep 3
    bash "${script_dir}/health-check.sh"
else
    echo "Build completed. Run again with --restart after systemd is installed."
fi
