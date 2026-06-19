#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="/home/andreyzabrodin/PC/4/backups"
TARGET="${1:-$BACKUP_ROOT/daily/latest.tar.gz}"

if [[ -L "$TARGET" ]]; then
  TARGET="$(readlink -f "$TARGET")"
fi

if [[ ! -f "$TARGET" ]]; then
  echo "Archive not found: $TARGET" >&2
  exit 1
fi

echo "Checking: $TARGET"

if [[ ! -f "${TARGET}.sha256" ]]; then
  echo "WARN: checksum file missing: ${TARGET}.sha256"
else
  (cd "$(dirname "$TARGET")" && sha256sum -c "$(basename "$TARGET").sha256")
fi

tar -tzf "$TARGET" >/dev/null
echo "Archive listing OK"

required=(
  fishing-bot-new/bot.js
  fishing-bot-new/package.json
  fishing-bot-new/.env
  fishing-bot-new/data/jokes.json
  fishing-bot-new/data/groups.json
)

missing=0
for item in "${required[@]}"; do
  if tar -tzf "$TARGET" "$item" >/dev/null 2>&1; then
    echo "OK $item"
  else
    echo "MISSING $item"
    missing=$((missing + 1))
  fi
done

if (( missing > 0 )); then
  echo "Verification failed: missing ${missing} required path(s)" >&2
  exit 1
fi

echo "Verification passed"
