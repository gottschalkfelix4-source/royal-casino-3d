// Optional browser benchmark, following the existing graphics QA Playwright setup.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.CASINO_PLAYWRIGHT_MODULE || 'playwright');
const currentPort = Number(process.env.CASINO_CURRENT_PORT || 3000);
const baselinePort = Number(process.env.CASINO_BASELINE_PORT || 3001);
const repetitions = Number(process.env.CASINO_PERF_REPETITIONS || 2);
const output = resolve(process.env.CASINO_PERF_OUTPUT || 'docs/loading-evidence');
mkdirSync(output, { recursive: true });
const results = [];

for (let repetition = 0; repetition < repetitions; repetition++) {
  // Alternate order and use a fresh browser profile, without HTTP/GPU cache reuse.
  for (const version of repetition % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
    const browser = await chromium.launch({
      ...(process.env.CASINO_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CASINO_CHROMIUM_EXECUTABLE } : { channel: 'chrome' }),
      headless: true,
      args: process.env.CASINO_SOFTWARE_GL === '1' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [], failedRequests = [], transfers = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure() }));
      await page.addInitScript(() => {
        localStorage.setItem('casino.quality', 'high');
        window.startup = { longTasks: [] };
        new PerformanceObserver(list => {
          for (const task of list.getEntries()) window.startup.longTasks.push({ start: task.startTime, duration: task.duration });
        }).observe({ type: 'longtask', buffered: true });
        const observer = new MutationObserver(() => {
          if (!document.querySelector('.lobby-strip') || !document.querySelector('#hall-layer canvas')) return;
          observer.disconnect();
          window.startup.scene = performance.now();
          requestAnimationFrame(async () => {
            // New startup resolves this promise after compilation and first render.
            // The baseline starts rendering synchronously during scene creation.
            if (window.__casinoReady) await window.__casinoReady;
            requestAnimationFrame(() => { window.startup.firstFrame = performance.now(); });
          });
        });
        observer.observe(document, { childList: true, subtree: true });
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 100, downloadThroughput: 1250000, uploadThroughput: 625000,
      });
      cdp.on('Network.loadingFinished', event => transfers.push(event.encodedDataLength));
      await page.goto(`http://127.0.0.1:${version === 'current' ? currentPort : baselinePort}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.startup.firstFrame, {}, { timeout: 120000 });
      const measurement = await page.evaluate(() => ({
        ...window.startup,
        resources: performance.getEntriesByType('resource').map(resource => ({
          name: resource.name.replace(location.origin, ''), duration: resource.duration, encodedBodySize: resource.encodedBodySize,
        })),
        fonts: document.fonts.status,
        canvasCount: document.querySelectorAll('.three-canvas').length,
      }));
      const result = { version, repetition, browser: await browser.version(), measurement,
        wireBytes: transfers.reduce((a, b) => a + b, 0), errors, failedRequests };
      results.push(result);
      writeFileSync(resolve(output, 'startup.json'), JSON.stringify({ viewport: [1280, 720], quality: 'high', downloadMbit: 10, latencyMs: 100,
        softwareGL: process.env.CASINO_SOFTWARE_GL === '1', results }, null, 2));
      console.log(JSON.stringify({ version, repetition, firstFrameMs: Math.round(measurement.firstFrame), wireBytes: result.wireBytes,
        requests: measurement.resources.length, errors, failedRequests: failedRequests.length }));
      if (errors.length || measurement.canvasCount !== 1 || (version === 'current' && failedRequests.length)) throw new Error('Startup failed');
    } finally { await browser.close(); }
  }
}
const median = version => {
  const values = results.filter(result => result.version === version).map(result => result.measurement.firstFrame).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
};
const baselineMs = median('baseline'), currentMs = median('current');
const summary = { baselineMs, currentMs, reductionPercent: (1 - currentMs / baselineMs) * 100 };
writeFileSync(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
