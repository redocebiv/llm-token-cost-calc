// Bundle the site into dist/ with esbuild.
//
// Three entry points: the two pages and the counting worker. Splitting keeps the
// 2.3 MB tokenizer rank tables in their own lazily loaded chunks, so the page
// itself stays small and paints before the tokenizer has loaded.

import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(path.join(dist, 'css'), { recursive: true });

const result = await build({
  entryPoints: {
    app: path.join(src, 'js/app.js'),
    'tokenizer.worker': path.join(src, 'js/tokenizer.worker.js'),
  },
  outdir: path.join(dist, 'js'),
  bundle: true,
  splitting: true,
  format: 'esm',
  target: ['es2022'],
  minify: true,
  chunkNames: 'chunks/[name]-[hash]',
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
});

for (const page of ['index.html']) {
  await fs.copyFile(path.join(src, page), path.join(dist, page));
}
await fs.copyFile(path.join(src, 'css/style.css'), path.join(dist, 'css/style.css'));
await fs.writeFile(path.join(dist, '.nojekyll'), '');

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
for (const [file, info] of Object.entries(result.metafile.outputs)) {
  if (info.entryPoint || info.bytes > 200_000) console.log(`  ${path.relative(root, file).padEnd(52)} ${kb(info.bytes)}`);
}
console.log('built dist/');
