#!/usr/bin/env bash
# Включить бэкапы и watchdog (таймеры + флаги в .env).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${BOT_DIR}/.env"

BACKUP_TIMER="fishing-bot-backup.timer"
BACKUP_WEEKLY_TIMER="fishing-bot-backup-weekly.timer"
WATCHDOG_TIMER="fishing-bot-watchdog.timer"

echo "=== Включение ops (бэкап + watchdog) ==="

set_env_flag() {
  local key="$1"
  local value="$2"
  if [[ ! -f "$ENV_FILE" ]]; then
    touch "$ENV_FILE"
  fi
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s/^${key}=.*/${key}=${value}/" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

set_env_flag BACKUP_ENABLED true
set_env_flag WATCHDOG_ENABLED true
set_env_flag TELEGRAM_NOTIFY_ENABLED true

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user enable --now "$BACKUP_TIMER" 2>/dev/null || true
  systemctl --user enable --now "$BACKUP_WEEKLY_TIMER" 2>/dev/null || true
  systemctl --user enable --now "$WATCHDOG_TIMER" 2>/dev/null || true
  echo "  timers enabled (если unit-файлы установлены)"
fi

echo ""
echo "Проверь в .env: BACKUP_ROOT, BACKUP_NOTIFY_USERNAME или BACKUP_NOTIFY_CHAT_ID"
