require('dotenv').config();

const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { getTelegramRequestStrategies, formatConnectionError } = require('./proxy');
const { isTelegramNotifyEnabled } = require('./notifyConfig');

const GROUPS_FILE = path.join(__dirname, '..', 'data', 'groups.json');
const CACHE_FILE = path.join(__dirname, '..', 'data', 'backup-notify.json');

function loadFallbackChatId() {
  try {
    const data = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf-8'));
    const active = Object.values(data.groups || {}).find((g) => g.active && g.addedBy);
    return active ? String(active.addedBy) : null;
  } catch {
    return null;
  }
}

function loadCachedChatId() {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    return data.chatId ? String(data.chatId) : null;
  } catch {
    return null;
  }
}

function saveCachedChatId(chatId, username) {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify({
      chatId: String(chatId),
      username: username || null,
      updatedAt: new Date().toISOString()
    }, null, 2),
    'utf-8'
  );
}

async function connectBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN не задан');

  for (const strategy of getTelegramRequestStrategies()) {
    try {
      const bot = new TelegramBot(token, { polling: false, request: strategy.request });
      await bot.getMe();
      return bot;
    } catch (error) {
      if (/401|Unauthorized/i.test(error?.message || '')) {
        throw new Error('BOT_TOKEN недействителен');
      }
    }
  }

  throw new Error('Не удалось подключиться к Telegram');
}

async function resolveNotifyChatId(bot) {
  if (process.env.BACKUP_NOTIFY_CHAT_ID) {
    return String(process.env.BACKUP_NOTIFY_CHAT_ID);
  }

  const rawUsername = process.env.BACKUP_NOTIFY_USERNAME;
  if (rawUsername) {
    const username = rawUsername.replace(/^@/, '');
    try {
      const chat = await bot.getChat(`@${username}`);
      if (chat?.id) {
        saveCachedChatId(chat.id, username);
        return String(chat.id);
      }
    } catch {
      // ignore
    }
  }

  return loadCachedChatId() || loadFallbackChatId();
}

async function sendTelegramNotify(text, { parseMode = 'HTML' } = {}) {
  if (!isTelegramNotifyEnabled()) {
    console.log('Telegram notify skipped (disabled or no recipient)');
    return null;
  }

  const bot = await connectBot();
  const chatId = await resolveNotifyChatId(bot);
  if (!chatId) {
    throw new Error('Не удалось определить chat_id для уведомлений');
  }

  await bot.sendMessage(chatId, text, {
    parse_mode: parseMode,
    disable_web_page_preview: true
  });

  return chatId;
}

module.exports = {
  connectBot,
  resolveNotifyChatId,
  sendTelegramNotify,
  formatConnectionError
};
