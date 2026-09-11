import { Router } from 'express';
import { newShoe, baccaratValue } from './cards.js';
import { parseBet, playOneShot } from './common.js';
import { bad, toCents } from '../util.js';

/** Klassische Baccarat-Regeln (Punto Banco) */
export function dealBaccarat(shoe) {
  const player = [shoe.pop(), shoe.pop()];
  const banker = [shoe.pop(), shoe.pop()];
  let p = baccaratValue(player);
  let b = baccaratValue(banker);
  let playerThird = null;

  if (p < 8 && b < 8) {
    if (p <= 5) {
      playerThird = shoe.pop();
      player.push(playerThird);
      p = baccaratValue(player);
    }
    let bankerDraws;
    if (playerThird === null) bankerDraws = b <= 5;
    else {
      const c = playerThird.r >= 10 ? 0 : playerThird.r;
      if (b <= 2) bankerDraws = true;
      else if (b === 3) bankerDraws = c !== 8;
      else if (b === 4) bankerDraws = c >= 2 && c <= 7;
      else if (b === 5) bankerDraws = c >= 4 && c <= 7;
      else if (b === 6) bankerDraws = c === 6 || c === 7;
      else bankerDraws = false;
    }
    if (bankerDraws) {
      banker.push(shoe.pop());
      b = baccaratValue(banker);
    }
  }
  const winner = p > b ? 'player' : b > p ? 'banker' : 'tie';
  return { player, banker, playerTotal: p, bankerTotal: b, winner };
}

export const baccaratRouter = Router();

baccaratRouter.post('/play', (req, res) => {
  const raw = req.body?.bets ?? {};
  const bets = {
    player: raw.player ? toCents(raw.player) : 0,
    banker: raw.banker ? toCents(raw.banker) : 0,
    tie: raw.tie ? toCents(raw.tie) : 0,
  };
  const total = bets.player + bets.banker + bets.tie;
  if (total <= 0) throw bad('Bitte mindestens eine Wette setzen');
  parseBet(total);

  const result = playOneShot(req.user.id, 'baccarat', total, () => {
    const deal = dealBaccarat(newShoe(8));
    let payout = 0;
    if (deal.winner === 'player') payout += bets.player * 2;
    if (deal.winner === 'banker') payout += Math.floor(bets.banker * 1.95);
    if (deal.winner === 'tie') payout += bets.tie * 9 + bets.player + bets.banker; // Push für Player/Banker
    return { ...deal, bets, payout, meta: { winner: deal.winner } };
  });
  res.json(result);
});
