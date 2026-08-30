#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function testSerializedPolling() {
  const { createResilientPoller } = require('../bot/resilientPolling');
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  let seenTimeout = null;

  const bot = {
    async getUpdates(options) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      calls += 1;
      seenTimeout = options.timeout;
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      return calls === 1 ? [{ update_id: 10 }] : [];
    },
    processUpdate(update) {
      assert.strictEqual(update.update_id, 10);
    }
  };

  const poller = createResilientPoller(bot, { pollTimeoutSec: 5 });
  await poller.start();
  await new Promise((resolve) => setTimeout(resolve, 55));
  await poller.stop();

  assert.strictEqual(maxActive, 1, 'getUpdates requests must never overlap');
  assert.strictEqual(seenTimeout, 5, 'poller must use long-polling');
  assert.strictEqual(poller.isRunning(), false);
}

async function testAtomicVotesAndCallbacks() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rybak-critical-'));
  process.env.BOT_DATA_DIR = tempDir;
  process.env.BOT_DB_PATH = path.join(tempDir, 'test.db');

  const database = require('../services/database');
  database.upsertJokes([{
    id: 1,
    text: 'Тестовый анекдот',
    source: 'test',
    contentType: 'joke',
    textHash: 'critical-test-joke',
    sentCount: 0,
    lastSentAt: null,
    likes: 0,
    dislikes: 0
  }]);

  let joke = database.applyUserVote(100, 1, null, 'like');
  assert.deepStrictEqual([joke.likes, joke.dislikes], [1, 0]);

  joke = database.applyUserVote(100, 1, 'like', 'dislike');
  assert.deepStrictEqual([joke.likes, joke.dislikes], [0, 1]);

  joke = database.applyUserVote(100, 1, 'dislike', null);
  assert.deepStrictEqual([joke.likes, joke.dislikes], [0, 0]);
  assert.strictEqual(database.loadUserVotesMap().size, 0);

  const listeners = new Map();
  let callbackAnswers = 0;
  let activeScreens = 0;
  let maxActiveScreens = 0;
  let gamesHubShown = 0;
  const bot = {
    on(event, listener) {
      listeners.set(event, listener);
    },
    onText() {},
    async answerCallbackQuery() {
      callbackAnswers += 1;
    }
  };
  const ctx = {
    bot,
    async showErrorScreen() {
      throw new Error('Unexpected error screen');
    }
  };
  const screens = {
    async showJokeScreen() {},
    async showMenu() {
      activeScreens += 1;
      maxActiveScreens = Math.max(maxActiveScreens, activeScreens);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeScreens -= 1;
    },
    async showJoke() {},
    async showWeatherMenu() {},
    async showSchedule() {},
    async showTop() {},
    async showHelpMenu() {},
    async showAbout() {},
    async showGamesHub() {
      gamesHubShown += 1;
    },
    async showWeatherCity() {},
    async showHelpStatus() {},
    async showHelpSetup() {}
  };

  const { setupHandlers } = require('../handlers');
  setupHandlers(ctx, screens);
  const callback = listeners.get('callback_query');
  assert(callback, 'callback_query handler must be registered');

  await callback({
    id: 'vote-1',
    data: 'like:1',
    from: { id: 100 },
    message: { message_id: 5, chat: { id: -100 } }
  });
  assert.strictEqual(callbackAnswers, 1, 'a callback query must be answered exactly once');
  assert.strictEqual(database.getJokeById(1).likes, 1);

  await Promise.all([
    callback({ id: 'menu-1', data: 'menu', message: { message_id: 5, chat: { id: -100 } } }),
    callback({ id: 'menu-2', data: 'menu', message: { message_id: 5, chat: { id: -100 } } })
  ]);
  assert.strictEqual(maxActiveScreens, 1, 'screen edits for one message must be serialized');

  const answersBeforeGame = callbackAnswers;
  await callback({
    id: 'games-1',
    data: 'games',
    from: { id: 100, first_name: 'Tester' },
    message: { message_id: 5, chat: { id: -100 } }
  });
  assert.strictEqual(callbackAnswers - answersBeforeGame, 1, 'game callback must be answered exactly once');
  assert.strictEqual(gamesHubShown, 1, 'games callback must open the games hub');

  const groupRegistry = require('../services/groupRegistry');
  groupRegistry.registerGroup({ chatId: -100777, title: 'Test Group', active: true });
  assert.strictEqual(groupRegistry.getGroup(-100777).title, 'Test Group');
  assert.strictEqual(groupRegistry.getActiveGroups().some((group) => String(group.chatId) === '-100777'), true);
  groupRegistry.deactivateGroup(-100777);
  assert.strictEqual(groupRegistry.getGroup(-100777).active, false);

  database.checkpoint();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

