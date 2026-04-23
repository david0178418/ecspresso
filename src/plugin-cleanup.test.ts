import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import { definePlugin } from './plugin';

describe('Plugin cleanup registry', () => {
	test('onCleanup runs registered fns in reverse order on uninstallPlugin', () => {
		const calls: string[] = [];

		const plugin = definePlugin('cleanup-order')
			.install((_world, onCleanup) => {
				onCleanup(() => calls.push('first'));
				onCleanup(() => calls.push('second'));
				onCleanup(() => calls.push('third'));
			});

		const world = ECSpresso.create().withPlugin(plugin).build();

		expect(world.installedPlugins).toContain('cleanup-order');
		const removed = world.uninstallPlugin('cleanup-order');
		expect(removed).toBe(true);
		expect(calls).toEqual(['third', 'second', 'first']);
		expect(world.installedPlugins).not.toContain('cleanup-order');
	});

	test('uninstallPlugin returns false for a plugin that is not installed', () => {
		const world = ECSpresso.create().build();
		expect(world.uninstallPlugin('nonexistent')).toBe(false);
	});

	test('uninstallPlugin is idempotent after the first successful call', () => {
		const calls: string[] = [];

		const plugin = definePlugin('idempotent')
			.install((_world, onCleanup) => {
				onCleanup(() => calls.push('ran'));
			});

		const world = ECSpresso.create().withPlugin(plugin).build();

		expect(world.uninstallPlugin('idempotent')).toBe(true);
		expect(world.uninstallPlugin('idempotent')).toBe(false);
		expect(calls).toEqual(['ran']);
	});

	test('dispose runs cleanups for all plugins in reverse install order', () => {
		const calls: string[] = [];

		const pluginA = definePlugin('a')
			.install((_world, onCleanup) => {
				onCleanup(() => calls.push('a-cleanup'));
			});
		const pluginB = definePlugin('b')
			.install((_world, onCleanup) => {
				onCleanup(() => calls.push('b-cleanup'));
			});
		const pluginC = definePlugin('c')
			.install((_world, onCleanup) => {
				onCleanup(() => calls.push('c-cleanup'));
			});

		const world = ECSpresso.create()
			.withPlugin(pluginA)
			.withPlugin(pluginB)
			.withPlugin(pluginC)
			.build();

		world.dispose();

		expect(calls).toEqual(['c-cleanup', 'b-cleanup', 'a-cleanup']);
		expect(world.installedPlugins).toEqual([]);
	});

	test('reinstall after uninstall re-runs install (and registers fresh cleanups)', () => {
		const calls: string[] = [];

		const plugin = definePlugin('reinstallable')
			.install((_world, onCleanup) => {
				calls.push('install');
				onCleanup(() => calls.push('cleanup'));
			});

		const world = ECSpresso.create().withPlugin(plugin).build();
		expect(calls).toEqual(['install']);

		world.uninstallPlugin('reinstallable');
		expect(calls).toEqual(['install', 'cleanup']);

		world.installPlugin(plugin);
		expect(calls).toEqual(['install', 'cleanup', 'install']);

		world.uninstallPlugin('reinstallable');
		expect(calls).toEqual(['install', 'cleanup', 'install', 'cleanup']);
	});

	test('a cleanup that throws does not prevent later cleanups from running', () => {
		const calls: string[] = [];
		const warn = console.warn;
		const warnings: unknown[][] = [];
		console.warn = (...args: unknown[]) => { warnings.push(args); };

		try {
			const plugin = definePlugin('throwing')
				.install((_world, onCleanup) => {
					onCleanup(() => calls.push('first'));
					onCleanup(() => { throw new Error('boom'); });
					onCleanup(() => calls.push('third'));
				});

			const world = ECSpresso.create().withPlugin(plugin).build();
			world.uninstallPlugin('throwing');
			expect(calls).toEqual(['third', 'first']);
			expect(warnings.length).toBeGreaterThan(0);
		} finally {
			console.warn = warn;
		}
	});

	test('one-arg install (no onCleanup) still type-checks and installs cleanly', () => {
		// Backward-compat path: existing plugins do not declare the second param.
		const plugin = definePlugin('legacy')
			.install((world) => {
				world.addResource('marker' as never, { v: 1 } as never);
			});

		const world = ECSpresso.create().withPlugin(plugin).build();
		expect(world.installedPlugins).toContain('legacy');
		expect(world.uninstallPlugin('legacy')).toBe(true);
	});

	test('plugins with no registered cleanups still uninstall successfully', () => {
		const plugin = definePlugin('no-cleanups')
			.install((_world, _onCleanup) => {});

		const world = ECSpresso.create().withPlugin(plugin).build();
		expect(world.uninstallPlugin('no-cleanups')).toBe(true);
		expect(world.installedPlugins).not.toContain('no-cleanups');
	});
});
