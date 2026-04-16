import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import { definePlugin } from './plugin';

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

		const plugin = definePlugin('test')
			.withComponentTypes<TestComponents>()
			.install((world) => {
				world.addSystem('TestSystem')
					.addQuery('movingEntities', {
						with: ['position', 'velocity'],
						without: ['health']
					})
					.setProcess(({ queries }) => {
						for (const entity of queries.movingEntities) {
							processedIds.push(entity.id);
						}
					});
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

		const plugin = definePlugin('multi-query')
			.withComponentTypes<TestComponents>()
			.install((world) => {
				world.addSystem('MultiQuerySystem')
					.addQuery('withMarker', {
						with: ['marker']
					})
					.addQuery('withHealth', {
						with: ['health']
					})
					.setProcess(({ queries }) => {
						for (const entity of queries.withMarker) {
							queriesProcessed.withMarker.push(entity.id);
						}
						for (const entity of queries.withHealth) {
							queriesProcessed.withHealth.push(entity.id);
						}
					});
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

		const plugin = definePlugin('lifecycle')
			.withComponentTypes<TestComponents>()
			.install((world) => {
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
		const plugin = definePlugin('typed')
			.withComponentTypes<TestComponents>()
			.install((world) => {
				world.addSystem('TypedSystem')
					.addQuery('entities', {
						with: ['position', 'health']
					})
					.setProcess(({ queries }) => {
						for (const entity of queries.entities) {
							const pos = entity.components.position;
							const health = entity.components.health;

							pos.x += 1;
							pos.y += 2;

							health.value -= 1;
						}
					});
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
			.setProcess(({ resources: { config, score } }) => {
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
			.setProcess(({ resources }) => {
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
			.setProcess(({ resources: { state } }) => {
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
			.setProcess(({ resources: { multiplier } }) => {
				results.push(multiplier.value);
			});

		// addQuery before withResources
		world.addSystem('queryFirst')
			.addQuery('entities', { with: ['position'] })
			.withResources(['multiplier'])
			.setProcess(({ resources: { multiplier } }) => {
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
			.setProcess(({ queries }) => {
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

describe('processEach', () => {
	test('iterates every matching entity with correct dt', () => {
		const seen: { id: number; dt: number }[] = [];

		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('iter')
			.processEach(
				{ with: ['position', 'velocity'] },
				({ entity, dt }) => {
					seen.push({ id: entity.id, dt });
				},
			);

		const e1 = world.spawn({ position: { x: 0, y: 0 }, velocity: { x: 1, y: 1 } });
		const e2 = world.spawn({ position: { x: 10, y: 10 }, velocity: { x: 2, y: 2 } });
		world.spawn({ position: { x: 20, y: 20 } }); // no velocity, excluded

		world.update(1 / 60);

		expect(seen.map(s => s.id).sort()).toEqual([e1.id, e2.id].sort());
		expect(seen[0]!.dt).toBeCloseTo(1 / 60);
		expect(seen[1]!.dt).toBeCloseTo(1 / 60);
	});

	test('mutations via entity.components persist', () => {
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('movement')
			.processEach(
				{ with: ['position', 'velocity'] },
				({ entity, dt }) => {
					entity.components.position.x += entity.components.velocity.x * dt;
					entity.components.position.y += entity.components.velocity.y * dt;
				},
			);

		const e = world.spawn({ position: { x: 0, y: 0 }, velocity: { x: 60, y: 120 } });
		world.update(1 / 60);

		const pos = world.entityManager.getComponent(e.id, 'position');
		expect(pos).toEqual({ x: 1, y: 2 });
	});

	test('without filter excludes entities with the listed component', () => {
		const seen: number[] = [];
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('alive')
			.processEach(
				{ with: ['position'], without: ['health'] },
				({ entity }) => { seen.push(entity.id); },
			);

		const alive = world.spawn({ position: { x: 0, y: 0 } });
		world.spawn({ position: { x: 0, y: 0 }, health: { value: 100 } });

		world.update(1 / 60);
		expect(seen).toEqual([alive.id]);
	});

	test('optional yields present-or-undefined component', () => {
		const results: { id: number; hasHealth: boolean }[] = [];
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('maybe')
			.processEach(
				{ with: ['position'], optional: ['health'] },
				({ entity }) => {
					results.push({
						id: entity.id,
						hasHealth: entity.components.health !== undefined,
					});
				},
			);

		const a = world.spawn({ position: { x: 0, y: 0 } });
		const b = world.spawn({ position: { x: 0, y: 0 }, health: { value: 100 } });

		world.update(1 / 60);

		expect(results.find(r => r.id === a.id)?.hasHealth).toBe(false);
		expect(results.find(r => r.id === b.id)?.hasHealth).toBe(true);
	});

	test('changed filter only iterates entities with changed components', () => {
		const seen: number[] = [];
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('changedOnly')
			.processEach(
				{ with: ['position'], changed: ['position'] },
				({ entity }) => { seen.push(entity.id); },
			);

		const e1 = world.spawn({ position: { x: 0, y: 0 } });
		world.spawn({ position: { x: 5, y: 5 } });

		// First update: both freshly spawned, so both are "changed"
		world.update(1 / 60);
		seen.length = 0;

		// No further changes → no iteration
		world.update(1 / 60);
		expect(seen).toEqual([]);

		world.markChanged(e1.id, 'position');
		world.update(1 / 60);
		expect(seen).toEqual([e1.id]);
	});

	test('parentHas filter scopes to children of qualifying parents', () => {
		const seen: number[] = [];
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('childrenOfHealthy')
			.processEach(
				{ with: ['position'], parentHas: ['health'] },
				({ entity }) => { seen.push(entity.id); },
			);

		const parent = world.spawn({ position: { x: 0, y: 0 }, health: { value: 100 } });
		const child = world.spawn({ position: { x: 10, y: 10 } });
		world.setParent(child.id, parent.id);

		const orphan = world.spawn({ position: { x: 50, y: 50 } });
		const unhealthyParent = world.spawn({ position: { x: 100, y: 100 } });
		const unhealthyChild = world.spawn({ position: { x: 110, y: 110 } });
		world.setParent(unhealthyChild.id, unhealthyParent.id);

		world.update(1 / 60);

		expect(seen).toContain(child.id);
		expect(seen).not.toContain(orphan.id);
		expect(seen).not.toContain(unhealthyChild.id);
		expect(seen).not.toContain(parent.id);
	});

	test('withResources threads resources into callback context', () => {
		const calls: number[] = [];
		const world = ECSpresso.create()
			.withComponentTypes<TestComponents>()
			.withResourceTypes<{ config: { speed: number } }>()
			.withResource('config', { speed: 99 })
			.build();

		world.addSystem('withRes')
			.withResources(['config'])
			.processEach(
				{ with: ['position'] },
				({ resources: { config } }) => {
					calls.push(config.speed);
				},
			);

		world.spawn({ position: { x: 0, y: 0 } });
		world.update(1 / 60);
		expect(calls).toEqual([99]);
	});

	test('withResources resolves once and reuses the same object', () => {
		const observed: Record<string, unknown>[] = [];
		const world = ECSpresso.create()
			.withComponentTypes<TestComponents>()
			.withResourceTypes<{ config: { speed: number } }>()
			.withResource('config', { speed: 10 })
			.build();

		world.addSystem('cacheTest')
			.withResources(['config'])
			.processEach(
				{ with: ['position'] },
				({ resources }) => { observed.push(resources); },
			);

		world.spawn({ position: { x: 0, y: 0 } });
		world.update(1 / 60);
		world.update(1 / 60);
		world.update(1 / 60);

		expect(observed).toHaveLength(3);
		expect(observed[0]).toBe(observed[1]);
		expect(observed[1]).toBe(observed[2]);
	});

	test('composes with inPhase / setPriority / inGroup', () => {
		const executionOrder: string[] = [];
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('preUpdater')
			.inPhase('preUpdate')
			.setPriority(10)
			.processEach(
				{ with: ['position'] },
				() => { executionOrder.push('pre'); },
			);

		world.addSystem('updater')
			.inPhase('update')
			.processEach(
				{ with: ['position'] },
				() => { executionOrder.push('upd'); },
			);

		world.spawn({ position: { x: 0, y: 0 } });
		world.update(1 / 60);

		expect(executionOrder).toEqual(['pre', 'upd']);
	});

	test('inGroup gates execution alongside processEach', () => {
		let calls = 0;
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('grouped')
			.inGroup('myGroup')
			.processEach(
				{ with: ['position'] },
				() => { calls++; },
			);

		world.spawn({ position: { x: 0, y: 0 } });
		world.update(1 / 60);
		expect(calls).toBe(1);

		world.disableSystemGroup('myGroup');
		world.update(1 / 60);
		expect(calls).toBe(1);

		world.enableSystemGroup('myGroup');
		world.update(1 / 60);
		expect(calls).toBe(2);
	});

	test('supports setOnInitialize / setOnDetach after processEach', async () => {
		let initCalled = false;
		let detachCalled = false;
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('withLifecycle')
			.processEach({ with: ['position'] }, () => {})
			.setOnInitialize(() => { initCalled = true; })
			.setOnDetach(() => { detachCalled = true; });

		await world.initialize();
		expect(initCalled).toBe(true);

		world.removeSystem('withLifecycle');
		expect(detachCalled).toBe(true);
	});

	test('runWhenEmpty does not invoke the per-entity callback when no entities match', () => {
		let calls = 0;
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('emptyRuns')
			.runWhenEmpty()
			.processEach(
				{ with: ['position'] },
				() => { calls++; },
			);

		world.update(1 / 60);
		expect(calls).toBe(0);
	});

	test('runtime guard: calling processEach twice throws', () => {
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();
		const builder = world.addSystem('twice')
			.processEach({ with: ['position'] }, () => {});

		expect(() => {
			// @ts-expect-error — processEach unavailable once __each is in Queries
			builder.processEach({ with: ['position'] }, () => {});
		}).toThrow();
	});

	test('runtime guard: processEach after addQuery throws', () => {
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();
		const builder = world.addSystem('afterAddQuery')
			.addQuery('e', { with: ['position'] });

		expect(() => {
			// @ts-expect-error — processEach unavailable after addQuery
			builder.processEach({ with: ['position'] }, () => {});
		}).toThrow();
	});

	test('runtime guard: processEach after setProcess throws', () => {
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();
		const builder = world.addSystem('afterSetProcess')
			.addQuery('e', { with: ['position'] })
			.setProcess(() => {});

		expect(() => {
			// @ts-expect-error — processEach unavailable after addQuery/setProcess
			builder.processEach({ with: ['position'] }, () => {});
		}).toThrow();
	});

	test('entity type inference: with/optional/without narrow correctly', () => {
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('typeCheck')
			.processEach(
				{ with: ['position'], optional: ['health'], without: ['marker'] },
				({ entity }) => {
					const x: number = entity.components.position.x;
					const y: number = entity.components.position.y;
					const health: { value: number } | undefined = entity.components.health;

					expect(typeof x).toBe('number');
					expect(typeof y).toBe('number');
					if (health !== undefined) {
						expect(typeof health.value).toBe('number');
					}
				},
			);

		world.spawn({ position: { x: 1, y: 2 } });
		world.spawn({ position: { x: 3, y: 4 }, health: { value: 50 } });
		world.update(1 / 60);
	});

	test('ecs is available in the callback context', () => {
		let observedEcs: unknown;
		const world = ECSpresso.create().withComponentTypes<TestComponents>().build();

		world.addSystem('ecsCheck')
			.processEach(
				{ with: ['position'] },
				({ ecs }) => { observedEcs = ecs; },
			);

		world.spawn({ position: { x: 0, y: 0 } });
		world.update(1 / 60);

		expect(observedEcs).toBe(world);
	});
});
