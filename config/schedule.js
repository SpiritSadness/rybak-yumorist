module.exports = {
  hours: [4, 7, 9, 14, 18, 23],
  groupSendDelayMs: 1500,
  catchupMinutes: Number(process.env.SCHEDULE_CATCHUP_MINUTES) || 45,
  backfillQuietAfterHour: Number(process.env.SCHEDULE_QUIET_AFTER_HOUR) || 22,
  backfill: process.env.SCHEDULE_BACKFILL !== 'false',
  outboxRetryMs: Number(process.env.OUTBOX_RETRY_MS) || 60000,
  labels: {
    4: 'Ранний улов 🐟',
    7: 'Утренний клёв',
    9: 'Доброе утро!',
    14: 'Обеденный улов',
    18: 'Вечерний клёв',
    23: 'Ночная рыбалка 🌙'
  },
  slotThemes: {
    4: { emoji: '🌙', from: '#1a1a3e', to: '#4a3f6b' },
    7: { emoji: '🌅', from: '#ff6b35', to: '#ffd166' },
    9: { emoji: '☀️', from: '#4facfe', to: '#00f2fe' },
    14: { emoji: '🍽️', from: '#f7971e', to: '#ffd200' },
    18: { emoji: '🌆', from: '#ee5a24', to: '#f79f1f' },
    23: { emoji: '🌙', from: '#0f0c29', to: '#302b63' }
  }
};
