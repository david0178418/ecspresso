import { Glob } from 'bun';

const bundleEntryPoints = Array.from(
	new Glob('src/bundles/**/*.ts').scanSync('.')
).filter((f) => !f.includes('.test.'));

const result = await Bun.build({
	entrypoints: ['src/index.ts', 'src/math.ts', ...bundleEntryPoints],
	outdir: 'dist',
	target: 'browser',
	sourcemap: 'linked',
	minify: true,
	external: ['pixi.js', 'ecspresso'],
});

if (!result.success) {
	console.error('Build failed:');
	result.logs.forEach((log) => console.error(log));
	process.exit(1);
}

function formatSize(bytes: number): string {
	return bytes >= 1024
		? `${(bytes / 1024).toFixed(2)} KB`
		: `${bytes} B`;
}

const artifacts = result.outputs
	.map((o) => ({
		path: o.path.replace(`${process.cwd()}/dist/`, ''),
		size: formatSize(o.size),
		kind: o.kind,
	}))
	.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'entry-point' ? -1 : 1));

const maxPath = Math.max(...artifacts.map((a) => a.path.length));
const maxSize = Math.max(...artifacts.map((a) => a.size.length));

console.log(`\nBundled ${result.outputs.length} artifacts\n`);
artifacts.forEach((a) => {
	const label = a.kind === 'entry-point' ? '(entry point)' : `(${a.kind})`;
	console.log(`  ${a.path.padEnd(maxPath + 2)}${a.size.padStart(maxSize)}  ${label}`);
});
