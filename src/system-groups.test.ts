import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import { definePlugin } from './plugin';

interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
}

describe('System Groups', () => {
	describe('inGroup builder method', () => {
		test('system should be assigned to a group', () => {
			const world = new ECSpresso<TestComponents>();

			world.addSystem('renderSystem')
				.inGroup('rendering')
				.addQuery('entities', { with: ['position'] })
				.setProcess(() => {});

			expect(world.getSystemsInGroup('rendering')).toEqual(['renderSystem']);
		});

		test('system can belong to multiple groups', () => {
			const world = new ECSpresso<TestComponents>();

			world.addSystem('physicsRenderer')
				.inGroup('physics')
				.inGroup('rendering')
				.addQuery('entities', { with: ['position'] })
				.setProcess(() => {});

			expect(world.getSystemsInGroup('physics')).toEqual(['physicsRenderer']);
			expect(world.getSystemsInGroup('rendering')).toEqual(['physicsRenderer']);
		});
	});

	describe('disable/enable group', () => {
		test('disabled group systems should not run', () => {
			const world = new ECSpresso<TestComponents>();
			let renderingRan = false;
			let otherRan = false;

			world.addSystem('renderSystem')
				.inGroup('rendering')
				.addQuery('entities', { with: ['position'] })
				.setProcess(() => { renderingRan = true; });

			world.addSystem('otherSystem')
				.addQuery('entities', { with: ['position'] })
				.setProcess(() => { otherRan = true; });

			world.spawn({ position: { x: 0, y: 0 } });

			world.disableSystemGroup('rendering');
			world.update(1/60);

			expect(renderingRan).toBe(false);
			expect(otherRan).toBe(true);
		});

		test('other systems should still run when group is disabled', () => {
			const world = new ECSpresso<TestComponents>();
			const executionOrder: string[] = [];

			world.addSystem('systemA')
				.inGroup('groupA')
				.addQuery('entities', { with: ['position'] })
				.setProcess(() => { executionOrder.push('A'); });

			world.addSystem('systemB')
				.inGroup('groupB')
				.addQuery('entities', { with: ['position'] })
				.setProcess(() => { executionOrder.push('B'); });

			world.spawn({ position: { x: 0, y: 0 } });

			world.disableSystemGroup('groupA');
			world.update(1/60);

			expect(executionOrder).toEqual(['B']);
		});

		test('re-enabling group should allow systems to run again', () => {
			const world = new ECSpresso<TestComponents>();
			let runCount = 0;

			world.addSystem('renderSystem')
				.inGroup('rendering')
				.addQuery('entities', { with: ['position'] })
				.setProcess(() => { runCount++; });

			world.spawn({ position: { x: 0, y: 0 } });

			// Disable and verify not running
			world.disableSystemGroup('rendering');
			world.update(1/60);
			expect(runCount).toBe(0);

			// Re-enable and verify running
			world.enableSystemGroup('rendering');
			world.update(1/60);
			expect(runCount).toBe(1);
		});
	});

	describe('isSystemGroupEnabled', () => {
		test('should return true for enabled groups', () => {
			const world = new ECSpresso<TestComponents>();

			world.addSystem('testSystem')
				.inGroup('testGroup')
				.setProcess(() => {});

			expect(world.isSystemGroupEnabled('testGroup')).toBe(true);
		});

		test('should return false for disabled groups', () => {
			const world = new ECSpresso<TestComponents>();

			world.addSystem('testSystem')
				.inGroup('testGroup')
				.setProcess(() => {});

			world.disableSystemGroup('testGroup');

			expect(world.isSystemGroupEnabled('testGroup')).toBe(false);
		});

		test('should return true for non-existent groups (default enabled)', () => {
			const world = new ECSpresso<TestComponents>();

			expect(world.isSystemGroupEnabled('nonExistent')).toBe(true);
		});
	});

	describe('getSystemsInGroup', () => {
		test('should return all system labels in group', () => {
			const world = new ECSpresso<TestComponents>();

			world.addSystem('system1')
				.inGroup('groupA')
				.setProcess(() => {});

			world.addSystem('system2')
				.inGroup('groupA')
				.setProcess(() => {});

			world.addSystem('system3')
				.inGroup('groupB')
				.setProcess(() => {});

			expect(world.getSystemsInGroup('groupA').sort()).toEqual(['system1', 'system2']);
		});

		test('should return empty array for non-existent group', () => {
			const world = new ECSpresso<TestComponents>();

			expect(world.getSystemsInGroup('nonExistent')).toEqual([]);
		});
	});

	describe('integration', () => {
		test('should work with plugin-installed systems', () => {
			let pluginRan = false;

			const plugin = definePlugin<TestComponents, {}, {}>({
				id: 'grouped-plugin',
				install(world) {
					world.addSystem('pluginSystem')
						.inGroup('pluginGroup')
						.addQuery('entities', { with: ['position'] })
						.setProcess(() => { pluginRan = true; });
				},
			});

			const world = ECSpresso.create<TestComponents>()
				.withPlugin(plugin)
				.build();

			world.spawn({ position: { x: 0, y: 0 } });

			world.disableSystemGroup('pluginGroup');
			world.update(1/60);

			expect(pluginRan).toBe(false);

			world.enableSystemGroup('pluginGroup');
			world.update(1/60);

			expect(pluginRan).toBe(true);
		});

		test('system in multiple groups - any disabled should skip', () => {
			const world = new ECSpresso<TestComponents>();
			let systemRan = false;

			world.addSystem('multiGroupSystem')
				.inGroup('groupA')
				.inGroup('groupB')
				.addQuery('entities', { with: ['position'] })
				.setProcess(() => { systemRan = true; });

			world.spawn({ position: { x: 0, y: 0 } });

			// Disable only one group
			world.disableSystemGroup('groupA');
			world.update(1/60);

			expect(systemRan).toBe(false);
		});

		test('system with no groups should always run', () => {
			const world = new ECSpresso<TestComponents>();
			let systemRan = false;

			world.addSystem('noGroupSystem')
				.addQuery('entities', { with: ['position'] })
				.setProcess(() => { systemRan = true; });

			world.spawn({ position: { x: 0, y: 0 } });

			// Disable some random group
			world.disableSystemGroup('someGroup');
			world.update(1/60);

			expect(systemRan).toBe(true);
		});
	});
});
