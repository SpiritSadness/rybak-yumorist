/**
 * ТЕСТ ПРЕЦИЗИОННОГО РАСЧЁТА ФАЗ ЛУНЫ
 */

const moonCalc = require('./services/moonPhaseCalculator');

console.log('═══════════════════════════════════════════════════════════════');
console.log('🌙 ТЕСТ КАЛЬКУЛЯТОРА ФАЗ ЛУНЫ');
console.log('═══════════════════════════════════════════════════════════════\n');

// Current moon
const current = moonCalc.getMoonPhaseNow();
console.log('━━━ ТЕКУЩАЯ ФАЗА ━━━');
console.log(`Дата: ${new Date().toString()}`);
console.log(`Возраст: ${current.age} дней`);
console.log(`Освещённость: ${current.illumination}%`);
console.log(`Видимая часть: ${current.visiblePercent}%`);
console.log(`Фаза: ${current.phaseEmoji} ${current.phaseName}`);
console.log(`Луна: ${current.isWaxing ? 'Растущая 🌒' : 'Убывающая 🌖'}`);
console.log(`Дней до полнолуния: ${current.daysUntilFull}`);
console.log(`Дней до новолуния: ${current.daysUntilNew}`);
console.log();
console.log(`🐟 Влияние на клёв: ${current.fishingImpact.impactDesc}`);
console.log();

// Verification against known astronomical events
console.log('━━━ ПРОВЕРКА НА ИЗВЕСТНЫХ ДАТАХ ━━━');
const tests = [
  { date: '2024-12-31', expected: 'new', desc: 'Новолуние 31 дек 2024' },
  { date: '2024-04-23', expected: 'full', desc: 'Полнолуние 23 апр 2024' },
  { date: '2024-04-17', expected: 'quarter', desc: 'Первая четверть 17 апр 2024' },
  { date: '2024-01-25', expected: 'full', desc: 'Полнолуние 25 янв 2024' },
];

for (const t of tests) {
  const r = moonCalc.getMoonPhase(t.date + ' 12:00:00', 'Europe/Moscow');
  const match = (t.expected === 'new' && r.age < 3) || 
                (t.expected === 'full' && r.age > 12 && r.age < 17) ||
                (t.expected === 'quarter' && r.age > 7 && r.age < 10);
  const status = match ? '✅' : '⚠️';
  console.log(`${status} ${t.desc}`);
  console.log(`   Результат: возраст ${r.age} дней, ${r.phaseName}`);
}

console.log();
console.log('═══════════════════════════════════════════════════════════════');
console.log('🌊 РАСЧЁТ ФАЗ ЛУНЫ ЗАВЕРШЁН');
console.log('═══════════════════════════════════════════════════════════════');