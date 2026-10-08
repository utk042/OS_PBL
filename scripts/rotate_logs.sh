#!/usr/bin/env bash
# Rotate the repository server logs: app.log -> app.log.1.gz -> app.log.2.gz ...
# Usage: rotate_logs.sh [--max-kb SIZE] [--copies N]
set -euo pipefail
source "$(dirname "$0")/common.sh"

MAX_KB=1024
COPIES=5

while [ $# -gt 0 ]; do
  case "$1" in
    --max-kb) MAX_KB="$2"; shift 2 ;;
    --copies) COPIES="$2"; shift 2 ;;
    -h|--help) echo "Usage: $(basename "$0") [--max-kb SIZE] [--copies N]  (logs in $LOG_DIR)"; exit 0 ;;
    *) die "unknown option $1" ;;
  esac
done

[ -d "$LOG_DIR" ] || die "log directory $LOG_DIR not found"
acquire_lock

rotate() {
  local file="$1" i
  # Shift the old copies up by one, dropping the oldest.
  run rm -f "$file.$COPIES.gz"
  for ((i = COPIES - 1; i >= 1; i--)); do
    if [ -f "$file.$i.gz" ]; then run mv "$file.$i.gz" "$file.$((i + 1)).gz"; fi
  done
  # copy + truncate keeps the server's open file descriptor valid (no restart needed).
  run cp "$file" "$file.1"
  run truncate -s 0 "$file"
  run gzip -f "$file.1"
  log "rotated $file"
}

rotated=0
for f in "$LOG_DIR"/*.log; do
  [ -e "$f" ] || continue
  size_kb=$(( $(stat -c %s "$f") / 1024 ))
  if [ "$size_kb" -ge "$MAX_KB" ]; then
    rotate "$f"
    rotated=$((rotated + 1))
  else
    log "skip $f (${size_kb} KB < ${MAX_KB} KB)"
  fi
done
log "$rotated log file(s) rotated"
