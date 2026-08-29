#!/usr/bin/env bash
set -euo pipefail

BOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="fishing-bot.service"
WATCHDOG_SERVICE="fishing-bot-watchdog.service"
WATCHDOG_TIMER="fishing-bot-watchdog.timer"
BACKUP_TIMER="fishing-bot-backup.timer"
BACKUP_WEEKLY_TIMER="fishing-bot-backup-weekly.timer"
LOG_FILE="${BOT_DIR}/logs/bot.log"
ERROR_LOG="${BOT_DIR}/logs/error.log"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/rybak-yumorist}"
BACKUP_STATUS="${BACKUP_ROOT}/status.json"

if [[ "${BOT_DIR}" == *"/scripts" ]]; then
  BOT_DIR="$(cd "${BOT_DIR}/.." && pwd)"
fi

cd "$BOT_DIR"

# --- colors ---
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
  BOLD="$(tput bold 2>/dev/null || true)"
  DIM="$(tput dim 2>/dev/null || true)"
  RESET="$(tput sgr0 2>/dev/null || true)"
  GREEN="$(tput setaf 2 2>/dev/null || true)"
  RED="$(tput setaf 1 2>/dev/null || true)"
  YELLOW="$(tput setaf 3 2>/dev/null || true)"
  CYAN="$(tput setaf 6 2>/dev/null || true)"
else
  BOLD="" DIM="" RESET="" GREEN="" RED="" YELLOW="" CYAN=""
fi

pause() {
  echo
  read -r -p "Нажми Enter, чтобы вернуться в меню…" _
  echo
}

header() {
  clear
  echo "${CYAN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
  echo "${CYAN}${BOLD}║     🐟 Рыбак Юморист — управление        ║${RESET}"
  echo "${CYAN}${BOLD}╚══════════════════════════════════════════╝${RESET}"
  echo
  show_short_status
  echo
}

service_state() {
  systemctl --user is-active "$SERVICE_NAME" 2>/dev/null || echo "inactive"
}

service_enabled() {
  systemctl --user is-enabled "$SERVICE_NAME" 2>/dev/null || echo "disabled"
}

watchdog_timer_state() {
  systemctl --user is-active "$WATCHDOG_TIMER" 2>/dev/null || echo "inactive"
}

watchdog_timer_enabled() {
  systemctl --user is-enabled "$WATCHDOG_TIMER" 2>/dev/null || echo "disabled"
}

count_bot_processes() {
  pgrep -f "node bot.js" 2>/dev/null | wc -l | tr -d ' '
}

# Лишние = все процессы минус один рабочий systemd-экземпляр
count_extra_bots() {
  local total state extra
  total="$(count_bot_processes)"
  total="${total:-0}"
  [[ "$total" =~ ^[0-9]+$ ]] || total=0

  state="$(service_state)"
  if [[ "$state" == "active" ]]; then
    extra=$(( total > 1 ? total - 1 : 0 ))
  else
    extra=$total
  fi

  echo "$extra"
}

show_short_status() {
  local state enabled extra total wd_state wd_enabled
  state="$(service_state)"
  enabled="$(service_enabled)"
  extra="$(count_extra_bots)"
  total="$(count_bot_processes)"
  total="${total:-0}"
  wd_state="$(watchdog_timer_state)"
  wd_enabled="$(watchdog_timer_enabled)"

  if [[ "$state" == "active" ]]; then
    echo "  Сервис systemd: ${GREEN}● запущен${RESET} (${SERVICE_NAME})"
  else
    echo "  Сервис systemd: ${RED}○ остановлен${RESET} (${SERVICE_NAME})"
  fi

  echo "  Автозапуск:     ${enabled}"
  echo "  Процессов бота: ${total}"

  if [[ "$wd_state" == "active" ]]; then
    echo "  Watchdog:       ${GREEN}● активен${RESET} (таймер ${wd_enabled})"
  else
    echo "  Watchdog:       ${YELLOW}○ выключен${RESET} (пункт 15)"
  fi

  if (( extra > 0 )); then
    echo "  ${YELLOW}⚠ Лишних процессов: ${extra}${RESET}"
    echo "  ${YELLOW}  → возможен конфликт 409, используй пункт 11${RESET}"
  fi

  if [[ -f "$LOG_FILE" ]]; then
    echo "  Лог:            ${LOG_FILE}"
  fi
}

