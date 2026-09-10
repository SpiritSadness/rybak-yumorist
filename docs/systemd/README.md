# systemd

## Прод (VPS) — system unit

На сервере бот уже ставится как **system** service (`/etc/systemd/system/fishing-bot.service`), не user:

```ini
[Unit]
Description=Telegram bot «Рыбак Юморист»
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/fishing-bot
EnvironmentFile=/opt/fishing-bot/.env
ExecStart=/usr/bin/node bot.js
Restart=always
RestartSec=15
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now fishing-bot
systemctl restart fishing-bot
journalctl -u fishing-bot -f
```

Не запускай второй экземпляр на ноутбуке с тем же `BOT_TOKEN`.

## Legacy — user units (домашний ПК)

Файлы в этой папке — для лабораторного запуска через `systemctl --user`.  
Для текущего прода **не используй**: прод только на VPS.

```bash
mkdir -p ~/.config/systemd/user
cp docs/systemd/*.service docs/systemd/*.timer ~/.config/systemd/user/
# Отредактируй WorkingDirectory
systemctl --user daemon-reload
# Только если VPS бот остановлен:
# systemctl --user enable --now fishing-bot.service
```

| Файл | Назначение |
|------|------------|
| `fishing-bot.service` | Процесс бота |
| `fishing-bot-backup.timer` + `.service` | Ежедневный бэкап |
| `fishing-bot-backup-weekly.timer` + `.service` | Еженедельный бэкап |
| `fishing-bot-watchdog.timer` + `.service` | Watchdog |

Подробнее: [PRODUCTION.md](../../PRODUCTION.md)
