const GAME_ACTIONS = new Set(['games', 'gcl', 'gok', 'gn', 'gq']);

function isGameAction(action) {
  if (!action) return false;
  if (GAME_ACTIONS.has(action)) return true;
  return action.startsWith('gm:') || action.startsWith('ga:');
}

async function handleGameCallback(ctx, screens, query) {
  const action = query.data;
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const userId = query.from?.id;
  const displayName = query.from?.first_name || query.from?.username;

  if (!chatId || !messageId || !userId) {
    return true;
  }

  if (action === 'games') {
    await screens.showGamesHub(chatId, messageId, userId, {
      displayName,
      flushSession: true
    });
    return true;
  }

  if (action.startsWith('gm:')) {
    const gameId = action.slice(3);
    await screens.startGame(chatId, messageId, userId, gameId, displayName);
    return true;
  }

  if (action === 'gcl') {
    await screens.revealClue(chatId, messageId, userId);
    return true;
  }

  if (action === 'gok') {
    await screens.readyAnswer(chatId, messageId, userId);
    return true;
  }

  if (action.startsWith('ga:')) {
    const answerIndex = Number.parseInt(action.slice(3), 10);
    if (!Number.isFinite(answerIndex)) {
      return true;
    }
    await screens.handleAnswer(chatId, messageId, userId, answerIndex);
    return true;
  }

  if (action === 'gn') {
    await screens.nextQuestion(chatId, messageId, userId, displayName);
    return true;
  }

  if (action === 'gq') {
    await screens.quitGame(chatId, messageId, userId, displayName);
    return true;
  }

  return false;
}

module.exports = { isGameAction, handleGameCallback };
