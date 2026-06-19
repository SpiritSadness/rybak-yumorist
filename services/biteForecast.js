/**
 * ПРОДВИНУТЫЙ СЕРВИС ПРОГНОЗА КЛЁВА
 * Реальная погода из Open-Meteo API для Костромы
 * Реки: Унжа, Волга, Ока
 *
 * Использует прецизионный астрономический калькулятор фаз луны (Jean Meeus algorithms)
 */

const moment = require('moment-timezone');
moment.locale('ru');
const { getWeather } = require('./weatherService');
const moonCalc = require('./moonPhaseCalculator');

// Кеш погоды на 10 минут
let weatherCache = null;
let weatherCacheTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 минут

function clearWeatherCache() {
  weatherCache = null;
  weatherCacheTime = 0;
}

/**
 * Получить погоду (с кешем)
 */
async function getCachedWeather() {
  const now = Date.now();
  if (weatherCache && (now - weatherCacheTime) < CACHE_DURATION) {
    return weatherCache;
  }
  try {
    weatherCache = await getWeather();
    weatherCacheTime = now;
    return weatherCache;
  } catch (e) {
    // Если ошибка, возвращаем кеш если есть
    if (weatherCache) return weatherCache;
    throw e;
  }
}

// ============ РАСЧЁТ ФАЗЫ ЛУНЫ (прецизионный астрономический) ============
function getMoonPhase() {
  // Используем прецизионный калькулятор на основе алгоритмов Jean Meeus
  const moonData = moonCalc.getMoonPhaseNow();
  
  return {
    age: moonData.age,
    illumination: moonData.illumination,
    visiblePercent: moonData.visiblePercent,
    daysUntilFull: moonData.daysUntilFull,
    daysUntilNew: moonData.daysUntilNew,
    name: moonData.phaseDesc,
    emoji: moonData.emoji,
    desc: moonData.isWaxing ? 'Растущая луна' : 'Убывающая луна',
    phaseName: moonData.phaseName,
    phaseKey: moonData.phaseKey,
    fishingImpact: moonData.fishingImpact,
    julianDay: moonData.julianDay,
    isWaxing: moonData.isWaxing,
    isWaning: moonData.isWaning
  };
}

// ============ ВРЕМЯ СУТОК ============
function getTimeOfDay() {
  const now = moment.tz('Europe/Moscow');
  const hour = now.hour();
  const minute = now.minute();
  
  let period, periodDesc, emoji;
  if (hour >= 5 && hour < 8) { period = 'dawn'; periodDesc = 'Рыбацкий рассвет'; emoji = '🌅'; }
  else if (hour >= 8 && hour < 11) { period = 'morning'; periodDesc = 'Утро'; emoji = '☀️'; }
  else if (hour >= 11 && hour < 14) { period = 'midday'; periodDesc = 'Полдень'; emoji = '🌤️'; }
  else if (hour >= 14 && hour < 17) { period = 'afternoon'; periodDesc = 'Послеобеденье'; emoji = '🌤️'; }
  else if (hour >= 17 && hour < 20) { period = 'evening'; periodDesc = 'Вечер'; emoji = '🌅'; }
  else if (hour >= 20 && hour < 23) { period = 'twilight'; periodDesc = 'Сумерки'; emoji = '🌆'; }
  else { period = 'night'; periodDesc = 'Ночь'; emoji = '🌙'; }
  
  return {
    hour, minute,
    period, periodDesc, emoji,
    formatted: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
  };
}

