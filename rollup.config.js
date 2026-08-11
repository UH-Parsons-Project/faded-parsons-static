import resolve from '@rollup/plugin-node-resolve';
import {terser} from 'rollup-plugin-terser';
import copy from 'rollup-plugin-copy';

// `npm run build` -> `production` is true
// `npm run dev` -> `production` is false
const production = !process.env.ROLLUP_WATCH;

export default {
	input: 'js/core/main.js',
	output: {
		file: 'dist/bundle.js',
		format: 'es',
		sourcemap: true,
	},
	plugins: [
		resolve(),
		production && terser(), // minify, but only in production
		copy({
			targets: [{src: 'js/core/worker.js', dest: 'dist/'}],
		}),
	],
};
