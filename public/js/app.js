import { api } from './api.js';
import { store, subscribe, setUser, setActiveGames, setBalance } from './state.js';
import { h, fmt, toast, openModal, countTo } from './ui.js';
import { sound } from './sound.js';
import { getGame } from './games/registry.js';
import { renderLobby } from './views/lobby.js';
import { renderProfile, renderLeaderboard } from './views/profile.js';
import { rt } from './realtime.js';
import { hall } from './views/hall.js';
import { voice } from './voice.js';
import { openRewards, openNews } from './rewards.js';
import { getQuality, setQuality } from './three/engine.js';

const QUALITY_LABEL = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' };

const viewEl = document.getElementById('view');
const topbar = document.getElementById('topbar');
let current = null; // aktuelle Ansicht mit destroy()
let balanceEl = null;
let shownBalance = 0;
let topbarSignature = '';

// ---------- Topbar ----------
function renderTopbar() {
  const u = store.user;
  const hash = location.hash || '#/';
  topbar.innerHTML = '';
  const navLink = (href, label) => h('a', { href, class: hash === href ? 'active' : '' }, label);
  topbar.append(
    h('a.brand', { href: '#/' }, h('span.logo', {}, '🎰'), 'ROYAL CASINO'),
    h('nav.nav', {}, navLink('#/', 'Lobby'), u && navLink('#/profile', 'Profil'), u && navLink('#/leaderboard', 'Rangliste')),
    h('div.spacer'),
    h('button.btn.btn-ghost.btn-sm', { onclick: cycleQuality, title: 'Grafikqualität (Pixeldichte, Schatten)' }, `⚙ ${QUALITY_LABEL[getQuality()]}`),
    h('button.btn.btn-ghost.btn-sm', { onclick: toggleSound, title: 'Sound an/aus' }, sound.enabled ? '🔊' : '🔇'),
  );
  if (u) {
    topbar.append(h('button.btn.btn-sm', { class: `btn btn-sm ${voice.enabled ? 'btn-green' : ''}`, onclick: () => voice.toggle(), title: 'Sprachchat: Mikrofon an/aus (Mitspieler in der Nähe hören dich)' }, voice.enabled ? '🎤 An' : '🎤 Aus'));
    balanceEl = h('span', {}, fmt(u.balance));
    shownBalance = u.balance;
    topbar.append(h('a.balance-pill', { href: '#/profile', title: 'Guthaben' }, h('span.coin', {}, '🪙'), balanceEl));
    topbar.append(h('button.btn.btn-sm', { class: `btn btn-sm ${u.bonus?.available ? 'btn-gold' : ''}`, onclick: () => openRewards(), title: 'Tagesbonus, Aufgaben, Erfolge' },
      '🎁 Belohnungen', u.bonus?.available ? h('span.badge', {}, '!') : null));
    if (u.rescue?.available) topbar.append(h('button.btn.btn-red.btn-sm', { onclick: claimRescue }, '🆘 Notfall-Guthaben'));
    topbar.append(h('div.user-menu', {},
      h('a.avatar', { href: '#/profile' }, u.username[0].toUpperCase()),
      h('span.username', {}, u.username),
      h('button.btn.btn-sm', { onclick: logout }, 'Abmelden'),
    ));
  } else {
    topbar.append(
      h('button.btn.btn-sm', { onclick: () => openAuth('login') }, 'Anmelden'),
      h('button.btn.btn-gold.btn-sm', { onclick: () => openAuth('register') }, 'Registrieren'),
    );
  }
}

