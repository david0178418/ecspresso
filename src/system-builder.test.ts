import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import { definePlugin } from './plugin';
import type { WorldConfigFrom } from './type-utils';

// Define component types for testing
interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	health: { value: number };
	marker: { id: string };
}



describe('SystemBuilder', () => {
	test('should create a system that can query entities', () => {
		const processedIds: number[] = [];

		const plugin = definePlugin<WorldConfigFrom<TestComponents, {}, {}>>({
			id: 'test',
			install(world) {
				world.addSystem('TestSystem')
					.addQuery('movingEntities', {
						with: ['position', 'velocity'],
						without: ['health']
					})
					.setProcess((queries) => {
						for (const entity of queries.movingEntities) {
							processedIds.push(entity.id);
						}
					});
			},
		});

		const world = ECSpresso.create().withComponentTypes<TestComponents>()
			.withPlugin(plugin)
			.build();

		const entity1 = world.spawn({
			position: { x: 0, y: 0 },
			velocity: { x: 5, y: 10 }
		});

		const entity2 = world.spawn({
			position: { x: 10, y: 20 },
			velocity: { x: -5, y: 0 },
			health: { value: 100 }
		});

		world.update(1/60);

		expect(processedIds).toContain(entity1.id);
		expect(processedIds).not.toContain(entity2.id);
	});

	test('should handle multiple query definitions', () => {
		const queriesProcessed = {
			withMarker: [] as number[],
			withHealth: [] as number[],
		};

		const plugin = definePlugin<WorldConfigFrom<TestComponents, {}, {}>>({
			id: 'multi-query',
			install(world) {
				world.addSystem('MultiQuerySystem')
					.addQuery('withMarker', {
						with: ['marker']
					})
					.addQuery('withHealth', {
						with: ['health']
					})
					.setProcess((queries) => {
						for (const entity of queries.withMarker) {
							queriesProcessed.withMarker.push(entity.id);
						}
						for (const entity of queries.withHealth) {
							queriesProcessed.withHealth.push(entity.id);
						}
					});
			},
		});

		const world = ECSpresso.create().withComponentTypes<TestComponents>()
			.withPlugin(plugin)
			.build();

		const entity1 = world.spawn({
			marker: { id: 'entity1' }
		});

		const entity2 = world.spawn({
			health: { value: 100 }
		});

		const entity3 = world.spawn({
			marker: { id: 'entity3' },
			health: { value: 80 }
		});

		world.update(1/60);

		expect(queriesProcessed['withMarker']).toContain(entity1.id);
		expect(queriesProcessed['withMarker']).toContain(entity3.id);
		expect(queriesProcessed['withMarker']).not.toContain(entity2.id);

		expect(queriesProcessed['withHealth']).toContain(entity2.id);
		expect(queriesProcessed['withHealth']).toContain(entity3.id);
		expect(queriesProcessed['withHealth']).not.toContain(entity1.id);
	});

	test('should support lifecycle hooks', async () => {
		let onInitializeCalled = false;
		let onDetachCalled = false;
		let processCalledCount = 0;

		const plugin = definePlugin<WorldConfigFrom<TestComponents, {}, {}>>({
			id: 'lifecycle',
			install(world) {
				world.addSystem('LifecycleSystem')
					.setOnInitialize(() => {
						onInitializeCalled = true;
					})
					.addQuery('entities', {
						with: ['position']
					})
					.setProcess(() => {
						processCalledCount++;
					})
					.setOnDetach(() => {
						onDetachCalled = true;
					});
			},
		});

		const world = ECSpresso.create().withComponentTypes<TestComponents>()
			.withPlugin(plugin)
			.build();

		await world.initialize();

		expect(onInitializeCalled).toBe(true);
		expect(onDetachCalled).toBe(false);
		expect(processCalledCount).toBe(0);

		world.spawn({
			position: { x: 0, y: 0 }
		});

		world.update(1/60);
		expect(processCalledCount).toBe(1);

		world.removeSystem('LifecycleSystem');
		expect(onDetachCalled).toBe(true);

		world.update(1/60);
		expect(processCalledCount).toBe(1);
	});

	test('should support statically typed queries with correct component access', () => {
		const plugin = definePlugin<WorldConfigFrom<TestComponents, {}, {}>>({
			id: 'typed',
			install(world) {
				world.addSystem('TypedSystem')
					.addQuery('entities', {
						with: ['position', 'health']
					})
					.setProcess((queries) => {
						for (const entity of queries.entities) {
							const pos = entity.components.position;
							const health = entity.components.health;

							pos.x += 1;
							pos.y += 2;

							health.value -= 1;
						}
					});
			},
		});

		const world = ECSpresso.create().withComponentTypes<TestComponents>()
			.withPlugin(plugin)
			.build();

		const entity = world.spawn({
			position: { x: 10, y: 20 },
			health: { value: 100 }
		});

		world.update(1/60);

		const updatedPos = world.entityManager.getComponent(entity.id, 'position');
		const updatedHealth = world.entityManager.getComponent(entity.id, 'health');

		expect(updatedPos).toEqual({ x: 11, y: 22 });
		expect(updatedHealth).toEqual({ value: 99 });
	});

	test('withResources injects typed resources into process callback', () => {
		interface Resources {
			config: { speed: number };
			score: { value: number };
		}

		const received: { config: Resources['config']; score: Resources['score'] }[] = [];

		const world = ECSpresso.create()
			.withComponentTypes<TestComponents>()
			.withResourceTypes<Resources>()
			.withResource('config', { speed: 42 })
			.withResource('score', { value: 100 })
			.build();

		world.addSystem('resourceSystem')
			.addQuery('entities', { with: ['position'] })
			.withResources(['config', 'score'])
			.setProcess((_queries, _dt, _ecs, { config, score }) => {
				received.push({ config, score });
			});

		world.spawn({ position: { x: 0, y: 0 } });
		world.update(1 / 60);
		world.update(1 / 60);

		expect(received).toHaveLength(2);
		expect(received[0]!.config.speed).toBe(42);
		expect(received[0]!.score.value).toBe(100);
	});

	test('withResources resolves once and reuses the same object', () => {
		const resourceObjects: Record<string, unknown>[] = [];

		const world = ECSpresso.create()
			.withComponentTypes<TestComponents>()
			.withResourceTypes<{ config: { speed: number } }>()
			.withResource('config', { speed: 10 })
			.build();

		world.addSystem('cacheTest')
			.withResources(['config'])
			.runWhenEmpty()
			.setProcess((_queries, _dt, _ecs, resources) => {
				resourceObjects.push(resources);
			});

		world.update(1 / 60);
		world.update(1 / 60);
		world.update(1 / 60);

		expect(resourceObjects).toHaveLength(3);
		// Same reference every frame — zero allocation
		expect(resourceObjects[0]).toBe(resourceObjects[1]);
		expect(resourceObjects[1]).toBe(resourceObjects[2]);
	});

	test('withResources works without queries (runWhenEmpty)', () => {
		let callCount = 0;

		const world = ECSpresso.create()
			.withComponentTypes<TestComponents>()
			.withResourceTypes<{ state: { paused: boolean } }>()
			.withResource('state', { paused: false })
			.build();

		world.addSystem('noQueryResources')
			.withResources(['state'])
			.runWhenEmpty()
			.setProcess((_queries, _dt, _ecs, { state }) => {
				if (!state.paused) callCount++;
			});

		world.update(1 / 60);
		expect(callCount).toBe(1);
	});

	test('withResources works regardless of chain order with addQuery', () => {
		const results: number[] = [];

		const world = ECSpresso.create()
			.withComponentTypes<TestComponents>()
			.withResourceTypes<{ multiplier: { value: number } }>()
			.withResource('multiplier', { value: 3 })
			.build();

		// withResources before addQuery
		world.addSystem('resourceFirst')
			.withResources(['multiplier'])
			.addQuery('entities', { with: ['position'] })
			.setProcess((_queries, _dt, _ecs, { multiplier }) => {
				results.push(multiplier.value);
			});

		// addQuery before withResources
		world.addSystem('queryFirst')
			.addQuery('entities', { with: ['position'] })
			.withResources(['multiplier'])
			.setProcess((_queries, _dt, _ecs, { multiplier }) => {
				results.push(multiplier.value * 10);
			});

		world.spawn({ position: { x: 0, y: 0 } });
		world.update(1 / 60);

		expect(results).toContain(3);
		expect(results).toContain(30);
	});

	test('systems without withResources still work with 3-param setProcess', () => {
		let called = false;

		const world = ECSpresso.create()
			.withComponentTypes<TestComponents>()
			.build();

		world.addSystem('classic')
			.addQuery('entities', { with: ['position'] })
			.setProcess((queries, _dt, _ecs) => {
				if (queries.entities.length > 0) called = true;
			});

		world.spawn({ position: { x: 0, y: 0 } });
		world.update(1 / 60);
		expect(called).toBe(true);
	});

	test('should support multiple addSystem calls on same world', () => {
		let system1Processed = false;
		let system2Processed = false;

		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('system1')
			.addQuery('moving', { with: ['position', 'velocity'] })
			.setProcess(() => { system1Processed = true; });
		world.addSystem('system2')
			.addQuery('healthy', { with: ['position', 'health'] })
			.setProcess(() => { system2Processed = true; });

		world.spawn({ position: { x: 0, y: 0 }, velocity: { x: 1, y: 1 } });
		world.spawn({ position: { x: 0, y: 0 }, health: { value: 100 } });
		world.update(1/60);

		expect(system1Processed).toBe(true);
		expect(system2Processed).toBe(true);
	});
});
