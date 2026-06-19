const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { cleanJokeText } = require('../utils/jokeText');
const {
  validateJoke,
  isBadJokeText,
  isFishingText,
  isValidStoredJoke
} = require('./jokeFilter');
const database = require('./database');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DB_DIR, 'jokes.json');
const VOTES_FILE = path.join(DB_DIR, 'user-votes.json');
const JOKE_OF_DAY_FILE = path.join(DB_DIR, 'joke-of-day.json');

const JOKE_OF_DAY_CACHE_MS = 24 * 60 * 60 * 1000;

function ensureDb() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ jokes: [] }, null, 2), 'utf-8');
}

function normalizeText(text) {
  return cleanJokeText(text);
}

function hashText(text) {
  const normalized = normalizeText(text).toLowerCase();
  return crypto.createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

function readDb() {
  ensureDb();
  database.init();
  return {
    jokes: database.getAllJokes().map((j) => ({
      ...j,
      likes: Number.isFinite(j.likes) ? j.likes : 0,
      dislikes: Number.isFinite(j.dislikes) ? j.dislikes : 0
    }))
  };
}

function writeDb(db) {
  ensureDb();
  database.init();
  database.replaceAllJokes(db.jokes || []);
}

function buildJokeRecord(id, text, source, prevVotes = null) {
  return {
    id,
    text,
    source: source || 'unknown',
    contentType: 'joke',
    textHash: hashText(text),
    sentCount: 0,
    lastSentAt: null,
    likes: prevVotes?.likes || 0,
    dislikes: prevVotes?.dislikes || 0
  };
}

async function upsertJokes({ jokes, source }) {
  return { inserted: await importValidatedJokes(jokes, source) };
}

async function importValidatedJokes(jokes, source = 'web') {
  const db = readDb();
  const known = new Set(db.jokes.map((j) => j.textHash));
  let inserted = 0;
  let nextId = db.jokes.length ? Math.max(...db.jokes.map((x) => x.id)) + 1 : 1;

  for (const raw of jokes || []) {
    const validation = validateJoke(typeof raw === 'string' ? raw : raw?.text);
    if (!validation.ok) continue;
    const h = hashText(validation.text);
    if (known.has(h)) continue;
    known.add(h);
    db.jokes.push(buildJokeRecord(nextId, validation.text, source));
    nextId += 1;
    inserted += 1;
  }

  writeDb(db);
  return inserted;
}

function replaceAllJokes(texts, { source = 'rebuild' } = {}) {
  const oldDb = readDb();
  const votesByHash = new Map();

  for (const joke of oldDb.jokes) {
    if (!joke.textHash) continue;
    if ((joke.likes || 0) + (joke.dislikes || 0) > 0) {
      votesByHash.set(joke.textHash, { likes: joke.likes || 0, dislikes: joke.dislikes || 0 });
    }
  }

  const jokes = [];
  const seen = new Set();
  let id = 1;

  for (const raw of texts || []) {
    const validation = validateJoke(raw);
    if (!validation.ok) continue;
    const h = hashText(validation.text);
    if (seen.has(h)) continue;
    seen.add(h);
    jokes.push(buildJokeRecord(id, validation.text, source, votesByHash.get(h)));
    id += 1;
  }

  writeDb({ jokes });
  saveJokeOfDayState(null);

  return {
    stored: jokes.length,
    votesPreserved: jokes.filter((j) => (j.likes || 0) + (j.dislikes || 0) > 0).length
  };
}

function getValidJokes(excludeIds = []) {
  const exclude = new Set(excludeIds.filter(Boolean));
  return readDb().jokes.filter((j) => isValidStoredJoke(j) && !exclude.has(j.id));
}

function getPoolJokeIds(excludeIds = []) {
  return getValidJokes(excludeIds).map((j) => j.id);
}

function pickRotatedJoke(excludeIds = []) {
  const jokeOfDay = getJokeOfTheDayInternal();
  const exclude = [...excludeIds, jokeOfDay?.id].filter(Boolean);
  const candidates = getValidJokes(exclude);
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const sentDiff = (a.sentCount || 0) - (b.sentCount || 0);
    if (sentDiff !== 0) return sentDiff;
    const aTime = a.lastSentAt ? new Date(a.lastSentAt).getTime() : 0;
    const bTime = b.lastSentAt ? new Date(b.lastSentAt).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.id - b.id;
  });

  const poolSize = Math.max(1, Math.ceil(candidates.length * 0.25));
  const pool = candidates.slice(0, poolSize);
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickNextJoke({ minDaysSinceSent = 30 } = {}) {
  const now = Date.now();
  const threshold = now - minDaysSinceSent * 24 * 60 * 60 * 1000;

  const candidates = getValidJokes()
    .filter((j) => !j.lastSentAt || new Date(j.lastSentAt).getTime() < threshold)
    .sort((a, b) => (a.sentCount - b.sentCount) || (a.id - b.id));

  return candidates[0] || pickRotatedJoke([]);
}

