import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Never run browser regression registration against the user's casino database.
const directory = mkdtempSync(join(tmpdir(), 'casino-graphics-'));
process.env.CASINO_DATA_DIR = directory;
process.env.CASINO_GRAPHICS_QA = '1';
process.env.CASINO_BOTS = '0';
process.env.PORT ??= '3100';
process.on('exit', () => rmSync(directory, { recursive: true, force: true }));
await import('../server/index.js');
console.log(`Graphics: http://localhost:${process.env.PORT}/__review.html`);
console.log(`Regression: http://localhost:${process.env.PORT}/__qa.html`);
