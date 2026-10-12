#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/opticplus-backend"
FRONTEND_DIR="$ROOT_DIR/opticplus-frontend"
RUNTIME_DIR="$ROOT_DIR/.portal-runtime"

fail() {
    printf 'Error: %s\n' "$1" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "$1 is required and must be available in PATH."
}

[[ -d "$BACKEND_DIR" ]] || fail "Backend folder not found: $BACKEND_DIR"
[[ -d "$FRONTEND_DIR" ]] || fail "Frontend folder not found: $FRONTEND_DIR"

require_command php
require_command composer
require_command node
require_command npm

if ! php -r 'exit(PHP_VERSION_ID >= 80200 ? 0 : 1);'; then
    fail "PHP 8.2 or newer is required. Install/configure PHP and ensure 'php' is on PATH."
fi

if [[ ! -f "$BACKEND_DIR/vendor/autoload.php" ]]; then
    printf '==> Installing backend dependencies with Composer...\n'
    (cd "$BACKEND_DIR" && composer install --no-interaction)
fi

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    [[ -f "$BACKEND_DIR/.env.example" ]] || fail "Backend .env.example is missing."
    printf '==> Creating backend .env from .env.example...\n'
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
fi

if ! grep -Eq '^APP_KEY=base64:[A-Za-z0-9+/=]+' "$BACKEND_DIR/.env"; then
    printf '==> Generating Laravel APP_KEY...\n'
    (cd "$BACKEND_DIR" && php artisan key:generate --force)
fi

if [[ ! -f "$FRONTEND_DIR/node_modules/vite/bin/vite.js" ]]; then
    printf '==> Installing frontend dependencies with npm...\n'
    (cd "$FRONTEND_DIR" && npm install)
fi

mkdir -p "$RUNTIME_DIR"

start_service() {
    local name="$1"
    local directory="$2"
    local log_file="$RUNTIME_DIR/$name.log"
    local pid_file="$RUNTIME_DIR/$name.pid"
    shift 2

    if [[ -f "$pid_file" ]]; then
        local old_pid
        old_pid="$(<"$pid_file")"
        if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
            printf 'Error: %s may already be running (PID %s). Check %s\n' "$name" "$old_pid" "$log_file" >&2
            return 1
        fi
        rm -f "$pid_file"
    fi

    (cd "$directory" && exec "$@") >"$log_file" 2>&1 </dev/null &
    local pid=$!
    printf '%s\n' "$pid" >"$pid_file"
    sleep 1

    if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$pid_file"
        printf 'Error: %s failed to start. Recent output from %s:\n' "$name" "$log_file" >&2
        tail -n 40 "$log_file" >&2 || true
        return 1
    fi

    printf 'Started %s (PID %s); log: %s\n' "$name" "$pid" "$log_file"
}

start_service backend "$BACKEND_DIR" php artisan serve --host=127.0.0.1 --port=8000
start_service frontend "$FRONTEND_DIR" npm run dev -- --host 127.0.0.1 --port 5173

printf '\nOPTICPLUS servers are starting:\n'
printf 'Backend:  http://127.0.0.1:8000\n'
printf 'Frontend: http://127.0.0.1:5173\n'