voice.onChange(() => { topbarSignature = ''; renderTopbar(); });
// Verbindung von anderem Tab/Gerät übernommen: Banner mit "Hier weiterspielen" statt nur Meldung
let offlineBanner = null;
const hideOffline = () => { offlineBanner?.remove(); offlineBanner = null; };
rt.on('replaced', () => {
  hideOffline();
  offlineBanner = h('div.offline-banner', {},
    h('span', {}, '⚠️ Dein Konto ist gerade in einem anderen Tab oder auf einem anderen Gerät in der Halle – dieser Tab ist offline.'),
    h('button.btn.btn-gold.btn-sm', { onclick: () => { hideOffline(); rt.connect(); } }, '▶ Hier weiterspielen'),
    h('a.btn.btn-sm', { href: '#/profile', onclick: hideOffline }, 'Sitzungen verwalten'),
  );
  document.body.append(offlineBanner);
});
rt.on('connect', hideOffline);
rt.on('revoked', async () => {
  hideOffline();
  toast('Diese Sitzung wurde beendet.', 'error', 6000);
  await refreshUser();
  if (!store.user) route();
});
rt.on('reward', (m) => {
  if (typeof m.balance === 'number') setBalance(m.balance);
  if (m.kind === 'achievement') { sound.play('bigwin'); toast(`🏅 Erfolg „${m.title}“: +🪙 ${fmt(m.amount)}`, 'gold', 6000); }
  else if (m.kind === 'mission_done') { sound.play('win'); toast(`📋 Aufgabe erfüllt: ${m.title} – 🪙 ${fmt(m.amount)} unter „Belohnungen“ abholen`, 'gold', 6000); }
  else if (m.kind === 'pickup') { sound.play('coin'); toast(`🪙 Chip gefunden: +${fmt(m.amount)} (heute ${fmt(m.today)} / 500,00)`, 'success', 2500); }
  else if (m.kind === 'pickup_cap') toast('Tageslimit für Chips erreicht (🪙 500) – morgen geht es weiter', 'info');
  else if (m.kind === 'pickup_far') toast('Zu weit weg – geh näher an den Chip heran', 'info', 1800);
});

let newsShownFor = null;
subscribe(() => {
  const u = store.user;
  if (u && !rt.ws) rt.connect();
  if (u?.news && newsShownFor !== u.id) { newsShownFor = u.id; u.news = null; setTimeout(openNews, 600); }
  if (!u && rt.ws) { voice.disable(); rt.disconnect(); }
  const sig = `${u?.id ?? '-'}|${u?.bonus?.available}|${u?.rescue?.available}|${sound.enabled}|${voice.enabled}|${location.hash}`;
  if (sig !== topbarSignature) {
    topbarSignature = sig;
    renderTopbar();
    return;
  }
  if (u && balanceEl && u.balance !== shownBalance) {
    const pill = balanceEl.parentElement;
    countTo(balanceEl, shownBalance, u.balance, 700);
    shownBalance = u.balance;
    pill.classList.remove('bump');
    void pill.offsetWidth;
    pill.classList.add('bump');
  }
});

function cycleQuality() {
  const order = ['high', 'medium', 'low'];
  const next = order[(order.indexOf(getQuality()) + 1) % order.length];
  setQuality(next);
  toast(`Grafikqualität: ${QUALITY_LABEL[next]}`, 'info');
  hall.rebuild();
  route(); // Ansicht mit neuer Qualität neu aufbauen
}

function toggleSound() {
  sound.setEnabled(!sound.enabled);
  if (sound.enabled) sound.play('click');
  topbarSignature = '';
  renderTopbar();
}

async function claimBonus() {
  try {
    const { user, amount } = await api.post('/wallet/daily-bonus');
    setUser(user);
    sound.play('bigwin');
    toast(`🎁 Tagesbonus: +🪙 ${fmt(amount)}`, 'gold');
  } catch (e) { toast(e.message, 'error'); }
}