function sanitizeRepo({ limit = Infinity } = {}) {
  const db = readDb();
  const before = db.jokes.length;
  const seen = new Set();

  db.jokes = (db.jokes || [])
    .map((j) => {
      const validation = validateJoke(j.text);
      if (!validation.ok) return null;
      return { ...j, text: validation.text, textHash: hashText(validation.text) };
    })
    .filter(Boolean)
    .filter((j) => {
      if (seen.has(j.textHash)) return false;
      seen.add(j.textHash);
      return true;
    })
    .slice(0, limit);

  const after = db.jokes.length;
  writeDb(db);
  return { before, after, removed: before - after };
}

async function markSent(jokeId) {
  const db = readDb();
  const idx = db.jokes.findIndex((j) => j.id === jokeId);
  if (idx === -1) return false;
  db.jokes[idx].sentCount += 1;
  db.jokes[idx].lastSentAt = new Date().toISOString();
  writeDb(db);
  return true;
}

function getAllJokes() {
  return readDb().jokes || [];
}

function getRandomJoke() {
  return pickRotatedJoke([]);
}

function getCount() {
  return getValidJokes().length;
}

function getVoteScore(joke) {
  return (joke?.likes || 0) - (joke?.dislikes || 0);
}

function getJokeById(jokeId) {
  return readDb().jokes.find((j) => j.id === jokeId) || null;
}

