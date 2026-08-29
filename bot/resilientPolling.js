const logger = require('../utils/logger');
const { formatConnectionError } = require('../utils/proxy');

const DEFAULT_POLL_TIMEOUT_SEC = 5;

function createResilientPoller(bot, { pollTimeoutSec = DEFAULT_POLL_TIMEOUT_SEC } = {}) {
  let offset = 0;
  let stopped = true;
  let failStreak = 0;
  let lastSuccessAt = Date.now();
  let loopPromise = null;

  async function pollLoop() {
    while (!stopped) {
      try {
        // Do not wrap getUpdates in Promise.race: timing out the wrapper does
        // not abort the HTTP request and creates overlapping Telegram consumers.
        const updates = await bot.getUpdates({
          timeout: pollTimeoutSec,
          limit: 50,
          offset
        });
        failStreak = 0;
        lastSuccessAt = Date.now();
        for (const update of updates) {
          offset = update.update_id + 1;
          bot.processUpdate(update);
        }
      } catch (error) {
        failStreak += 1;
        if (failStreak <= 3 || failStreak % 15 === 0) {
          logger.warn('Poll failed:', formatConnectionError(error));
        }
        await new Promise((r) => setTimeout(r, Math.min(300 * failStreak, 1500)));
      }
    }
  }

  async function start(initialOffset = 0) {
    await stop();
    offset = initialOffset;
    stopped = false;
    lastSuccessAt = Date.now();
    loopPromise = pollLoop().finally(() => {
      loopPromise = null;
    });
  }

  async function stop() {
    stopped = true;
    if (loopPromise) await loopPromise;
  }

  function isRunning() {
    return !stopped;
  }

  function getHealth() {
    return { lastSuccessAt, failStreak, running: isRunning() };
  }

  return { start, stop, isRunning, getOffset: () => offset, getHealth };
}

module.exports = { createResilientPoller, DEFAULT_POLL_TIMEOUT_SEC };
