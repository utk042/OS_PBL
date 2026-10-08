#!/usr/bin/env bash
# Bulk ingestion: move new PDFs from the inbox into the repository, extract their
# text in parallel background processes and rebuild the keyword index.
# Usage: reindex.sh [--jobs N] [--full]
set -euo pipefail
source "$(dirname "$0")/common.sh"

INBOX="${INBOX:-$DRR_ROOT/inbox}"
JOBS="$(nproc 2>/dev/null || echo 2)"
FULL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --jobs) JOBS="$2"; shift 2 ;;
    --full) FULL=1; shift ;;
    -h|--help) echo "Usage: $(basename "$0") [--jobs N] [--full]"; exit 0 ;;
    *) die "unknown option $1" ;;
  esac
done

acquire_lock
mkdir -p "$INBOX" "$UPLOAD_DIR" "$INDEX_DIR/text"

# Extract plain text from one document. pdftotext is used when installed;
# plain .txt files are copied so the script can be tested without it.
extract() {
  local src="$1" out="$INDEX_DIR/text/$(basename "${1%.*}").txt"
  case "$src" in
    *.pdf)
      if command -v pdftotext > /dev/null; then pdftotext -q "$src" "$out"; else : > "$out"; fi ;;
    *) cp "$src" "$out" ;;
  esac
  echo "$(basename "$src")"
}

# 1. Ingest: move new files from the inbox.
moved=0
for f in "$INBOX"/*; do
  [ -f "$f" ] || continue
  run mv -n "$f" "$UPLOAD_DIR/"
  moved=$((moved + 1))
done
log "ingested $moved new file(s)"

# 2. Extract text, at most JOBS background processes at a time.
if [ "$FULL" = 1 ]; then
  todo=("$UPLOAD_DIR"/*)
else
  todo=()
  for f in "$UPLOAD_DIR"/*; do
    [ -f "$f" ] || continue
    t="$INDEX_DIR/text/$(basename "${f%.*}").txt"
    [ "$f" -nt "$t" ] || [ ! -e "$t" ] && todo+=("$f")
  done
fi

running=0
done_count=0
for f in "${todo[@]}"; do
  [ -f "$f" ] || continue
  if [ "$DRY_RUN" = 1 ]; then log "dry-run: extract $f"; continue; fi
  extract "$f" > /dev/null &
  running=$((running + 1))
  if [ "$running" -ge "$JOBS" ]; then
    wait -n            # block until any one child process exits
    running=$((running - 1))
  fi
  done_count=$((done_count + 1))
done
wait                   # reap the remaining children
log "extracted text from $done_count document(s) using up to $JOBS parallel processes"

# 3. Rebuild the keyword index: word -> documents containing it.
if [ "$DRY_RUN" != 1 ]; then
  tmp="$(mktemp)"
  for t in "$INDEX_DIR"/text/*.txt; do
    [ -f "$t" ] || continue
    doc="$(basename "$t" .txt)"
    tr -cs '[:alnum:]' '\n' < "$t" | tr '[:upper:]' '[:lower:]' | awk 'length($0) > 2' | sort -u | sed "s/\$/\t$doc/"
  done | sort > "$tmp"
  mv "$tmp" "$INDEX_DIR/keywords.tsv"
  log "index has $(cut -f1 "$INDEX_DIR/keywords.tsv" | sort -u | wc -l) distinct words"
fi