// ============ СЕЗОН ============
function getSeason() {
  const now = moment.tz('Europe/Moscow');
  const month = now.month();
  const day = now.date();
  
  if (month === 2 && day < 15) return { id: 4, name: 'Зима', desc: 'Ранняя весна', emoji: '❄️', fishing: 'зимняя' };
  if (month === 2) return { id: 1, name: 'Весна', desc: 'Начало весны', emoji: '🌱', fishing: 'весенняя' };
  if (month === 3) return { id: 1, name: 'Весна', desc: 'Весна', emoji: '🌸', fishing: 'весенняя' };
  if (month === 4) return { id: 1, name: 'Весна', desc: 'Весна', emoji: '🌿', fishing: 'весенняя' };
  if (month === 5 && day < 15) return { id: 1, name: 'Весна', desc: 'Конец весны', emoji: '🌿', fishing: 'весенняя' };
  if (month === 5) return { id: 2, name: 'Лето', desc: 'Начало лета', emoji: '☀️', fishing: 'летняя' };
  if (month === 6) return { id: 2, name: 'Лето', desc: 'Лето', emoji: '🌻', fishing: 'летняя' };
  if (month === 7) return { id: 2, name: 'Лето', desc: 'Разгар лета', emoji: '🔥', fishing: 'летняя' };
  if (month === 8 && day < 15) return { id: 2, name: 'Лето', desc: 'Конец лета', emoji: '🌾', fishing: 'летняя' };
  if (month === 8) return { id: 3, name: 'Осень', desc: 'Начало осени', emoji: '🍂', fishing: 'осенняя' };
  if (month === 9) return { id: 3, name: 'Осень', desc: 'Осень', emoji: '🍁', fishing: 'осенняя' };
  if (month === 10 && day < 15) return { id: 3, name: 'Осень', desc: 'Осень', emoji: '🍂', fishing: 'осенняя' };
  if (month === 10) return { id: 4, name: 'Зима', desc: 'Начало зимы', emoji: '❄️', fishing: 'зимняя' };
  if (month === 11) return { id: 4, name: 'Зима', desc: 'Зима', emoji: '🌨️', fishing: 'зимняя' };
  if (month === 0) return { id: 4, name: 'Зима', desc: 'Глубокая зима', emoji: '🥶', fishing: 'зимняя' };
  if (month === 1 && day < 15) return { id: 4, name: 'Зима', desc: 'Зима', emoji: '🥶', fishing: 'зимняя' };
  
  return { id: 2, name: 'Лето', desc: 'Лето', emoji: '☀️', fishing: 'летняя' };
}

// ============ РАСЧЁТ ИНДЕКСА КЛЁВА ============
function calculateBiteIndex(params) {
  const { time, season, moon, weather } = params;
  let index = 50;
  
  // Время
  if (time.hour >= 5 && time.hour < 8) index += 25;
  else if (time.hour >= 4 && time.hour < 5) index += 15;
  else if (time.hour >= 17 && time.hour < 20) index += 20;
  else if (time.hour >= 11 && time.hour < 14) index += 5;
  else if (time.hour >= 14 && time.hour < 17) index += 10;
  else if (time.hour >= 23 || time.hour < 4) index -= 20;
  else if (time.hour >= 0 && time.hour < 4) index -= 10;
  
  // Сезон
  switch(season.id) {
    case 1: index += 20; break;
    case 2: index += 15; break;
    case 3: index += 18; break;
    case 4: index -= 10; break;
  }
  
  // Луна - используем прецизионный расчёт с fishingImpact
  if (moon.fishingImpact) {
    switch(moon.fishingImpact.impact) {
      case 'excellent': index += 20; break;
      case 'good': index += 10; break;
      case 'moderate': index += 0; break;
      case 'fair': index -= 5; break;
      case 'poor': index -= 15; break;
    }
  } else {
    // Fallback на старый метод если fishingImpact не доступен
    if (moon.age < 2 || moon.age > 27) index += 20;
    else if (moon.age > 13 && moon.age < 16) index += 18;
    else if ((moon.age > 6 && moon.age < 9) || (moon.age > 21 && moon.age < 24)) index -= 10;
  }
  
  // Дополнительные факторы видимости луны
  if (moon.visiblePercent) {
    // Хорошая видимость (40-80%) положительно влияет на ночную рыбалку
    if (moon.visiblePercent >= 40 && moon.visiblePercent <= 80) index += 5;
  }
  
  // Погода
  if (weather.pressureStatus === 'high') index += 15;
  else if (weather.pressureStatus === 'normal') index += 5;
  else if (weather.pressureStatus === 'slight_low') index -= 5;
  else if (weather.pressureStatus === 'low') index -= 15;
  
  if (weather.windStrength === 'calm') index -= 5;
  else if (weather.windStrength === 'light') index += 5;
  else if (weather.windStrength === 'moderate') index += 10;
  else if (weather.windStrength === 'fresh') index -= 5;
  else if (weather.windStrength === 'strong') index -= 20;
  
  if (weather.windDirection === 'Ю' || weather.windDirection === 'ЮЗ') index += 5;
  if (weather.windDirection === 'С' || weather.windDirection === 'СЗ') index -= 5;
  
  const temp = weather.temperature;
  if (season.id === 4) {
    if (temp < -20) index -= 25;
    else if (temp < -10) index -= 10;
    else if (temp >= -10 && temp <= -3) index += 15;
  } else if (season.id === 1) {
    if (temp < 3) index -= 10;
    else if (temp >= 10 && temp <= 18) index += 15;
    else if (temp > 18) index -= 5;
  } else if (season.id === 2) {
    if (temp < 12) index -= 10;
    else if (temp >= 15 && temp <= 25) index += 10;
    else if (temp > 28) index -= 15;
  } else if (season.id === 3) {
    if (temp < 3) index -= 15;
    else if (temp >= 5 && temp <= 12) index += 15;
    else if (temp > 15) index -= 5;
  }
  
  index += 5;
  index = Math.max(0, Math.min(100, index));
  return Math.round(index);
}

