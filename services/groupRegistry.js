const fs = require('fs');
const path = require('path');
const database = require('./database');

const DB_FILE = path.join(__dirname, '..', 'data', 'groups.json');

function ensureDb() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ groups: {} }, null, 2), 'utf-8');
  }
}

function readDb() {
  ensureDb();
  database.init();
  return { groups: database.getAllGroupsMap() };
}

function writeDb(db) {
  ensureDb();
  database.init();
  for (const group of Object.values(db.groups || {})) {
    database.upsertGroup(group);
  }
}

function isGroupChatId(chatId) {
  const id = Number(chatId);
  return Number.isFinite(id) && id < 0;
}

function registerGroup({ chatId, title = '', addedBy = null, active = true }) {
  const key = String(chatId);
  const db = readDb();
  const existing = db.groups[key] || {};

  db.groups[key] = {
    chatId: key,
    title: title || existing.title || '',
    addedBy: addedBy ?? existing.addedBy ?? null,
    active,
    addedAt: existing.addedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  writeDb(db);
  return db.groups[key];
}

function deactivateGroup(chatId) {
  const key = String(chatId);
  const db = readDb();
  if (!db.groups[key]) return null;

  db.groups[key].active = false;
  db.groups[key].updatedAt = new Date().toISOString();
  writeDb(db);
  return db.groups[key];
}

function getGroup(chatId) {
  return readDb().groups[String(chatId)] || null;
}

function getActiveGroups() {
  return Object.values(readDb().groups).filter((group) => group.active);
}

function resolveTargetGroupId(queryChatId) {
  return isGroupChatId(queryChatId) ? String(queryChatId) : null;
}

async function ensureRegistered(bot, chatId, addedBy = null) {
  if (!isGroupChatId(chatId)) return null;

  const key = String(chatId);
  let title = getGroup(key)?.title || '';

  try {
    const chat = await bot.getChat(key);
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
