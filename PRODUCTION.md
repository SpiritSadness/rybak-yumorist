# Production — Рыбак Юморист

Краткий чеклист для эксплуатации бота на домашнем ПК.

## Сервисы systemd (user)

| Юнит | Назначение |
|------|------------|
| `fishing-bot.service` | Основной процесс бота |
| `fishing-bot-backup.timer` | Ежедневный бэкап в 03:00 |
| `fishing-bot-backup-weekly.timer` | Полный бэкап по воскресеньям 03:15 |
| `fishing-bot-watchdog.timer` | Проверка каждые 3 мин, алерт в Telegram если бот упал |

Включить watchdog (один раз):

```bash
systemctl --user enable --now fishing-bot-watchdog.timer
```

Автозапуск при входе без GUI:

```bash
loginctl enable-linger "$USER"
```

## Управление

- **Панель:** `./botctl.sh` или ярлык «Рыбак Юморист — управление»
- **Не запускай** `npm start` вручную — будет конфликт 409 с systemd
- Перезапуск: `./botctl.sh restart` или пункт 4 в меню

## Данные

- **SQLite:** `data/bot.db` — основное хранилище (анекдоты, группы, голоса)
- JSON в `data/` синхронизируется автоматически для бэкапов и чтения
- Состояние планировщика: `data/scheduler-state.json`

## Бэкапы

- Локально: `~/PC/4/backups/{daily,weekly,monthly,data}`
- Зеркало (offsite на том же ПК / другой диск): `~/Backups/rybak-yumorist`  
  Переопределить: `BACKUP_MIRROR_PATH=/path` в `.env`
- Отчёты в Telegram: `BACKUP_NOTIFY_USERNAME=andrey720p`

Проверка последнего архива:

```bash
npm run backup:verify
```

## Мониторинг

- Watchdog шлёт алерт @andrey720p если `fishing-bot.service` не active
- Повторный алерт не чаще чем раз в 30 мин (`WATCHDOG_COOLDOWN_MS`)
- При восстановлении — сообщение «Бот снова работает»

## Обновление кода

```bash
cd ~/PC/4/fishing-bot-new
npm install
systemctl --user restart fishing-bot.service
```

## Переменные окружения (.env)

| Переменная | Описание |
|------------|----------|
| `BOT_TOKEN` | Токен Telegram-бота |
| `BACKUP_NOTIFY_USERNAME` | Кому слать отчёты бэкапа и watchdog |
| `BACKUP_MIRROR_PATH` | Путь зеркала бэкапов (опционально) |
| `WATCHDOG_COOLDOWN_MS` | Интервал между алертами (мс) |

## Git / CI

Репозиторий с GitHub Actions: синтаксическая проверка всех `.js` при push/PR.

```bash
node scripts/check-syntax.js
```
