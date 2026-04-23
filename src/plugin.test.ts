import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import { definePlugin } from './plugin';

// Define test component and resource types
interface PositionComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
}

interface PositionResources {
	gravity: { value: number };
}

interface PlayerComponents {
	player: { id: string };
	health: { value: number };
}

interface PlayerResources {
	playerControls: { up: boolean; down: boolean; left: boolean; right: boolean };
}

describe('Plugin', () => {
	test('should create a plugin with correct type parameters', () => {
		const plugin = definePlugin('test')
			.withComponentTypes<PositionComponents>()
			.withResourceTypes<PositionResources>()
			.install(() => {});
		expect(plugin.id).toBe('test');
	});

	test('should add systems via the install function', () => {
		const plugin = definePlugin('test')
			.withComponentTypes<PositionComponents>()
			.withResourceTypes<PositionResources>()
			.install((world) => {
				world.addSystem('test').setProcess(() => {});
			});

		const world = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		// Verify the plugin was installed
		expect(world.installedPlugins).toContain('test');
	});

	test('should add resources via the install function', () => {
		const plugin = definePlugin('test')
			.withComponentTypes<PositionComponents>()
			.withResourceTypes<PositionResources>()
			.install((world) => {
				world.addResource('gravity', { value: 9.8 });
			});

		const world = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		expect(world.installedPlugins).toContain('test');
		expect(world.hasResource('gravity')).toBe(true);
	});

	test('should handle a world installing a plugin', () => {
		const plugin = definePlugin('test-plugin')
			.withComponentTypes<PositionComponents>()
			.withResourceTypes<PositionResources>()
			.install((world) => {
				world.addResource('gravity', { value: 9.8 });
			});

		const world = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		// Verify the plugin was installed by checking the installed plugins
		expect(world.installedPlugins).toContain('test-plugin');
		expect(world.hasResource('gravity')).toBe(true);
	});

	test('should combine two plugins with a composite plugin', () => {
		const physicsPlugin = definePlugin('physics')
			.withComponentTypes<PositionComponents>()
			.withResourceTypes<PositionResources>()
			.install((world) => {
				world.addResource('gravity', { value: 9.8 });
				world.addSystem('physics')
					.addQuery('movingEntities', {
						with: ['position', 'velocity']
					})
					.setProcess(() => {});
			});

		const playerPlugin = definePlugin('player')
			.withComponentTypes<PlayerComponents>()
			.withResourceTypes<PlayerResources>()
			.install((world) => {
				world.addResource('playerControls', { up: false, down: false, left: false, right: false });
				world.addSystem('player')
					.addQuery('players', {
						with: ['player', 'health']
					})
					.setProcess(() => {});
			});

		// Combine the plugins using a composite plugin
		const gamePlugin = definePlugin('game')
			.withComponentTypes<PositionComponents & PlayerComponents>()
			.withResourceTypes<PositionResources & PlayerResources>()
			.install((world) => {
				world.installPlugin(physicsPlugin);
				world.installPlugin(playerPlugin);
			});

		// Install the combined plugin into a world
		const world = ECSpresso.create()
			.withPlugin(gamePlugin)
			.build();

		// Install and verify plugin was successfully installed
		expect(world.installedPlugins).toContain('game');
		expect(world.hasResource('gravity')).toBe(true);
		expect(world.hasResource('playerControls')).toBe(true);
	});

	test('should support defining multiple systems in a plugin', () => {
		const plugin = definePlugin('test')
			.withComponentTypes<PositionComponents>()
			.withResourceTypes<PositionResources>()
			.install((world) => {
				world.addSystem('physics')
					.addQuery('moving', { with: ['position', 'velocity'] })
					.setProcess(() => {});
				world.addSystem('rendering')
					.addQuery('positioned', { with: ['position'] })
					.setProcess(() => {});
				world.addResource('gravity', { value: 9.8 });
			});

		const world = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		expect(world.installedPlugins).toContain('test');
		expect(world.hasResource('gravity')).toBe(true);
	});

});

