#!/usr/bin/env bash
# Shared settings and helpers for the repository admin scripts.
# Every value can be overridden from the environment, e.g. DRR_ROOT=/srv/drr ./backup.sh

DRR_ROOT="${DRR_ROOT:-/opt/drr}"
UPLOAD_DIR="${UPLOAD_DIR:-$DRR_ROOT/uploads}"
DB_FILE="${DB_FILE:-$DRR_ROOT/research.db}"
BACKUP_DIR="${BACKUP_DIR:-$DRR_ROOT/backups}"
LOG_DIR="${LOG_DIR:-$DRR_ROOT/logs}"
INDEX_DIR="${INDEX_DIR:-$DRR_ROOT/index}"
DRY_RUN="${DRY_RUN:-0}"

log() {
  printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$(basename "$0")" "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

# run CMD...  - execute, or only print it when DRY_RUN=1
run() {
  if [ "$DRY_RUN" = "1" ]; then
    log "dry-run: $*"
  else
    "$@"
  fi
}

# Only one copy of a script may run at a time (mutual exclusion with a lock file).
acquire_lock() {
  local lock="/tmp/drr-$(basename "$0" .sh).lock"
  exec 9>"$lock"
  if ! flock -n 9; then
    die "another instance is already running ($lock)"
  fi
}
