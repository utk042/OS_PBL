#!/usr/bin/env bash
# Health check for the repository server. Exit status 0 = healthy, 1 = a threshold was crossed.
# Usage: health_check.sh [--disk PCT] [--load N]
set -uo pipefail
source "$(dirname "$0")/common.sh"

DISK_MAX=90
LOAD_MAX="$(nproc 2>/dev/null || echo 1)"

while [ $# -gt 0 ]; do
  case "$1" in
    --disk) DISK_MAX="$2"; shift 2 ;;
    --load) LOAD_MAX="$2"; shift 2 ;;
    -h|--help) echo "Usage: $(basename "$0") [--disk PCT] [--load N]"; exit 0 ;;
    *) die "unknown option $1" ;;
  esac
done

status=0
target="$DRR_ROOT"
[ -d "$target" ] || target=/

disk="$(df -P "$target" | awk 'NR == 2 { gsub("%", "", $5); print $5 }')"
if [ "$disk" -ge "$DISK_MAX" ]; then log "ALERT disk ${disk}% used (limit ${DISK_MAX}%)"; status=1; else log "disk ${disk}% used"; fi

load="$(cut -d' ' -f1 /proc/loadavg)"
if awk -v l="$load" -v m="$LOAD_MAX" 'BEGIN { exit !(l > m) }'; then log "ALERT load average $load (limit $LOAD_MAX)"; status=1; else log "load average $load"; fi

mem="$(awk '/MemTotal/ { t = $2 } /MemAvailable/ { a = $2 } END { printf "%d", (t - a) * 100 / t }' /proc/meminfo)"
log "memory ${mem}% used"

log "top processes by CPU:"
ps -eo pid,stat,pcpu,pmem,comm --sort=-pcpu | head -n 6

if pgrep -f "app.py" > /dev/null; then log "repository server is running"; else log "repository server is NOT running"; fi
exit "$status"