function loadJokeOfDayState() {
  ensureDb();
  if (!fs.existsSync(JOKE_OF_DAY_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(JOKE_OF_DAY_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function saveJokeOfDayState(state) {
  ensureDb();
  if (!state) {
    if (fs.existsSync(JOKE_OF_DAY_FILE)) fs.unlinkSync(JOKE_OF_DAY_FILE);
    return;
  }
  fs.writeFileSync(JOKE_OF_DAY_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function getJokeOfTheDayInternal() {
  const now = Date.now();
  const state = loadJokeOfDayState();

  if (state?.jokeId && state?.selectedAt && (now - state.selectedAt) < JOKE_OF_DAY_CACHE_MS) {
    const cached = getJokeById(state.jokeId);
    if (cached && isValidStoredJoke(cached)) return cached;
  } else if (state?.jokeId && state?.selectedAt && (now - state.selectedAt) >= JOKE_OF_DAY_CACHE_MS) {
    saveJokeOfDayState(null);
  }

  const candidates = getValidJokes();
  if (!candidates.length) return null;

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  saveJokeOfDayState({ jokeId: selected.id, selectedAt: now });
  return selected;
}

function getJokeOfDayMeta() {
  const now = Date.now();
  const joke = getJokeOfTheDayInternal();
  if (!joke) return null;

  const state = loadJokeOfDayState();
  const selectedAt = state?.selectedAt || now;
  const expiresAt = selectedAt + JOKE_OF_DAY_CACHE_MS;
  const remainingMs = Math.max(0, expiresAt - now);

  return { joke, selectedAt, expiresAt, remainingMs };
}

function getJokeOfTheDay() {
  return getJokeOfTheDayInternal();
}

function getRandomJokeExcluding(jokeId) {
  return pickRotatedJoke([jokeId]);
}

function getTopJokes(limit = 10) {
  return getValidJokes()
    .sort((a, b) => b.sentCount - a.sentCount || a.id - b.id)
    .slice(0, limit);
}

function likeJoke(jokeId) {
  const db = readDb();
  const idx = db.jokes.findIndex((j) => j.id === jokeId);
  if (idx === -1) return false;
  db.jokes[idx].likes = (db.jokes[idx].likes || 0) + 1;
  writeDb(db);
  return true;
}

function dislikeJoke(jokeId) {
  const db = readDb();
  const idx = db.jokes.findIndex((j) => j.id === jokeId);
  if (idx === -1) return false;
  db.jokes[idx].dislikes = (db.jokes[idx].dislikes || 0) + 1;
  writeDb(db);
  return true;
}

function getTopJokesByLikes(limit = 5, excludeJokeId = null) {
  return getValidJokes([excludeJokeId].filter(Boolean))
    .filter((j) => (j.likes || 0) > 0 || (j.dislikes || 0) > 0)
    .sort((a, b) => {
      const scoreDiff = getVoteScore(b) - getVoteScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      const likesDiff = (b.likes || 0) - (a.likes || 0);
      if (likesDiff !== 0) return likesDiff;
      const dislikesDiff = (a.dislikes || 0) - (b.dislikes || 0);
      if (dislikesDiff !== 0) return dislikesDiff;
      return a.id - b.id;
    })
    .slice(0, limit);
}

function getBottomJokesWithDislikes(limit = 1) {
  return getValidJokes()
    .filter((j) => (j.dislikes || 0) > 0)
    .sort((a, b) => getVoteScore(a) - getVoteScore(b))
    .slice(0, limit);
}

function getTop5Jokes() {
  return getTopJokesByLikes(5);
}

const userVotes = loadUserVotes();

function loadUserVotes() {
  ensureDb();
  database.init();
  return database.loadUserVotesMap();
}

function saveUserVotes() {
  ensureDb();
  database.init();
  database.saveUserVotesMap(userVotes);
}

function resetAllVotes() {
  const db = readDb();
  db.jokes.forEach((j) => {
    j.likes = 0;
    j.dislikes = 0;
  });
  writeDb(db);
  userVotes.clear();
  saveUserVotes();
}

function hasUserVoted(userId, jokeId) {
  return userVotes.has(`${userId}_${jokeId}`);
}

function markUserVoted(userId, jokeId, voteType) {
  userVotes.set(`${userId}_${jokeId}`, voteType);
  saveUserVotes();
}

function getUserVote(userId, jokeId) {
  return userVotes.get(`${userId}_${jokeId}`);
}

function removeUserVote(userId, jokeId) {
  userVotes.delete(`${userId}_${jokeId}`);
  saveUserVotes();
}

function removeLike(jokeId) {
  const db = readDb();
  const idx = db.jokes.findIndex((j) => j.id === jokeId);
  if (idx === -1) return false;
  db.jokes[idx].likes = Math.max(0, (db.jokes[idx].likes || 0) - 1);
  writeDb(db);
  return true;
}

function removeDislike(jokeId) {
  const db = readDb();
  const idx = db.jokes.findIndex((j) => j.id === jokeId);
  if (idx === -1) return false;
  db.jokes[idx].dislikes = Math.max(0, (db.jokes[idx].dislikes || 0) - 1);
  writeDb(db);
  return true;
}

function changeVote(jokeId, fromVote, toVote) {
  const db = readDb();
  const idx = db.jokes.findIndex((j) => j.id === jokeId);
  if (idx === -1) return false;

  if (fromVote === 'like') db.jokes[idx].likes = Math.max(0, (db.jokes[idx].likes || 0) - 1);
  else if (fromVote === 'dislike') db.jokes[idx].dislikes = Math.max(0, (db.jokes[idx].dislikes || 0) - 1);

  if (toVote === 'like') db.jokes[idx].likes = (db.jokes[idx].likes || 0) + 1;
  else if (toVote === 'dislike') db.jokes[idx].dislikes = (db.jokes[idx].dislikes || 0) + 1;

  writeDb(db);
  return true;
}

module.exports = {
  normalizeText,
  hashText,
  upsertJokes,
  importValidatedJokes,
  replaceAllJokes,
  pickNextJoke,
  getRandomJoke,
  getRandomJokeExcluding,
  getJokeById,
  getVoteScore,
  markSent,
  sanitizeRepo,
  isFishingText,
  isBadJokeText,
  isValidStoredJoke,
  getAllJokes,
  getCount,
  getPoolJokeIds,
  getTopJokes,
  getTop5Jokes,
  getTopJokesByLikes,
  getBottomJokesWithDislikes,
  getJokeOfTheDay,
  getJokeOfDayMeta,
  likeJoke,
  dislikeJoke,
  resetAllVotes,
  hasUserVoted,
  markUserVoted,
  getUserVote,
  removeUserVote,
  removeLike,
  removeDislike,
  changeVote
};
