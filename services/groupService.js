const CACHE_MS = 5 * 60 * 1000;
const statusCache = new Map();

function escape(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function isGroupMember(bot, groupChatId, userId) {
  if (!groupChatId || !userId) return false;

  try {
    const member = await bot.getChatMember(groupChatId, userId);
    return !['left', 'kicked', 'banned'].includes(member.status);
  } catch {
    return false;
  }
}

async function isGroupAdmin(bot, groupChatId, userId) {
  if (!groupChatId || !userId) return false;

  try {
    const member = await bot.getChatMember(groupChatId, userId);
    return ['administrator', 'creator'].includes(member.status);
  } catch {
    return false;
  }
}

async function canAccessPrivateInfo(bot, userId, queryChatId, targetGroupId) {
  if (!userId || !targetGroupId) return false;

  if (String(queryChatId) === String(targetGroupId)) {
    return isGroupMember(bot, targetGroupId, userId);
  }

  return isGroupMember(bot, targetGroupId, userId);
}

async function verifyGroup(bot, chatId) {
  if (!chatId) {
    return {
      configured: false,
      ok: false,
      title: null,
      memberStatus: null,
      line: '⚠️ Бот ещё не добавлен в эту группу'
    };
  }

  const key = String(chatId);
  const now = Date.now();
  const cached = statusCache.get(key);
  if (cached && (now - cached.time) < CACHE_MS) {
    return cached.status;
  }

  try {
    const chat = await bot.getChat(key);
    const me = await bot.getMe();
    const member = await bot.getChatMember(key, me.id);
    const canSend = ['administrator', 'creator', 'member'].includes(member.status);

    const status = canSend
      ? {
          configured: true,
          ok: true,
          title: chat.title || key,
          memberStatus: member.status,
          line: `✅ Группа: <b>${escape(chat.title || 'группа')}</b>`
        }
      : {
          configured: true,
          ok: false,
          title: chat.title || null,
          memberStatus: member.status,
          line: `❌ Бот в группе, но статус «${member.status}» — нет доступа к отправке`
        };

    statusCache.set(key, { time: now, status });
    return status;
  } catch (error) {
    const status = {
      configured: false,
      ok: false,
      title: null,
      memberStatus: null,
      line: `❌ Группа недоступна: ${escape(error.message || 'ошибка')}`
    };
    statusCache.set(key, { time: now, status });
    return status;
  }
}

async function getUserGroupHealthReports(bot, userId, { jokeCount = 0, scheduleHours = [] } = {}) {
  const groupRegistry = require('./groupRegistry');
  const activeGroups = groupRegistry.getActiveGroups();
  const reports = [];

  for (const group of activeGroups) {
    if (!await isGroupMember(bot, group.chatId, userId)) continue;

    const health = await getHealthReport(bot, group.chatId, { jokeCount, scheduleHours });
    reports.push({
      chatId: group.chatId,
      title: group.title || health.group?.title || group.chatId,
      health
    });
  }

  return reports;
}

async function getHealthReport(bot, groupChatId, { jokeCount = 0, scheduleHours = [] } = {}) {
  const group = await verifyGroup(bot, groupChatId);
  const hours = scheduleHours.length ? scheduleHours.join(', ') : '—';

  const lines = [
    group.line,
    group.ok
      ? `✅ Бот в группе: <b>${escape(group.memberStatus || 'участник')}</b>`
      : '❌ Бот не может отправлять сообщения',
    group.ok
      ? `✅ Рассылка: ${escape(hours)}:00 МСК`
      : '⚠️ Рассылка не работает — проверьте права бота',
    `✅ Анекдотов в базе: ${jokeCount}`,
    '✅ Погода: Кострома и Макарьев'
  ];

  if (group.ok) {
    lines.unshift('🟢 <b>Всё в порядке</b>');
  } else if (group.configured) {
    lines.unshift('🟡 <b>Есть проблемы — см. ниже</b>');
  } else {
    lines.unshift('🔴 <b>Группа не подключена</b>');
  }

  return { group, lines };
}

function clearGroupCache(chatId = null) {
  if (chatId) statusCache.delete(String(chatId));
  else statusCache.clear();
}

module.exports = {
  isGroupMember,
  isGroupAdmin,
  canAccessPrivateInfo,
  verifyGroup,
  getHealthReport,
  getUserGroupHealthReports,
  clearGroupCache,
  escape
};
