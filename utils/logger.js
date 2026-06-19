const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const MAX_LOG_KB = 2048;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateIfNeeded(fileName) {
  const logFile = path.join(LOG_DIR, fileName);
  if (!fs.existsSync(logFile)) return;

  const sizeKb = Math.ceil(fs.statSync(logFile).size / 1024);
  if (sizeKb <= MAX_LOG_KB) return;

  const rotated = path.join(LOG_DIR, `${fileName}.${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.renameSync(logFile, rotated);

  const prefix = `${fileName}.`;
  fs.readdirSync(LOG_DIR)
    .filter((name) => name.startsWith(prefix))
    .sort()
    .slice(0, -5)
    .forEach((name) => {
      try {
        fs.unlinkSync(path.join(LOG_DIR, name));
      } catch {
        // ignore
      }
    });
}

function writeLog(fileName, level, parts) {
  rotateIfNeeded(fileName);
  const line = `[${new Date().toISOString()}] [${level}] ${parts.join(' ')}\n`;
  console.log(line.trim());
  ensureLogDir();
  fs.appendFileSync(path.join(LOG_DIR, fileName), line, 'utf-8');
}

function formatPart(part) {
  if (part instanceof Error) return part.stack || part.message;
  if (typeof part === 'object') return JSON.stringify(part);
  return String(part);
}

module.exports = {
  info(...parts) {
    writeLog('bot.log', 'INFO', parts.map(formatPart));
  },
  warn(...parts) {
    writeLog('bot.log', 'WARN', parts.map(formatPart));
  },
  error(...parts) {
    writeLog('error.log', 'ERROR', parts.map(formatPart));
    writeLog('bot.log', 'ERROR', parts.map(formatPart));
  }
};
