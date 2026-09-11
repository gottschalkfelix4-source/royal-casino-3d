export const GAMES = [
  { id: 'slots', name: 'Slots', icon: '🎰', accent: '#d4af37', tagline: '5 Walzen, 9 Gewinnlinien – bis zu 800× Einsatz', load: () => import('./slots.js') },
  { id: 'roulette', name: 'Roulette', icon: '🎡', accent: '#e74c3c', tagline: 'Europäisches Roulette mit 3D-Kessel', load: () => import('./roulette.js') },
  { id: 'blackjack', name: 'Blackjack', icon: '🃏', accent: '#2ecc71', tagline: 'Schlag den Dealer – Blackjack zahlt 3:2', load: () => import('./blackjack.js') },
  { id: 'videopoker', name: 'Video Poker', icon: '♠️', accent: '#3b82f6', tagline: 'Jacks or Better – Royal Flush zahlt 800×', load: () => import('./videopoker.js') },
  { id: 'baccarat', name: 'Baccarat', icon: '🎴', accent: '#a855f7', tagline: 'Player, Banker oder Tie?', load: () => import('./baccarat.js') },
  { id: 'dice', name: 'Würfel', icon: '🎲', accent: '#f59e0b', tagline: 'Sic Bo mit drei Würfeln – bis zu 60:1', load: () => import('./dice.js') },
  { id: 'plinko', name: 'Plinko', icon: '🔮', accent: '#ec4899', tagline: 'Lass die Kugel fallen – bis zu 1000×', load: () => import('./plinko.js') },
  { id: 'crash', name: 'Crash', icon: '🚀', accent: '#ef4444', tagline: 'Steig aus, bevor die Rakete explodiert', load: () => import('./crash.js') },
  { id: 'mines', name: 'Mines', icon: '💣', accent: '#10b981', tagline: 'Finde die Edelsteine, meide die Minen', load: () => import('./mines.js') },
  { id: 'coinflip', name: 'Münzwurf', icon: '🪙', accent: '#eab308', tagline: 'Kopf oder Zahl – 1,96× Auszahlung', load: () => import('./coinflip.js') },
  { id: 'wheel', name: 'Glücksrad', icon: '🎯', accent: '#06b6d4', tagline: 'Dreh das Rad – bis zu 5× Einsatz', load: () => import('./wheel.js') },
  { id: 'hilo', name: 'Hi-Lo', icon: '🔺', accent: '#f97316', tagline: 'Höher oder niedriger? Multiplikator-Kette', load: () => import('./hilo.js') },
];

export const getGame = (id) => GAMES.find((g) => g.id === id);