async function claimRescue() {
  try {
    const { user, amount } = await api.post('/wallet/rescue');
    setUser(user);
    sound.play('win');
    toast(`🆘 Notfall-Guthaben: +🪙 ${fmt(amount)}`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function logout() {
  try { await api.post('/auth/logout'); } catch { /* egal */ }
  setUser(null);
  setActiveGames([]);
  location.hash = '#/';
  toast('Abgemeldet', 'info');
}

// ---------- Auth-Modal ----------
export function openAuth(initial = 'login') {
  let mode = initial;
  const err = h('div.form-error');
  const username = h('input.input', { placeholder: 'Benutzername', autocomplete: 'username', maxlength: 20, required: true });
  const password = h('input.input', { type: 'password', placeholder: 'Passwort (min. 6 Zeichen)', autocomplete: 'current-password', required: true });
  const submit = h('button.btn.btn-gold.btn-big', { type: 'submit' }, 'Anmelden');
  const note = h('div.panel-note');
  const tabLogin = h('button', { type: 'button', onclick: () => setMode('login') }, 'Anmelden');
  const tabRegister = h('button', { type: 'button', onclick: () => setMode('register') }, 'Registrieren');
  const setMode = (m) => {
    mode = m;
    tabLogin.classList.toggle('active', m === 'login');
    tabRegister.classList.toggle('active', m === 'register');
    submit.textContent = m === 'login' ? 'Anmelden' : 'Konto erstellen';
    note.textContent = m === 'login' ? '' : 'Neue Konten starten mit 🪙 10.000 virtuellem Guthaben. Täglich gibt es 🪙 5.000 Bonus.';
    password.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    err.textContent = '';
  };
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      submit.disabled = true;
      try {
        const { user } = await api.post(`/auth/${mode}`, { username: username.value.trim(), password: password.value });
        setUser(user);
        close();
        sound.play('win');
        toast(mode === 'login' ? `Willkommen zurück, ${user.username}!` : `Willkommen, ${user.username}! 🪙 ${fmt(user.balance)} Startguthaben`, 'gold');
        refreshActiveGames();
        if ((location.hash || '#/') === '#/') route();
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        submit.disabled = false;
      }
    },
  }, h('div.tabs', {}, tabLogin, tabRegister), username, password, err, submit, note);
  setMode(mode);
  const { close } = openModal({ title: '🎰 Royal Casino', body: form });
  setTimeout(() => username.focus(), 50);
}

// ---------- Routing ----------
async function refreshActiveGames() {
  if (!store.user) return;
  try {
    const { active } = await api.get('/games/active');
    setActiveGames(active);
  } catch { /* ignorieren */ }
}

async function refreshUser() {
  if (!store.user) return;
  try {
    const { user } = await api.get('/auth/me');
    setUser(user); // null, wenn die Sitzung serverseitig beendet wurde
  } catch { /* ignorieren */ }
}

async function route() {
  const hash = location.hash || '#/';
  if (current) {
    current.destroy?.();
    current = null;
    refreshUser(); // Kontostand nach evtl. abgebrochener Animation synchronisieren
  }
  topbarSignature = '';
  renderTopbar();
  window.scrollTo(0, 0);

  rt.sendGame(hash.startsWith('#/game/') && store.user ? hash.slice(7) : null);
  if (hash.startsWith('#/game/')) {
    const meta = getGame(hash.slice(7));
    if (!meta) { location.hash = '#/'; return; }
    if (!store.user) {
      current = renderLobby(viewEl, { openAuth });
      openAuth('login');
      return;
    }
    viewEl.className = 'view';
    viewEl.innerHTML = '';
    viewEl.append(h('div.loading', {}, h('div.spinner'), `${meta.icon} ${meta.name} wird geladen…`));
    hall.setMode('spectate', meta.id);
    try {
      const mod = await meta.load();
      if ((location.hash || '#/') !== hash) return;
      const game = new mod.default(meta);
      game.mount(viewEl);
      current = game;
      window.__game = game; // für Debugging in der Konsole
    } catch (e) {
      console.error(e);
      viewEl.innerHTML = '';
      viewEl.append(h('div.empty', {}, `Spiel konnte nicht geladen werden: ${e.message}`));
    }
    return;
  }
  if (hash === '#/profile' && store.user) { hall.setMode('idle'); return renderProfile(viewEl); }
  if (hash === '#/leaderboard' && store.user) { hall.setMode('idle'); return renderLeaderboard(viewEl); }
  await refreshActiveGames();
  if ((location.hash || '#/') !== hash) return;
  current = renderLobby(viewEl, { openAuth });
}

window.addEventListener('hashchange', route);

(async function init() {
  try {
    const { user } = await api.get('/auth/me');
    setUser(user);
  } catch (e) {
    toast(e.message, 'error');
  }
  route();
})();
