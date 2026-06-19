const axios = require('axios');
const moment = require('moment-timezone');
const cities = require('../config/weatherCities');
const { buildAxiosAgent, getAxiosProxyConfig } = require('../utils/proxy');

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

const WEATHER_PARAMS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'surface_pressure',
  'visibility',
  'uv_index',
  'is_day'
].join(',');

const HOURLY_PARAMS = [
  'temperature_2m',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'cloud_cover'
].join(',');

function getCity(cityId) {
  return cities[cityId] || cities.kostroma;
}

function getCities() {
  return Object.values(cities);
}

function clearWeatherCache(cityId = null) {
  if (cityId) cache.delete(cityId);
  else cache.clear();
}

function getWeatherDescription(code) {
  const map = {
    0: '☀️ Ясно',
    1: '🌤️ Малооблачно',
    2: '⛅ Облачно',
    3: '☁️ Пасмурно',
    45: '🌫️ Туман',
    48: '🌫️ Изморозь',
    51: '🌧️ Морось',
    53: '🌧️ Морось',
    55: '🌧️ Морось',
    61: '🌧️ Дождь',
    63: '🌧️ Дождь',
    65: '🌧️ Ливень',
    71: '🌨️ Снег',
    73: '🌨️ Снег',
    75: '🌨️ Снегопад',
    80: '🌦️ Ливень',
    81: '🌦️ Ливень',
    82: '⛈️ Ливень',
    95: '⛈️ Гроза',
    96: '⛈️ Гроза с градом',
    99: '⛈️ Гроза с градом'
  };
  return map[code] || '❓ Без данных';
}

function getWindDirection(degrees) {
  if (degrees == null) return '—';
  if (degrees >= 337.5 || degrees < 22.5) return 'С';
  if (degrees < 67.5) return 'СВ';
  if (degrees < 112.5) return 'В';
  if (degrees < 157.5) return 'ЮВ';
  if (degrees < 202.5) return 'Ю';
  if (degrees < 247.5) return 'ЮЗ';
  if (degrees < 292.5) return 'З';
  return 'СЗ';
}

function getPressureDesc(hpa) {
  if (hpa > 1015) return 'Повышенное';
  if (hpa >= 1005) return 'Нормальное';
  if (hpa >= 995) return 'Пониженное';
  return 'Низкое';
}

function getWindStrengthDesc(speed) {
  if (speed <= 0.5) return 'Штиль';
  if (speed <= 3.3) return 'Слабый';
  if (speed <= 5.5) return 'Умеренный';
  if (speed <= 7.9) return 'Свежий';
  if (speed <= 10.7) return 'Сильный';
  return 'Шторм';
}

function getCloudDesc(cover) {
  if (cover == null) return '—';
  if (cover <= 10) return 'Ясно';
  if (cover <= 30) return 'Малооблачно';
  if (cover <= 60) return 'Облачно';
  if (cover <= 90) return 'Пасмурно';
  return 'Сплошная облачность';
}

function getUvDesc(uv) {
  if (uv == null) return '—';
  if (uv <= 2) return 'Низкий';
  if (uv <= 5) return 'Умеренный';
  if (uv <= 7) return 'Высокий';
  if (uv <= 10) return 'Очень высокий';
  return 'Экстремальный';
}

function getComfort(temp) {
  if (temp < -15) return '🥶 Очень холодно';
  if (temp < -5) return '❄️ Холодно';
  if (temp < 5) return '🧥 Прохладно';
  if (temp < 18) return '🌤️ Комфортно';
  if (temp < 26) return '☀️ Тепло';
  return '🥵 Жарко';
}

async function fetchOpenMeteo(city) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
    `&current=${WEATHER_PARAMS}` +
    `&hourly=${HOURLY_PARAMS}` +
    '&timezone=Europe%2FMoscow&forecast_days=1';

  const agent = buildAxiosAgent();
  const response = await axios.get(url, {
    timeout: 20000,
    headers: { Accept: 'application/json', 'User-Agent': 'RybakYumoristBot/2.0' },
    ...(agent ? getAxiosProxyConfig(agent) : { proxy: false })
  });

  return response.data;
}

function buildHourlyForecast(hourly) {
  if (!hourly?.time?.length) return [];

  const now = moment.tz('Europe/Moscow');
  const result = [];

  for (let i = 0; i < hourly.time.length && result.length < 8; i += 1) {
    const hourMoment = moment.tz(hourly.time[i], 'Europe/Moscow');
    if (hourMoment.isBefore(now.clone().subtract(1, 'hour'))) continue;

    result.push({
      time: hourMoment.format('HH:mm'),
      temperature: Math.round(hourly.temperature_2m[i]),
      weatherDesc: getWeatherDescription(hourly.weather_code[i]),
      windSpeed: Math.round(hourly.wind_speed_10m[i]),
      windDirection: getWindDirection(hourly.wind_direction_10m[i]),
      precipitationProb: hourly.precipitation_probability?.[i] || 0
    });
  }

  return result;
}

function parseWeatherResponse(json, city) {
  const current = json.current;
  const hourly = json.hourly;
  if (!current) throw new Error('No current weather in API response');

  const pressureHpa = current.surface_pressure;
  const cloudCover = hourly?.cloud_cover?.[0] ?? null;
  const precipProb = hourly?.precipitation_probability?.[0] || 0;

  return {
    cityId: city.id,
    cityName: city.name,
    cityEmoji: city.emoji,
    fetchedAt: moment.tz('Europe/Moscow').format('DD.MM.YYYY HH:mm'),
    weatherDescription: getWeatherDescription(current.weather_code),
    temperature: Math.round(current.temperature_2m),
    feelsLike: Math.round(current.apparent_temperature),
    humidity: current.relative_humidity_2m,
    windSpeed: Math.round(current.wind_speed_10m),
    windDirection: getWindDirection(current.wind_direction_10m),
    windStrengthDesc: getWindStrengthDesc(current.wind_speed_10m),
    pressure: Math.round(pressureHpa * 0.750062),
    pressureDesc: getPressureDesc(pressureHpa),
    precipitation: current.precipitation || 0,
    precipitationProbability: precipProb,
    visibility: current.visibility ? (current.visibility / 1000).toFixed(1) : '>10',
    cloudCover,
    cloudDesc: getCloudDesc(cloudCover),
    uvIndex: current.uv_index ?? null,
    uvDesc: getUvDesc(current.uv_index),
    comfort: getComfort(current.temperature_2m),
    isDay: current.is_day === 1,
    hourly: buildHourlyForecast(hourly)
  };
}

async function getWeather(cityId = 'kostroma', { forceRefresh = false } = {}) {
  const city = getCity(cityId);
  const now = Date.now();
  const cached = cache.get(city.id);

  if (!forceRefresh && cached && (now - cached.time) < CACHE_MS) {
    return cached.data;
  }

  const json = await fetchOpenMeteo(city);
  const data = parseWeatherResponse(json, city);
  cache.set(city.id, { data, time: now });
  return data;
}

module.exports = {
  getWeather,
  getCity,
  getCities,
  clearWeatherCache,
  getWeatherDescription,
  getWindDirection
};
