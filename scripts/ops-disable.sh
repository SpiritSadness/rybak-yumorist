#!/usr/bin/env bash
# Отключить бэкапы, watchdog и Telegram-уведомления об ops.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${BOT_DIR}/.env"

BACKUP_TIMER="fishing-bot-backup.timer"
BACKUP_WEEKLY_TIMER="fishing-bot-backup-weekly.timer"
WATCHDOG_TIMER="fishing-bot-watchdog.timer"

echo "=== Отключение ops (бэкап + watchdog) ==="

disable_timer() {
  local unit="$1"
  if systemctl list-unit-files "$unit" &>/dev/null 2>&1; then
    systemctl disable --now "$unit" 2>/dev/null || true
    echo "  timer off: $unit"
  elif systemctl --user list-unit-files "$unit" &>/dev/null 2>&1; then
    systemctl --user disable --now "$unit" 2>/dev/null || true
    echo "  timer off (user): $unit"
  fi
}

if command -v systemctl >/dev/null 2>&1; then
  for unit in "$BACKUP_TIMER" "$BACKUP_WEEKLY_TIMER" "$WATCHDOG_TIMER"; do
    disable_timer "$unit"
  done
else
  echo "  systemctl не найден — таймеры пропущены"
fi

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

set_env_flag BACKUP_ENABLED false
set_env_flag WATCHDOG_ENABLED false
set_env_flag TELEGRAM_NOTIFY_ENABLED false

echo ""
echo "В .env выставлено:"
echo "  BACKUP_ENABLED=false"
echo "  WATCHDOG_ENABLED=false"
echo "  TELEGRAM_NOTIFY_ENABLED=false"
echo ""
echo "Бот (fishing-bot.service) не трогали — только бэкапы и алерты."
echo "Включить обратно: ./scripts/ops-enable.sh или botctl → пункт 18"
