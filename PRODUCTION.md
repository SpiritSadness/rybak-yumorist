# Production — Рыбак Юморист

Чеклист для эксплуатации бота на Linux (systemd user).

## Сервисы systemd (user)

| Юнит | Назначение |
|------|------------|
| `fishing-bot.service` | Основной процесс бота |
| `fishing-bot-backup.timer` | Ежедневный бэкап |
| `fishing-bot-backup-weekly.timer` | Еженедельный полный бэкап |
| `fishing-bot-watchdog.timer` | Проверка процесса, алерт в Telegram |

Включить watchdog (один раз):

```bash
systemctl --user enable --now fishing-bot-watchdog.timer
```

Автозапуск без GUI:

```bash
loginctl enable-linger "$USER"
```

## Управление

- Панель: `./botctl.sh`
- Не запускай `npm start` параллельно с systemd — будет конфликт 409
- Перезапуск: `./botctl.sh restart`
- После правок перед рестартом: `npm run check:syntax && npm run test:critical`

## Данные

- SQLite: `data/bot.db`
- JSON-снимки в `data/` для бэкапов
- Состояние планировщика: `data/scheduler-state.json`

## Бэкапы

По умолчанию корень: `~/backups/rybak-yumorist`  
Переопределение: `BACKUP_ROOT=/path` в окружении / `.env`.

Зеркало (опционально): `BACKUP_MIRROR_PATH=/path`

Отчёты в Telegram: задай `BACKUP_NOTIFY_USERNAME` или `BACKUP_NOTIFY_CHAT_ID`.

```bash
npm run backup:verify
```

## Мониторинг

Watchdog шлёт алерт получателю из `BACKUP_NOTIFY_*`, если сервис не active.  
Повтор не чаще чем раз в 30 мин (`WATCHDOG_COOLDOWN_MS`).

## Обновление кода

```bash
cd /path/to/rybak-yumorist
git pull
npm install
npm run check:syntax
npm run test:critical
systemctl --user restart fishing-bot.service
journalctl --user -u fishing-bot.service -n 50 --no-pager
```

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `BOT_TOKEN` | Токен Telegram-бота |
| `BACKUP_NOTIFY_USERNAME` | Кому слать отчёты |
| `BACKUP_NOTIFY_CHAT_ID` | Или числовой chat id |
| `BACKUP_ROOT` | Корень бэкапов |
| `BACKUP_MIRROR_PATH` | Зеркало бэкапов |
| `WATCHDOG_COOLDOWN_MS` | Интервал между алертами |
| `HTTP_PROXY` | HTTP-прокси для Telegram/API |
| `TELEGRAM_RECONNECT_MS` | Интервал reconnect health-check |
| `TELEGRAM_POLL_STALE_MS` | Когда polling считается зависшим |
| `TELEGRAM_STARTUP_RETRY_MS` | Задержка между retry на старте |
| `SCHEDULE_CATCHUP_MINUTES` | Окно догоняющей рассылки |
| `SCHEDULE_QUIET_AFTER_HOUR` | После какого часа не догонять дневные слоты |
| `SCHEDULE_BACKFILL` | Включать ли backfill при старте |
| `OUTBOX_RETRY_MS` | Интервал retry очереди исходящих |

## Git / CI

```bash
node scripts/check-syntax.js
node scripts/test-critical.js
```

Примеры systemd: [docs/systemd/README.md](./docs/systemd/README.md)  
Миграция после обновления: [docs/MIGRATION.md](./docs/MIGRATION.md)