show_full_status() {
  header
  echo "${BOLD}Подробный статус${RESET}"
  echo "────────────────────────────────────────"
  systemctl --user status "$SERVICE_NAME" --no-pager || true
  echo
  echo "${BOLD}Процессы node bot.js:${RESET}"
  pgrep -af "^node bot.js$" 2>/dev/null || echo "  (нет)"
  echo
  if [[ -f "$BACKUP_STATUS" ]]; then
    echo "${BOLD}Последний бэкап:${RESET}"
    cat "$BACKUP_STATUS"
    echo
  fi
  echo "${BOLD}Watchdog:${RESET}"
  systemctl --user status "$WATCHDOG_TIMER" --no-pager 2>/dev/null || echo "  (не настроен)"
  echo
  pause
}

kill_manual_bots() {
  header
  echo "${BOLD}Остановка лишних процессов${RESET}"
  echo "────────────────────────────────────────"

  local main_pid pid extra=0
  main_pid="$(systemctl --user show -p MainPID --value "$SERVICE_NAME" 2>/dev/null || true)"
  main_pid="${main_pid:-0}"

  echo "Основной PID (systemd): ${main_pid:-—}"
  echo
  echo "${BOLD}Все процессы node bot.js:${RESET}"
  pgrep -af "node bot.js" 2>/dev/null || echo "  (нет)"
  echo

  while read -r pid; do
    [[ -z "$pid" ]] && continue
    [[ "$pid" == "$main_pid" ]] && continue
    extra=$((extra + 1))
  done < <(pgrep -f "node bot.js" 2>/dev/null)

  if (( extra == 0 )); then
    echo "${GREEN}Лишних процессов не найдено.${RESET}"
    pause
    return
  fi

  read -r -p "Остановить ${extra} лишний(их) процесс(ов)? [y/N] " confirm
  if [[ "$confirm" =~ ^[yYдД]$ ]]; then
    while read -r pid; do
      [[ -z "$pid" ]] && continue
      [[ "$pid" == "$main_pid" ]] && continue
      kill "$pid" 2>/dev/null || true
    done < <(pgrep -f "node bot.js" 2>/dev/null)
    sleep 1
    echo "${GREEN}✓ Лишние процессы остановлены${RESET}"
  else
    echo "Отменено."
  fi
  pause
}

do_start() {
  header
  echo "${BOLD}Запуск бота${RESET}"
  echo "────────────────────────────────────────"
  if (( $(count_extra_bots) > 0 )); then
    echo "${YELLOW}Сначала останови лишние процессы (пункт 11).${RESET}"
    pause
    return
  fi
  systemctl --user start "$SERVICE_NAME"
  sleep 2
  if [[ "$(service_state)" == "active" ]]; then
    echo "${GREEN}✓ Бот запущен${RESET}"
  else
    echo "${RED}✗ Не удалось запустить. Смотри логи (пункт 5).${RESET}"
  fi
  pause
}

do_stop() {
  header
  echo "${BOLD}Остановка бота${RESET}"
  echo "────────────────────────────────────────"
  read -r -p "Остановить сервис ${SERVICE_NAME}? [y/N] " confirm
  if [[ "$confirm" =~ ^[yYдД]$ ]]; then
    systemctl --user stop "$SERVICE_NAME"
    echo "${GREEN}✓ Остановлен${RESET}"
  else
    echo "Отменено."
  fi
  pause
}

do_restart() {
  header
  echo "${BOLD}Перезапуск бота${RESET}"
  echo "────────────────────────────────────────"
  if (( $(count_extra_bots) > 0 )); then
    echo "${YELLOW}Обнаружены лишние процессы — останавливаю…${RESET}"
    pkill -f "node bot.js" 2>/dev/null || true
    sleep 2
  fi
  systemctl --user restart "$SERVICE_NAME"
  sleep 3
  if [[ "$(service_state)" == "active" ]]; then
    echo "${GREEN}✓ Бот перезапущен${RESET}"
    tail -n 5 "$LOG_FILE" 2>/dev/null || true
  else
    echo "${RED}✗ Перезапуск не удался. Смотри логи.${RESET}"
  fi
  pause
}

