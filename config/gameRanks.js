/** Звания по общему счёту */
const RANKS = [
  { min: 0, title: 'Малёк', emoji: '🐣' },
  { min: 40, title: 'Плотва', emoji: '🐟' },
  { min: 100, title: 'Окунь', emoji: '🐯' },
  { min: 200, title: 'Щука', emoji: '🐊' },
  { min: 350, title: 'Судак', emoji: '🌙' },
  { min: 550, title: 'Бывалый', emoji: '🎖️' },
  { min: 800, title: 'Легенда', emoji: '👑' }
];

function rankLabel(rank) {
  return rank.emoji ? `${rank.emoji} ${rank.title}` : rank.title;
}

function getRankInfo(totalScore) {
  const score = Math.max(0, totalScore || 0);
  let current = RANKS[0];
  let next = RANKS[1] || null;

  for (let i = 0; i < RANKS.length; i += 1) {
    if (score >= RANKS[i].min) {
      current = RANKS[i];
      next = RANKS[i + 1] || null;
    }
  }

  if (!next) {
    return {
      ...current,
      label: rankLabel(current),
      progress: 100,
      nextTitle: null,
      pointsToNext: 0
    };
  }

  const span = next.min - current.min;
  const done = score - current.min;
  const progress = Math.min(100, Math.round((done / span) * 100));

  return {
    ...current,
    label: rankLabel(current),
    progress,
    nextTitle: next.title,
    pointsToNext: next.min - score
  };
}

module.exports = { RANKS, getRankInfo };
