function isTruthyEnv(name, defaultValue = true) {
  const value = process.env[name];
  if (value === undefined || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'no' && normalized !== 'off';
}

function hasNotifyRecipient() {
  return Boolean(process.env.BACKUP_NOTIFY_CHAT_ID || process.env.BACKUP_NOTIFY_USERNAME);
}

function isTelegramNotifyEnabled() {
  return isTruthyEnv('TELEGRAM_NOTIFY_ENABLED', true)
    && isTruthyEnv('BACKUP_NOTIFY_ENABLED', true)
    && hasNotifyRecipient();
}

function isWatchdogEnabled() {
  return isTruthyEnv('WATCHDOG_ENABLED', true);
}

function isBackupEnabled() {
  return isTruthyEnv('BACKUP_ENABLED', true);
}

module.exports = {
  isTruthyEnv,
  hasNotifyRecipient,
  isTelegramNotifyEnabled,
  isWatchdogEnabled,
  isBackupEnabled,
};
