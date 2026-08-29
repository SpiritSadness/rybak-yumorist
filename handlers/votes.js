const logger = require('../utils/logger');
const ui = require('../utils/telegramUi');
const jokeRepo = require('../services/jokeRepo');
const jokeProgressService = require('../services/jokeProgressService');

function createVoteHandler(ctx, screens) {
  return async function handleVote(query, jokeId, voteType) {
    const userId = query.from?.id;
    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;

    if (!userId || !chatId || !messageId || !jokeId) {
      return;
    }

    const joke = jokeRepo.getJokeById(jokeId);
    if (!joke) {
      await ctx.showErrorScreen(chatId, messageId, 'vote');
      return;
    }

    try {
      const result = jokeRepo.applyUserVote(userId, jokeId, voteType);
      if (!result.joke) throw new Error('Анекдот не найден');
      await screens.showJokeScreen(
        chatId,
        messageId,
        result.joke,
        jokeProgressService.peekProgress(chatId, messageId)
      );
    } catch (error) {
      logger.error('Vote error:', error);
      await ctx.showErrorScreen(chatId, messageId, 'vote', ui.jokeKeyboard(joke));
    }
  };
}

module.exports = { createVoteHandler };