do_enable_autostart() {
  header
  echo "${BOLD}Автозапуск при входе${RESET}"
  echo "────────────────────────────────────────"
  systemctl --user enable "$SERVICE_NAME"
  echo "${GREEN}✓ Включён: systemctl --user enable ${SERVICE_NAME}${RESET}"
  echo
  echo "Если ПК работает без входа в систему, выполни один раз:"
  echo "  loginctl enable-linger \"\$USER\""
  pause
}

do_disable_autostart() {
  header
  echo "${BOLD}Отключить автозапуск${RESET}"
  echo "────────────────────────────────────────"
  read -r -p "Отключить автозапуск? [y/N] " confirm
  if [[ "$confirm" =~ ^[yYдД]$ ]]; then
    systemctl --user disable "$SERVICE_NAME"
    echo "${GREEN}✓ Автозапуск отключён${RESET}"
  else
    echo "Отменено."
  fi
  pause
}

do_logs_tail() {
  header
  echo "${BOLD}Последние строки лога${RESET}"
  echo "────────────────────────────────────────"
  if [[ -f "$LOG_FILE" ]]; then
    tail -n 40 "$LOG_FILE"
  else
    echo "Лог не найден: $LOG_FILE"
  fi
  echo
  if [[ -f "$ERROR_LOG" ]]; then
    echo "${BOLD}Последние ошибки (error.log):${RESET}"
    tail -n 15 "$ERROR_LOG" 2>/dev/null || echo "(пусто)"
  fi
  pause
}

do_logs_follow() {
  header
  echo "${BOLD}Лог в реальном времени${RESET}"
  echo "${DIM}Выход: Ctrl+C${RESET}"
  echo "────────────────────────────────────────"
  echo
  trap 'echo; pause' INT
  tail -n 20 -f "$LOG_FILE" 2>/dev/null || journalctl --user -u "$SERVICE_NAME" -f --no-pager
  trap - INT
}

do_check_connection() {
  header
  echo "${BOLD}Проверка Telegram и групп${RESET}"
  echo "────────────────────────────────────────"
  npm run check:connection
  pause
}

do_sync_commands() {
  header
  echo "${BOLD}Синхронизация команд /start и /help${RESET}"
  echo "────────────────────────────────────────"
  npm run set:commands
  pause
}

do_backup() {
  header
  echo "${BOLD}Бэкап${RESET}"
  echo "────────────────────────────────────────"
  echo "  1) Daily (быстрый)"
  echo "  2) Weekly (полный)"
  echo "  3) Проверить последний daily"
  echo "  0) Назад"
  echo
  read -r -p "Выбор: " sub
  case "$sub" in
    1) npm run backup ;;
    2) npm run backup:weekly ;;
    3) npm run backup:verify ;;
    0|"") return ;;
    *) echo "Неизвестный пункт" ; pause ; return ;;
  esac
  pause
}

do_rebuild_jokes() {
  header
  echo "${BOLD}Пересборка базы анекдотов${RESET}"
  echo "────────────────────────────────────────"
  read -r -p "Это займёт ~30 сек. Продолжить? [y/N] " confirm
  if [[ "$confirm" =~ ^[yYдД]$ ]]; then
    npm run rebuild:jokes
  else
    echo "Отменено."
  fi
  pause
}

do_open_folder() {
  header
  echo "${BOLD}Папка проекта${RESET}"
  echo "  ${BOT_DIR}"
  echo
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$BOT_DIR" 2>/dev/null && echo "${GREEN}Открыто в файловом менеджере${RESET}" || echo "Не удалось открыть"
  else
    echo "xdg-open недоступен"
  fi
  pause
}

do_enable_watchdog() {
  header
  echo "${BOLD}Watchdog — алерт в Telegram если бот упал${RESET}"
  echo "────────────────────────────────────────"
  systemctl --user enable --now "$WATCHDOG_TIMER"
  echo "${GREEN}✓ Таймер включён: ${WATCHDOG_TIMER}${RESET}"
  echo "  Проверка каждые 3 минуты, алерт в Telegram (BACKUP_NOTIFY_*)"
  pause
}

