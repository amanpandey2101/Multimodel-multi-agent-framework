const { build } = require('esbuild');

const pkg = require('./package.json');
const external = Object.keys(pkg.dependencies || {});

build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/index.js',
  external: [...external, 'fs/promises', 'path', 'child_process', 'url', 'events'],
}).catch(() => process.exit(1));