describe('PluginBuilder.setSystemDefaults', () => {
	test('phase default applies to systems inside install', () => {
		const order: string[] = [];
		const plugin = definePlugin('defaults-phase')
			.setSystemDefaults({ phase: 'render' })
			.install((world) => {
				world.addSystem('default-render').setProcess(() => { order.push('plugin'); });
			});

		const ecs = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		ecs.addSystem('update-sys').setProcess(() => { order.push('update'); });

		ecs.update(1 / 60);

		// 'update' phase runs before 'render' phase
		expect(order).toEqual(['update', 'plugin']);
	});

	test('priority default applies to systems inside install', () => {
		const order: string[] = [];
		const plugin = definePlugin('defaults-priority')
			.setSystemDefaults({ priority: 100 })
			.install((world) => {
				world.addSystem('high-prio').setProcess(() => { order.push('plugin'); });
			});

		const ecs = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		ecs.addSystem('low').setPriority(0).setProcess(() => { order.push('low'); });

		ecs.update(1 / 60);

		// Higher priority runs first within the same phase
		expect(order).toEqual(['plugin', 'low']);
	});

	test('inScreens default gates plugin systems to the named screens', async () => {
		const ran: string[] = [];
		const plugin = definePlugin('defaults-screens')
			.withScreenTypes<{ playing: { initialState: () => {} }; menu: { initialState: () => {} } }>()
			.setSystemDefaults({ inScreens: ['playing'] })
			.install((world) => {
				world._registerScreen('playing', { initialState: () => ({}) });
				world._registerScreen('menu', { initialState: () => ({}) });
				world.addSystem('playing-only').setProcess(() => { ran.push('playing-only'); });
			});

		const ecs = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		await ecs.setScreen('menu', {});
		ecs.update(1 / 60);
		expect(ran).toEqual([]);

		await ecs.setScreen('playing', {});
		ecs.update(1 / 60);
		expect(ran).toEqual(['playing-only']);
	});

	test('per-system override wins over plugin default', () => {
		const order: string[] = [];
		const plugin = definePlugin('defaults-override')
			.setSystemDefaults({ phase: 'update', priority: 100 })
			.install((world) => {
				world.addSystem('override-to-render')
					.inPhase('render')
					.setProcess(() => { order.push('override-to-render'); });
				world.addSystem('override-priority')
					.setPriority(0)
					.setProcess(() => { order.push('override-priority'); });
			});

		const ecs = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		ecs.addSystem('mid').setPriority(50).setProcess(() => { order.push('mid'); });

		ecs.update(1 / 60);

		// update phase: 'mid' (prio 50) between defaults (prio 100) and override-priority (prio 0)
		// render phase: 'override-to-render' last
		expect(order).toEqual(['mid', 'override-priority', 'override-to-render']);
	});

	test('partial defaults leave other fields at built-in defaults', () => {
		const order: string[] = [];
		const plugin = definePlugin('defaults-partial')
			.setSystemDefaults({ priority: 100 })
			.install((world) => {
				// phase should default to 'update' (built-in), not something from the plugin
				world.addSystem('partial').setProcess(() => { order.push('partial'); });
			});

		const ecs = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		ecs.addSystem('render-sys').inPhase('render').setProcess(() => { order.push('render'); });

		ecs.update(1 / 60);

		// 'partial' ran in 'update' phase (before 'render')
		expect(order).toEqual(['partial', 'render']);
	});

	test('inScreens([]) on a plugin system clears the default gate', async () => {
		const ran: string[] = [];
		const plugin = definePlugin('defaults-clear')
			.withScreenTypes<{ playing: { initialState: () => {} }; menu: { initialState: () => {} } }>()
			.setSystemDefaults({ inScreens: ['playing'] })
			.install((world) => {
				world._registerScreen('playing', { initialState: () => ({}) });
				world._registerScreen('menu', { initialState: () => ({}) });
				world.addSystem('gated').setProcess(() => { ran.push('gated'); });
				world.addSystem('always')
					.inScreens([])
					.setProcess(() => { ran.push('always'); });
			});

		const ecs = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		await ecs.setScreen('menu', {});
		ecs.update(1 / 60);
		expect(ran).toEqual(['always']);
	});

	test('defaults do not leak across plugins', () => {
		const order: string[] = [];
		const pluginA = definePlugin('a')
			.setSystemDefaults({ phase: 'render' })
			.install((world) => {
				world.addSystem('a-sys').setProcess(() => { order.push('a'); });
			});
		const pluginB = definePlugin('b')
			.install((world) => {
				world.addSystem('b-sys').setProcess(() => { order.push('b'); });
			});

		const ecs = ECSpresso.create()
			.withPlugin(pluginA)
			.withPlugin(pluginB)
			.build();

		ecs.update(1 / 60);

		// B's system defaults to 'update' phase, so it runs before A's 'render' system
		expect(order).toEqual(['b', 'a']);
	});

	test('defaults do not leak to systems added outside any plugin install', () => {
		const order: string[] = [];
		const plugin = definePlugin('defaults-no-leak')
			.setSystemDefaults({ phase: 'render', priority: 100 })
			.install((world) => {
				world.addSystem('inside').setProcess(() => { order.push('inside'); });
			});

		const ecs = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		// Added outside any install — should NOT inherit the plugin's defaults
		ecs.addSystem('outside').setProcess(() => { order.push('outside'); });

		ecs.update(1 / 60);

		// 'outside' is in 'update' phase, 'inside' is in 'render' phase
		expect(order).toEqual(['outside', 'inside']);
	});

	test('re-calling setSystemDefaults replaces (does not merge)', () => {
		const order: string[] = [];
		const plugin = definePlugin('defaults-replace')
			.setSystemDefaults({ phase: 'render', priority: 100 })
			.setSystemDefaults({ priority: 50 })
			.install((world) => {
				world.addSystem('replaced').setProcess(() => { order.push('replaced'); });
			});

		const ecs = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		ecs.addSystem('render-peer').inPhase('render').setProcess(() => { order.push('render-peer'); });
		ecs.addSystem('update-peer').setPriority(0).setProcess(() => { order.push('update-peer'); });

		ecs.update(1 / 60);

		// After replacement, defaults are { priority: 50 } only:
		// - phase reverts to 'update' (not 'render')
		// - priority is 50, so 'replaced' runs before 'update-peer' (prio 0)
		// 'render-peer' runs last in 'render' phase
		expect(order).toEqual(['replaced', 'update-peer', 'render-peer']);
	});
});

