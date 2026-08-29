require('dotenv').config();
const { connectBot, startPolling } = require('../bot/connect');

(async () => {
  const bot = await connectBot(process.env.BOT_TOKEN);
  console.log('connected');
  await bot.deleteWebHook({ drop_pending_updates: false });
  console.log('webhook deleted');
  await startPolling(bot);
  console.log('polling started');
  setTimeout(() => process.exit(0), 3000);
})().catch((error) => {
  console.error('ERR', error.message);
  process.exit(1);
});
