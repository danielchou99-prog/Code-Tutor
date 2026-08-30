#!/usr/bin/env bash
set -Eeuo pipefail

frontend_url="${CODE_TUTOR_FRONTEND_HEALTH_URL:-http://127.0.0.1:3000/}"
api_url="${CODE_TUTOR_API_HEALTH_URL:-http://127.0.0.1:8000/health}"
worker_url="${CODE_TUTOR_WORKER_HEALTH_URL:-http://127.0.0.1:8010/health}"

check_url() {
    local name="$1"
    local url="$2"
    local attempt
    for attempt in {1..15}; do
        if curl --fail --silent --show-error --max-time 10 "$url" >/dev/null; then
            echo "Health check passed: ${name}"
            return 0
        fi
        sleep 2
    done
    echo "Health check failed: ${name} (${url})" >&2
    return 1
}

check_compiler_url() {
    local name="$1"
    local url="$2"
    local response
    local attempt
    for attempt in {1..15}; do
        if response="$(curl --fail --silent --show-error --max-time 10 "$url")" \
            && grep -Eq '"compiler_available"[[:space:]]*:[[:space:]]*true' <<<"$response"; then
            echo "Health check passed: ${name} and Docker compiler"
            return 0
        fi
        sleep 2
    done
    echo "Health check failed: ${name} cannot use the Docker compiler (${url})" >&2
    return 1
}

check_url "Next.js" "$frontend_url"
check_compiler_url "FastAPI" "$api_url"
check_compiler_url "Judge Worker" "$worker_url"
