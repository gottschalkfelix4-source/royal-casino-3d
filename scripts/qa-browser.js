// Browser-QA: alle 12 Spiele in der Halle nacheinander durchspielen und Fehler/hängende Zustände protokollieren.
// Anwendung: eingeloggt im Casino die Browser-Konsole öffnen, diese Datei komplett einfügen, Enter.
// Fortschritt: window.__qa  (results, errors, done)
(() => {
  window.__qa = { results: [], errors: [], done: false, current: null };
  window.addEventListener('error', (e) => window.__qa.errors.push(`${window.__qa.current}: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => window.__qa.errors.push(`${window.__qa.current}: ${String(e.reason?.message || e.reason)}`));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) return false; await wait(200); } return true; };
  const go = async (id) => {
    location.hash = '#/game/' + id;
    await until(() => window.__game?.meta?.id === id && !document.querySelector('.loading'), 20000);
    await until(() => !window.__game.busy, 20000); // ready() abwarten
    const g = window.__game;
    g.engine.tweener.timeScale = 6; // Animationen beschleunigen
    return g;
  };
  const idle = (g, ms = 30000) => until(() => !g.busy, ms);
  const click = (txt) => { const b = [...document.querySelectorAll('.game-panel button')].find((b) => b.textContent.includes(txt) && !b.disabled && !b.closest('.hidden')); if (b) b.click(); return !!b; };
  const steps = {
    slots: async (g) => { click('DREHEN'); await idle(g); },
    roulette: async (g) => { g.addBet('red'); click('DREHEN'); await idle(g); },
    blackjack: async (g) => { click('AUSTEILEN'); await idle(g); if (g.game) { click('Halten'); await idle(g); } },
    videopoker: async (g) => { if (!g.game) { click('GEBEN'); await idle(g); } g.toggleHold(0); click('ZIEHEN'); await idle(g); },
    baccarat: async (g) => { g.addBet('player'); click('AUSTEILEN'); await idle(g); },
    dice: async (g) => { g.addBet('big'); click('WÜRFELN'); await idle(g); },
    plinko: async (g) => { click('FALLEN'); await until(() => g.balls === 0, 30000); },
    crash: async (g) => { if (!g.running) { click('STARTEN'); await wait(1500); } click('AUSZAHLEN'); await until(() => !g.running, 20000); },
    mines: async (g) => { if (!g.game) { click('STARTEN'); await idle(g); } const free = [...Array(25).keys()].find((i) => !g.game?.revealed.includes(i)); await g.reveal(free); await idle(g); if (g.game) { click('AUSZAHLEN'); await idle(g); } },
    coinflip: async (g) => { click('WERFEN'); await idle(g); },
    wheel: async (g) => { click('DREHEN'); await idle(g); },
    hilo: async (g) => { if (!g.game) { click('STARTEN'); await idle(g); } if (g.game) { g.guess(g.game.card.r >= 7 ? 'lower' : 'higher'); await idle(g); if (g.game) { click('Auszahlen'); await idle(g); } } },
  };
  (async () => {
    for (const id of Object.keys(steps)) {
      window.__qa.current = id;
      const t0 = Date.now(); const errBefore = window.__qa.errors.length;
      try {
        const g = await go(id);
        await steps[id](g);
        window.__qa.results.push({ id, ok: !g.busy && window.__qa.errors.length === errBefore, stuck: g.busy, ms: Date.now() - t0, status: [...document.querySelectorAll('.stat-box .value')].map((v) => v.textContent).join(' | ') });
      } catch (e) { window.__qa.results.push({ id, ok: false, error: String(e?.message || e), ms: Date.now() - t0 }); }
    }
    window.__qa.done = true;
    console.table(window.__qa.results);
    if (window.__qa.errors.length) console.warn('Fehler:', window.__qa.errors);
  })();
  console.log('QA läuft – Ergebnisse in window.__qa');
})();