// ============ АКТИВНОСТЬ РЫБЫ ============
function getFishActivity(biteIndex, season, weather) {
  const fish = [];
  const temp = weather.temperature;
  const time = getTimeOfDay();
  
  // Щука
  let pikeActivity = 'Средняя', pikeEmoji = '🐺';
  if (season.id === 1) { pikeActivity = 'Жор!'; pikeEmoji = '🔥🐺'; }
  else if (season.id === 3 && biteIndex > 70) { pikeActivity = 'Жор!'; pikeEmoji = '🔥🐺'; }
  else if (season.id === 4 && temp < -10) { pikeActivity = 'Слабая'; pikeEmoji = '🐺'; }
  else if (biteIndex > 75) { pikeActivity = 'Хорошая'; pikeEmoji = '😁🐺'; }
  else if (biteIndex < 40) { pikeActivity = 'Слабая'; pikeEmoji = '😴🐺'; }
  fish.push({ name: 'Щука', emoji: pikeEmoji, activity: pikeActivity, type: 'хищник' });
  
  // Судак
  let zanderActivity = 'Средняя', zanderEmoji = '🐟';
  if (season.id === 3 && biteIndex > 65) { zanderActivity = 'Отличная'; zanderEmoji = '😁🐟'; }
  else if (time.hour >= 17 && time.hour <= 21) { zanderActivity = 'Хорошая'; zanderEmoji = '😁🐟'; }
  else if (biteIndex > 70) { zanderActivity = 'Хорошая'; zanderEmoji = '😁🐟'; }
  else if (biteIndex < 45) { zanderActivity = 'Слабая'; zanderEmoji = '😴🐟'; }
  fish.push({ name: 'Судак', emoji: zanderEmoji, activity: zanderActivity, type: 'хищник' });
  
  // Окунь
  let perchActivity = 'Средняя', perchEmoji = '🐠';
  if (season.id === 4) { perchActivity = 'Отличная'; perchEmoji = '🔥🐠'; }
  else if (biteIndex > 60) { perchActivity = 'Хорошая'; perchEmoji = '😁🐠'; }
  else if (biteIndex < 40) { perchActivity = 'Слабая'; perchEmoji = '😴🐠'; }
  fish.push({ name: 'Окунь', emoji: perchEmoji, activity: perchActivity, type: 'хищник' });
  
  // Лещ
  let breamActivity = 'Средняя', breamEmoji = '🐟';
  if (season.id === 3 && biteIndex > 70) { breamActivity = 'Отличная'; breamEmoji = '😁🐟'; }
  else if (season.id === 2 && temp >= 18 && temp <= 25) { breamActivity = 'Хорошая'; breamEmoji = '😁🐟'; }
  else if (time.hour >= 6 && time.hour <= 9) { breamActivity = 'Хорошая'; breamEmoji = '😁🐟'; }
  else if (biteIndex > 75) { breamActivity = 'Хорошая'; breamEmoji = '😁🐟'; }
  else if (biteIndex < 50) { breamActivity = 'Слабая'; breamEmoji = '😴🐟'; }
  fish.push({ name: 'Лещ', emoji: breamEmoji, activity: breamActivity, type: 'белый' });
  
  // Карась
  let carpActivity = 'Средняя', carpEmoji = '🎣';
  if (season.id === 2 && temp >= 18 && temp <= 28) { carpActivity = 'Отличная'; carpEmoji = '🔥🎣'; }
  else if (season.id === 1 && temp >= 15) { carpActivity = 'Хорошая'; carpEmoji = '😁🎣'; }
  else if (biteIndex > 70) { carpActivity = 'Хорошая'; carpEmoji = '😁🎣'; }
  else if (biteIndex < 50) { carpActivity = 'Слабая'; carpEmoji = '😴🎣'; }
  fish.push({ name: 'Карась', emoji: carpEmoji, activity: carpActivity, type: 'белый' });
  
  // Карп
  let commonCarpActivity = 'Средняя', commonCarpEmoji = '🐉';
  if (season.id === 2 && temp >= 20 && temp <= 28) { commonCarpActivity = 'Жор!'; commonCarpEmoji = '🔥🐉'; }
  else if (season.id === 3 && biteIndex > 70) { commonCarpActivity = 'Хорошая'; commonCarpEmoji = '😁🐉'; }
  else if (biteIndex > 80) { commonCarpActivity = 'Хорошая'; commonCarpEmoji = '😁🐉'; }
  else if (biteIndex < 45) { commonCarpActivity = 'Слабая'; commonCarpEmoji = '😴🐉'; }
  fish.push({ name: 'Карп', emoji: commonCarpEmoji, activity: commonCarpActivity, type: 'белый' });
  
  // Плотва
  let roachActivity = 'Средняя', roachEmoji = '🐟';
  if (season.id === 4) { roachActivity = 'Хорошая'; roachEmoji = '😁🐟'; }
  else if (season.id === 1 && temp >= 10) { roachActivity = 'Хорошая'; roachEmoji = '😁🐟'; }
  else if (biteIndex > 65) { roachActivity = 'Хорошая'; roachEmoji = '😁🐟'; }
  else if (biteIndex < 40) { roachActivity = 'Слабая'; roachEmoji = '😴🐟'; }
  fish.push({ name: 'Плотва', emoji: roachEmoji, activity: roachActivity, type: 'белый' });
  
  // Налим
  if (season.id === 4) {
    let burbotActivity = 'Средняя', burbotEmoji = '🐉';
    if (temp < -10) { burbotActivity = 'Отличная'; burbotEmoji = '🔥🐉'; }
    else if (temp >= -10 && temp <= -3) { burbotActivity = 'Хорошая'; burbotEmoji = '😁🐉'; }
    else { burbotActivity = 'Слабая'; burbotEmoji = '😴🐉'; }
    fish.push({ name: 'Налим', emoji: burbotEmoji, activity: burbotActivity, type: 'хищник' });
  }
  
  return fish;
}

