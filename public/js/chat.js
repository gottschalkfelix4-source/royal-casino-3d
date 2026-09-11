import { h } from './ui.js';
import { rt } from './realtime.js';
import { store } from './state.js';
import { GAMES } from './games/registry.js';

const fmtTime = (ts) => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const gameName = (id) => GAMES.find((g) => g.id === id)?.name ?? '';

/**
 * Chat-Widget mit Nachrichtenliste und Eingabe. Nachrichten kommen über rt ('chat').
 * filterGame: nur Chat-Nachrichten von Spielern an dieser Station (null = alle).
 */
export function chatWidget({ compact = false, filterGame = null } = {}) {
  const list = h('div.chat-list');
  const input = h('input.chat-input', { placeholder: 'Nachricht… (Enter)', maxlength: 200 });
  const form = h('form.chat-form', {
    onsubmit: (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      rt.sendChat(text);
      input.value = '';
    },
  }, input, h('button.btn.btn-sm.btn-gold', { type: 'submit' }, '➤'));
  const el = h('div.chat', { class: `chat ${compact ? 'compact' : ''}` }, list, form);

  const push = ({ name, text, ts, system = false, mine = false, cls = '' }) => {
    const row = h('div.chat-msg', { class: `chat-msg ${system ? 'system' : ''} ${mine ? 'mine' : ''} ${cls}` },
      system ? null : h('span.chat-name', {}, name),
      h('span.chat-text', {}, text),
      ts ? h('span.chat-time', {}, fmtTime(ts)) : null,
    );
    list.append(row);
    while (list.children.length > 80) list.firstChild.remove();
    list.scrollTop = list.scrollHeight;
  };

  const offs = [
    rt.on('chat', (m) => {
      if (filterGame && m.game !== filterGame) return;
      push({ name: m.name, text: m.text, ts: m.ts, mine: m.id === rt.me });
    }),
    rt.on('join', (p) => { if (!p.bot && !filterGame) push({ system: true, text: `${p.name} hat das Casino betreten`, ts: Date.now() }); }),
    rt.on('leave', (p) => { if (p?.name && !p.bot && !filterGame) push({ system: true, text: `${p.name} hat das Casino verlassen`, ts: Date.now() }); }),
    rt.on('round', (r) => {
      if (filterGame && r.game !== filterGame) return;
      if (r.id === rt.me) return;
      const net = r.payout - r.bet;
      const money = (net / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 });
      push({ system: true, cls: net > 0 ? 'win' : 'lose', ts: r.ts, text: `${r.name} ${net > 0 ? 'gewinnt' : 'verliert'} 🪙 ${net > 0 ? money : money.replace('-', '')}${filterGame ? '' : ` beim ${gameName(r.game)}`}` });
    }),
  ];
  if (!store.user) input.disabled = true;
  push({ system: true, text: filterGame ? `Tisch-Chat · ${gameName(filterGame)}` : 'Willkommen im Casino-Chat', ts: Date.now() });
  return { el, push, destroy: () => offs.forEach((f) => f()) };
}

/** Liste der Spieler an einer Station (live). */
export function playersList(game) {
  const el = h('div.players-list');
  const render = () => {
    const others = rt.playersAt(game);
    el.replaceChildren(
      h('span.pill.gold', {}, `👤 ${store.user?.username ?? 'Du'}`),
      ...others.map((p) => h('span.pill', { class: `pill ${p.bot ? '' : 'win'}` }, `${p.bot ? '🤖 ' : ''}${p.name}`)),
      others.length === 0 ? h('span.panel-note', {}, 'Noch niemand sonst am Tisch') : null,
    );
  };
  render();
  const off = rt.on('players', render);
  return { el, destroy: off };
}
