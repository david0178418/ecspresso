import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import { definePlugin, createPluginFactory } from './plugin';

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
		const plugin = definePlugin<PositionComponents, {}, PositionResources>({
			id: 'test',
			install() {},
		});
		expect(plugin.id).toBe('test');
	});

	test('should add systems via the install function', () => {
		const plugin = definePlugin<PositionComponents, {}, PositionResources>({
			id: 'test',
			install(world) {
				world.addSystem('test').setProcess(() => {});
			},
		});

		const world = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		// Verify the plugin was installed
		expect(world.installedPlugins).toContain('test');
	});

	test('should add resources via the install function', () => {
		const plugin = definePlugin<PositionComponents, {}, PositionResources>({
			id: 'test',
			install(world) {
				world.addResource('gravity', { value: 9.8 });
			},
		});

		const world = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		expect(world.installedPlugins).toContain('test');
		expect(world.hasResource('gravity')).toBe(true);
	});

	test('should handle a world installing a plugin', () => {
		const plugin = definePlugin<PositionComponents, {}, PositionResources>({
			id: 'test-plugin',
			install(world) {
				world.addResource('gravity', { value: 9.8 });
			},
		});

		const world = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		// Verify the plugin was installed by checking the installed plugins
		expect(world.installedPlugins).toContain('test-plugin');
		expect(world.hasResource('gravity')).toBe(true);
	});

	test('should combine two plugins with a composite plugin', () => {
		const physicsPlugin = definePlugin<PositionComponents, {}, PositionResources>({
			id: 'physics',
			install(world) {
				world.addResource('gravity', { value: 9.8 });
				world.addSystem('physics')
					.addQuery('movingEntities', {
						with: ['position', 'velocity']
					})
					.setProcess(() => {});
			},
		});

		const playerPlugin = definePlugin<PlayerComponents, {}, PlayerResources>({
			id: 'player',
			install(world) {
				world.addResource('playerControls', { up: false, down: false, left: false, right: false });
				world.addSystem('player')
					.addQuery('players', {
						with: ['player', 'health']
					})
					.setProcess(() => {});
			},
		});

		// Combine the plugins using a composite plugin
		const gamePlugin = definePlugin<PositionComponents & PlayerComponents, {}, PositionResources & PlayerResources>({
			id: 'game',
			install(world) {
				world.installPlugin(physicsPlugin);
				world.installPlugin(playerPlugin);
			},
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
		const plugin = definePlugin<PositionComponents, {}, PositionResources>({
			id: 'test',
			install(world) {
				world.addSystem('physics')
					.addQuery('moving', { with: ['position', 'velocity'] })
					.setProcess(() => {});
				world.addSystem('rendering')
					.addQuery('positioned', { with: ['position'] })
					.setProcess(() => {});
				world.addResource('gravity', { value: 9.8 });
			},
		});

		const world = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		expect(world.installedPlugins).toContain('test');
		expect(world.hasResource('gravity')).toBe(true);
	});

	test('definePlugin with world type param should produce a compatible plugin', () => {
		// Build a world with known types
		const baseWorld = ECSpresso.create()
			.withComponentTypes<PositionComponents & PlayerComponents>()
			.withResourceTypes<PositionResources & PlayerResources>()
			.build();

		type World = typeof baseWorld;

		// Use the world-type overload — no need to repeat C/E/R
		const plugin = definePlugin<World>({
			id: 'world-typed',
			install(world) {
				world.addResource('gravity', { value: 9.8 });
				world.addSystem('movement')
					.addQuery('movers', { with: ['position', 'velocity'] })
					.setProcess(() => {});
			},
		});

		expect(plugin.id).toBe('world-typed');

		// The plugin should be installable via withPlugin on a compatible builder
		const world = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		expect(world.installedPlugins).toContain('world-typed');
		expect(world.hasResource('gravity')).toBe(true);
	});

	test('createPluginFactory with explicit type params should produce correctly-typed plugins', () => {
		const define = createPluginFactory<PositionComponents, {}, PositionResources>();

		const gravityPlugin = define({
			id: 'gravity',
			install(world) {
				world.addResource('gravity', { value: 9.8 });
			},
		});

		const movementPlugin = define({
			id: 'movement',
			install(world) {
				world.addSystem('movement')
					.addQuery('movers', { with: ['position', 'velocity'] })
					.setProcess(() => {});
			},
		});

		expect(gravityPlugin.id).toBe('gravity');
		expect(movementPlugin.id).toBe('movement');

		const world = ECSpresso.create()
			.withPlugin(gravityPlugin)
			.withPlugin(movementPlugin)
			.build();

		expect(world.installedPlugins).toContain('gravity');
		expect(world.installedPlugins).toContain('movement');
		expect(world.hasResource('gravity')).toBe(true);
	});

	test('createPluginFactory with world type param should produce correctly-typed plugins', () => {
		const baseWorld = ECSpresso.create()
			.withComponentTypes<PositionComponents & PlayerComponents>()
			.withResourceTypes<PositionResources & PlayerResources>()
			.build();

		type World = typeof baseWorld;

		const define = createPluginFactory<World>();

		const plugin = define({
			id: 'factory-world-typed',
			install(world) {
				world.addResource('gravity', { value: 9.8 });
				world.addResource('playerControls', { up: false, down: false, left: false, right: false });
				world.addSystem('physics')
					.addQuery('movers', { with: ['position', 'velocity'] })
					.setProcess(() => {});
			},
		});

		expect(plugin.id).toBe('factory-world-typed');

		const world = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		expect(world.installedPlugins).toContain('factory-world-typed');
		expect(world.hasResource('gravity')).toBe(true);
		expect(world.hasResource('playerControls')).toBe(true);
	});
});