// ============ ПРОГНОЗ ДЛЯ РЕКИ УНЖА ============
function getUnzhaForecast(biteIndex, season, weather) {
  let unzhaModifier = 0;
  
  if (weather.windDirection === 'Ю' || weather.windDirection === 'ЮВ') unzhaModifier += 10;
  else if (weather.windDirection === 'С' || weather.windDirection === 'СЗ') unzhaModifier -= 10;
  
  unzhaModifier += 5;
  
  if (weather.pressureStatus === 'high') unzhaModifier += 10;
  else if (weather.pressureStatus === 'low') unzhaModifier -= 15;
  
  const unzhaIndex = Math.max(0, Math.min(100, biteIndex + unzhaModifier));
  const temp = weather.temperature;
  
  const unzhaFish = [];
  
  let pikeUnzha = 'Средняя';
  if (season.id === 1) pikeUnzha = 'Жор!';
  else if (season.id === 3) pikeUnzha = 'Отличная';
  else if (unzhaIndex > 70) pikeUnzha = 'Хорошая';
  else if (unzhaIndex < 40) pikeUnzha = 'Слабая';
  unzhaFish.push({ name: 'Щука', emoji: '🐺', activity: pikeUnzha });
  
  let zanderUnzha = 'Средняя';
  if (season.id === 3 && unzhaIndex > 65) zanderUnzha = 'Отличная';
  else if (unzhaIndex > 70) zanderUnzha = 'Хорошая';
  else if (unzhaIndex < 45) zanderUnzha = 'Слабая';
  unzhaFish.push({ name: 'Судак', emoji: '🐟', activity: zanderUnzha });
  
  let breamUnzha = 'Средняя';
  if (season.id === 3 && unzhaIndex > 70) breamUnzha = 'Отличная';
  else if (season.id === 2 && temp >= 18 && temp <= 25) breamUnzha = 'Хорошая';
  else if (unzhaIndex > 75) breamUnzha = 'Хорошая';
  else if (unzhaIndex < 50) breamUnzha = 'Слабая';
  unzhaFish.push({ name: 'Лещ', emoji: '🐟', activity: breamUnzha });
  
  let perchUnzha = 'Средняя';
  if (season.id === 4) perchUnzha = 'Отличная';
  else if (unzhaIndex > 65) perchUnzha = 'Хорошая';
  else if (unzhaIndex < 45) perchUnzha = 'Слабая';
  unzhaFish.push({ name: 'Окунь', emoji: '🐠', activity: perchUnzha });
  
  return {
    river: '🏞️ <b>р. Унжа</b> (Кострома)',
    index: unzhaIndex,
    fish: unzhaFish
  };
}

