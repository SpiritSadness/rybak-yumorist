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
systemctl --user restart fishing-bot.service
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

## Git / CI

```bash
node scripts/check-syntax.js
```