async function testWeatherScreenUsesCacheFastPath() {
  const { createContext } = require('../bot/context');
  const { createScreens } = require('../bot/screens');
  const weatherService = require('../services/weatherService');

  const originalGetCity = weatherService.getCity;
  const originalGetCachedWeather = weatherService.getCachedWeather;
  const originalGetWeather = weatherService.getWeather;

  const renders = [];
  const ctx = createContext();
  ctx.renderAndRemember = async (chatId, messageId, text, keyboard) => {
    renders.push({ chatId, messageId, text, keyboard });
    return messageId || 55;
  };

  weatherService.getCity = () => ({ id: 'kostroma', name: 'Кострома' });
  weatherService.getCachedWeather = () => ({
    cityId: 'kostroma',
    cityName: 'Кострома',
    cityEmoji: '🏙️',
    fetchedAt: '30.08.2026 02:00',
    weatherDescription: '☀️ Ясно',
    temperature: 20,
    feelsLike: 21,
    humidity: 50,
    windSpeed: 2,
    windDirection: 'С',
    windStrengthDesc: 'Слабый',
    pressure: 760,
    pressureDesc: 'Нормальное',
    precipitation: 0,
    precipitationProbability: 0,
    visibility: '>10',
    cloudCover: 0,
    cloudDesc: 'Ясно',
    uvIndex: 1,
    uvDesc: 'Низкий',
    comfort: '🌤️ Комфортно',
    isDay: true,
    hourly: []
  });
  weatherService.getWeather = async () => {
    throw new Error('cached weather path should not fetch network data');
  };

  try {
    const screens = createScreens(ctx);
    await screens.showWeatherCity(123, 77, 'kostroma', false);
    assert.strictEqual(renders.length, 1, 'cached weather should render in one Telegram update');
    assert(!String(renders[0].text).includes('Загружаю'), 'cached weather should skip loading screen');
  } finally {
    weatherService.getCity = originalGetCity;
    weatherService.getCachedWeather = originalGetCachedWeather;
    weatherService.getWeather = originalGetWeather;
  }
}

function testRuntimeModulesLoad() {
  const ui = require('../utils/telegramUi');
  const menuButtons = ui.mainMenuKeyboard().inline_keyboard.flat();
  assert(menuButtons.some((button) => button.callback_data === 'games'), 'main menu must include games');
  assert(ui.scheduledJokeKeyboard({ id: 1 }).inline_keyboard.length > 0, 'scheduled photo must include controls');

  assert.doesNotThrow(() => require('../bot/startup'));
  assert.doesNotThrow(() => require('../bot/gameScreens'));
  assert.doesNotThrow(() => require('../handlers/games'));
  assert.doesNotThrow(() => require('../services/gameService'));
  assert.doesNotThrow(() => require('../services/gameScoreService'));
  assert.doesNotThrow(() => require('../services/scheduleImageService'));
  assert.doesNotThrow(() => require('../services/scheduleImageServiceLegacy'));
}

(async () => {
  await testSerializedPolling();
  await testAtomicVotesAndCallbacks();
  await testWeatherScreenUsesCacheFastPath();
  testRuntimeModulesLoad();
  console.log('test-critical: OK');
})().catch((error) => {
  console.error('test-critical: FAIL', error);
  process.exit(1);
});
