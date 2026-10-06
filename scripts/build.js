import { build, context } from 'esbuild';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/build');
const options = {
  absWorkingDir: root,
  entryPoints: ['public/js/app.js'],
  outdir: output,
  entryNames: '[name]-[hash]',
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  metafile: true,
  plugins: [{
    name: 'entry-manifest',
    setup(builder) {
      builder.onEnd(async result => {
        if (result.errors.length) return;
        const [entry] = Object.entries(result.metafile.outputs).find(([, info]) => info.entryPoint === 'public/js/app.js');
        const app = `/build/${relative(output, resolve(root, entry)).split('\\').join('/')}`;
        await mkdir(output, { recursive: true });
        await writeFile(resolve(output, 'manifest.json.tmp'), JSON.stringify({ app }));
        await rename(resolve(output, 'manifest.json.tmp'), resolve(output, 'manifest.json'));
      });
    },
  }],
};

export async function buildFrontend() { await build(options); }
export async function watchFrontend() {
  const watcher = await context(options);
  await watcher.rebuild();
  await watcher.watch();
  return watcher;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildFrontend();