do_test_watchdog() {
  header
  echo "${BOLD}Тест watchdog (ручной запуск)${RESET}"
  echo "────────────────────────────────────────"
  node "${BOT_DIR}/scripts/watchdog.js"
  pause
}

do_disable_ops() {
  header
  echo "${BOLD}Отключить бэкапы + watchdog + алерты в TG${RESET}"
  echo "────────────────────────────────────────"
  bash "${BOT_DIR}/scripts/ops-disable.sh"
  pause
}

do_enable_ops() {
  header
  echo "${BOLD}Включить бэкапы + watchdog${RESET}"
  echo "────────────────────────────────────────"
  bash "${BOT_DIR}/scripts/ops-enable.sh"
  pause
}

show_menu() {
  echo "${BOLD}Меню${RESET}"
  echo "  ${CYAN}1)${RESET}  Статус (подробно)"
  echo "  ${CYAN}2)${RESET}  Запустить бота"
  echo "  ${CYAN}3)${RESET}  Остановить бота"
  echo "  ${CYAN}4)${RESET}  Перезапустить бота"
  echo "  ${CYAN}5)${RESET}  Логи — последние строки"
  echo "  ${CYAN}6)${RESET}  Логи — в реальном времени"
  echo "  ${CYAN}7)${RESET}  Проверка Telegram / групп"
  echo "  ${CYAN}8)${RESET}  Синхронизировать команды бота"
  echo "  ${CYAN}9)${RESET}  Бэкап"
  echo "  ${CYAN}10)${RESET} Пересборка анекдотов"
  echo "  ${CYAN}11)${RESET} Убить лишние процессы (409 Conflict)"
  echo "  ${CYAN}12)${RESET} Включить автозапуск systemd"
  echo "  ${CYAN}13)${RESET} Отключить автозапуск systemd"
  echo "  ${CYAN}14)${RESET} Открыть папку проекта"
  echo "  ${CYAN}15)${RESET} Включить watchdog (алерт в TG)"
  echo "  ${CYAN}16)${RESET} Тест watchdog сейчас"
  echo "  ${CYAN}17)${RESET} ${YELLOW}Отключить бэкапы и алерты${RESET}"
  echo "  ${CYAN}18)${RESET} Включить бэкапы и watchdog"
  echo "  ${CYAN}0)${RESET}  Выход"
  echo
}

main() {
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemctl не найден. Скрипт рассчитан на Linux с systemd."
    exit 1
  fi

  if [[ ! -f "${BOT_DIR}/bot.js" ]]; then
    echo "Не найден bot.js в ${BOT_DIR}"
    exit 1
  fi

  while true; do
    header
    show_menu
    read -r -p "Выбор: " choice
    case "$choice" in
      1) show_full_status ;;
      2) do_start ;;
      3) do_stop ;;
      4) do_restart ;;
      5) do_logs_tail ;;
      6) do_logs_follow ;;
      7) do_check_connection ;;
      8) do_sync_commands ;;
      9) do_backup ;;
      10) do_rebuild_jokes ;;
      11) kill_manual_bots ;;
      12) do_enable_autostart ;;
      13) do_disable_autostart ;;
      14) do_open_folder ;;
      15) do_enable_watchdog ;;
      16) do_test_watchdog ;;
      17) do_disable_ops ;;
      18) do_enable_ops ;;
      0|q|Q|exit|выход) clear; echo "Пока! 🎣"; exit 0 ;;
      *) echo "${YELLOW}Неизвестный пункт: ${choice}${RESET}"; pause ;;
    esac
  done
}

# CLI shortcuts: ./botctl.sh restart | status | logs
if [[ "${1:-}" == "restart" ]]; then
  systemctl --user restart "$SERVICE_NAME"
  exit 0
elif [[ "${1:-}" == "start" ]]; then
  systemctl --user start "$SERVICE_NAME"
  exit 0
elif [[ "${1:-}" == "stop" ]]; then
  systemctl --user stop "$SERVICE_NAME"
  exit 0
elif [[ "${1:-}" == "status" ]]; then
  systemctl --user status "$SERVICE_NAME" --no-pager
  exit 0
elif [[ "${1:-}" == "logs" ]]; then
  tail -n 50 -f "$LOG_FILE"
  exit 0
fi

main
