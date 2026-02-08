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
				world.addSystem('test').setProcess(() => {}).and();
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
					.setProcess(() => {})
					.and();
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
					.setProcess(() => {})
					.and();
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

	test('should support chaining multiple systems with and()', () => {
		const plugin = definePlugin<PositionComponents, {}, PositionResources>({
			id: 'test',
			install(world) {
				world
					.addSystem('physics')
					.addQuery('moving', { with: ['position', 'velocity'] })
					.setProcess(() => {})
					.and()
					.addSystem('rendering')
					.addQuery('positioned', { with: ['position'] })
					.setProcess(() => {})
					.and()
					.addResource('gravity', { value: 9.8 });
			},
		});

		const world = ECSpresso.create()
			.withPlugin(plugin)
			.build();

		expect(world.installedPlugins).toContain('test');
		expect(world.hasResource('gravity')).toBe(true);
	});
});