describe('world.pluginFactory()', () => {
	test('basic factory from built world', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<{ position: { x: number; y: number }; velocity: { x: number; y: number } }>()
			.withResourceTypes<{ gravity: { value: number } }>()
			.build();

		const define = ecs.pluginFactory();

		const plugin = define({
			id: 'world-factory-basic',
			install(world) {
				world.addResource('gravity', { value: 9.8 });
				world.addSystem('mover')
					.addQuery('movers', { with: ['position', 'velocity'] })
					.setProcess(() => {});
			},
		});

		const world2 = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		expect(world2.installedPlugins).toContain('world-factory-basic');
		expect(world2.hasResource('gravity')).toBe(true);
	});

	test('multiple plugins from same factory', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<{ position: { x: number; y: number }; health: number }>()
			.withResourceTypes<{ gravity: { value: number }; score: number }>()
			.build();

		const define = ecs.pluginFactory();

		const physicsPlugin = define({
			id: 'physics',
			install(world) {
				world.addResource('gravity', { value: 9.8 });
			},
		});

		const scorePlugin = define({
			id: 'scoring',
			install(world) {
				world.addResource('score', 0);
			},
		});

		const world2 = ECSpresso.create()
			.withPlugin(physicsPlugin)
			.withPlugin(scorePlugin)
			.build();

		expect(world2.installedPlugins).toContain('physics');
		expect(world2.installedPlugins).toContain('scoring');
		expect(world2.hasResource('gravity')).toBe(true);
		expect(world2.hasResource('score')).toBe(true);
	});

	test('compile-time rejection of invalid names', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<{ position: { x: number; y: number } }>()
			.withEventTypes<{ hit: { damage: number } }>()
			.build();

		const define = ecs.pluginFactory();

		define({
			id: 'type-check',
			install(world) {
				// @ts-expect-error - 'nonexistent' is not a valid component
				world.addSystem('bad').addQuery('q', { with: ['nonexistent'] });

				// @ts-expect-error - 'boom' is not a valid event
				world.eventBus.publish('boom', {});
			},
		});
	});

	test('includes types from installed plugins', () => {
		const pluginA = definePlugin('plugin-a')
			.withComponentTypes<{ alpha: number }>()
			.withResourceTypes<{ alphaRes: string }>()
			.install((world) => {
				world.addResource('alphaRes', 'hello');
			});

		const ecs = ECSpresso.create()
			.withPlugin(pluginA)
			.withComponentTypes<{ beta: boolean }>()
			.build();

		const define = ecs.pluginFactory();

		const pluginB = define({
			id: 'plugin-b',
			install(world) {
				// Can access both plugin-a's types and the extra types
				world.addSystem('combo')
					.addQuery('q', { with: ['alpha', 'beta'] })
					.setProcess(() => {});
				world.addResource('alphaRes', 'overwritten');
			},
		});

		expect(pluginB.id).toBe('plugin-b');
	});
});
