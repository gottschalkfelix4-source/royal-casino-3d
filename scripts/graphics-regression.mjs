import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.CASINO_PLAYWRIGHT_MODULE || 'playwright');
const directory = resolve(process.env.CASINO_PERF_OUTPUT || 'docs/performance50-evidence');
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CASINO_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CASINO_CHROMIUM_EXECUTABLE } : { channel: 'chrome' }),
  headless: true,
  args: process.env.CASINO_SOFTWARE_GL === '1' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
});
try {
  const page = await browser.newPage({ viewport: {
    width: Number(process.env.CASINO_QA_WIDTH || 1600), height: Number(process.env.CASINO_QA_HEIGHT || 900),
  } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(`http://localhost:${process.env.CASINO_CURRENT_PORT || 3100}/__qa.html${process.env.CASINO_QA_AUTO === '1' ? '?auto=1' : ''}`);
  await page.locator('#run').click();
  await page.waitForFunction(() => {
    try { const result = JSON.parse(document.querySelector('#result').textContent); return result.errors.length || result.results.some(r => r.PASS); }
    catch { return false; }
  }, {}, { timeout: 300000 });
  const report = JSON.parse(await page.locator('#result').textContent());
  report.consoleErrors = errors;
  writeFileSync(resolve(directory, 'regression.json'), JSON.stringify(report, null, 2));
  const cycles = report.results.filter(r => r.afterCycle);
  const high = cycles.filter(r => r.quality === 'high');
  if (report.errors.length || errors.length || !report.results.some(r => r.PASS)) throw new Error(JSON.stringify(report));
  // Camera culling and LOD lazily upload GPU resources, so exact GPU counters vary.
  for (const key of ['registry', 'updaters', 'canvasCount']) {
    if (high[0].afterCycle[key] !== high[1].afterCycle[key]) throw new Error(`Resources changed after returning to high quality: ${key}`);
  }
  console.log(JSON.stringify({ mounts: report.results.find(r => r.PASS).mounts, errors: report.errors.length + errors.length, cycles }, null, 2));
} finally { await browser.close(); }
