#!/usr/bin/env bash
# Start Tiga for development: backend on :8000, frontend on :3000. Ctrl+C stops both.
#   ./start_dev.sh            start both
#   ./start_dev.sh --install  (re)install backend and frontend dependencies first
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  set +u   # nvm reads unset variables; with -u the shell would exit inside it, silently
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null
  nvm use --lts >/dev/null 2>&1 || true
  set -u
fi

if [[ "${1:-}" == "--install" ]]; then
  command -v uv >/dev/null || { echo "uv is required: https://docs.astral.sh/uv/" >&2; exit 1; }
  (cd "$root/tiga" && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt -r requirements-dev.txt)
  (cd "$root/frontend" && npm ci)
fi

[[ -x "$root/tiga/.venv/bin/python" ]] || { echo "Missing tiga/.venv. Run: ./start_dev.sh --install" >&2; exit 1; }
[[ -d "$root/frontend/node_modules" ]] || { echo "Missing frontend/node_modules. Run: ./start_dev.sh --install" >&2; exit 1; }

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd "$root/tiga" && exec .venv/bin/python main.py) & pids+=($!)
(cd "$root/frontend" && exec npm run dev) & pids+=($!)

echo "Tiga API:  http://127.0.0.1:8000  (docs at /docs)"
echo "Tiga web:  http://localhost:3000"
wait -n "${pids[@]}"
