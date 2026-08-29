# Если после смены сервера / отключения ПК сыпятся ошибки бэкапа или «бот не работает»

## Почему так

На Linux включены **systemd-таймеры**:
- бэкап в 03:00
- watchdog каждые ~3 мин

После переноса проекта или смены путей бэкап **падает** (новый `BACKUP_ROOT`, нет папки, мало места) — в Telegram уходит «бэкап не выполнен».

Watchdog шлёт «бот не работает», если `fishing-bot.service` не active (ПК выключен, сервис не подняли, другой путь в unit-файле).

## Быстро: выключить весь ops-мусор

На машине, где крутится бот:

```bash
cd /path/to/rybak-yumorist
git pull
bash scripts/ops-disable.sh
```

Это:
1. Останавливает таймеры бэкапа и watchdog
2. Пишет в `.env`: `BACKUP_ENABLED=false`, `WATCHDOG_ENABLED=false`, `TELEGRAM_NOTIFY_ENABLED=false`

**Сам бот не останавливается** — только алерты и бэкапы.

Или через меню: `./botctl.sh` → пункт **17**.

## Если бот сам не отвечает

```bash
./botctl.sh status          # или пункт 1
./botctl.sh restart         # пункт 4
./botctl.sh                 # пункт 11 — убить лишние процессы (409 Conflict)
npm run check:connection
```

Частые причины:
- **409 Conflict** — два `node bot.js` (systemd + ручной `npm start`)
- **Неверный путь** в `~/.config/systemd/user/fishing-bot.service` после переноса папки
- **BOT_TOKEN** / сеть / прокси

## Если бэкапы нужны снова

1. В `.env` задай `BACKUP_ROOT` (реальный путь с местом на диске)
2. `BACKUP_NOTIFY_USERNAME` или `BACKUP_NOTIFY_CHAT_ID`
3. `bash scripts/ops-enable.sh` или botctl → пункт **18**

## Флаги в .env

| Переменная | false = |
|------------|---------|
| `BACKUP_ENABLED` | не запускать бэкап (таймер может стучаться, но скрипт сразу выходит) |
| `WATCHDOG_ENABLED` | не проверять сервис и не слать алерты |
| `TELEGRAM_NOTIFY_ENABLED` | не слать в Telegram отчёты бэкапа/watchdog |

Можно отключить только уведомления, оставив бэкап локально: `TELEGRAM_NOTIFY_ENABLED=false`.
