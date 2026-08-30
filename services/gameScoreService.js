const fs = require('fs');
const path = require('path');
const { getRankInfo } = require('../config/gameRanks');

const SCORES_FILE = path.join(__dirname, '..', 'data', 'game-scores.json');
let scoreCache = null;

function defaultUser() {
  return {
    totalScore: 0,
    roundsPlayed: 0,
    bestStreak: 0,
    byGame: {},
    displayName: null,
    lastRoundScore: 0,
    lastRoundAt: null,
    updatedAt: null
  };
}

function ensureFile() {
  const dir = path.dirname(SCORES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SCORES_FILE)) {
    fs.writeFileSync(SCORES_FILE, JSON.stringify({ users: {} }, null, 2), 'utf-8');
  }
}

function load() {
  if (scoreCache) return scoreCache;
  ensureFile();
  try {
    scoreCache = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
  } catch {
    scoreCache = { users: {} };
  }
  return scoreCache;
}

function save(data) {
  ensureFile();
  scoreCache = data;
  fs.writeFileSync(SCORES_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function ensureUser(db, userId) {
  const key = String(userId);
  if (!db.users[key]) db.users[key] = defaultUser();
  return db.users[key];
}

function applyScore(user, gameId, roundScore, streak, displayName, { completeRound }) {
  user.totalScore = (user.totalScore || 0) + roundScore;
  user.lastRoundScore = roundScore;
  user.lastRoundAt = new Date().toISOString();
  user.displayName = displayName || user.displayName;
  user.updatedAt = user.lastRoundAt;

  if (completeRound) {
    user.roundsPlayed = (user.roundsPlayed || 0) + 1;
    user.bestStreak = Math.max(user.bestStreak || 0, streak || 0);
  }

  if (gameId) {
    if (!user.byGame[gameId]) {
      user.byGame[gameId] = { score: 0, rounds: 0, bestRound: 0 };
    }
    const g = user.byGame[gameId];
    g.score += roundScore;
    if (completeRound) g.rounds += 1;
    g.bestRound = Math.max(g.bestRound, roundScore);
  }

  return user;
}

/** Полный раунд (5 вопросов) */
function recordRound(userId, gameId, { roundScore, streak, displayName }) {
  if (!userId || roundScore <= 0) return getUserStats(userId);

  const db = load();
  const user = ensureUser(db, userId);
  const before = user.totalScore || 0;
  applyScore(user, gameId, roundScore, streak, displayName, { completeRound: true });
  save(db);

  return { user, before, after: user.totalScore, rank: getRankInfo(user.totalScore) };
}

/** Выход из раунда — сохраняем заработанное, но без +1 к «раундам» */
function recordPartialRound(userId, gameId, roundScore, displayName) {
  if (!userId || roundScore <= 0) return null;

  const db = load();
  const user = ensureUser(db, userId);
  const before = user.totalScore || 0;
  applyScore(user, gameId, roundScore, 0, displayName, { completeRound: false });
  save(db);

  return { user, before, after: user.totalScore, rank: getRankInfo(user.totalScore) };
}

function getLeaderboard(limit = 5) {
  const db = load();
  return Object.entries(db.users)
    .map(([id, u]) => ({
      userId: id,
      name: u.displayName || `Игрок …${id.slice(-4)}`,
      totalScore: u.totalScore || 0,
      roundsPlayed: u.roundsPlayed || 0,
      bestStreak: u.bestStreak || 0,
      rank: getRankInfo(u.totalScore || 0)
    }))
    .filter((u) => u.totalScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, limit);
}

function getUserRankPosition(userId) {
  const db = load();
  const all = Object.entries(db.users)
    .map(([id, u]) => ({ userId: id, totalScore: u.totalScore || 0 }))
    .filter((u) => u.totalScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore);

  const idx = all.findIndex((u) => u.userId === String(userId));
  if (idx === -1) return null;
  return { place: idx + 1, total: all.length };
}

function getUserStats(userId) {
  if (!userId) return defaultUser();
  const db = load();
  return ensureUser(db, userId);
}

module.exports = {
  recordRound,
  recordPartialRound,
  getLeaderboard,
  getUserRankPosition,
  getUserStats,
  getRankInfo
};
