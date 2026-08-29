const logger = require('../utils/logger');
const { formatConnectionError, isProxyError } = require('../utils/proxy');
const database = require('../services/database');

const RECONNECT_COOLDOWN_MS = Number(process.env.TELEGRAM_RECONNECT_MS) || 60000;
const SHUTDOWN_TIMEOUT_MS = 10000;
const POLL_STALE_MS = Number(process.env.TELEGRAM_POLL_STALE_MS) || 30000;

function isReconnectableError(error) {
  if (isProxyError(error)) return true;
  const text = formatConnectionError(error);
  return /ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|socket hang up|EFATAL|502|503|504|EAI_AGAIN/i.test(text);
}

function registerRuntimeHandlers(ctx) {
  let reconnecting = false;
  let lastReconnectAttempt = 0;
  let shuttingDown = false;

  async function tryReconnect(reason) {
    if (shuttingDown || reconnecting || typeof ctx.replaceBot !== 'function') return;
    if (Date.now() - lastReconnectAttempt < RECONNECT_COOLDOWN_MS) return;

    reconnecting = true;
    lastReconnectAttempt = Date.now();

    try {
      logger.warn('Telegram reconnect attempt:', reason);
      await ctx.replaceBot();
      logger.info('Telegram reconnected successfully');
    } catch (error) {
      logger.warn('Telegram reconnect failed:', formatConnectionError(error));
    } finally {
      reconnecting = false;
    }
  }

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection:', reason instanceof Error ? reason : String(reason));
  });

  process.on('uncaughtException', (error) => {
    logger.error('uncaughtException:', error);
    process.exit(1);
  });

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);

    const forceTimer = setTimeout(() => {
      logger.warn('Shutdown timeout, forcing exit');
      process.exit(0);
    }, SHUTDOWN_TIMEOUT_MS);
    if (typeof forceTimer.unref === 'function') forceTimer.unref();

    try {
      if (ctx.bot?._resilientPoller) {
        await ctx.bot._resilientPoller.stop();
      } else if (ctx.bot?.stopPolling) {
        await ctx.bot.stopPolling();
      }
    } catch (error) {
      logger.warn('stopPolling error:', error.message);
    }

    try {
      database.checkpoint?.();
    } catch (error) {
      logger.warn('DB checkpoint error:', error.message);
    }

    clearTimeout(forceTimer);
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const healthTimer = setInterval(async () => {
    if (shuttingDown || !ctx.bot) return;

    if (process.env.WEBHOOK_URL) {
      try {
        await ctx.bot.getMe();
      } catch (error) {
        if (isReconnectableError(error)) tryReconnect('health_check');
      }
      return;
    }

    // Never call getUpdates here: Telegram allows only one polling consumer.
    const health = ctx.bot._resilientPoller?.getHealth?.();
    if (!health) {
      tryReconnect('poller_missing');
      return;
    }

    const staleFor = Date.now() - health.lastSuccessAt;
    if (!health.running || (health.failStreak >= 3 && staleFor >= POLL_STALE_MS)) {
      tryReconnect(`poller_unhealthy:${health.failStreak}:${staleFor}`);
    }
  }, Math.min(RECONNECT_COOLDOWN_MS, 15000));
}

module.exports = { registerRuntimeHandlers };
