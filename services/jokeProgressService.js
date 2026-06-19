const fs = require('fs');
const path = require('path');
const jokeRepo = require('./jokeRepo');

const PROGRESS_FILE = path.join(__dirname, '..', 'data', 'screen-joke-progress.json');
const MAX_SCREENS = 500;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function ensureFile() {
  const dir = path.dirname(PROGRESS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(PROGRESS_FILE)) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ screens: {} }, null, 2), 'utf-8');
  }
}

function readDb() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch {
    return { screens: {} };
  }
}

function writeDb(db) {
  ensureFile();
  const now = Date.now();
  const screens = db.screens || {};
  const entries = Object.entries(screens).filter(([, value]) => {
    const ts = Date.parse(value?.updatedAt || 0);
    return Number.isFinite(ts) && (now - ts) < MAX_AGE_MS;
  });

  entries.sort((a, b) => Date.parse(b[1].updatedAt) - Date.parse(a[1].updatedAt));
  db.screens = Object.fromEntries(entries.slice(0, MAX_SCREENS));
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function screenKey(chatId, messageId) {
  if (!chatId || !messageId) return null;
  return `${chatId}:${messageId}`;
}

function getPoolState() {
  const jokeOfDay = jokeRepo.getJokeOfDayMeta()?.joke;
  const exclude = jokeOfDay?.id ? [jokeOfDay.id] : [];
  const poolIds = jokeRepo.getPoolJokeIds(exclude);
  return { poolIds, total: poolIds.length };
}

function getSeenIds(key, poolIds) {
  if (!key) return [];
  const poolSet = new Set(poolIds);
  const seen = readDb().screens[key]?.seenIds || [];
  return seen.filter((id) => poolSet.has(id));
}

function saveSeenIds(key, seenIds) {
  if (!key) return;
  const db = readDb();
  db.screens[key] = {
    seenIds,
    updatedAt: new Date().toISOString()
  };
  writeDb(db);
}

function peekProgress(chatId, messageId) {
  const key = screenKey(chatId, messageId);
  const { poolIds, total } = getPoolState();

  if (!key || !total) {
    return { remaining: null, total: total || jokeRepo.getCount() };
  }

  const seenIds = getSeenIds(key, poolIds);
  const remaining = Math.max(0, total - seenIds.length);
  return { remaining, total };
}

function getNextJokeForScreen(chatId, messageId) {
  const key = screenKey(chatId, messageId);
  const { poolIds, total } = getPoolState();

  if (!total) {
    return { joke: null, remaining: null, total: 0 };
  }

  if (!key) {
    const joke = jokeRepo.getRandomJoke();
    return { joke, remaining: null, total };
  }

  let seenIds = getSeenIds(key, poolIds);
  let unseenIds = poolIds.filter((id) => !seenIds.includes(id));

  if (!unseenIds.length) {
    seenIds = [];
    unseenIds = [...poolIds];
  }

  const pickedId = unseenIds[Math.floor(Math.random() * unseenIds.length)];
  seenIds.push(pickedId);
  saveSeenIds(key, seenIds);

  const remaining = Math.max(0, total - seenIds.length);
  const joke = jokeRepo.getJokeById(pickedId);

  return { joke, remaining, total };
}

module.exports = {
  screenKey,
  getPoolState,
  peekProgress,
  getNextJokeForScreen
};
