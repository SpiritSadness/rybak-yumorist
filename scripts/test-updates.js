require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { getTelegramRequestStrategies } = require('../utils/proxy');

(async () => {
  const token = process.env.BOT_TOKEN;
  const strategy = getTelegramRequestStrategies()[0];
  const bot = new TelegramBot(token, { polling: false, request: strategy.request });

  console.log('strategy:', strategy.name);

  const wh = await bot.getWebHookInfo();
  console.log('webhook:', JSON.stringify(wh));

  console.log('getUpdates...');
  const updates = await bot.getUpdates({ timeout: 3, limit: 5 });
  console.log('updates count:', updates.length);
  if (updates.length) {
    console.log('last:', updates[updates.length - 1].update_id, updates[updates.length - 1].callback_query?.data || updates[updates.length - 1].message?.text);
  }

  console.log('deleteWebHook...');
  const del = await bot.deleteWebHook({ drop_pending_updates: false });
  console.log('deleted:', del);

  const wh2 = await bot.getWebHookInfo();
  console.log('webhook after:', JSON.stringify(wh2));
})().catch((error) => {
  console.error('FAIL:', error.message);
  process.exit(1);
});
