#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$ROOT_DIR/.portal-runtime"

stop_service() {
    local name="$1"
    local pid_file="$RUNTIME_DIR/$name.pid"
    local pid

    if [[ ! -f "$pid_file" ]]; then
        printf 'No tracked %s server process found.\n' "$name"
        return
    fi

    pid="$(<"$pid_file")"
    if [[ ! "$pid" =~ ^[0-9]+$ ]] || ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$pid_file"
        printf 'No running %s server process found.\n' "$name"
        return
    fi

    local process_command
    process_command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    case "$name:$process_command" in
        backend:*"artisan serve"*|frontend:*"npm run dev"*)
            kill "$pid"
            for _ in {1..10}; do
                if ! kill -0 "$pid" 2>/dev/null; then
                    break
                fi
                sleep 1
            done
            if kill -0 "$pid" 2>/dev/null; then
                kill -KILL "$pid"
            fi
            rm -f "$pid_file"
            printf 'Stopped %s server (PID %s).\n' "$name" "$pid"
            ;;
        *)
            printf 'Refusing to stop PID %s: it no longer appears to be the OPTICPLUS %s server.\n' "$pid" "$name" >&2
            return 1
            ;;
    esac
}

stop_service backend
stop_service frontend
