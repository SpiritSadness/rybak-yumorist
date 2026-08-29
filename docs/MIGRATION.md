# Миграция после обновления (cleanup)

Если бот уже работал на сервере до коммита с обезличиванием путей:

## 1. Обновить код

```bash
cd ~/rybak-yumorist   # ваш каталог
git pull
npm install
npm run check:syntax
npm run test:critical
```

## 2. Дополнить `.env`

Добавьте (если ещё нет):

```env
HTTP_PROXY=http://user:pass@host:port
TELEGRAM_RECONNECT_MS=60000
TELEGRAM_POLL_STALE_MS=30000
TELEGRAM_STARTUP_RETRY_MS=15000
BACKUP_ROOT=/path/to/backups/rybak-yumorist
BACKUP_NOTIFY_USERNAME=your_telegram_username
# или
# BACKUP_NOTIFY_CHAT_ID=123456789
```

Раньше пути могли быть захардкожены в `scripts/backup.sh` — теперь только через env.

## 3. Перезапуск

```bash
systemctl --user restart fishing-bot.service
systemctl --user restart fishing-bot-backup.timer
systemctl --user restart fishing-bot-watchdog.timer
```

## 4. Проверка бэкапа

```bash
npm run backup:verify
```

## 5. systemd (опционально)

Примеры unit-файлов: [docs/systemd/README.md](./systemd/README.md)
