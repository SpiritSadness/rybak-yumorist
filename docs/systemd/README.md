# systemd (user units)

Примеры unit-файлов для Linux. Пути — плейсхолдеры: замени `%h/rybak-yumorist` на свой каталог проекта.

## Установка

```bash
mkdir -p ~/.config/systemd/user
cp docs/systemd/*.service docs/systemd/*.timer ~/.config/systemd/user/
# Отредактируй WorkingDirectory и пути в .service при необходимости
systemctl --user daemon-reload
systemctl --user enable --now fishing-bot.service
systemctl --user enable --now fishing-bot-backup.timer
systemctl --user enable --now fishing-bot-backup-weekly.timer
systemctl --user enable --now fishing-bot-watchdog.timer
loginctl enable-linger "$USER"
```

После установки или обновления:

```bash
npm run check:syntax
npm run test:critical
systemctl --user restart fishing-bot.service
```

## Файлы

| Файл | Назначение |
|------|------------|
| `fishing-bot.service` | Основной процесс бота |
| `fishing-bot-backup.timer` + `.service` | Ежедневный бэкап 03:00 |
| `fishing-bot-backup-weekly.timer` + `.service` | Еженедельный бэкап воскресенье 03:15 |
| `fishing-bot-watchdog.timer` + `.service` | Проверка каждые ~3 мин |

Подробнее: [PRODUCTION.md](../PRODUCTION.md)
