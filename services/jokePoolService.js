const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const sitesConfig = require('../config/sites');
const database = require('./database');
const { scrapeJokesFromSources } = require('./scrapeService');
const { validateJoke } = require('./jokeFilter');
const jokeRepo = require('./jokeRepo');

const POOL_REFRESH_META_KEY = 'lastPoolRefreshAt';

function loadFallbackJokes() {
  const file = path.join(__dirname, '..', sitesConfig.fallback?.file || 'data/fishing-fallback.json');
  if (!fs.existsSync(file)) return [];

  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const list = Array.isArray(data) ? data : (data.jokes || []);
  const seen = new Set();
  const valid = [];

  for (const raw of list) {
    const validation = validateJoke(raw);
    if (!validation.ok) continue;
    const key = validation.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(validation.text);
  }

  return valid;
}

function dedupeTexts(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const text = typeof item === 'string' ? item : item.text;
    const validation = validateJoke(text);
    if (!validation.ok) continue;
    const key = validation.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(validation.text);
  }

  return out;
}

async function collectAllValidJokes() {
  logger.info('Scraping jokes from web sources...');
  const scraped = await scrapeJokesFromSources();
  logger.info('Scraped valid jokes:', scraped.length);

  const fallback = loadFallbackJokes();
  logger.info('Fallback jokes:', fallback.length);

  const merged = dedupeTexts([
    ...scraped.map((j) => j.text),
    ...fallback
  ]);

  return { merged, scraped: scraped.length, fallback: fallback.length };
}

async function rebuildPool() {
  const { merged, scraped, fallback } = await collectAllValidJokes();

  if (merged.length < 10) {
    throw new Error(`Слишком мало анекдотов после фильтрации: ${merged.length}`);
  }

  const stats = jokeRepo.replaceAllJokes(merged, { source: 'rebuild' });
  jokeRepo.sanitizeRepo();
  recordPoolRefresh();

  const result = {
    scraped,
    fallback,
    unique: merged.length,
    stored: jokeRepo.getCount(),
    ...stats
  };

  logger.info('Joke pool rebuilt:', result);
  return result;
}

async function refreshPool() {
  const { merged } = await collectAllValidJokes();
  const inserted = await jokeRepo.importValidatedJokes(merged, 'web');
  jokeRepo.sanitizeRepo();
  recordPoolRefresh();

  const result = {
    candidates: merged.length,
    inserted,
    stored: jokeRepo.getCount()
  };

  logger.info('Joke pool refreshed:', result);
  return result;
}

function getLastPoolRefreshAt() {
  database.init();
  const raw = database.getMeta(POOL_REFRESH_META_KEY);
  const ts = Date.parse(raw || '');
  return Number.isFinite(ts) ? ts : 0;
}

function recordPoolRefresh() {
  database.init();
  database.setMeta(POOL_REFRESH_META_KEY, new Date().toISOString());
}

function shouldRefreshOnStartup() {
  const minInterval = sitesConfig.pool?.startupRefreshMinIntervalMs ?? 6 * 60 * 60 * 1000;
  const lastAt = getLastPoolRefreshAt();
  if (!lastAt) return true;
  return (Date.now() - lastAt) >= minInterval;
}

async function initPoolOnStartup() {
  const minSize = sitesConfig.pool?.minPoolSize || 80;
  const count = jokeRepo.getCount();

  if (count < minSize) {
    logger.info('Joke pool is small, rebuilding...');
    const result = await rebuildPool();
    recordPoolRefresh();
    return result;
  }

  if (shouldRefreshOnStartup()) {
    logger.info('Startup pool refresh (last refresh older than threshold)');
    return refreshPool();
  }

  const hoursAgo = Math.round((Date.now() - getLastPoolRefreshAt()) / 3600000);
  logger.info(`Startup pool refresh skipped (last refresh ${hoursAgo}h ago)`);
  return { skipped: true, stored: count };
}

function startPeriodicRefresh(onTick = refreshPool) {
  const intervalMs = sitesConfig.pool?.refreshIntervalMs;
  if (!intervalMs || intervalMs < 60000) return null;

  logger.info('Joke pool auto-refresh every', Math.round(intervalMs / 3600000), 'hours');

  const timer = setInterval(() => {
    onTick().catch((error) => logger.error('Pool refresh failed:', error.message));
  }, intervalMs);

  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = {
  loadFallbackJokes,
  collectAllValidJokes,
  rebuildPool,
  refreshPool,
  initPoolOnStartup,
  startPeriodicRefresh
};
