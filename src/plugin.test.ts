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
