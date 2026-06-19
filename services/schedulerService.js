const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const scheduleConfig = require('../config/schedule');
const logger = require('../utils/logger');

const STATE_FILE = path.join(__dirname, '..', 'data', 'scheduler-state.json');
const CHECK_MS = 30000;
const CATCHUP_MINUTES = 10;

function ensureStateFile() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ sentSlots: {} }, null, 2), 'utf-8');
  }
}

function loadState() {
  ensureStateFile();
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { sentSlots: {} };
  }
}

function saveState(state) {
  ensureStateFile();
  const cutoff = Date.now() - 8 * 24 * 60 * 60 * 1000;
  const sentSlots = {};

  for (const [slot, iso] of Object.entries(state.sentSlots || {})) {
    const ts = Date.parse(iso);
    if (Number.isFinite(ts) && ts >= cutoff) sentSlots[slot] = iso;
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify({ sentSlots }, null, 2), 'utf-8');
}

function getMoscowNow() {
  return moment.tz('Europe/Moscow');
}

function slotKey(now = getMoscowNow()) {
  return `${now.format('YYYY-MM-DD')}-${now.hour()}`;
}

function wasSlotSent(slot) {
  return Boolean(loadState().sentSlots[slot]);
}

function markSlotSent(slot) {
  const state = loadState();
  state.sentSlots[slot] = new Date().toISOString();
  saveState(state);
}

function getDueSlot(now = getMoscowNow()) {
  const hour = now.hour();
  if (!scheduleConfig.hours.includes(hour)) return null;
  if (now.minute() > CATCHUP_MINUTES) return null;

  const slot = slotKey(now);
  if (wasSlotSent(slot)) return null;

  return slot;
}

function getMissedSlotForBackfill(now = getMoscowNow()) {
  const today = now.format('YYYY-MM-DD');

  for (let i = scheduleConfig.hours.length - 1; i >= 0; i -= 1) {
    const hour = scheduleConfig.hours[i];
    const slot = `${today}-${hour}`;

    if (wasSlotSent(slot)) continue;

    const slotStart = now.clone().hour(hour).minute(0).second(0).millisecond(0);
    if (!slotStart.isBefore(now)) continue;

    const hoursAgo = now.diff(slotStart, 'hours', true);
    if (hoursAgo > 6) continue;

    return slot;
  }

  return null;
}

function startScheduler(runScheduledSend) {
  let busy = false;

  async function tick() {
    if (busy) return;

    const dueSlot = getDueSlot();
    const slot = dueSlot || getMissedSlotForBackfill();
    if (!slot) return;

    busy = true;
    try {
      const kind = dueSlot ? 'due' : 'backfill';
      logger.info('Scheduler firing slot:', slot, kind, getMoscowNow().format('HH:mm:ss'), 'MSK');
      const sent = await runScheduledSend(slot);
      if (sent) {
        markSlotSent(slot);
        logger.info('Scheduler slot done:', slot);
      } else {
        logger.warn('Scheduler slot skipped (nothing sent):', slot);
      }
    } catch (error) {
      logger.error('Scheduler slot failed:', slot, error.message);
    } finally {
      busy = false;
    }
  }

  logger.info(
    'Scheduler:',
    scheduleConfig.hours.join(', '),
    'MSK · check every',
    CHECK_MS / 1000,
    's · catch-up',
    CATCHUP_MINUTES,
    'min'
  );

  tick();
  const timer = setInterval(tick, CHECK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

module.exports = {
  startScheduler,
  getMoscowNow,
  slotKey,
  getDueSlot,
  getMissedSlotForBackfill,
  wasSlotSent,
  markSlotSent
};