// ============ ГЛАВНАЯ АСИНХРОННАЯ ФУНКЦИЯ ============
async function getForecast() {
  const now = moment.tz('Europe/Moscow');
  const time = getTimeOfDay();
  const season = getSeason();
  const moon = getMoonPhase();
  const weather = await getCachedWeather();
  
  const biteIndex = calculateBiteIndex({ time, season, moon, weather });
  const fishActivity = getFishActivity(biteIndex, season, weather);
  const unzha = getUnzhaForecast(biteIndex, season, weather);
  
  const predators = fishActivity.filter(f => f.type === 'хищник');
  const whiteFish = fishActivity.filter(f => f.type === 'белый');
  
  let biteText, biteEmoji;
  if (biteIndex >= 85) { biteText = 'Отличный клёв!'; biteEmoji = '🎣'; }
  else if (biteIndex >= 70) { biteText = 'Хороший клёв'; biteEmoji = '😁'; }
  else if (biteIndex >= 55) { biteText = 'Средний клёв'; biteEmoji = '😐'; }
  else if (biteIndex >= 40) { biteText = 'Слабый клёв'; biteEmoji = '😴'; }
  else if (biteIndex >= 25) { biteText = 'Плохой клёв'; biteEmoji = '😞'; }
  else { biteText = 'Клёва нет'; biteEmoji = '😵'; }
  
  const todayForecast = biteIndex >= 70 ? 'Благоприятный день для рыбалки!' :
                        biteIndex >= 50 ? 'Можно порыбачить' :
                        biteIndex >= 30 ? 'Рыбалка сомнительна' : 'Лучше остаться дома';
  
  let tackleTip;
  if (season.id === 4) tackleTip = '🪤 Зимняя удочка, мормышка';
  else if (time.hour >= 5 && time.hour <= 9) tackleTip = '🎣 Утренний фидер, живность';
  else tackleTip = '🪱 Поплавок, донные снасти';
  
  return {
    now: now.format('DD MMMM YYYY, dddd'),
    time,
    season,
    moon,
    weather,
    biteIndex,
    biteText,
    biteEmoji,
    forecast: todayForecast,
    tackleTip,
    fishActivity,
    predators,
    whiteFish,
    unzha,
    weatherSummary: `${weather.comfort}, ${weather.windDirection} ветер ${weather.windSpeed} м/с ${weather.windStrengthDesc}, давление ${weather.pressure} мм рт.ст., видимость ${weather.visibility} км`
  };
}

