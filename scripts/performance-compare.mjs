// Use installed Playwright or provide CASINO_PLAYWRIGHT_MODULE (a module URL).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.CASINO_PLAYWRIGHT_MODULE || 'playwright');
const baselinePort = Number(process.env.CASINO_BASELINE_PORT || 3101);
const currentPort = Number(process.env.CASINO_CURRENT_PORT || 3100);
const repetitions = Number(process.env.CASINO_PERF_REPETITIONS || 3);
const baselineCommit = process.env.CASINO_BASELINE_COMMIT || '377d0bb';
const output = resolve(process.env.CASINO_PERF_OUTPUT || 'docs/performance50-evidence');
mkdirSync(output, { recursive: true });
const launchArgs = ['--disable-frame-rate-limit', '--disable-gpu-vsync'];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs });
const results = [];
try {
  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (const port of repetition % 2 ? [currentPort, baselinePort] : [baselinePort, currentPort]) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
      await page.goto(`http://localhost:${port}/__review.html?quality=high&retina=1&photo=1`);
      await page.waitForFunction(() => { try { return JSON.parse(document.querySelector('#metrics').textContent).samples > 0; } catch { return false; } }, {}, { timeout: 120000 });
      const configuration = await page.evaluate(async () => {
        const { hall } = await import('/js/views/hall.js');
        const { rt } = await import('/js/realtime.js');
        for (const [i, x, z] of [[1, -3, 8], [2, 4, 3], [3, -6, -4]]) {
          const player = { id: -i, name: `Benchmark ${i}`, bot: true, x, z, ry: 0, anim: 'idle' };
          rt.players.set(player.id, player); hall.ensureAvatar(player);
        }
        hall.mode = 'qa'; hall.engine.adaptiveEnabled = false;
        const renderer = hall.engine.renderer, gl = renderer.getContext();
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return { buffer: [renderer.domElement.width, renderer.domElement.height], dpr: renderer.getPixelRatio(), quality: 'high', msaa: hall.engine.quality.msaa,
          effects: { aoScale: hall.engine.quality.aoScale, aoSamples: hall.engine.gtaoPass.gtaoMaterial.defines.SAMPLES, reflectionScale: hall.engine.quality.reflection,
            smaa: hall.engine.smaaPass.enabled, shadows: renderer.shadowMap.enabled, shadowMap: hall.engine.quality.shadowMap },
          gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), players: hall.avatars.size };
      });
      for (const scenario of ['entrance', 'tour', 'blackjack', 'slots']) {
        await page.evaluate(async scenario => {
          const { hall } = await import('/js/views/hall.js');
          const e = hall.engine;
          window.perfCamera?.();
          const camera = phase => {
            if (scenario === 'tour') { e.camera.position.set(Math.sin(phase) * 5, 1.62, 7 + Math.cos(phase) * 5); e.camera.lookAt(0, 1.2, -2); }
            else if (scenario === 'blackjack') { e.camera.position.set(0, 1.42, 7.15); e.camera.lookAt(0, 1, 5.4); }
            else if (scenario === 'slots') { e.camera.position.set(-14.8, 1.55, 1); e.camera.lookAt(-17.6, 1.35, 0); }
            else { e.camera.position.set(0, 1.62, 12.5); e.camera.lookAt(0, 1.62, 0); }
          };
          window.perfClock = performance.now();
          window.perfCamera = e.onUpdate(() => camera((performance.now() - window.perfClock) / 8000 * Math.PI * 2));
        }, scenario);
        await page.waitForTimeout(5000);
        const measurement = await page.evaluate(async () => {
          const { hall } = await import('/js/views/hall.js');
          const e = hall.engine, original = e.step;
          const intervals = [], cpu = [], calls = [], triangles = [];
          window.perfClock = performance.now();
          let previous;
          e.step = function(render = true) {
            const start = performance.now();
            original.call(this, render);
            if (!render) return;
            if (previous !== undefined) intervals.push(start - previous);
            previous = start;
            cpu.push(performance.now() - start); calls.push(e.renderer.info.render.calls); triangles.push(e.renderer.info.render.triangles);
          };
          await new Promise(resolve => setTimeout(resolve, 8000));
          e.step = original;
          const average = a => a.reduce((x, y) => x + y, 0) / a.length;
          const percentile = (a, p) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];
          return { fps: 1000 / average(intervals), samples: intervals.length, meanMs: average(intervals), p50Ms: percentile(intervals, .5), p95Ms: percentile(intervals, .95), cpuMedianMs: percentile(cpu, .5), calls: average(calls), triangles: average(triangles), intervals };
        });
        if (repetition === 0) await page.screenshot({ path: resolve(output, `${port === baselinePort ? 'before' : 'after'}-${scenario}.png`) });
        const result = { version: port === baselinePort ? 'baseline' : 'current', repetition, scenario, configuration, measurement, errors: [...errors] };
        results.push(result);
        writeFileSync(resolve(output, 'measurements.json'), JSON.stringify({ browser: await browser.version(), launchArgs, baselineCommit, results }, null, 2));
        console.log(JSON.stringify({ version: result.version, repetition, scenario, fps: +measurement.fps.toFixed(1), cpu: +measurement.cpuMedianMs.toFixed(2), calls: Math.round(measurement.calls), errors: errors.length }));
        if (errors.length) throw new Error(errors.join('\n'));
      }
      await page.close();
    }
  }
  const summary = ['entrance', 'tour', 'blackjack', 'slots'].map(scenario => {
    const median = version => results.filter(r => r.scenario === scenario && r.version === version).map(r => r.measurement.fps).sort((a, b) => a - b)[Math.floor(repetitions / 2)];
    const before = median('baseline'), after = median('current');
    return { scenario, before, after, gainPercent: (after / before - 1) * 100 };
  });
  writeFileSync(resolve(output, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  const configurations = results.map(r => JSON.stringify(r.configuration));
  if (configurations.some(configuration => configuration !== configurations[0])) throw new Error('Comparison configurations differ');
  if (summary.some(row => row.gainPercent < 50)) throw new Error('The 50% throughput target was not reached in every scenario');
} finally { await browser.close(); }
