/** Spiel-IDs, an denen Spieler in der Halle sitzen/stehen können */
export const GAME_IDS = ['slots', 'roulette', 'blackjack', 'videopoker', 'baccarat', 'dice', 'plinko', 'crash', 'mines', 'coinflip', 'wheel', 'hilo'];

/** Grober Standort der Stationen (für Bots) – muss zum Client-Layout passen */
export const STATION_POS = {
  slots: [-16, 0], roulette: [-8, 4], blackjack: [0, 5.5], baccarat: [8, 4], dice: [-8, -5], hilo: [8, -5],
  wheel: [0, -12], crash: [-5.5, -12.5], plinko: [5.5, -12.5], videopoker: [17.5, 8], mines: [17.5, 0], coinflip: [0, -3],
};

export const HALL_BOUNDS = { x: 18.6, z: 13.6 };
