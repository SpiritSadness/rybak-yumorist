const axios = require('axios');
const sitesConfig = require('./config/sites');

async function testSource(source) {
  console.log(`Testing: ${source.name}`);
  try {
    const response = await axios.get(source.url, { timeout: 15000 });
    console.log(`OK: ${response.status}, bytes: ${response.data.length}`);
    return { name: source.name, status: response.status, works: true };
  } catch (error) {
    console.log(`FAIL: ${error.message}`);
    return { name: source.name, works: false, error: error.message };
  }
}

async function main() {
  const results = [];
  for (const source of sitesConfig.sources) {
    results.push(await testSource(source));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const working = results.filter(r => r.works).length;
  console.log(`\nDone: ${working}/${results.length} sources reachable`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
