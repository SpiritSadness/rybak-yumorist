const { URL } = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

function getProxyUrl() {
  if (process.env.USE_PROXY === 'false') return null;
  return process.env.SOCKS_PROXY ||
    process.env.ALL_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.HTTPS_PROXY ||
    null;
}

function isSocksProxy(proxyUrl) {
  return /^socks/i.test(proxyUrl || '');
}

function parseProxyAuth(proxyUrl) {
  try {
    const url = new URL(proxyUrl);
    if (!url.username) return null;
    const user = decodeURIComponent(url.username);
    const pass = decodeURIComponent(url.password || '');
    return `${user}:${pass}`;
  } catch (e) {
    return null;
  }
}

function createProxyAgent(proxyUrl) {
  if (!proxyUrl) return null;
  if (isSocksProxy(proxyUrl)) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpsProxyAgent(proxyUrl, { keepAlive: true });
}

function getRequestNativeProxyOptions(proxyUrl) {
  if (!proxyUrl || isSocksProxy(proxyUrl)) return null;

  const auth = parseProxyAuth(proxyUrl);
  try {
    const url = new URL(proxyUrl);
    const port = url.port || '8080';
    const proxyHost = `${url.protocol}//${url.hostname}:${port}`;

    const options = {
      proxy: proxyHost,
      tunnel: true,
      strictSSL: true,
      timeout: 30000,
      forever: true
    };

    if (auth) options.proxyAuth = auth;
    return options;
  } catch (e) {
    return { proxy: proxyUrl, tunnel: true, strictSSL: true, timeout: 30000 };
  }
}

function getTelegramRequestOptionsFromAgent(agent) {
  if (!agent) {
    return { proxy: false, family: 4, timeout: 30000 };
  }
  return { agent, proxy: false, timeout: 8000 };
}

function getTelegramRequestOptionsFromRequestProxy(proxyUrl) {
  const options = getRequestNativeProxyOptions(proxyUrl);
  if (!options) return null;
  return { ...options, proxy: false, family: 4 };
}

function getTelegramRequestStrategies() {
  const proxyUrl = getProxyUrl();
  const strategies = [];

  if (proxyUrl) {
    if (isSocksProxy(proxyUrl)) {
      // Proxy6 и аналоги: SOCKS часто рвёт long-poll, HTTP на том же порту — стабильнее.
      const httpUrl = proxyUrl.replace(/^socks5:\/\//i, 'http://');
      strategies.push({
        name: 'HTTP proxy (agent)',
        request: getTelegramRequestOptionsFromAgent(createProxyAgent(httpUrl))
      });
      strategies.push({
        name: 'SOCKS proxy',
        request: getTelegramRequestOptionsFromAgent(createProxyAgent(proxyUrl))
      });
    } else {
      // Proxy6: request-тunnel даёт 407, agent работает — не тратим 30s на лишнюю попытку.
      strategies.push({
        name: 'HTTP proxy (agent)',
        request: getTelegramRequestOptionsFromAgent(createProxyAgent(proxyUrl))
      });
    }
    return strategies;
  }

  strategies.push({ name: 'direct (IPv4)', request: { proxy: false, family: 4, timeout: 30000 } });
  strategies.push({ name: 'direct', request: { proxy: false, timeout: 30000 } });

  return strategies;
}

function isProxyError(error) {
  const parts = [
    error?.message,
    error?.code,
    ...(error?.errors || []).map(e => e?.message || e?.code)
  ].filter(Boolean).join(' ');

  return /407|tunneling socket|Proxy Authentication|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET/i.test(parts) ||
    error?.code === 'EFATAL';
}

function formatConnectionError(error) {
  const details = (error?.errors || [])
    .map(e => e?.code || e?.message)
    .filter(Boolean)
    .join(', ');

  if (details) return `${error.message} (${details})`;
  return error?.message || String(error);
}

function getAxiosProxyConfig(agent) {
  if (!agent) return { proxy: false };
  return { httpAgent: agent, httpsAgent: agent, proxy: false };
}

function buildAxiosAgent() {
  return createProxyAgent(getProxyUrl());
}

module.exports = {
  getProxyUrl,
  createProxyAgent,
  buildAxiosAgent,
  isProxyError,
  isSocksProxy,
  getTelegramRequestStrategies,
  getTelegramRequestOptionsFromAgent,
  getAxiosProxyConfig,
  formatConnectionError
};
