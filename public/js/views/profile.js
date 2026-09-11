import { api } from '../api.js';
import { store } from '../state.js';
import { h, fmt, fmtSigned, fmtInt, toast } from '../ui.js';
import { GAMES } from '../games/registry.js';

const gameName = (id) => GAMES.find((g) => g.id === id)?.name ?? id ?? '–';
const gameIcon = (id) => GAMES.find((g) => g.id === id)?.icon ?? '🎁';
const dt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' });

function loading() {
  return h('div.loading', {}, h('div.spinner'), 'Lade…');
}

export async function renderProfile(root) {
  root.innerHTML = '';
  root.className = 'view';
  root.append(loading());
  try {
    const [{ user }, { history }] = await Promise.all([api.get('/wallet'), api.get('/wallet/history?limit=100')]);
    const s = user.stats;
    const net = s.totalWon - s.totalWagered;
    root.innerHTML = '';
    root.append(h('div.page', {},
      h('h1', {}, `👤 ${user.username}`),
      h('div.stats-grid', {},
        stat('Guthaben', `🪙 ${fmt(user.balance)}`, 'gold'),
        stat('Gespielte Runden', fmtInt(s.gamesPlayed)),
        stat('Gesamteinsatz', fmt(s.totalWagered)),
        stat('Gesamtgewinn', fmt(s.totalWon)),
        stat('Netto', fmtSigned(net), net >= 0 ? 'win' : 'lose'),
        stat('Größter Gewinn', fmt(s.biggestWin), 'gold'),
        stat('Mitglied seit', new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(user.createdAt)),
      ),
      h('div.card', {},
        h('h2', {}, 'Verlauf'),
        history.length === 0 ? h('div.empty', {}, 'Noch keine Buchungen') :
          h('div', { style: { overflowX: 'auto' } }, h('table.table', {},
            h('thead', {}, h('tr', {}, h('th', {}, 'Zeit'), h('th', {}, 'Spiel'), h('th', {}, 'Details'), h('th', { style: { textAlign: 'right' } }, 'Einsatz'), h('th', { style: { textAlign: 'right' } }, 'Auszahlung'), h('th', { style: { textAlign: 'right' } }, 'Netto'), h('th', { style: { textAlign: 'right' } }, 'Kontostand'))),
            h('tbody', {}, history.map((t) => h('tr', {},
              h('td', {}, dt.format(t.createdAt)),
              h('td', {}, `${gameIcon(t.game)} ${t.type === 'round' ? gameName(t.game) : t.meta?.label ?? t.type}`),
              h('td', { style: { color: 'var(--muted)', fontSize: '12px' } }, describe(t)),
              h('td.num', {}, t.bet ? fmt(t.bet) : '–'),
              h('td.num', {}, t.type === 'round' ? fmt(t.payout) : '–'),
              h('td.num', { class: `num ${t.amount >= 0 ? 'pos' : 'neg'}` }, fmtSigned(t.amount)),
              h('td.num', {}, fmt(t.balanceAfter)),
            ))),
          )),
      ),
    ));
  } catch (e) {
    toast(e.message, 'error');
    root.innerHTML = '';
    root.append(h('div.empty', {}, e.message));
  }
}

function describe(t) {
  const m = t.meta ?? {};
  const parts = [];
  if (m.multiplier != null && m.multiplier > 0) parts.push(`${(Math.round(m.multiplier * 100) / 100).toLocaleString('de-DE')}×`);
  if (m.number != null) parts.push(`Zahl ${m.number}`);
  if (m.dice) parts.push(m.dice.join('-'));
  if (m.winner) parts.push({ player: 'Player', banker: 'Banker', tie: 'Tie' }[m.winner]);
  if (m.outcome) parts.push(m.outcome === 'heads' ? 'Kopf' : 'Zahl');
  if (m.crashPoint) parts.push(`Crash @ ${m.crashPoint.toLocaleString('de-DE')}×`);
  if (m.result && typeof m.result === 'string') parts.push(RESULT_LABEL[m.result] ?? m.result);
  if (m.mines) parts.push(`${m.mines} Minen`);
  if (m.steps) parts.push(`${m.steps} Schritte`);
  return parts.join(' · ');
}

const RESULT_LABEL = {
  win: 'Gewonnen', lose: 'Verloren', push: 'Unentschieden', bust: 'Überkauft', blackjack: 'Blackjack!',
  dealer_blackjack: 'Dealer-Blackjack', dealer_bust: 'Dealer überkauft', boom: 'Mine getroffen', cleared: 'Alle gefunden',
  cashout: 'Ausgezahlt', crashed: 'Abgestürzt', cashed: 'Ausgezahlt', lost: 'Verloren', max: 'Maximum erreicht',
  royal_flush: 'Royal Flush', straight_flush: 'Straight Flush', four_of_a_kind: 'Vierling', full_house: 'Full House',
  flush: 'Flush', straight: 'Straße', three_of_a_kind: 'Drilling', two_pair: 'Zwei Paare', jacks_or_better: 'Buben oder besser', high_card: 'Nichts',
};

function stat(label, value, cls = '') {
  return h('div.stat-box', {}, h('div.label', {}, label), h('div.value', { class: `value ${cls}` }, value));
}

export async function renderLeaderboard(root) {
  root.innerHTML = '';
  root.className = 'view';
  root.append(loading());
  try {
    const { leaderboard, myRank } = await api.get('/wallet/leaderboard');
    const medals = ['🥇', '🥈', '🥉'];
    root.innerHTML = '';
    root.append(h('div.page', {},
      h('h1', {}, '🏆 Rangliste'),
      h('p', { style: { color: 'var(--muted)', margin: 0 } }, `Dein Rang: #${myRank}`),
      h('div.card', {}, h('table.table', {},
        h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Spieler'), h('th', { style: { textAlign: 'right' } }, 'Guthaben'), h('th', { style: { textAlign: 'right' } }, 'Runden'), h('th', { style: { textAlign: 'right' } }, 'Größter Gewinn'))),
        h('tbody', {}, leaderboard.map((u, i) => h('tr', { class: u.username === store.user?.username ? 'me' : '' },
          h('td', {}, i < 3 ? h('span.rank-medal', {}, medals[i]) : `${i + 1}`),
          h('td', {}, u.username),
          h('td.num', {}, `🪙 ${fmt(u.balance)}`),
          h('td.num', {}, fmtInt(u.gamesPlayed)),
          h('td.num', {}, fmt(u.biggestWin)),
        ))),
      )),
    ));
  } catch (e) {
    toast(e.message, 'error');
    root.innerHTML = '';
    root.append(h('div.empty', {}, e.message));
  }
}
