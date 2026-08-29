#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
require('moment/locale/ru');
const TelegramBot = require('node-telegram-bot-api');
const { getTelegramRequestStrategies, formatConnectionError } = require('../utils/proxy');

const BOT_DIR = path.join(__dirname, '..');
const GROUPS_FILE = path.join(BOT_DIR, 'data', 'groups.json');
const JOKES_FILE = path.join(BOT_DIR, 'data', 'jokes.json');
const CACHE_FILE = path.join(BOT_DIR, 'data', 'backup-notify.json');
const PACKAGE_FILE = path.join(BOT_DIR, 'package.json');

const RETENTION = {
  daily: 14,
  weekly: 8,
  data: 30,
  monthly: 6
};

function loadReport() {
  const raw = process.argv[2];
  if (!raw) {
    console.error('Usage: backup-notify.js <json-report>');
    process.exit(1);
  }
  return JSON.parse(raw);
}

function loadBotVersion() {
  try {
    return JSON.parse(fs.readFileSync(PACKAGE_FILE, 'utf-8')).version || '?';
  } catch {
    return '?';
  }
}

function loadGroupInfo() {
  try {
    const data = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf-8'));
    const active = Object.values(data.groups || {}).filter((g) => g.active);
    return {
      count: active.length,
      names: active.map((g) => g.title || g.chatId).slice(0, 5)
    };
  } catch {
    return { count: 0, names: [] };
  }
}

function loadFallbackChatId() {
  try {
    const data = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf-8'));
    const groups = Object.values(data.groups || {});
    const active = groups.find((g) => g.active && g.addedBy);
    return active ? String(active.addedBy) : null;
  } catch {
    return null;
  }
}

function loadCachedChatId() {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    return data.chatId ? String(data.chatId) : null;
  } catch {
    return null;
  }
}

function saveCachedChatId(chatId, username) {
  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify({
      chatId: String(chatId),
      username: username || null,
      updatedAt: new Date().toISOString()
    }, null, 2),
    'utf-8'
  );
}

async function resolveChatId(bot) {
  if (process.env.BACKUP_NOTIFY_CHAT_ID) {
    return String(process.env.BACKUP_NOTIFY_CHAT_ID);
  }

  const rawUsername = process.env.BACKUP_NOTIFY_USERNAME;
  if (rawUsername) {
    const username = rawUsername.replace(/^@/, '');
    try {
      const chat = await bot.getChat(`@${username}`);
      if (chat?.id) {
        saveCachedChatId(chat.id, username);
        return String(chat.id);
      }
    } catch {
      // user may not have opened bot yet
    }
  }

  return loadCachedChatId() || loadFallbackChatId();
}

function countJsonItems(file, key) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (key === 'jokes') return Array.isArray(data.jokes) ? data.jokes.length : 0;
  } catch {
    return 0;
  }
  return 0;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function bar(current, max) {
  const c = Math.max(0, Number(current) || 0);
  const m = Math.max(1, Number(max) || 1);
  const filled = Math.min(10, Math.round((c / m) * 10));
  return `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)} ${c}/${m}`;
}

function modeInfo(mode) {
  if (mode === 'weekly' || mode === 'full') {
    return {
      title: 'Полный бэкап',
      schedule: 'каждое воскресенье в 03:15',
      includes: 'весь проект, включая node_modules',
      emoji: '📦'
    };
  }
  return {
    title: 'Ежедневный бэкап',
    schedule: 'каждый день в 03:00',
    includes: 'код, конфиги, .env и папка data/',
    emoji: '📁'
  };
}

function nextRuns(mode) {
  const now = moment.tz('Europe/Moscow');
  let nextDaily = now.clone().hour(3).minute(0).second(0);
  if (!nextDaily.isAfter(now)) nextDaily.add(1, 'day');

  let nextWeekly = now.clone().day(0).hour(3).minute(15).second(0);
  if (!nextWeekly.isAfter(now)) nextWeekly.add(1, 'week');

  const fmt = (m) => m.locale('ru').format('dd, DD.MM · HH:mm');

  if (mode === 'weekly' || mode === 'full') {
    return [
      `• Следующий полный — ${fmt(nextWeekly)}`,
      `• Следующий ежедневный — ${fmt(nextDaily)}`
    ];
  }

  return [
    `• Следующий ежедневный — ${fmt(nextDaily)}`,
    `• Следующий полный — ${fmt(nextWeekly)}`
  ];
}

function monthLabel(name) {
  if (!name) return '—';
  const match = name.match(/(\d{4})-(\d{2})/);
  if (!match) return name;
  const months = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const idx = parseInt(match[2], 10) - 1;
  return `${months[idx] || match[2]} ${match[1]}`;
}

