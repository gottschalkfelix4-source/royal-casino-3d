import { api } from './api.js';
import { h, fmt, toast, openModal } from './ui.js';
import { setUser } from './state.js';
import { sound } from './sound.js';

/** Die vier Wege, Coins zu verdienen – für Tafel und "Was ist neu" */
export const EARN_WAYS = [
  { icon: '📅', title: 'Tagesbonus', text: '🪙 500 pro Tag, +100 für jeden Tag in Folge – bis 🪙 1.500. Serie halten!' },
  { icon: '📋', title: 'Tagesaufgaben', text: 'Jeden Tag 3 Aufgaben (z. B. „3 Runden Blackjack“). Fortschritt läuft automatisch, Belohnung 🪙 100–400.' },
  { icon: '🪙', title: 'Chips in der Halle', text: 'Leuchtende Chips liegen in der Halle – drüberlaufen sammelt 🪙 10–50 ein. Bis 🪙 500 am Tag.' },
  { icon: '🏆', title: 'Erfolge', text: '13 einmalige Boni: erste Runde, 100 Runden, 10×-Gewinn, alle Spiele, 5 Siege in Folge … bis 🪙 2.500.' },
];

/** Einmalige "Was ist neu"-Meldung nach dem Update (Server merkt sich pro Konto, dass sie gezeigt wurde). */
export function openNews() {
  const body = h('div.news', {},
    h('p.news-intro', {}, 'Ab sofort kannst du dir dein Guthaben wieder aufbauen – auf vier Wegen:'),
    ...EARN_WAYS.map((w) => h('div.news-row', {}, h('span.news-icon', {}, w.icon), h('div', {}, h('div.rw-title', {}, w.title), h('div.panel-note', {}, w.text)))),
    h('p.panel-note', {}, 'Alles findest du jederzeit unter „🎁 Belohnungen“ oben rechts – und auf der Tafel am Eingang der Halle.'),
    h('button.btn.btn-gold.btn-big', { onclick: () => { close(); openRewards(); } }, '🎁 Belohnungen ansehen'),
  );
  const { close } = openModal({ title: '✨ Neu: Coins verdienen', body, onClose: () => api.post('/wallet/news-seen').catch(() => {}) });
}

/** Belohnungs-Übersicht: Tagesbonus mit Serie, Tagesaufgaben, Chips, Erfolge */
export async function openRewards() {
  const body = h('div.rewards');
  const { close } = openModal({ title: '🎁 Belohnungen', body });
  const render = (s) => {
    body.replaceChildren(
      // Tagesbonus
      h('div.rw-section', {},
        h('div.rw-head', {}, h('span', {}, '📅 Tagesbonus'), h('span.rw-streak', {}, `🔥 Serie: ${s.daily.streak} Tag${s.daily.streak === 1 ? '' : 'e'}`)),
        h('div.panel-note', {}, '500 Coins pro Tag, +100 für jeden Tag in Folge (max. 1.500). Ein verpasster Tag setzt die Serie zurück.'),
        s.daily.available
          ? h('button.btn.btn-gold.btn-block', { onclick: () => claim('/rewards/daily') }, `🎁 ${fmt(s.daily.nextAmount)} abholen`)
          : h('div.rw-done', {}, `✓ Heute abgeholt · morgen wieder: 🪙 ${fmt(s.daily.nextAmount)}`),
      ),
      // Aufgaben
      h('div.rw-section', {},
        h('div.rw-head', {}, h('span', {}, '📋 Tagesaufgaben'), h('span.panel-note', {}, 'täglich 3 neue')),
        ...s.missions.map((m) => h('div.rw-mission', { class: `rw-mission ${m.claimed ? 'claimed' : m.done ? 'done' : ''}` },
          h('div.rw-mission-main', {},
            h('div.rw-title', {}, m.title),
            h('div.rw-bar', {}, h('div.rw-fill', { style: { width: `${Math.min(100, (m.progress / m.target) * 100)}%` } })),
            h('div.rw-progress', {}, m.key === 'wager1000' ? `🪙 ${fmt(m.progress)} / ${fmt(m.target)}` : `${m.progress} / ${m.target}`),
          ),
          m.claimed ? h('span.rw-badge', {}, '✓') :
            m.done ? h('button.btn.btn-gold.btn-sm', { onclick: () => claim(`/rewards/missions/${m.key}/claim`) }, `🪙 ${fmt(m.reward)}`) :
              h('span.rw-reward', {}, `🪙 ${fmt(m.reward)}`),
        )),
      ),
      // Chips
      h('div.rw-section', {},
        h('div.rw-head', {}, h('span', {}, '🪙 Chips in der Halle'), h('span.panel-note', {}, `heute ${fmt(s.pickups.today)} / ${fmt(s.pickups.cap)}`)),
        h('div.rw-bar', {}, h('div.rw-fill.gold', { style: { width: `${Math.min(100, (s.pickups.today / s.pickups.cap) * 100)}%` } })),
        h('div.panel-note', {}, 'In der Halle liegen immer wieder leuchtende Chips (10–50 Coins). Einfach hinlaufen und drüberlaufen. Insgesamt gesammelt: ' + s.pickups.total),
      ),
      // Erfolge
      h('div.rw-section', {},
        h('div.rw-head', {}, h('span', {}, '🏆 Erfolge'), h('span.panel-note', {}, `${s.achievements.filter((a) => a.unlocked).length} / ${s.achievements.length}`)),
        h('div.rw-grid', {}, s.achievements.map((a) => h('div.rw-ach', { class: `rw-ach ${a.unlocked ? 'unlocked' : ''}`, title: a.desc },
          h('div.rw-ach-title', {}, `${a.unlocked ? '🏅' : '🔒'} ${a.title}`),
          h('div.rw-ach-desc', {}, a.desc),
          h('div.rw-ach-reward', {}, `🪙 ${fmt(a.reward)}`),
        ))),
      ),
    );
  };
  const claim = async (path) => {
    try {
      const res = await api.post(path);
      setUser(res.user);
      sound.play('bigwin');
      toast(`+🪙 ${fmt(res.amount)}${res.streak ? ` · Serie: Tag ${res.streak}` : ''}`, 'gold');
      render(res.summary);
    } catch (e) { toast(e.message, 'error'); }
  };
  try {
    render(await api.get('/rewards'));
  } catch (e) {
    body.replaceChildren(h('div.empty', {}, e.message));
  }
  return { close };
}
