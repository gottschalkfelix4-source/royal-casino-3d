import { hall } from './hall.js';
import { GAMES } from '../games/registry.js';
import { store, subscribe } from '../state.js';
import { h, fmt } from '../ui.js';
import { rt } from '../realtime.js';
import { chatWidget } from '../chat.js';

/**
 * Lobby: HTML-Overlay über der dauerhaften 3D-Halle (siehe hall.js), die im Modus 'walk' läuft.
 */
export function renderLobby(root, { openAuth }) {
  root.innerHTML = '';
  root.className = 'view';

  const welcome = h('div.lobby-welcome');
  const online = h('span.online-badge', {}, '● 0 online');
  const renderWelcome = (u) => {
    welcome.replaceChildren(...[
      h('div.lobby-title', {}, 'ROYAL CASINO'),
      h('div.lobby-sub', {}, u ? `${u.username} · 🪙 ${fmt(u.balance)} · ` : 'Zwölf Spiele · Virtuelles Spielgeld · ', online),
      u ? null : h('div.row', { style: { marginTop: '10px' } },
        h('button.btn.btn-gold', { onclick: () => openAuth('register') }, '🎁 Registrieren'),
        h('button.btn', { onclick: () => openAuth('login') }, 'Anmelden'),
      ),
    ].filter(Boolean));
  };
  renderWelcome(store.user);
  const unsubscribe = subscribe((s) => renderWelcome(s.user));
  const updateOnline = () => { online.textContent = `● ${[...rt.players.values()].filter((p) => !p.bot).length || (store.user ? 1 : 0)} online`; };
  updateOnline();

  const hint = h('div.lobby-hint', {}, h('span.kbd', {}, 'W A S D'), ' laufen · Maus ziehen: umsehen · ', h('span.kbd', {}, 'E'), ' / Klick: spielen · ', h('span.kbd', {}, 'Enter'), ' Chat');
  const prompt = h('div.lobby-prompt');
  const ticker = h('div.lobby-ticker');
  const crosshair = h('div.crosshair');
  const strip = h('div.lobby-strip', {}, GAMES.map((g) =>
    h('a.strip-item', { href: `#/game/${g.id}`, title: g.name, dataset: { id: g.id }, onmouseenter: () => hall.setHover(hall.stationById(g.id)), onmouseleave: () => hall.setHover(null) },
      h('span.strip-icon', {}, g.icon), h('span.strip-name', {}, g.name),
      store.activeGames.includes(g.id) ? h('span.strip-live', {}, '●') : null)
  ));
  const chat = store.user ? chatWidget({ compact: true }) : null;
  const chatBox = h('div.lobby-chat', {}, chat ? chat.el : h('div.panel-note', { style: { padding: '10px' } }, 'Melde dich an, um mit anderen zu chatten.'));
  root.append(h('div.lobby.transparent', {}, welcome, hint, prompt, ticker, crosshair, chatBox, strip));

  const pushTicker = ({ text, cls }) => {
    ticker.prepend(h('div.ticker-item', { class: `ticker-item ${cls}` }, text));
    while (ticker.children.length > 4) ticker.lastChild.remove();
    setTimeout(() => ticker.lastChild?.classList.add('fade'), 7000);
  };

  hall.setMode('walk');
  const offs = [
    hall.on('near', (best) => {
      prompt.classList.toggle('show', !!best);
      if (best?.action === 'coin') prompt.replaceChildren(h('span.kbd', {}, 'E'), ` ${best.name}`, h('span.prompt-sub', {}, 'oder einfach drüberlaufen'));
      else if (best?.action) prompt.replaceChildren(h('span.kbd', {}, 'E'), ` ${best.name}`);
      else if (best) prompt.replaceChildren(h('span.kbd', {}, 'E'), ` ${best.name} spielen`, h('span.prompt-sub', {}, `${rt.playersAt(best.id).length} Mitspieler am Tisch`));
    }),
    hall.on('hover', (station) => strip.querySelectorAll('.strip-item').forEach((el) => el.classList.toggle('active', el.dataset.id === station?.id))),
    hall.on('ticker', pushTicker),
    hall.on('chatfocus', () => chat?.el.querySelector('input')?.focus()),
    rt.on('players', updateOnline),
  ];

  return {
    destroy() {
      unsubscribe();
      offs.forEach((f) => f());
      chat?.destroy();
      hall.setMode('idle');
    },
  };
}
