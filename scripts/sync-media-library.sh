#!/usr/bin/env bash
# sync-media-library.sh
# Aggregates all Lavira media (AI-generated + web interface) into one flat,
# date-sorted directory using symlinks (no duplication of source files).
#
# Sort mechanism: each symlink is prefixed with its source file's mtime
# (YYYY-MM-DD_HHMMSS), so `ls -1 media-library/ | sort -r` or `ls -1r`
# always shows the latest post first, no DB or index needed.

set -euo pipefail

ROOT="/home/kamau/lavira-media-engine"
LIB="$ROOT/media-library"
SOURCES=("$ROOT/outputs" "$ROOT/posts")
EXT_REGEX='\.(jpg|jpeg|png|gif|mp4|mov|mp3|wav)$'

mkdir -p "$LIB"

# Clear stale symlinks (sources may have been deleted/moved); real files untouched.
find "$LIB" -maxdepth 1 -type l -delete

count=0
for src in "${SOURCES[@]}"; do
  [ -d "$src" ] || continue
  while IFS= read -r -d '' f; do
    ts=$(date -d "@$(stat -c %Y "$f")" +"%Y-%m-%d_%H%M%S")
    base=$(basename "$f")
    link="$LIB/${ts}__${base}"
    # Avoid collisions if two files share the same second+name
    n=1
    while [ -e "$link" ]; do
      link="$LIB/${ts}__${n}__${base}"
      n=$((n+1))
    done
    ln -s "$f" "$link"
    count=$((count+1))
  done < <(find "$src" -type f -regextype posix-extended -iregex ".*$EXT_REGEX" -print0)
done

echo "media-library synced: $count files linked -> $LIB"
echo "Newest first: ls -1r $LIB | head"
