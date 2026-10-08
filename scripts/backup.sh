#!/usr/bin/env bash
# Nightly backup of the repository: uploads + metadata database.
# Usage: backup.sh [--keep DAYS] [--help]
set -euo pipefail
source "$(dirname "$0")/common.sh"

KEEP_DAYS=7

usage() {
  echo "Usage: $(basename "$0") [--keep DAYS]"
  echo "Archives $UPLOAD_DIR and $DB_FILE into $BACKUP_DIR and removes archives older than DAYS (default $KEEP_DAYS)."
}

while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP_DAYS="${2:?--keep needs a number}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done

[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || die "--keep must be a whole number"
[ -d "$UPLOAD_DIR" ] || die "upload directory $UPLOAD_DIR not found"

acquire_lock
mkdir -p "$BACKUP_DIR"

stamp="$(date '+%Y%m%d-%H%M%S')"
archive="$BACKUP_DIR/drr-$stamp.tar.gz"
items=("$(basename "$UPLOAD_DIR")")
[ -f "$DB_FILE" ] && items+=("$(basename "$DB_FILE")")

log "backing up ${items[*]} to $archive"
run tar -czf "$archive" -C "$(dirname "$UPLOAD_DIR")" "${items[@]}"

if [ "$DRY_RUN" != "1" ]; then
  # Verify the archive can be read back before trusting it.
  tar -tzf "$archive" > /dev/null || die "archive $archive is corrupt"
  size="$(du -h "$archive" | cut -f1)"
  count="$(tar -tzf "$archive" | grep -vc '/$' || true)"
  log "backup OK: $count files, $size"
fi

# Retention: delete archives older than KEEP_DAYS days.
removed=0
while IFS= read -r old; do
  run rm -f "$old"
  removed=$((removed + 1))
done < <(find "$BACKUP_DIR" -name 'drr-*.tar.gz' -type f -mtime +"$KEEP_DAYS")
log "removed $removed old backup(s); keeping $KEEP_DAYS days"