function formatDuration(sec) {
  const s = Number(sec) || 0;
  if (s < 60) return `${s} сек`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} мин ${r} сек` : `${m} мин`;
}

function section(title) {
  return `\n<b>${title}</b>`;
}

function formatSuccessReport(report) {
  const info = modeInfo(report.mode);
  const version = loadBotVersion();
  const groups = loadGroupInfo();
  const lines = [];

  lines.push(`${info.emoji} <b>Резервная копия выполнена</b>`);
  lines.push(`🐟 Рыбак Юморист · v${escapeHtml(version)}`);
  lines.push('');
  lines.push(`✅ <b>${info.title}</b> — всё прошло штатно`);
  lines.push(`Сохранено: ${info.includes}`);
  lines.push(`🕐 ${escapeHtml(report.finishedAt || '—')} · ⏱ ${formatDuration(report.durationSec)}`);

  if (report.attempt && report.attempt > 1) {
    lines.push(`🔁 Потребовалось попыток: ${report.attempt} из ${report.maxAttempts || 3}`);
  }

  lines.push(section('Что сохранено'));

  lines.push('');
  lines.push('1️⃣ <b>Основной архив</b>');
  lines.push(`   ${escapeHtml(report.size || '—')} · ${report.files || '—'} файлов`);
  lines.push(`   <code>${escapeHtml(report.archiveName || '—')}</code>`);
  lines.push(`   ${report.checksumOk ? '✓ Целостность проверена (SHA256)' : '⚠️ Контрольная сумма не проверена'}`);

  if (report.dataArchiveName) {
    lines.push('');
    lines.push('2️⃣ <b>База бота (data/)</b>');
    lines.push(`   ${escapeHtml(report.dataSize || '—')} — анекдоты, группы, голоса, прогресс`);
    lines.push(`   <code>${escapeHtml(report.dataArchiveName)}</code>`);
  }

  lines.push('');
  lines.push('3️⃣ <b>Месячная копия</b>');
  if (report.monthlyCreated) {
    lines.push(`   🆕 Создана сегодня — ${escapeHtml(monthLabel(report.monthlyName))}`);
  } else if (report.monthlyName) {
    lines.push(`   ✓ Уже есть — ${escapeHtml(monthLabel(report.monthlyName))}`);
  } else {
    lines.push('   — не требовалась');
  }

  lines.push(section('Склад бэкапов на ПК'));
  lines.push('');
  lines.push(`📁 Ежедневные   ${bar(report.dailyCount, RETENTION.daily)}`);
  lines.push(`📦 Полные       ${bar(report.weeklyCount, RETENTION.weekly)}`);
  lines.push(`💾 Data         ${bar(report.dataCount, RETENTION.data)}`);
  lines.push(`🗓 Месячные     ${bar(report.monthlyCount, RETENTION.monthly)}`);

  const diskLine = report.diskFreeGb
    ? `💽 Диск: <b>${report.diskFreeGb} GB</b> свободно${report.diskUsedPct ? ` · занято ${report.diskUsedPct}%` : ''}`
    : '💽 Диск: данные недоступны';
  lines.push('');
  lines.push(diskLine);

  lines.push(section('Состояние бота'));
  lines.push('');
  lines.push(`🎣 Анекдотов: <b>${report.jokeCount ?? '—'}</b>`);
  lines.push(`👥 Групп: <b>${groups.count}</b>`);
  if (groups.names.length) {
    for (const name of groups.names) {
      lines.push(`   └ ${escapeHtml(name)}`);
    }
  }

  lines.push(section('Расписание'));
  lines.push('');
  for (const line of nextRuns(report.mode)) {
    lines.push(line);
  }
  lines.push('');
  const notifyUser = (process.env.BACKUP_NOTIFY_USERNAME || '').replace(/^@/, '');
  if (notifyUser) {
    lines.push(`ℹ️ ${info.schedule} · отчёт для @${escapeHtml(notifyUser)}`);
  } else {
    lines.push(`ℹ️ ${info.schedule}`);
  }

  return lines.join('\n');
}

function formatFailureReport(report) {
  const info = modeInfo(report.mode);
  const version = loadBotVersion();
  const lines = [];

  lines.push('🚨 <b>Бэкап не выполнен</b>');
  lines.push(`🐟 Рыбак Юморист · v${escapeHtml(version)}`);
  lines.push('');
  lines.push(`❌ <b>${info.title}</b> — произошла ошибка`);
  lines.push(`🕐 ${escapeHtml(report.finishedAt || '—')}`);

  if (report.attempt && report.attempt > 1) {
    lines.push(`🔁 Попыток: ${report.attempt} из ${report.maxAttempts || 3}`);
  }

  lines.push(section('Что случилось'));
  lines.push('');
  lines.push(`⚠️ ${escapeHtml(report.error || report.message || 'Неизвестная ошибка')}`);

  lines.push(section('Что проверить'));
  lines.push('');
  lines.push('1. Свободное место на диске');
  lines.push('2. Лог бэкапа (см. BACKUP_ROOT/logs/backup.log)');
  lines.push('3. Запуск вручную: <code>npm run backup</code>');

  if (report.diskFreeGb) {
    lines.push('');
    lines.push(`💽 Сейчас свободно: <b>${report.diskFreeGb} GB</b>`);
  }

  lines.push(section('Расписание'));
  lines.push('');
  for (const line of nextRuns(report.mode)) {
    lines.push(line);
  }

  return lines.join('\n');
}

function formatReport(report) {
  return report.status === 'ok' ? formatSuccessReport(report) : formatFailureReport(report);
}

async function connectBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN не задан');

  for (const strategy of getTelegramRequestStrategies()) {
    try {
      const bot = new TelegramBot(token, { polling: false, request: strategy.request });
      await bot.getMe();
      return bot;
    } catch (error) {
      if (/401|Unauthorized/i.test(error?.message || '')) {
        throw new Error('BOT_TOKEN недействителен');
      }
    }
  }

  throw new Error('Не удалось подключиться к Telegram');
}

async function main() {
  const report = loadReport();
  const bot = await connectBot();
  const chatId = await resolveChatId(bot);

  if (!chatId) {
    console.error('Не удалось определить chat_id. Напишите боту /start или задайте BACKUP_NOTIFY_CHAT_ID');
    process.exit(1);
  }

  report.jokeCount = report.jokeCount ?? countJsonItems(JOKES_FILE, 'jokes');

  const text = formatReport(report);

  try {
    await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    console.log('Backup report sent to chat', chatId);
  } catch (error) {
    console.error('Send failed:', formatConnectionError(error));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
