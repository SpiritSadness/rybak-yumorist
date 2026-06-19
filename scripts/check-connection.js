#!/usr/bin/env node
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const {
  getProxyUrl,
  getTelegramRequestStrategies,
  formatConnectionError
} = require('../utils/proxy');
const groupRegistry = require('../services/groupRegistry');
const groupService = require('../services/groupService');

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('❌ BOT_TOKEN не задан в .env');
  process.exit(1);
}

async function tryStrategy(name, requestOptions) {
  process.stdout.write(`→ ${name} ... `);
  try {
    const bot = new TelegramBot(token, { polling: false, request: requestOptions });
    const me = await bot.getMe();
    console.log(`✅ OK (@${me.username})`);
    return 'ok';
  } catch (error) {
    const message = error?.message || String(error);
    if (/401|Unauthorized/i.test(message)) {
      console.log('⚠️ Сеть работает, но BOT_TOKEN неверный (401)');
      console.log('   Получи новый токен у @BotFather → /mybots → API Token → Revoke');
      return 'token';
    }
    console.log(`❌ ${formatConnectionError(error)}`);
    return 'fail';
  }
}

async function checkGroups(requestOptions) {
  const bot = new TelegramBot(token, { polling: false, request: requestOptions });
  const legacyChatId = process.env.CHAT_ID;

  if (legacyChatId) {
    await groupRegistry.migrateLegacyGroup(bot, legacyChatId);
  }

  const groups = groupRegistry.getActiveGroups();
  console.log(`\nАктивных групп: ${groups.length}`);

  if (!groups.length) {
    console.log('ℹ️  Групп пока нет — добавьте @fishingHumorousBot в свою группу и нажмите /start');
    return;
  }

  for (const group of groups) {
    const status = await groupService.verifyGroup(bot, group.chatId);
    const title = group.title || status.title || group.chatId;
    console.log(`  • ${title}: ${status.line.replace(/<[^>]+>/g, '')}`);
  }
}

async function main() {
  console.log('Проверка подключения к Telegram API\n');
  console.log('Прокси из .env:', getProxyUrl() || '(не задан)');
  console.log('Happ VPN: убедись что VPN подключён (зелёная галочка в Happ)\n');

  const strategies = getTelegramRequestStrategies();
  let tokenError = false;

  for (const strategy of strategies) {
    const result = await tryStrategy(strategy.name, strategy.request);
    if (result === 'ok') {
      console.log(`\n✅ Рабочий способ: ${strategy.name}`);
      await checkGroups(strategy.request);
      return;
    }
    if (result === 'token') tokenError = true;
  }

  if (tokenError) {
    console.log('\n⚠️ Прокси/VPN настроен правильно, но токен бота недействителен.');
    console.log('Обнови BOT_TOKEN в .env и запусти снова.');
    process.exit(1);
  }

  console.log('\n❌ Ни один способ не сработал.');
  console.log('\nЧто делать:');
  console.log('1. HTTP-прокси в .env отвечает 407 — логин/пароль у провайдера просрочен.');
  console.log('   Получи новые данные и обнови HTTP_PROXY.');
  console.log('2. Если используешь Clash/V2Ray/VPN — укажи локальный SOCKS:');
  console.log('   SOCKS_PROXY=socks5://127.0.0.1:7890');
  console.log('3. Если Telegram открывается в браузере без VPN — добавь:');
  console.log('   USE_PROXY=false');
  process.exit(1);
}

main();
