// Real WebGL smoke test: shed effects without replacing an already mounted game.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.CASINO_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  ...(process.env.CASINO_CHROMIUM_EXECUTABLE ? { executablePath: process.env.CASINO_CHROMIUM_EXECUTABLE } : { channel: 'chrome' }),
  headless: true,
  args: process.env.CASINO_SOFTWARE_GL === '1' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text()); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8 });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8 });
  });
  // QA server uses an isolated temporary database, never the production account store.
  await page.goto(`http://localhost:${process.env.CASINO_CURRENT_PORT || 3100}/__qa.html`);
  await page.waitForFunction(() => !!document.querySelector('#run')?.onclick);
  const result = await page.evaluate(async () => {
    const { hall } = await import('/js/views/hall.js');
    const { store } = await import('/js/state.js');
    const { GAMES } = await import('/js/games/registry.js');
    const { preloadMaterials } = await import('/js/three/surface-assets.js');
    const { preloadCharacters } = await import('/js/three/character-assets.js');
    await Promise.all([preloadMaterials(), preloadCharacters()]);
    localStorage.setItem('casino.quality', 'auto');
    hall.setMode('walk'); await hall.ready; clearTimeout(hall.captureTimer);
    const engine = hall.engine; engine.stop();
    const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `auto${Date.now()}`, password: 'device-fixture-9437' }) });
    store.user = (await response.json()).user;
    const meta = GAMES.find(game => game.id === 'blackjack'), { default: Game } = await meta.load();
    hall.setMode('spectate', meta.id);
    const game = new Game(meta); game.mount(document.querySelector('#view')); await game.ready();
    const root = hall.mounted.root, scene = engine.scene, camera = engine.camera;
    engine.step(true); engine.renderer.getContext().finish();
    // Deterministic overload input tests the actual effect chain and framebuffer reallocation.
    for (let i = 0; i < 80; i++) engine.adaptive.sample(150);
    engine.applyAdaptiveEffects(); engine.resize(); engine.step(true); engine.renderer.getContext().finish();
    // A later shader variant must not revive the disabled floor reflection.
    const material = hall.casino.floor.material;
    material.customProgramCacheKey = () => 'floor-reflection-qa';
    material.needsUpdate = true;
    engine.step(true); engine.renderer.getContext().finish();
    const result = { auto: engine.automatic, quality: engine.qualityName, scale: engine.adaptive.scale,
      effectLevel: engine.adaptive.effectLevel, ao: engine.gtaoPass.enabled, bloom: engine.bloomPass.enabled,
      smaa: engine.smaaPass.enabled, msaa: engine.renderPass.target.samples, reflection: hall.reflection.enabled,
      reflectionStrength: material.userData.shader.uniforms.reflectionStrength.value,
      scenePreserved: engine.scene === scene, cameraPreserved: engine.camera === camera,
      gamePreserved: hall.mounted.root === root, canvasCount: document.querySelectorAll('.three-canvas').length };
    game.destroy(); hall.rebuild(); await hall.ready; hall.engine.stop();
    result.rebuiltEffectLevel = hall.engine.adaptive.effectLevel;
    result.rebuiltAO = hall.engine.gtaoPass.enabled;
    return result;
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(result, { auto: true, quality: 'high', scale: 0.5, effectLevel: 2, ao: false, bloom: false,
    smaa: false, msaa: 0, reflection: false, reflectionStrength: 0, scenePreserved: true, cameraPreserved: true,
    gamePreserved: true, canvasCount: 1, rebuiltEffectLevel: 0, rebuiltAO: true });
  console.log(JSON.stringify({ result, errors }, null, 2));
} finally { await browser.close(); }
