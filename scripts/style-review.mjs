// Capture the same cameras before/after a style edit, with fixed resolution and live animation.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.CASINO_PLAYWRIGHT_MODULE || 'playwright');
const label = process.env.CASINO_STYLE_LABEL || 'after';
const directory = resolve(process.env.CASINO_PERF_OUTPUT || 'docs/comic-evidence');
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text());
  });
  await page.goto(`http://localhost:${process.env.CASINO_CURRENT_PORT || 3100}/__review.html?quality=high&retina=1&photo=1`);
  await page.waitForFunction(() => {
    try { return JSON.parse(document.querySelector('#metrics').textContent).samples > 0; }
    catch { return false; }
  }, {}, { timeout: 120000 });
  for (const scenario of ['entrance', 'blackjack', 'slots', 'baccarat']) {
    await page.evaluate(async scenario => {
      const { hall } = await import('/js/views/hall.js');
      hall.mode = 'qa'; hall.engine.adaptiveEnabled = false;
      window.styleCamera?.();
      const positions = {
        entrance: [[0, 1.62, 12.5], [0, 1.62, 0]],
        blackjack: [[2.5, 1.85, 9.2], [0.2, 1, 6.6]],
        slots: [[-14.8, 1.55, 1], [-17.6, 1.35, 0]],
        baccarat: [[7.8, 2.3, 8.2], [6.5, .9, 5.8]],
      };
      window.styleCamera = hall.engine.onUpdate(() => {
        hall.engine.camera.position.set(...positions[scenario][0]);
        hall.engine.camera.lookAt(...positions[scenario][1]);
      });
    }, scenario);
    await page.waitForTimeout(3000);
    const measurements = [];
    for (let repetition = 0; repetition < 3; repetition++) {
      measurements.push(await page.evaluate(async () => {
        const { hall } = await import('/js/views/hall.js');
        const e = hall.engine, original = e.step, intervals = [], calls = [];
        let previous;
        e.step = function (render = true) {
          const now = performance.now(); original.call(this, render);
          if (!render) return;
          if (previous !== undefined) intervals.push(now - previous);
          previous = now; calls.push(e.renderer.info.render.calls);
        };
        await new Promise(resolve => setTimeout(resolve, 4000));
        e.step = original;
        const average = values => values.reduce((a, b) => a + b, 0) / values.length;
        const gl = e.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
        return { fps: 1000 / average(intervals), samples: intervals.length, calls: average(calls),
          buffer: [e.renderer.domElement.width, e.renderer.domElement.height],
          gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
      }));
    }
    await page.screenshot({ path: resolve(directory, `${label}-${scenario}.png`) });
    const fps = measurements.map(m => m.fps).sort((a, b) => a - b)[1];
    results.push({ scenario, fps, measurements });
    console.log(JSON.stringify({ label, scenario, fps: +fps.toFixed(1), errors: errors.length }));
  }
  writeFileSync(resolve(directory, `${label}.json`), JSON.stringify({ browser: await browser.version(), errors, results }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
