import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachUser, authRouter } from './auth.js';
import { walletRouter } from './wallet.js';
import { gamesRouter } from './games/index.js';
import { attachRealtime } from './realtime.js';
import { rewardsRouter } from './rewards.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use(attachUser);

app.use('/api/auth', authRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/games', gamesRouter);
app.use('/api/rewards', rewardsRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden' }));

app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three'), { maxAge: '1d' }));
app.use(express.static(path.join(root, 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ungültiges JSON' });
  if (!err.expose) console.error(err);
  res.status(err.status ?? 500).json({ error: err.expose ? err.message : 'Serverfehler' });
});

const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer(app);
attachRealtime(server, { bots: process.env.CASINO_BOTS === undefined ? 3 : Number(process.env.CASINO_BOTS) });
server.listen(PORT, () => {
  console.log(`🎰 Royal Casino läuft auf http://localhost:${PORT}`);
});
