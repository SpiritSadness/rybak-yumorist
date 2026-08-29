const database = require('./database');
const { withTimeout } = require('../utils/withTimeout');

function isGroupChatId(chatId) {
  const id = Number(chatId);
  return Number.isFinite(id) && id < 0;
}

function registerGroup({ chatId, title = '', addedBy = null, active = true }) {
  const key = String(chatId);
  const existing = database.getGroup(key) || {};

  const group = {
    chatId: key,
    title: title || existing.title || '',
    addedBy: addedBy ?? existing.addedBy ?? null,
    active,
    addedAt: existing.addedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  database.upsertGroup(group);
  return group;
}

function deactivateGroup(chatId) {
  const key = String(chatId);
  const existing = database.getGroup(key);
  if (!existing) return null;
  if (!existing.active) return existing;
  database.setGroupActive(key, false);
  return { ...existing, active: false, updatedAt: new Date().toISOString() };
}

function getGroup(chatId) {
  return database.getGroup(String(chatId));
}

function getActiveGroups() {
  return database.getActiveGroups();
}

function resolveTargetGroupId(queryChatId) {
  return isGroupChatId(queryChatId) ? String(queryChatId) : null;
}

async function ensureRegistered(bot, chatId, addedBy = null) {
  if (!isGroupChatId(chatId)) return null;

  const key = String(chatId);
  const cached = getGroup(key);
  if (cached?.active) return cached;

  let title = cached?.title || '';

  try {
    const chat = await withTimeout(bot.getChat(key), 5000, 'getChat');
    title = chat.title || title;
  } catch {
    // keep cached title
  }

  return registerGroup({ chatId: key, title, addedBy, active: true });
}

async function migrateLegacyGroup(bot, legacyChatId) {
  if (!legacyChatId || !isGroupChatId(legacyChatId)) return;

  let title = 'Группа';
  try {
    const chat = await bot.getChat(legacyChatId);
    title = chat.title || title;
  } catch {
    // ignore
  }

  registerGroup({ chatId: legacyChatId, title, addedBy: null, active: true });
}

module.exports = {
  isGroupChatId,
  registerGroup,
  deactivateGroup,
  getGroup,
  getActiveGroups,
  resolveTargetGroupId,
  ensureRegistered,
  migrateLegacyGroup
};
