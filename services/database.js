const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const logger = require('../utils/logger');

const DATA_DIR = process.env.BOT_DATA_DIR
  ? path.resolve(process.env.BOT_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_PATH = process.env.BOT_DB_PATH
  ? path.resolve(process.env.BOT_DB_PATH)
  : path.join(DATA_DIR, 'bot.db');

let db = null;
let enabled = false;
let snapshotTimer = null;
const SNAPSHOT_DEBOUNCE_MS = 1000;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function mapJokeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    text: row.text,
    source: row.source,
    contentType: row.content_type,
    textHash: row.text_hash,
    sentCount: row.sent_count,
    lastSentAt: row.last_sent_at,
    likes: row.likes,
    dislikes: row.dislikes
  };
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jokes (
      id INTEGER PRIMARY KEY,
      text TEXT NOT NULL,
      source TEXT,
      content_type TEXT DEFAULT 'joke',
      text_hash TEXT UNIQUE,
      sent_count INTEGER DEFAULT 0,
      last_sent_at TEXT,
      likes INTEGER DEFAULT 0,
      dislikes INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS groups (
      chat_id TEXT PRIMARY KEY,
      title TEXT,
      added_by INTEGER,
      active INTEGER DEFAULT 1,
      added_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS user_votes (
      user_id INTEGER NOT NULL,
      joke_id INTEGER NOT NULL,
      vote_type TEXT NOT NULL,
      PRIMARY KEY (user_id, joke_id)
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jokes_hash ON jokes(text_hash);
  `);
  db.pragma('journal_mode = WAL');
}

function importJsonIfNeeded() {
  const jokesFile = path.join(DATA_DIR, 'jokes.json');
  const groupsFile = path.join(DATA_DIR, 'groups.json');
  const votesFile = path.join(DATA_DIR, 'user-votes.json');
  const migrated = db.prepare('SELECT value FROM meta WHERE key = ?').get('migratedFromJson');

  if (migrated?.value === '1') return;

  logger.info('SQLite: migrating data from JSON files...');

  const insertJoke = db.prepare(`
    INSERT OR IGNORE INTO jokes
    (id, text, source, content_type, text_hash, sent_count, last_sent_at, likes, dislikes)
    VALUES (@id, @text, @source, @contentType, @textHash, @sentCount, @lastSentAt, @likes, @dislikes)
  `);

  if (fs.existsSync(jokesFile)) {
    const raw = JSON.parse(fs.readFileSync(jokesFile, 'utf-8'));
    const tx = db.transaction((jokes) => {
      for (const j of jokes || []) {
        insertJoke.run({
          id: j.id,
          text: j.text,
          source: j.source || 'unknown',
          contentType: j.contentType || 'joke',
          textHash: j.textHash,
          sentCount: j.sentCount || 0,
          lastSentAt: j.lastSentAt || null,
          likes: j.likes || 0,
          dislikes: j.dislikes || 0
        });
      }
    });
    tx(raw.jokes || []);
  }

  const insertGroup = db.prepare(`
    INSERT OR REPLACE INTO groups (chat_id, title, added_by, active, added_at, updated_at)
    VALUES (@chatId, @title, @addedBy, @active, @addedAt, @updatedAt)
  `);

  if (fs.existsSync(groupsFile)) {
    const raw = JSON.parse(fs.readFileSync(groupsFile, 'utf-8'));
    const tx = db.transaction((groups) => {
      for (const g of Object.values(groups || {})) {
        insertGroup.run({
          chatId: String(g.chatId),
          title: g.title || '',
          addedBy: g.addedBy ?? null,
          active: g.active ? 1 : 0,
          addedAt: g.addedAt || new Date().toISOString(),
          updatedAt: g.updatedAt || new Date().toISOString()
        });
      }
    });
    tx(raw.groups || {});
  }

  const insertVote = db.prepare(`
    INSERT OR REPLACE INTO user_votes (user_id, joke_id, vote_type) VALUES (?, ?, ?)
  `);

  if (fs.existsSync(votesFile)) {
    const raw = JSON.parse(fs.readFileSync(votesFile, 'utf-8'));
    const tx = db.transaction((entries) => {
      for (const [key, voteType] of Object.entries(entries)) {
        const [userId, jokeId] = key.split('_');
        if (!userId || !jokeId) continue;
        insertVote.run(Number(userId), Number(jokeId), voteType);
      }
    });
    tx(raw);
  }

  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('migratedFromJson', '1');
  logger.info('SQLite: migration complete');
}

function init() {
  if (db) return db;

  ensureDataDir();
  db = new Database(DB_PATH);
  createSchema();
  importJsonIfNeeded();
  enabled = true;
  return db;
}

function isEnabled() {
  if (!db) init();
  return enabled;
}

function getAllJokes() {
  init();
  return db.prepare('SELECT * FROM jokes ORDER BY id ASC').all().map(mapJokeRow);
}

function loadUserVotesMap() {
  init();
  const rows = db.prepare('SELECT user_id, joke_id, vote_type FROM user_votes').all();
  const map = new Map();
  for (const row of rows) {
    map.set(`${row.user_id}_${row.joke_id}`, row.vote_type);
  }
  return map;
}

function exportJsonSnapshots() {
  const jokesFile = path.join(DATA_DIR, 'jokes.json');
  const groupsFile = path.join(DATA_DIR, 'groups.json');
  const votesFile = path.join(DATA_DIR, 'user-votes.json');

  fs.writeFileSync(jokesFile, JSON.stringify({ jokes: getAllJokes() }, null, 2), 'utf-8');
  fs.writeFileSync(groupsFile, JSON.stringify({ groups: getAllGroupsMap() }, null, 2), 'utf-8');
  fs.writeFileSync(votesFile, JSON.stringify(Object.fromEntries(loadUserVotesMap().entries()), null, 2), 'utf-8');
}

function scheduleJsonSnapshots() {
  if (snapshotTimer) return;
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    try {
      exportJsonSnapshots();
    } catch (error) {
      logger.warn('SQLite snapshot export failed:', error.message);
    }
  }, SNAPSHOT_DEBOUNCE_MS);
  if (typeof snapshotTimer.unref === 'function') snapshotTimer.unref();
}

function flushJsonSnapshots() {
  if (snapshotTimer) {
    clearTimeout(snapshotTimer);
    snapshotTimer = null;
  }
  exportJsonSnapshots();
}

function replaceAllJokes(jokes) {
  init();
  const tx = db.transaction((items) => {
    db.prepare('DELETE FROM jokes').run();
    const insert = db.prepare(`
      INSERT INTO jokes
      (id, text, source, content_type, text_hash, sent_count, last_sent_at, likes, dislikes)
      VALUES (@id, @text, @source, @contentType, @textHash, @sentCount, @lastSentAt, @likes, @dislikes)
    `);
    for (const j of items) {
      insert.run({
        id: j.id,
        text: j.text,
        source: j.source || 'unknown',
        contentType: j.contentType || 'joke',
        textHash: j.textHash,
        sentCount: j.sentCount || 0,
        lastSentAt: j.lastSentAt || null,
        likes: j.likes || 0,
        dislikes: j.dislikes || 0
      });
    }
  });
  tx(jokes);
  scheduleJsonSnapshots();
}

function upsertJokes(jokes) {
  init();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO jokes
    (id, text, source, content_type, text_hash, sent_count, last_sent_at, likes, dislikes)
    VALUES (@id, @text, @source, @contentType, @textHash, @sentCount, @lastSentAt, @likes, @dislikes)
  `);
  let count = 0;
  const tx = db.transaction((items) => {
    for (const j of items) {
      const info = insert.run({
        id: j.id,
        text: j.text,
        source: j.source || 'unknown',
        contentType: j.contentType || 'joke',
        textHash: j.textHash,
        sentCount: j.sentCount || 0,
        lastSentAt: j.lastSentAt || null,
        likes: j.likes || 0,
        dislikes: j.dislikes || 0
      });
      if (info.changes) count += 1;
    }
  });
  tx(jokes);
  if (count > 0) scheduleJsonSnapshots();
  return count;
}

function getNextJokeId() {
  init();
  const row = db.prepare('SELECT MAX(id) AS maxId FROM jokes').get();
  return (row?.maxId || 0) + 1;
}

function getAllGroupsMap() {
  init();
  const rows = db.prepare('SELECT * FROM groups').all();
  const groups = {};
  for (const row of rows) {
    groups[row.chat_id] = {
      chatId: row.chat_id,
      title: row.title || '',
      addedBy: row.added_by,
      active: Boolean(row.active),
      addedAt: row.added_at,
      updatedAt: row.updated_at
    };
  }
  return groups;
}

function getJokeById(jokeId) {
  init();
  return mapJokeRow(db.prepare('SELECT * FROM jokes WHERE id = ?').get(jokeId));
}

function updateJokeCounters(jokeId, { likesDelta = 0, dislikesDelta = 0 } = {}) {
  init();
  const info = db.prepare(`
    UPDATE jokes
    SET likes = MAX(0, likes + ?),
        dislikes = MAX(0, dislikes + ?)
    WHERE id = ?
  `).run(likesDelta, dislikesDelta, jokeId);
  if (info.changes) scheduleJsonSnapshots();
  return info.changes > 0;
}

function markJokeSent(jokeId) {
  init();
  const info = db.prepare(`
    UPDATE jokes
    SET sent_count = sent_count + 1,
        last_sent_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), jokeId);
  if (info.changes) scheduleJsonSnapshots();
  return info.changes > 0;
}

function applyUserVote(userId, jokeId, fromVote, toVote) {
  init();
  const validVotes = new Set(['like', 'dislike']);
  if (fromVote && !validVotes.has(fromVote)) throw new Error(`Invalid previous vote: ${fromVote}`);
  if (toVote && !validVotes.has(toVote)) throw new Error(`Invalid vote: ${toVote}`);

  const tx = db.transaction(() => {
    const likesDelta = (toVote === 'like' ? 1 : 0) - (fromVote === 'like' ? 1 : 0);
    const dislikesDelta = (toVote === 'dislike' ? 1 : 0) - (fromVote === 'dislike' ? 1 : 0);
    const info = db.prepare(`
      UPDATE jokes
      SET likes = MAX(0, likes + ?),
          dislikes = MAX(0, dislikes + ?)
      WHERE id = ?
    `).run(likesDelta, dislikesDelta, jokeId);
    if (!info.changes) return null;

    if (toVote) {
      db.prepare(`
        INSERT INTO user_votes (user_id, joke_id, vote_type)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, joke_id) DO UPDATE SET vote_type = excluded.vote_type
      `).run(userId, jokeId, toVote);
    } else {
      db.prepare('DELETE FROM user_votes WHERE user_id = ? AND joke_id = ?').run(userId, jokeId);
    }

    return getJokeById(jokeId);
  });

  const result = tx();
  if (result) scheduleJsonSnapshots();
  return result;
}

function setUserVote(userId, jokeId, voteType) {
  init();
  db.prepare(`
    INSERT INTO user_votes (user_id, joke_id, vote_type)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, joke_id) DO UPDATE SET vote_type = excluded.vote_type
  `).run(userId, jokeId, voteType);
  scheduleJsonSnapshots();
}

function deleteUserVote(userId, jokeId) {
  init();
  const info = db.prepare('DELETE FROM user_votes WHERE user_id = ? AND joke_id = ?').run(userId, jokeId);
  if (info.changes) scheduleJsonSnapshots();
  return info.changes > 0;
}

function upsertGroup(group) {
  init();
  db.prepare(`
    INSERT OR REPLACE INTO groups (chat_id, title, added_by, active, added_at, updated_at)
    VALUES (@chatId, @title, @addedBy, @active, @addedAt, @updatedAt)
  `).run({
    chatId: String(group.chatId),
    title: group.title || '',
    addedBy: group.addedBy ?? null,
    active: group.active ? 1 : 0,
    addedAt: group.addedAt || new Date().toISOString(),
    updatedAt: group.updatedAt || new Date().toISOString()
  });
  scheduleJsonSnapshots();
}

function saveUserVotesMap(map) {
  init();
  const tx = db.transaction((entries) => {
    db.prepare('DELETE FROM user_votes').run();
    const insert = db.prepare('INSERT INTO user_votes (user_id, joke_id, vote_type) VALUES (?, ?, ?)');
    for (const [key, voteType] of entries) {
      const [userId, jokeId] = key.split('_');
      if (!userId || !jokeId) continue;
      insert.run(Number(userId), Number(jokeId), voteType);
    }
  });
  tx([...map.entries()]);
  scheduleJsonSnapshots();
}

function getMeta(key) {
  init();
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row?.value ?? null;
}

function setMeta(key, value) {
  init();
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, String(value));
}

function checkpoint() {
  if (!db) return;
  flushJsonSnapshots();
  db.pragma('wal_checkpoint(TRUNCATE)');
}

module.exports = {
  init,
  isEnabled,
  getAllJokes,
  replaceAllJokes,
  upsertJokes,
  getNextJokeId,
  getJokeById,
  updateJokeCounters,
  markJokeSent,
  applyUserVote,
  setUserVote,
  deleteUserVote,
  getAllGroupsMap,
  upsertGroup,
  loadUserVotesMap,
  saveUserVotesMap,
  exportJsonSnapshots,
  scheduleJsonSnapshots,
  flushJsonSnapshots,
  checkpoint,
  getMeta,
  setMeta,
  DB_PATH
};