// Синхронная версия для callback (использует кеш)
function getForecastSync() {
  const now = moment.tz('Europe/Moscow');
  const time = getTimeOfDay();
  const season = getSeason();
  const moon = getMoonPhase();
  
  // Вычисляем базовый индекс без погоды (если погода есть - используем её)
  let biteIndex, fishActivity, unzha, weather;
  
  if (weatherCache) {
    weather = weatherCache;
    biteIndex = calculateBiteIndex({ time, season, moon, weather });
  } else {
    // Базовый расчёт без погоды
    const moonBonus = moon.phase >= 0.4 && moon.phase <= 0.6 ? 10 : 0;
    const timeBonus = (time.hour >= 5 && time.hour <= 9) || (time.hour >= 17 && time.hour <= 20) ? 15 : 0;
    const seasonBonus = (season.id === 2 || season.id === 3) ? 10 : 0;
    biteIndex = 50 + moonBonus + timeBonus + seasonBonus;
    biteIndex = Math.min(100, Math.max(10, biteIndex));
  }
  
  fishActivity = getFishActivity(biteIndex, season, weather || {});
  unzha = getUnzhaForecast(biteIndex, season, weather || {});
  
  const predators = fishActivity.filter(f => f.type === 'хищник');
  const whiteFish = fishActivity.filter(f => f.type === 'белый');
  
  let biteText, biteEmoji;
  if (biteIndex >= 85) { biteText = 'Отличный клёв!'; biteEmoji = '🎣'; }
  else if (biteIndex >= 70) { biteText = 'Хороший клёв'; biteEmoji = '😁'; }
  else if (biteIndex >= 55) { biteText = 'Средний клёв'; biteEmoji = '😐'; }
  else if (biteIndex >= 40) { biteText = 'Слабый клёв'; biteEmoji = '😴'; }
  else if (biteIndex >= 25) { biteText = 'Плохой клёв'; biteEmoji = '😞'; }
  else { biteText = 'Клёва нет'; biteEmoji = '😵'; }
  
  const todayForecast = biteIndex >= 70 ? 'Благоприятный день для рыбалки!' :
                        biteIndex >= 50 ? 'Можно порыбачить' :
                        biteIndex >= 30 ? 'Рыбалка сомнительна' : 'Лучше остаться дома';
  
  let tackleTip;
  if (season.id === 4) tackleTip = '🪤 Зимняя удочка, мормышка';
  else if (time.hour >= 5 && time.hour <= 9) tackleTip = '🎣 Утренний фидер, живность';
  else tackleTip = '🪱 Поплавок, донные снасти';
  
  return {
    now: now.format('DD MMMM YYYY, dddd'),
    time,
    season,
    moon,
    weather,
    biteIndex,
    biteText,
    biteEmoji,
    forecast: todayForecast,
    tackleTip,
    fishActivity,
    predators,
    whiteFish,
    unzha,
    weatherSummary: weather ? `${weather.comfort}, ${weather.windDirection} ветер ${weather.windSpeed} м/с, давление ${weather.pressure} мм рт.ст.` : 'Данные загружаются...'
  };
}

module.exports = {
  getForecast,
  getForecastSync,
  getMoonPhase,
  getTimeOfDay,
  getSeason,
  clearWeatherCache
};
