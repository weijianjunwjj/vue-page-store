import terser from '@rollup/plugin-terser';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const banner = `/*!
 * vue-page-store v${pkg.version}
 * (c) ${new Date().getFullYear()} weijianjun
 * @license MIT
 */`;

export default {
  input: 'src/index.js',
  external: ['vue'],
  output: [
    {
      file: 'dist/index.esm.js',
      format: 'es',
      banner,
    },
    {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      exports: 'named',
      banner,
    },
    {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'VuePageStore',
      exports: 'named',
      globals: { vue: 'Vue' },
      banner,
    },
    {
      file: 'dist/index.umd.min.js',
      format: 'umd',
      name: 'VuePageStore',
      exports: 'named',
      globals: { vue: 'Vue' },
      banner,
      plugins: [terser()],
    },
  ],
};
