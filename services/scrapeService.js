const axios = require('axios');
const cheerio = require('cheerio');
const sitesConfig = require('../config/sites');
const { validateJoke } = require('./jokeFilter');
const { buildAxiosAgent, getAxiosProxyConfig } = require('../utils/proxy');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPageUrls(source) {
  const base = source.url.replace(/\/$/, '');
  const urls = [base];

  for (let page = 2; page <= (source.pages || 1); page += 1) {
    urls.push(`${base}/${page}`);
  }

  return urls;
}

async function fetchHtml(url, { timeoutMs = 20000, attempts = 3 } = {}) {
  const agent = buildAxiosAgent();
  const config = sitesConfig.scraping;
  let lastErr = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await axios.get(url, {
        timeout: Math.min(timeoutMs, config.timeout || 20000),
        responseType: 'text',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache'
        },
        ...(agent ? getAxiosProxyConfig(agent) : { proxy: false })
      });
      return res.data;
    } catch (error) {
      lastErr = error;
      await sleep((config.retryDelay || 1000) * attempt);
    }
  }

  throw lastErr;
}

function extractFromPage(html, source) {
  const $ = cheerio.load(html);
  const containerSel = source.selectors?.container || '.topicbox';
  const textSel = source.selectors?.text || '.text';
  const results = [];

  $(containerSel).each((_, box) => {
    const raw = textSel
      ? $(box).find(textSel).first().text()
      : $(box).text();
    const validation = validateJoke(raw);
    if (validation.ok) {
      results.push({ text: validation.text, source: source.name });
    }
  });

  return results;
}

async function scrapeJokesFromSource(source, options = {}) {
  const config = sitesConfig.scraping;
  const perSourceLimit = options.perSourceLimit ?? config.perSourceLimit ?? 200;
  const minPerPage = source.minJokesPerPage ?? 8;
  const stopAfterEmpty = config.stopAfterEmptyPages ?? 2;

  const results = [];
  const seen = new Set();
  let emptyPages = 0;

  for (const pageUrl of buildPageUrls(source)) {
    if (results.length >= perSourceLimit) break;

    try {
      const html = await fetchHtml(pageUrl);
      const pageJokes = extractFromPage(html, source);

      if (pageJokes.length < minPerPage) {
        emptyPages += 1;
        if (emptyPages >= stopAfterEmpty) break;
      } else {
        emptyPages = 0;
      }

      for (const joke of pageJokes) {
        const key = joke.text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ ...joke, sourceUrl: pageUrl });
        if (results.length >= perSourceLimit) break;
      }

      await sleep(config.pageDelay || 1200);
    } catch (error) {
      const status = error.response?.status;
      if (status === 404 && results.length > 0) break;
      if (results.length === 0) throw error;
      break;
    }
  }

  return results;
}

async function scrapeJokesFromSources(sources = sitesConfig.sources, options = {}) {
  const results = [];
  const seen = new Set();

  for (const source of sources) {
    try {
      const jokes = await scrapeJokesFromSource(source, options);
      for (const joke of jokes) {
        const key = joke.text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(joke);
      }
      await sleep(sitesConfig.scraping.pageDelay || 1200);
    } catch (error) {
      const msg = error?.message || String(error);
      console.warn(`⚠️ Источник ${source.name}: ${msg}`);
    }
  }

  return results;
}

module.exports = {
  scrapeJokesFromSources,
  scrapeJokesFromSource,
  extractFromPage,
  fetchHtml
};
