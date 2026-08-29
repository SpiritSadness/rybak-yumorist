#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { sendTelegramNotify } = require('../utils/telegramNotify');
const { isWatchdogEnabled } = require('../utils/notifyConfig');

const SERVICE_NAME = process.env.BOT_SERVICE_NAME || 'fishing-bot.service';
const STATE_FILE = path.join(__dirname, '..', 'data', 'watchdog-state.json');
const ALERT_COOLDOWN_MS = Number(process.env.WATCHDOG_COOLDOWN_MS || 30 * 60 * 1000);

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function serviceState() {
  try {
    return execSync(`systemctl --user is-active ${SERVICE_NAME}`, { encoding: 'utf-8' }).trim();
  } catch {
    return 'inactive';
  }
}

function serviceMainPid() {
  try {
    return execSync(`systemctl --user show -p MainPID --value ${SERVICE_NAME}`, { encoding: 'utf-8' }).trim();
  } catch {
    return '0';
  }
}

async function main() {
  if (!isWatchdogEnabled()) {
    console.log('SKIP: WATCHDOG_ENABLED=false');
    return;
  }

  const state = loadState();
  const now = Date.now();
  const active = serviceState() === 'active';
  const pid = serviceMainPid();

  if (active) {
    if (state.alertSent) {
      try {
        await sendTelegramNotify(
          '✅ <b>Бот снова работает</b>\n\n'
          + `Сервис: <code>${SERVICE_NAME}</code>\n`
          + `PID: <code>${pid}</code>\n`
          + `Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} MSK`
        );
        console.log('Recovery notification sent');
      } catch (error) {
        console.error('Recovery notify failed:', error.message);
      }
    }

    saveState({ alertSent: false, lastOkAt: new Date().toISOString(), lastPid: pid });
    console.log('OK: bot is active, pid', pid);
    return;
  }

  const lastAlert = Date.parse(state.lastAlertAt || 0);
  if (state.alertSent && Number.isFinite(lastAlert) && (now - lastAlert) < ALERT_COOLDOWN_MS) {
    console.log('SKIP: alert cooldown active');
    return;
  }

  try {
    await sendTelegramNotify(
      '🚨 <b>Бот не работает!</b>\n\n'
      + `Сервис: <code>${SERVICE_NAME}</code>\n`
      + `Статус: <b>${serviceState()}</b>\n\n`
      + 'Проверь на ПК:\n'
      + '• <code>./botctl.sh restart</code>\n'
      + '• или ярлык «Рыбак Юморист — управление» → пункт 4'
    );
    saveState({
      alertSent: true,
      lastAlertAt: new Date().toISOString(),
      lastState: serviceState()
    });
    console.log('Alert sent: bot is down');
  } catch (error) {
    console.error('Alert failed:', error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
