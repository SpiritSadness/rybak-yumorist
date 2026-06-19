module.exports = {
  sources: [
    {
      name: 'anekdot.ru',
      url: 'https://anekdot.ru/tags/%D1%80%D1%8B%D0%B1%D0%B0%D0%BB%D0%BA%D0%B0',
      pages: 15,
      minJokesPerPage: 8,
      selectors: {
        container: '.topicbox',
        text: '.text'
      }
    }
  ],
  fallback: {
    enabled: true,
    file: 'data/fishing-fallback.json'
  },
  pool: {
    refreshIntervalMs: 7 * 24 * 60 * 60 * 1000,
    startupRefreshMinIntervalMs: 6 * 60 * 60 * 1000,
    minPoolSize: 80
  },
  scraping: {
    perSourceLimit: 200,
    pageDelay: 1200,
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 20000,
    stopAfterEmptyPages: 2
  }
};
