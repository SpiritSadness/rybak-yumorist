#!/usr/bin/env node
require('dotenv').config();

const jokePoolService = require('../services/jokePoolService');

async function main() {
  console.log('Пересборка базы анекдотов...\n');

  try {
    const result = await jokePoolService.rebuildPool();
    console.log('\n✅ Готово');
    console.log(`   С сайта (anekdot.ru): ${result.scraped}`);
    console.log(`   Запасные (fallback):  ${result.fallback}`);
    console.log(`   Уникальных:           ${result.unique}`);
    console.log(`   В базе:               ${result.stored}`);
    console.log(`   Голоса сохранены:     ${result.votesPreserved || 0}`);
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    process.exit(1);
  }
}

main();
