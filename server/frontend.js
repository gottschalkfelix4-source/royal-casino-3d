import compression from 'compression';
import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Keep HTML fresh while content-hashed bundles can be cached across visits. */
export function installFrontend(app, root) {
  app.use(compression({
    filter: (req, res) => /\.glb$/.test(req.path) || compression.filter(req, res),
  }));
  app.use('/build', express.static(path.join(root, 'public/build'), { maxAge: '1y', immutable: true, index: false }));
  app.get(['/', '/index.html'], (req, res) => {
    let html = readFileSync(path.join(root, 'public/index.html'), 'utf8');
    const manifest = path.join(root, 'public/build/manifest.json');
    if (existsSync(manifest)) {
      const { app: entry } = JSON.parse(readFileSync(manifest, 'utf8'));
      html = html.replace('src="js/app.js"', `src="${entry}"`);
    }
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  });
}
