#!/usr/bin/env node
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { getTelegramRequestStrategies, formatConnectionError } = require('../utils/proxy');
const { syncBotCommands, listBotCommands } = require('../utils/botCommands');

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('❌ BOT_TOKEN не задан в .env');
  process.exit(1);
}

async function main() {
  console.log('Обновление списка команд бота…\n');

  for (const strategy of getTelegramRequestStrategies()) {
    try {
      const bot = new TelegramBot(token, { polling: false, request: strategy.request });
      const me = await bot.getMe();
      console.log(`Подключено: ${strategy.name} (@${me.username})\n`);

      await syncBotCommands(bot, (level, ...args) => {
        const prefix = level === 'warn' ? '⚠️' : '✅';
        console.log(prefix, ...args);
      });

      console.log('\nТекущие команды в Telegram:');
      const listed = await listBotCommands(bot);
      if (!listed.length) {
        console.log('  (пусто — только /start и /help должны появиться в чате)');
      } else {
        for (const item of listed) {
          console.log(`\n  [${item.scope}, ${item.language}]`);
          item.commands.forEach((line) => console.log(`    ${line}`));
        }
      }

      console.log('\n✅ Готово. Перезайдите в чат с ботом, если подсказки не обновились сразу.');
      return;
    } catch (error) {
      console.log(`→ ${strategy.name}: ${formatConnectionError(error)}`);
    }
  }

  console.error('\n❌ Не удалось подключиться к Telegram. Проверьте VPN (Happ) и BOT_TOKEN.');
  process.exit(1);
}

main();
