// Simuliert den Slot-Automaten und gibt RTP + Trefferquote aus:  npm run sim:slots
import { spinReels, gridFromStops, evaluateGrid } from '../server/games/slots.js';

const N = Number(process.argv[2]) || 500_000;
const bet = 100;
let paid = 0;
let hits = 0;
let big = 0;
for (let i = 0; i < N; i++) {
  const { payout } = evaluateGrid(gridFromStops(spinReels()), bet);
  paid += payout;
  if (payout > 0) hits++;
  if (payout >= bet * 10) big++;
}
console.log(`Spins: ${N}`);
console.log(`RTP: ${((paid / (N * bet)) * 100).toFixed(2)} %`);
console.log(`Trefferquote: ${((hits / N) * 100).toFixed(2)} %`);
console.log(`>=10x: ${((big / N) * 100).toFixed(3)} %`);
