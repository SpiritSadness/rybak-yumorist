const { escapeHtml } = require('./telegramUi');
const { getGame, listGames } = require('../config/games');
const { CLUE_POINTS } = require('../services/gameService');

const SEP = '────────────────';

function bar(progress, width = 10) {
  const pct = Math.max(0, Math.min(100, progress || 0));
  const fill = Math.round((pct / 100) * width);
  return `${'▰'.repeat(fill)}${'▱'.repeat(width - fill)}`;
}

function formatGamesHub({ stats, leaderboard, rank, rankPosition, activeSession }) {
  const total = stats?.totalScore || 0;
  const rounds = stats?.roundsPlayed || 0;

  let text = `<b>🎮 Игры</b>\n`;
  text += `<i>5 вопросов · очки копятся · общий рейтинг</i>\n\n`;

  text += `<b>👤 Профиль</b>\n`;
  text += `Звание: ${escapeHtml(rank.label)}\n`;
  text += `Счёт: <b>${total}</b>`;
  if (rankPosition) text += ` · место <b>#${rankPosition.place}</b> из ${rankPosition.total}`;
  text += '\n';

  if (rank.nextTitle && rank.pointsToNext > 0) {
    text += `До «${escapeHtml(rank.nextTitle)}»: ${rank.pointsToNext} оч.\n`;
    text += `${bar(rank.progress)} ${rank.progress}%\n`;
  }

  if (stats?.lastRoundScore > 0) {
    text += `Последний раунд: +${stats.lastRoundScore}\n`;
  }
  if (activeSession?.score > 0) {
    text += `<i>Незавершённый раунд: ${activeSession.score} оч. (сохранится при выходе)</i>\n`;
  }
  if (rounds > 0) {
    text += `Сыграно раундов: ${rounds}`;
    if (stats?.bestStreak > 1) text += ` · серия до ${stats.bestStreak}`;
    text += '\n';
  }

  text += `\n${SEP}\n<b>🏆 Рейтинг</b>\n`;
  if (leaderboard?.length) {
    leaderboard.forEach((row, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      text += `${medal} ${escapeHtml(row.name)} — <b>${row.totalScore}</b>`;
      if (row.rank?.label) text += ` · ${row.rank.label}`;
      text += '\n';
    });
  } else {
    text += `<i>Пока пусто. Сыграй первым.</i>\n`;
  }

  text += `\n${SEP}\n<b>🎯 Режимы</b>\n`;
  listGames().forEach((g) => {
    text += `· <b>${escapeHtml(g.short)}</b> — ${escapeHtml(g.hint)}\n`;
  });
  return text;
}

function formatQuestion(session) {
  const game = getGame(session.gameId);
  const q = session.questions[session.index];
  const num = session.index + 1;
  const total = session.questions.length;

  let text = `<b>${escapeHtml(game.title)}</b>\n`;
  text += `${num} / ${total}  ·  раунд: <b>${session.score}</b>`;
  if (session.streak > 0) {
    text += `  ·  серия: ${session.streak} (+${session.streak * 2} бонус)`;
  }
  text += `\n${SEP}\n`;

  if (session.gameId === 'fd') {
    const clues = q.clues.slice(0, session.cluesRevealed);
    const pts = CLUE_POINTS[Math.min(session.cluesRevealed - 1, CLUE_POINTS.length - 1)];
    text += `<i>🔎 Улики ${session.cluesRevealed} из ${q.clues.length} · ответ сейчас = ${pts} оч.</i>\n\n`;
    clues.forEach((c, i) => {
      text += `<b>${i + 1}.</b> ${escapeHtml(c)}\n`;
    });
    if (session.cluesRevealed < q.clues.length) {
      text += `\n<i>Можно открыть ещё улику — очки за ответ станут меньше.</i>`;
    }
    return text;
  }

  if (session.gameId === 'tob') {
    text += escapeHtml(q.statement);
    return text;
  }

  if (session.gameId === 'tm') {
    text += escapeHtml(q.question);
    return text;
  }

  if (session.gameId === 'fof') {
    text += `Существует ли рыба с названием\n<b>«${escapeHtml(q.name)}»</b>?`;
    return text;
  }

  return text;
}

function formatResult(session, result) {
  const q = result.question;
  const verdict = result.correct ? '✅ Верно' : '❌ Неверно';

  let text = `<b>${verdict}</b>`;
  if (result.correct && result.points > 0) {
    text += ` · +${result.points}`;
    if (result.streak > 1) text += ` (серия ${result.streak})`;
  }
  text += `\n${SEP}\n`;

  if (!result.correct) {
    if (session.gameId === 'fd') {
      text += `Ответ: <b>${escapeHtml(q.answer)}</b>\n\n`;
    } else if (session.gameId === 'tm') {
      text += `Ответ: <b>${escapeHtml(q.options[q.correct])}</b>\n\n`;
    } else if (session.gameId === 'fof') {
      text += q.real ? 'Это настоящая рыба.\n\n' : 'Это вымысел.\n\n';
    } else if (session.gameId === 'tob') {
      text += q.answer ? 'Это правда.\n\n' : 'Это миф.\n\n';
    }
  }

  text += escapeHtml(q.explanation || q.fact || '');
  text += `\n\n${SEP}\n`;
  text += `Раунд: <b>${session.score}</b> оч.`;
  text += `\n<i>Общий счёт обновится в конце раунда.</i>`;
  return text;
}

function formatRoundSummary(summary, gameTitle, { before, after, rank, rankBefore }) {
  let text = `<b>🏁 Раунд завершён</b>\n`;
  text += `${escapeHtml(gameTitle)}\n${SEP}\n`;
  text += `Очков в раунде: <b>${summary.score}</b>\n`;
  text += `Лучшая серия: ${summary.bestStreak}\n`;

  if (before != null && after != null) {
    text += `\n<b>+${summary.score}</b> к общему счёту\n`;
    text += `${before} → <b>${after}</b>\n`;
  }

  if (rank) {
    text += `\nЗвание: <b>${escapeHtml(rank.label)}</b>`;
    if (rankBefore && rankBefore.title !== rank.title) {
      text += `\n<i>🎉 Новое звание (было: ${rankBefore.label || rankBefore.title})</i>`;
    } else if (rank.nextTitle && rank.pointsToNext > 0) {
      text += `\nДо «${escapeHtml(rank.nextTitle)}»: ${rank.pointsToNext} оч.`;
    }
  }

  return text;
}

function formatPartialSave({ earned, before, after, rank }) {
  return `<b>💾 Раунд сохранён</b>\n${SEP}\n`
    + `Заработано: <b>${earned}</b>\n`
    + `Счёт: ${before} → <b>${after}</b>\n`
    + `Звание: ${escapeHtml(rank?.label || '—')}\n\n`
    + `<i>Дойди до 5/5 — больше очков за серии.</i>`;
}

module.exports = {
  formatGamesHub,
  formatQuestion,
  formatResult,
  formatRoundSummary,
  formatPartialSave,
  SEP
};
