import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import { definePlugin } from './plugin';

interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	health: { value: number };
	collision: { radius: number; isColliding: boolean };
	damage: { value: number };
	lifetime: { remaining: number };
	state: { current: string; previous: string };
}

interface TestResources {
	config: { debug: boolean; maxEntities: number };
	gameState: string;
	physics: { gravity: number };
}

interface TestEvents {
	playerDamaged: { entityId: number; amount: number };
	gameStarted: {};
	gameEnded: { winner: string };
	hierarchyChanged: { entityId: number; oldParent: number | null; newParent: number | null };
}

describe('ECSpresso', () => {
	describe('type checks', () => {
		test('should allow type-safe component access', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.entityManager.createEntity();

			// @ts-expect-error // TypeScript should complain if we try to access a non-existent component
			entity.components.doesNotExist;

			world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });

			const filteredComponent = world.getEntitiesWithQuery(['position']);
			const [entity1] = filteredComponent;

			expect(filteredComponent.length).toBe(1);
			expect(entity1?.components.position.x).toBe(0);
			expect(entity1?.components.velocity?.y).toBeUndefined();

			const entity2 = world.entityManager.createEntity();
			world.entityManager.addComponent(entity2.id, 'velocity', { x: 10, y: 20 });

			const filteredComponent2 = world.getEntitiesWithQuery(['velocity']);

			filteredComponent2[0]?.components.velocity.y;

			try {
				// @ts-expect-error // TypeScript should complain if we try to access a non-existent component
				filteredComponent2[0].components.position.y;
			} catch {
				// expect error...
			}

			expect(filteredComponent2.length).toBe(1);
			expect(entity2.components.velocity?.x).toBe(10);
			expect(entity2.components.position?.y).toBeUndefined();

			// @ts-expect-error // TypeScript should complain if we try to add a query with a non-existent component
			world.getEntitiesWithQuery(['doesNotExist']);

			// @ts-expect-error // TypeScript should complain if we try to add a query with a non-existent component
			world.getEntitiesWithQuery([], ['doesNotExist']);

			const filteredComponent3 = world.getEntitiesWithQuery(['velocity'], ['position']);

			const entity3 = filteredComponent3[0];

			entity3?.components.velocity.y;

			try {
				// @ts-expect-error // TypeScript should complain if we try to access a component that is excluded
				entity3.components.position;
			} catch {
				// expect error...
			}

			expect(filteredComponent3.length).toBe(1);
			expect(entity3?.components.velocity.x).toBe(10);
			expect(entity3).toBeDefined();
			expect(entity3 && Object.keys(entity3.components)).not.toInclude('position');
		});

		test('should allow type-safe component assignment', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();

			const entity = world.entityManager.createEntity();
			world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });
			// @ts-expect-error // TypeScript should complain if we try to add a component that doesn't exist
			world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0, z: 0 });
			// @ts-expect-error // TypeScript should complain if we try to add a component that doesn't exist
			world.entityManager.addComponent(entity.id, 'doesNotExist', { value: 100 });
			world.entityManager.addComponents(entity, {
				position: {
					x: 10,
					y: 20,
				},
				// @ts-expect-error // TypeScript should complain if we try to add a component that doesn't exist
				nonExistentComponent: { x: 5, y: 10 },
			});

			// Test with a valid component
			world.entityManager.addComponent(entity.id, 'position', { x: 5, y: 10 });

			// This would produce a type error in a stricter TypeScript configuration
			// @ts-expect-error - 'notAComponent' is not a valid component name
			world.entityManager.addComponent(entity.id, 'notAComponent', { x: 5, y: 10 });

			expect(true).toBe(true); // Just to ensure the test runs without errors
		});

		test('should allow type-safe resource access', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();

			// @ts-expect-error // TypeScript should complain if we are missing fields
			world.addResource('config', {});
			world.addResource('config', {
				debug: true,
				maxEntities: 1000,
				// @ts-expect-error // TypeScript should complain if we add an extra field
				extraField: 'not allowed'
			});
			// @ts-expect-error // TypeScript should complain if we try to add a resource that doesn't exist
			world.addResource('doesNotExist', { value: 100 });

			try {
				// @ts-expect-error // TypeScript should complain if we try to access a non-existent resource
				world.getResource('nonExistentResource');
			} catch {
				// expect error...
			}

			expect(true).toBe(true); // Just to ensure the test runs without errors
		});

		test('should reject invalid dependsOn keys in addResource', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();

			world.addResource('config', {
				// @ts-expect-error - 'nonExistent' is not a valid resource key
				dependsOn: ['nonExistent'],
				factory: () => ({ debug: true, maxEntities: 100 }),
			});

			// Valid dependsOn should compile
			world.addResource('config', {
				dependsOn: ['gameState'],
				factory: () => ({ debug: true, maxEntities: 100 }),
			});

			expect(true).toBe(true);
		});

		test('should type-check dependsOn keys in withResource builder', () => {
			// Valid dependsOn compiles with inferred resource types
			ECSpresso
				.create<{}, {}, {}>()
				.withResource('base', 10)
				.withResource('derived', {
					dependsOn: ['base'],
					factory: () => 20,
				});

			// Valid dependsOn compiles with pre-declared resource types
			ECSpresso
				.create<{}, {}, { base: number; derived: number }>()
				.withResource('derived', {
					dependsOn: ['base'],
					factory: () => 20,
				});

			expect(true).toBe(true);
		});

		test('should allow type-safe event publishing', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();

			// Event publishing type safety
			world.eventBus.publish('playerDamaged', {
				entityId: 1,
				amount: 10,
				// @ts-expect-error // TypeScript should complain about extra fields
				extraField: 'not allowed'
			});
			// @ts-expect-error // TypeScript should complain about missing required fields
			world.eventBus.publish('playerDamaged', {});
			world.eventBus.publish('playerDamaged', {
				entityId: 1,
				amount: 10,
				// @ts-expect-error // TypeScript should complain about extra fields
				extraField: true
			});
			// @ts-expect-error // TypeScript should complain if we try to publish a non-existent event
			world.eventBus.publish('nonExistentEvent', {});

			expect(true).toBe(true); // Just to ensure the test runs without errors
		});

		test('should allow type-safe system creation', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();

			world
				.addSystem('some-system')
				.addQuery('someQuery', {
					with: ['position'],
					without: ['health'],
				})
				.addQuery('someOtherQuery', {
					// @ts-expect-error // TypeScript should complain if we try to add a query with a non-existent component
					with: ['non-existent-component'],
					// @ts-expect-error // TypeScript should complain if we try to add a query with a non-existent component
					without: ['other-non-existent-component'],
				})
				.setProcess((queries) => {
					queries.someQuery.length;

					for(const entity of queries.someQuery) {
						// TypeScript should know that entity has a position component
						entity.components.position.x
						// @ts-expect-error // TypeScript should complain if we try to access a non-existent component
						entity.components.shouldFail;
					}

					// @ts-expect-error // TypeScript should complain if we try to access a non-existent query
					queries.notAQuery;
				})
				.setEventHandlers({
					// @ts-expect-error // TypeScript should complain if we try to add an event handler for a non-existent event
					nonExistentEvent: () => {},
					playerDamaged(data) {
						data.amount.toFixed(); // TypeScript should know that data has an amount property

						// @ts-expect-error // TypeScript should complain if we try to access a non-existent property
						data.nonExistentProperty;
					}
				});

			expect(true).toBe(true); // Just to ensure the test runs without errors
		});

		test('should handle plugin augmentation', () => {
			const plugin1 = definePlugin<{cmpFromB1: number}, {evtFromB1: {data: number}}, {resFromB1: {data: number}}>({
				id: 'plugin1',
				install(world) {
					world.addResource('resFromB1', { data: 100 });
				},
			});

			const plugin2 = definePlugin<{cmpFromB2: string}, {evtFromB2: {data: string}}, {resFromB2: {data: string}}>({
				id: 'plugin2',
				install(world) {
					world.addResource('resFromB2', { data: 'test' });
				},
			});

			const merged = definePlugin<
				{cmpFromB1: number} & {cmpFromB2: string},
				{evtFromB1: {data: number}} & {evtFromB2: {data: string}},
				{resFromB1: {data: number}} & {resFromB2: {data: string}}
			>({
				id: 'merged',
				install(world) {
					world.installPlugin(plugin1);
					world.installPlugin(plugin2);
					world
						.addSystem('some-system')
						.addQuery('someQuery', {
							with: [
								'cmpFromB1',
								'cmpFromB2',
								// @ts-expect-error // TypeScript should complain if we try to add a query with a non-existent component
								'notAComponent',
							],
						})
						.setEventHandlers({
							evtFromB1(data) {
								data.data.toFixed();
							},
							evtFromB2(data) {
								data.data.toUpperCase();
							},
							// @ts-expect-error // TypeScript should complain if we try to add an event handler for a non-existent event
							nonExistentEvent: () => {},
						});
				},
			});

			const ecspresso = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(merged)
				.build();

			ecspresso
				.addSystem('some-system-2')
				.addQuery('someQuery', {
					with: [
						'position',
						'cmpFromB1',
						'cmpFromB2',
						// @ts-expect-error // TypeScript should complain if we try to add a query with a non-existent component
						'doesNotExist',
					],
				})
				.setEventHandlers({
					evtFromB1(data) {
						data.data.toFixed();
					},
					evtFromB2(data) {
						data.data.toUpperCase();
					},
					// @ts-expect-error // TypeScript should complain if we try to add an event handler for a non-existent event
					nonExistentEvent: () => {},
				});

			// @ts-expect-error // TypeScript should complain if we try to publish a non-existent event
			ecspresso.eventBus.publish('nonExistentEvent', { data: 'test' });

			ecspresso.getResource('resFromB1');
			ecspresso.getResource('resFromB2');
			try {
				// @ts-expect-error // TypeScript should complain if we try to access a non-existent resource
				ecspresso.getResource('non-existent-resource');
			} catch {
				// expect error...
			}

			expect(true).toBe(true);
		});

		test('should allow overlapping components, events and resources of the same type', () => {
			const plugin1 = definePlugin<{cmp: number}, {evt: {data: number}}, {res: {data: number}}>({
				id: 'plugin1',
				install() {},
			});
			const plugin2 = definePlugin<{cmp: number}, {evt: {data: number}}, {res: {data: number}}>({
				id: 'plugin2',
				install() {},
			});

			// Test with traditional method-based installation
			const ecspresso = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(plugin1)
				.withPlugin(plugin2)
				.build();

			// Set resources
			ecspresso.addResource('config', { debug: true, maxEntities: 1000 });
			// @ts-expect-error // TypeScript should complain if we try to add incompatible resources
			ecspresso.addResource('config', {foo: 1});

			ecspresso
				.addSystem('some-system')
				.addQuery('someQuery', {
					with: ['cmp'],
				});

			expect(true).toBe(true);
		});

		test('should not allow conflicting components, events and resources of different types', () => {
			const plugin3 = definePlugin<{cmp: number}, {evt: {data: number}}, {res: {data: number}}>({
				id: 'plugin3',
				install() {},
			});
			const plugin4 = definePlugin<{cmp: string}, {evt: {data: string}}, {res: {data: string}}>({
				id: 'plugin4',
				install() {},
			});

			ECSpresso.create()
				.withPlugin(plugin3)
				// @ts-expect-error // TypeScript should complain if we try to install plugins that conflict with each other
				.withPlugin(plugin4)
				.build();

			const plugin5 = definePlugin<{position: string}, {gameEnded: string}, {config: boolean}>({
				id: 'plugin5',
				install() {},
			});

			ECSpresso.create<TestComponents, TestEvents, TestResources>()
				// @ts-expect-error // TypeScript should complain if we try to install plugins that conflict with the type parameters passed to ecspresso
				.withPlugin(plugin5)
				.build();

			expect(true).toBe(true);
		});
	});

	// Core ECS functionality tests
	describe('Core ECS', () => {
		test('should run systems with queries', () => {
			const plugin = definePlugin<TestComponents, {}, {}>({
				id: 'movement',
				install(world) {
					world.addSystem('MovementSystem')
						.addQuery('entities', {
							with: ['position', 'velocity'],
							without: ['health'],
						})
						.setProcess((queries) => {
							for (const entity of queries.entities) {
								processedEntities.push(entity.id);
							}
						});
				},
			});

			const world = ECSpresso.create()
				.withPlugin(plugin)
				.build();

			const entity1 = world.spawn({
				position: { x: 0, y: 0 },
				velocity: { x: 5, y: 10 }
			});

			world.spawn({
				position: { x: 100, y: 100 },
				health: { value: 100 }
			});

			const processedEntities: number[] = [];

			world.update(1/60);

			// Only entity1 should match the query
			expect(processedEntities).toEqual([entity1.id]);
		});

		test('should manage resources', () => {
			const plugin = definePlugin<TestComponents, {}, TestResources>({
				id: 'resources',
				install(world) {
					world.addResource('config', { debug: true, maxEntities: 1000 });
				},
			});

			const world = ECSpresso.create<TestComponents, {}, TestResources>()
				.withPlugin(plugin)
				.build();

			// Getting resources
			const config = world.getResource('config');
			expect(config).toEqual({ debug: true, maxEntities: 1000 });

			// Has resource
			expect(world.hasResource('config')).toBe(true);
			expect(world.hasResource('gameState' as keyof TestResources)).toBe(false);

			// Remove resource using the direct method
			world.removeResource('config');

			// Verify resource is gone
			expect(world.hasResource('config')).toBe(false);
		});
	});

	// System lifecycle tests
	describe('System Lifecycle', () => {
		test('should remove systems by label', () => {
			let processRan = false;

			const plugin = definePlugin<TestComponents, {}, {}>({
				id: 'movement',
				install(world) {
					world.addSystem('MovementSystem')
						.addQuery('entities', {
							with: ['position'],
						})
						.setProcess(() => {
							processRan = true;
						});
				},
			});

			const world = ECSpresso.create<TestComponents>()
				.withPlugin(plugin)
				.build();

			// Add entity to match the query
			world.spawn({
				position: { x: 0, y: 0 }
			});

			// System should run during update
			world.update(1/60);
			expect(processRan).toBe(true);

			// Reset flag
			processRan = false;

			// Remove the system
			world.removeSystem('MovementSystem');

			// System should not run after removal
			world.update(1/60);
			expect(processRan).toBe(false);
		});

		test('should handle initializing and detaching systems', async () => {
			let initializationCalled = false;
			let detachCalled = false;
			let processCalled = false;

			const plugin = definePlugin<TestComponents, {}, {}>({
				id: 'movement-control',
				install(world) {
					world.addSystem('MovementControlSystem')
						.setOnInitialize((_ecs) => {
							initializationCalled = true;
						})
						.setOnDetach((_ecs) => {
							detachCalled = true;
						})
						.addQuery('entities', {
							with: ['position'],
						})
						.setProcess((_queries, _deltaTime, _ecs) => {
							processCalled = true;
						});
				},
			});

			const world = ECSpresso.create<TestComponents>()
				.withPlugin(plugin)
				.build();

			// Add an entity to match the query
			world.spawn({
				position: { x: 0, y: 0 }
			});

			await world.initialize();

			// Initialization should have been called
			expect(initializationCalled).toBe(true);

			// Process should run during update
			world.update(1/60);
			expect(processCalled).toBe(true);

			// Remove the system, which should call onDetach
			world.removeSystem('MovementControlSystem');
			expect(detachCalled).toBe(true);
		});
	});

	// Entity and component management tests
	describe('Entity & Component Management', () => {
		test('should create entities with components using spawn method', () => {
			const world = new ECSpresso<TestComponents>();

			// Create entity with multiple components using spawn
			const entity = world.spawn({
				position: { x: 10, y: 20 },
				velocity: { x: 5, y: -2 },
				health: { value: 100 }
			});

			// Verify entity was created
			expect(entity.id).toBeGreaterThan(0);

			// Verify all components were added
			expect(world.hasComponent(entity.id, 'position')).toBe(true);
			expect(world.hasComponent(entity.id, 'velocity')).toBe(true);
			expect(world.hasComponent(entity.id, 'health')).toBe(true);

			// Verify component values
			const position = world.entityManager.getComponent(entity.id, 'position');
			const velocity = world.entityManager.getComponent(entity.id, 'velocity');
			const health = world.entityManager.getComponent(entity.id, 'health');

			expect(position).toEqual({ x: 10, y: 20 });
			expect(velocity).toEqual({ x: 5, y: -2 });
			expect(health).toEqual({ value: 100 });
		});

		test('getComponent returns T | undefined for missing components', () => {
			type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
			const world = ECSpresso.create<TestComponents>().build();
			const entity = world.spawn({ position: { x: 0, y: 0 } });
			const result = world.entityManager.getComponent(entity.id, 'position');
			const _typeCheck: IsExact<typeof result, { x: number; y: number } | undefined> = true;
			expect(_typeCheck).toBe(true);
		});

		test('getComponent returns falsy component values correctly', () => {
			interface FalsyComponents {
				count: number;
				flag: boolean;
				label: string;
			}
			const world = ECSpresso.create<FalsyComponents>().build();
			const entity = world.spawn({ count: 0, flag: false, label: '' });

			expect(world.entityManager.getComponent(entity.id, 'count')).toBe(0);
			expect(world.entityManager.getComponent(entity.id, 'flag')).toBe(false);
			expect(world.entityManager.getComponent(entity.id, 'label')).toBe('');
		});

		test('should handle state transitions in systems', () => {
			const plugin = definePlugin<TestComponents, {}, {}>({
				id: 'state',
				install(world) {
					world.addSystem('StateSystem')
						.addQuery('statefulEntities', {
							with: ['state'],
						})
						.setProcess((queries, _deltaTime, _ecs) => {
							for (const entity of queries.statefulEntities) {
								const state = entity.components.state;
								state.previous = state.current;
								state.current = 'running';
							}
						});
				},
			});

			const world = ECSpresso.create<TestComponents>()
				.withPlugin(plugin)
				.build();

			const entity = world.spawn({
				state: { current: 'idle', previous: '' }
			});

			// Run the system
			world.update(1/60);

			// Check that state was updated
			const state = world.entityManager.getComponent(entity.id, 'state');
			expect(state).toEqual({ current: 'running', previous: 'idle' });
		});

		test('should track entity lifetimes', () => {
			const plugin = definePlugin<TestComponents, {}, {}>({
				id: 'lifetime',
				install(world) {
					world.addSystem('LifetimeSystem')
						.addQuery('lifetimeEntities', {
							with: ['lifetime'],
						})
						.setProcess(queries => {
							for (const entity of queries.lifetimeEntities) {
								entity.components.lifetime.remaining -= 1;

								if (entity.components.lifetime.remaining <= 0) {
									removedEntities.push(entity.id);
								}
							}
						});
				},
			});

			const world = ECSpresso.create<TestComponents>()
				.withPlugin(plugin)
				.build();

			// Create an entity with a lifetime component
			const entity1 = world.spawn({
				lifetime: { remaining: 2 }
			});

			// Create an entity without a lifetime
			const entity2 = world.entityManager.createEntity();

			// Track which entities were removed
			const removedEntities: number[] = [];

			// First update reduces lifetime to 1
			world.update(1/60);
			expect(removedEntities).toEqual([]);

			// Second update reduces lifetime to 0
			world.update(1/60);
			expect(removedEntities).toEqual([entity1.id]);

			// Now manually remove the entity that the system flagged
			for (const id of removedEntities) {
				world.entityManager.removeEntity(id);
			}

			// After removing entity1, trying to get its component should return undefined
			// because the entity no longer exists
			try {
				const lifeComponent = world.entityManager.getComponent(entity1.id, 'lifetime');
				expect(lifeComponent).toBeUndefined();
			} catch (_error) {
				// If an error is thrown because the entity doesn't exist, that's also acceptable
				// The test is successful either way
			}

			// Entity2 exists but has no lifetime component
			const entity2Component = world.entityManager.getComponent(entity2.id, 'lifetime');
			expect(entity2Component).toBeUndefined();
		});

		test('should handle component additions and removals during update', () => {
			const plugin = definePlugin<TestComponents, {}, {}>({
				id: 'dynamic-component',
				install(world) {
					world.addSystem('DynamicComponentSystem')
						.addQuery('entities', {
							with: ['velocity'],
						})
						.setProcess((_queries, _deltaTime, ecs) => {
							if (!ecs.entityManager.getComponent(entity.id, 'position')) {
								ecs.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });
							} else {
								ecs.entityManager.removeComponent(entity.id, 'position');
							}
						});
				},
			});

			const world = ECSpresso.create<TestComponents>()
				.withPlugin(plugin)
				.build();

			// Create entity with velocity component
			const entity = world.spawn({
				velocity: { x: 5, y: 10 }
			});

			// First update adds the position component
			world.update(1/60);
			expect(world.entityManager.getComponent(entity.id, 'position')).toBeDefined();

			// Second update removes the position component
			world.update(1/60);
			expect(world.entityManager.getComponent(entity.id, 'position')).toBeUndefined();
		});
	});

	// Direct system addition tests
	describe('Direct System Creation', () => {
		test('should handle systems added directly via addSystem with type-safety', async () => {
			const world = new ECSpresso<TestComponents, TestEvents>();

			// Create entities
			world.spawn({
				position: { x: 10, y: 20 },
				velocity: { x: 5, y: 0 }
			});

			// Track various calls
			let initialized = false;
			let processCalled = false;
			let eventHandled = false;
			let sumX = 0;
			let sumY = 0;

			// Add a system directly to ECSpresso with all features
			world
				.addSystem('CompleteSystem')
				.addQuery('objects', {
					with: ['position', 'velocity'],
				})
				.setOnInitialize((_ecs) => {
					initialized = true;
				})
				.setProcess((queries, _deltaTime, _ecs) => {
					processCalled = true;

					// Type-safe component access
					for (const entity of queries.objects) {
						sumX += entity.components.position.x + entity.components.velocity.x;
						sumY += entity.components.position.y + entity.components.velocity.y;
					}
				})
				.setEventHandlers({
					playerDamaged: (data) => {
						eventHandled = true;
						expect(data.entityId).toBe(123);
						expect(data.amount).toBe(10);
					}
				});

			expect(initialized).toBe(false);

			await world.initialize();

			// After building, initialization should be called
			expect(initialized).toBe(true);

			// Check process runs during update
			world.update(1/60);
			expect(processCalled).toBe(true);
			expect(sumX).toBe(15); // 10+5 from entity1
			expect(sumY).toBe(20); // 20+0 from entity1

			// Trigger the event and verify handler is called
			world.eventBus.publish('playerDamaged', { entityId: 123, amount: 10 });
			expect(eventHandled).toBe(true);
		});

		test('should provide equivalent functionality for systems added via plugin or directly', () => {
			const directWorld = new ECSpresso<TestComponents>();

			directWorld.spawn({
				position: { x: 0, y: 0 },
				velocity: { x: 5, y: 10 }
			});

			let pluginProcessed = false;
			let directProcessed = false;

			const plugin = definePlugin<TestComponents, {}, {}>({
				id: 'test-plugin',
				install(world) {
					world.addSystem('PluginSystem')
						.addQuery('entities', {
							with: ['position', 'velocity'],
						})
						.setProcess((queries) => {
							expect(queries.entities.length).toBe(1);
							pluginProcessed = true;
						});
				},
			});

			const worldWithPlugin = ECSpresso.create<TestComponents>()
				.withPlugin(plugin)
				.build();

			worldWithPlugin.spawn({
				position: { x: 0, y: 0 },
				velocity: { x: 5, y: 10 }
			});

			directWorld
				.addSystem('DirectSystem')
				.addQuery('entities', {
					with: ['position', 'velocity'],
				})
				.setProcess((queries) => {
					expect(queries.entities.length).toBe(1);
					directProcessed = true;
				});

			directWorld.update(1/60);
			worldWithPlugin.update(1/60);

			expect(directProcessed).toBe(true);
			expect(pluginProcessed).toBe(true);
		});

		test('should support defining multiple systems via separate addSystem calls', () => {
			const world = new ECSpresso<TestComponents>();

			let system1Processed = false;
			let system2Processed = false;
			let system3Processed = false;

			// Create entities
			world.spawn({
				position: { x: 0, y: 0 },
				velocity: { x: 5, y: 10 }
			});

			world.spawn({
				position: { x: 100, y: 100 },
				health: { value: 100 }
			});

			world.addSystem('system1')
				.addQuery('movingEntities', {
					with: ['position', 'velocity'],
				})
				.setProcess((queries) => {
					system1Processed = true;
					expect(queries.movingEntities.length).toBe(1);
				});
			world.addSystem('system2')
				.addQuery('healthyEntities', {
					with: ['position', 'health'],
				})
				.setProcess((queries) => {
					system2Processed = true;
					expect(queries.healthyEntities.length).toBe(1);
				});
			world.addSystem('system3')
				.addQuery('allPositioned', {
					with: ['position'],
				})
				.setProcess((queries) => {
					system3Processed = true;
					expect(queries.allPositioned.length).toBe(2);
				});

			// All systems should now be registered and functional
			world.update(1/60);

			expect(system1Processed).toBe(true);
			expect(system2Processed).toBe(true);
			expect(system3Processed).toBe(true);
		});
	});

	// Priority tests
	describe('System Priority', () => {
		test('should execute systems in priority order (higher priority first)', () => {
			const world = new ECSpresso<TestComponents>();

			// Track execution order
			const executionOrder: string[] = [];

			// Create systems with different priorities
			world.addSystem('LowPrioritySystem')
				.setPriority(0)
				.addQuery('entities', {
					with: ['position'],
				})
				.setProcess(() => {
					executionOrder.push('low');
				});

			world.addSystem('HighPrioritySystem')
				.setPriority(100)
				.addQuery('entities', {
					with: ['position'],
				})
				.setProcess(() => {
					executionOrder.push('high');
				});

			world.addSystem('MediumPrioritySystem')
				.setPriority(50)
				.addQuery('entities', {
					with: ['position'],
				})
				.setProcess(() => {
					executionOrder.push('medium');
				});

			world.spawn({
				position: { x: 0, y: 0 }
			});

			// Update the world to run all systems
			world.update(1/60);

			// Check that systems executed in priority order (high to low)
			expect(executionOrder).toEqual(['high', 'medium', 'low']);
		});

		test('should maintain registration order for systems with the same priority', () => {
			const world = new ECSpresso<TestComponents>();

			// Track execution order
			const executionOrder: string[] = [];

			// Create systems with the same priority in a specific order
			world.addSystem('SystemA')
				.setPriority(10)
				.addQuery('entities', {
					with: ['position'],
				})
				.setProcess(() => {
					executionOrder.push('A');
				});

			world.addSystem('SystemB')
				.setPriority(10)
				.addQuery('entities', {
					with: ['position'],
				})
				.setProcess(() => {
					executionOrder.push('B');
				});

			world.addSystem('SystemC')
				.setPriority(10)
				.addQuery('entities', {
					with: ['position'],
				})
				.setProcess(() => {
					executionOrder.push('C');
				});

			world.spawn({
				position: { x: 0, y: 0 }
			});

			// Update the world to run all systems
			world.update(1/60);

			// Check that systems with the same priority executed in registration order
			expect(executionOrder).toEqual(['A', 'B', 'C']);
		});

		test('should maintain priority when adding systems through plugins', () => {
			const pluginHigh = definePlugin<TestComponents, {}, {}>({
				id: 'plugin-high',
				install(world) {
					world.addSystem('PluginSystemHigh')
						.setPriority(100)
						.addQuery('entities', {
							with: ['position'],
						})
						.setProcess((_queries, _deltaTime, _ecs) => {
							executionOrder.push('pluginHigh');
						});
				},
			});

			const pluginLow = definePlugin<TestComponents, {}, {}>({
				id: 'plugin-low',
				install(world) {
					world.addSystem('PluginSystemLow')
						.setPriority(0)
						.addQuery('entities', {
							with: ['position'],
						})
						.setProcess((_queries, _deltaTime, _ecs) => {
							executionOrder.push('pluginLow');
						});
				},
			});

			const world = ECSpresso.create<TestComponents>()
				.withPlugin(pluginHigh)
				.withPlugin(pluginLow)
				.build();

			world.spawn({
				position: { x: 0, y: 0 }
			});

			// Add a direct system with medium priority
			world.addSystem('DirectSystemMedium')
				.setPriority(50)
				.addQuery('entities', {
					with: ['position'],
				})
				.setProcess(() => {
					executionOrder.push('directMedium');
				});

			// Track execution order
			const executionOrder: string[] = [];

			// Run update to execute all systems
			world.update(1/60);

			// Check that systems executed in priority order across plugins and direct addition
			expect(executionOrder).toEqual(['pluginHigh', 'directMedium', 'pluginLow']);
		});

		test('should allow updating system priorities dynamically', () => {
			const world = new ECSpresso<TestComponents>();

			// Track execution order
			const executionOrder: string[] = [];

			// Add systems with initial priorities
			world.addSystem('SystemA')
				.setPriority(10)
				.addQuery('entities', {
					with: ['position'],
				})
				.setProcess(() => {
					executionOrder.push('A');
				});

			world.addSystem('SystemB')
				.setPriority(20)
				.addQuery('entities', {
					with: ['position'],
				})
				.setProcess(() => {
					executionOrder.push('B');
				});

			world.addSystem('SystemC')
				.setPriority(30)
				.addQuery('entities', {
					with: ['position'],
				})
				.setProcess(() => {
					executionOrder.push('C');
				});

			world.spawn({
				position: { x: 0, y: 0 }
			});

			// Initial update and check
			world.update(1/60);
			expect(executionOrder).toEqual(['C', 'B', 'A']);

			// Clear execution order
			executionOrder.length = 0;

			// Change priorities
			world.updateSystemPriority('SystemA', 40); // Now highest
			world.updateSystemPriority('SystemC', 5);  // Now lowest

			// Run update again with new priorities
			world.update(1/60);

			// Check new execution order
			expect(executionOrder).toEqual(['A', 'B', 'C']);
		});

		test('should preserve cached sorting for performance', () => {
			// This test verifies that the sorting happens only when needed
			const world = new ECSpresso<TestComponents>();

			// Add a lot of systems to make sorting noticeable
			for (let i = 0; i < 5; i++) {
				world.addSystem(`System${i}`)
					.setPriority(i)
					.setProcess(() => {});
			}

			// Trigger deferred finalization so systems are registered
			world.update(1/60);

			// Replace the internal _rebuildPhaseSystems method temporarily with a spy
			let sortCallCount = 0;
			const originalSortMethod = world['_rebuildPhaseSystems'];
			world['_rebuildPhaseSystems'] = function() {
				sortCallCount++;
				originalSortMethod.call(this);
			};

			// Run multiple updates - sorting should not happen
			world.update(1/60);
			world.update(1/60);
			world.update(1/60);

			// Should not have sorted during updates
			expect(sortCallCount).toBe(0);

			// Now update a priority - should trigger sorting
			world.updateSystemPriority('System0', 100);
			expect(sortCallCount).toBe(1);

			// Run more updates - should not trigger sorting
			world.update(1/60);
			world.update(1/60);
			expect(sortCallCount).toBe(1);

			// Restore original method
			world['_rebuildPhaseSystems'] = originalSortMethod;
		});
	});

	// Event convenience methods tests
	describe('Event Convenience Methods', () => {
		test('on() should subscribe and receive events', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			let receivedData: TestEvents['playerDamaged'] | undefined;

			world.on('playerDamaged', (data) => {
				receivedData = data;
			});

			world.eventBus.publish('playerDamaged', { entityId: 1, amount: 25 });

			expect(receivedData).toBeDefined();
			expect(receivedData?.entityId).toBe(1);
			expect(receivedData?.amount).toBe(25);
		});

		test('on() should return a working unsubscribe function', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			let callCount = 0;

			const unsubscribe = world.on('gameStarted', () => {
				callCount++;
			});

			world.eventBus.publish('gameStarted', {});
			expect(callCount).toBe(1);

			unsubscribe();

			world.eventBus.publish('gameStarted', {});
			expect(callCount).toBe(1); // Should not increase
		});

		test('off() should remove subscription by callback reference', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			let callCount = 0;

			const handler = () => { callCount++; };

			world.on('gameStarted', handler);

			world.eventBus.publish('gameStarted', {});
			expect(callCount).toBe(1);

			const removed = world.off('gameStarted', handler);
			expect(removed).toBe(true);

			world.eventBus.publish('gameStarted', {});
			expect(callCount).toBe(1); // Should not increase
		});

		test('off() should return false for non-existent callback', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();

			const handler1 = () => {};
			const handler2 = () => {};

			world.on('gameStarted', handler1);

			const removed = world.off('gameStarted', handler2);
			expect(removed).toBe(false);
		});

		test('on() should provide type-safe event data', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();

			world.on('gameEnded', (data) => {
				// TypeScript should know data has a winner property
				const winner: string = data.winner;
				expect(winner).toBe('Player 1');
			});

			world.eventBus.publish('gameEnded', { winner: 'Player 1' });
		});
	});

	// Post-update hooks tests
	describe('Post-Update Hooks', () => {
		test('onPostUpdate() hook should be called after update()', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			let hookCalled = false;

			world.onPostUpdate(() => {
				hookCalled = true;
			});

			expect(hookCalled).toBe(false);
			world.update(1/60);
			expect(hookCalled).toBe(true);
		});

		test('onPostUpdate() hook should receive ecs instance and deltaTime', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			let receivedEcs: typeof world | undefined;
			let receivedDeltaTime: number | undefined;

			world.onPostUpdate((ecs, deltaTime) => {
				receivedEcs = ecs;
				receivedDeltaTime = deltaTime;
			});

			world.update(0.016);

			expect(receivedEcs).toBeDefined();
			expect(receivedEcs).toBe(world);
			expect(receivedDeltaTime).toBeDefined();
			expect(receivedDeltaTime).toBe(0.016);
		});

		test('multiple onPostUpdate() hooks should be called in registration order', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const executionOrder: string[] = [];

			world.onPostUpdate(() => { executionOrder.push('first'); });
			world.onPostUpdate(() => { executionOrder.push('second'); });
			world.onPostUpdate(() => { executionOrder.push('third'); });

			world.update(1/60);

			expect(executionOrder).toEqual(['first', 'second', 'third']);
		});

		test('onPostUpdate() should return a working unsubscribe function', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			let callCount = 0;

			const unsubscribe = world.onPostUpdate(() => {
				callCount++;
			});

			world.update(1/60);
			expect(callCount).toBe(1);

			unsubscribe();

			world.update(1/60);
			expect(callCount).toBe(1); // Should not increase
		});

		test('onPostUpdate() hooks should run after all systems', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const executionOrder: string[] = [];

			// Add a system
			world.addSystem('TestSystem')
				.addQuery('entities', { with: ['position'] })
				.setProcess(() => {
					executionOrder.push('system');
				});

			// Add a post-update hook
			world.onPostUpdate(() => {
				executionOrder.push('post-update');
			});

			// Create entity to trigger the system
			world.spawn({ position: { x: 0, y: 0 } });

			world.update(1/60);

			expect(executionOrder).toEqual(['system', 'post-update']);
		});

		test('onPostUpdate() hooks should not be called if update() is not called', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			let hookCalled = false;

			world.onPostUpdate(() => {
				hookCalled = true;
			});

			// Don't call update()
			expect(hookCalled).toBe(false);
		});
	});

	// Component lifecycle tests
	describe('Component Lifecycle', () => {
		test('onComponentAdded should be called when component is added', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			let callbackValue: TestComponents['health'] | undefined;
			let callbackEntityId = -1;

			world.onComponentAdded('health', (value, entity) => {
				callbackValue = value;
				callbackEntityId = entity.id;
			});

			const entity = world.spawn({ health: { value: 100 } });

			expect(callbackValue).toEqual({ value: 100 });
			expect(callbackEntityId).toBe(entity.id);
		});

		test('onComponentAdded should be called when entity spawned with component', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const spawnedEntities: number[] = [];

			world.onComponentAdded('position', (_value, entity) => {
				spawnedEntities.push(entity.id);
			});

			const entity1 = world.spawn({ position: { x: 0, y: 0 } });
			const entity2 = world.spawn({ position: { x: 10, y: 10 }, velocity: { x: 1, y: 1 } });

			expect(spawnedEntities).toEqual([entity1.id, entity2.id]);
		});

		test('onComponentRemoved should be called when component explicitly removed', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			let removedValue: TestComponents['velocity'] | undefined;

			world.onComponentRemoved('velocity', (value) => {
				removedValue = value;
			});

			const entity = world.spawn({ velocity: { x: 5, y: 10 } });
			world.entityManager.removeComponent(entity.id, 'velocity');

			expect(removedValue).toEqual({ x: 5, y: 10 });
		});

		test('onComponentRemoved should be called for each component when entity removed', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const removedComponents: string[] = [];

			world.onComponentRemoved('position', () => {
				removedComponents.push('position');
			});
			world.onComponentRemoved('velocity', () => {
				removedComponents.push('velocity');
			});

			const entity = world.spawn({
				position: { x: 0, y: 0 },
				velocity: { x: 1, y: 1 }
			});

			world.removeEntity(entity.id);

			expect(removedComponents.sort()).toEqual(['position', 'velocity']);
		});

		test('onComponentAdded unsubscribe function should stop future callbacks', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			let callCount = 0;

			const unsubscribe = world.onComponentAdded('health', () => {
				callCount++;
			});

			world.spawn({ health: { value: 100 } });
			expect(callCount).toBe(1);

			unsubscribe();

			world.spawn({ health: { value: 50 } });
			expect(callCount).toBe(1); // Should not increase
		});

		test('onComponentRemoved unsubscribe function should stop future callbacks', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			let callCount = 0;

			const unsubscribe = world.onComponentRemoved('position', () => {
				callCount++;
			});

			const entity1 = world.spawn({ position: { x: 0, y: 0 } });
			world.entityManager.removeComponent(entity1.id, 'position');
			expect(callCount).toBe(1);

			unsubscribe();

			const entity2 = world.spawn({ position: { x: 10, y: 10 } });
			world.entityManager.removeComponent(entity2.id, 'position');
			expect(callCount).toBe(1); // Should not increase
		});

		test('callback should receive correct value and entity', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			let receivedValue: TestComponents['state'] | undefined;
			let receivedEntityId: number | undefined;

			world.onComponentAdded('state', (value, entity) => {
				receivedValue = value;
				receivedEntityId = entity.id;
			});

			const entity = world.spawn({ state: { current: 'idle', previous: '' } });

			expect(receivedValue).toEqual({ current: 'idle', previous: '' });
			expect(receivedEntityId).toBe(entity.id);
		});
	});

	// Entity hierarchy tests
	describe('Entity Hierarchy', () => {
		test('should set and get parent via convenience methods', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const parent = world.spawn({ position: { x: 0, y: 0 } });
			const child = world.spawn({ position: { x: 10, y: 10 } });

			world.setParent(child.id, parent.id);

			expect(world.getParent(child.id)).toBe(parent.id);
		});

		test('should get children via convenience method', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const parent = world.spawn({ position: { x: 0, y: 0 } });
			const child1 = world.spawn({ position: { x: 10, y: 10 } });
			const child2 = world.spawn({ position: { x: 20, y: 20 } });

			world.setParent(child1.id, parent.id);
			world.setParent(child2.id, parent.id);

			expect(world.getChildren(parent.id)).toEqual([child1.id, child2.id]);
		});

		test('should remove parent via convenience method', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const parent = world.spawn({ position: { x: 0, y: 0 } });
			const child = world.spawn({ position: { x: 10, y: 10 } });

			world.setParent(child.id, parent.id);
			world.removeParent(child.id);

			expect(world.getParent(child.id)).toBeNull();
		});

		test('spawnChild should create entity with parent set', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const parent = world.spawn({ position: { x: 0, y: 0 } });

			const child = world.spawnChild(parent.id, { position: { x: 10, y: 10 } });

			expect(world.getParent(child.id)).toBe(parent.id);
			expect(world.getChildren(parent.id)).toEqual([child.id]);
			expect(child.components.position).toEqual({ x: 10, y: 10 });
		});

		test('removeEntity should cascade to descendants by default', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const parent = world.spawn({ position: { x: 0, y: 0 } });
			const child = world.spawnChild(parent.id, { position: { x: 10, y: 10 } });
			const grandchild = world.spawnChild(child.id, { position: { x: 20, y: 20 } });

			world.removeEntity(parent.id);

			expect(world.entityManager.getEntity(parent.id)).toBeUndefined();
			expect(world.entityManager.getEntity(child.id)).toBeUndefined();
			expect(world.entityManager.getEntity(grandchild.id)).toBeUndefined();
		});

		test('removeEntity with cascade:false should orphan children', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const parent = world.spawn({ position: { x: 0, y: 0 } });
			const child = world.spawnChild(parent.id, { position: { x: 10, y: 10 } });

			world.removeEntity(parent.id, { cascade: false });

			expect(world.entityManager.getEntity(parent.id)).toBeUndefined();
			expect(world.entityManager.getEntity(child.id)).toBeDefined();
			expect(world.getParent(child.id)).toBeNull();
		});

		test('traversal methods should work via convenience methods', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const root = world.spawn({ position: { x: 0, y: 0 } });
			const child1 = world.spawnChild(root.id, { position: { x: 10, y: 10 } });
			const child2 = world.spawnChild(root.id, { position: { x: 20, y: 20 } });
			const grandchild = world.spawnChild(child1.id, { position: { x: 30, y: 30 } });

			expect(world.getAncestors(grandchild.id)).toEqual([child1.id, root.id]);
			expect(world.getDescendants(root.id)).toEqual([child1.id, grandchild.id, child2.id]);
			expect(world.getRoot(grandchild.id)).toBe(root.id);
			expect(world.getSiblings(child1.id)).toEqual([child2.id]);
			expect(world.isDescendantOf(grandchild.id, root.id)).toBe(true);
			expect(world.isAncestorOf(root.id, grandchild.id)).toBe(true);
			expect(world.getRootEntities()).toEqual([root.id]);
			expect(world.getChildAt(root.id, 0)).toBe(child1.id);
			expect(world.getChildIndex(root.id, child2.id)).toBe(1);
		});

		test('hierarchyChanged event should emit when parent is set', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const parent = world.spawn({ position: { x: 0, y: 0 } });
			const child = world.spawn({ position: { x: 10, y: 10 } });

			const events: TestEvents['hierarchyChanged'][] = [];
			world.on('hierarchyChanged', (data) => {
				events.push(data);
			});

			world.setParent(child.id, parent.id);

			expect(events.length).toBe(1);
			expect(events[0]).toEqual({
				entityId: child.id,
				oldParent: null,
				newParent: parent.id,
			});
		});

		test('hierarchyChanged event should emit when parent is removed', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const parent = world.spawn({ position: { x: 0, y: 0 } });
			const child = world.spawn({ position: { x: 10, y: 10 } });

			world.setParent(child.id, parent.id);

			const events: TestEvents['hierarchyChanged'][] = [];
			world.on('hierarchyChanged', (data) => {
				events.push(data);
			});

			world.removeParent(child.id);

			expect(events.length).toBe(1);
			expect(events[0]).toEqual({
				entityId: child.id,
				oldParent: parent.id,
				newParent: null,
			});
		});

		test('hierarchyChanged event should emit when parent is changed', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();
			const parent1 = world.spawn({ position: { x: 0, y: 0 } });
			const parent2 = world.spawn({ position: { x: 50, y: 50 } });
			const child = world.spawn({ position: { x: 10, y: 10 } });

			world.setParent(child.id, parent1.id);

			const events: TestEvents['hierarchyChanged'][] = [];
			world.on('hierarchyChanged', (data) => {
				events.push(data);
			});

			world.setParent(child.id, parent2.id);

			expect(events.length).toBe(1);
			expect(events[0]).toEqual({
				entityId: child.id,
				oldParent: parent1.id,
				newParent: parent2.id,
			});
		});

		test('spawn and spawnChild should infer component types from arguments', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();

			// spawn should infer that position is present
			const entity = world.spawn({ position: { x: 10, y: 20 } });
			// TypeScript should know position exists (not optional)
			const x: number = entity.components.position.x;
			const y: number = entity.components.position.y;
			expect(x).toBe(10);
			expect(y).toBe(20);

			// spawnChild should also infer component types
			const child = world.spawnChild(entity.id, {
				velocity: { x: 5, y: 10 },
				health: { value: 100 }
			});
			// TypeScript should know velocity and health exist (not optional)
			const vx: number = child.components.velocity.x;
			const hp: number = child.components.health.value;
			expect(vx).toBe(5);
			expect(hp).toBe(100);

			// Components not provided should still be optional
			expect(child.components.position).toBeUndefined();

			// Type-level verification: assigning optional component to non-optional should error
			// @ts-expect-error - position was not provided, so it's optional and can't be assigned to non-optional
			const _badAssign: { x: number; y: number } = child.components.position;
		});
	});

	describe('withResource() Builder', () => {
		test('should add direct value resource', () => {
			const world = ECSpresso
				.create<{}, {}, { config: { debug: boolean } }>()
				.withResource('config', { debug: true })
				.build();

			expect(world.getResource('config')).toEqual({ debug: true });
		});

		test('should add factory resource', async () => {
			const world = ECSpresso
				.create<{}, {}, { counter: number }>()
				.withResource('counter', () => 42)
				.build();

			await world.initializeResources();
			expect(world.getResource('counter')).toBe(42);
		});

		test('should add factory with dependencies', async () => {
			const world = ECSpresso
				.create<{}, {}, { base: number; derived: number }>()
				.withResource('base', 10)
				.withResource('derived', {
					dependsOn: ['base'],
					factory: (ecs) => ecs.getResource('base') * 2
				})
				.build();

			await world.initializeResources();
			expect(world.getResource('derived')).toBe(20);
		});

		test('should add factory with onDispose', async () => {
			let disposed = false;
			const world = ECSpresso
				.create<{}, {}, { db: { value: number } }>()
				.withResource('db', {
					factory: () => ({ value: 42 }),
					onDispose: () => { disposed = true; }
				})
				.build();

			await world.initializeResources();
			expect(world.getResource('db').value).toBe(42);

			await world.disposeResources();
			expect(disposed).toBe(true);
		});

		test('should chain with withPlugin()', () => {
			const plugin = definePlugin<{ position: { x: number; y: number } }, {}, { physics: { gravity: number } }>({
				id: 'physics',
				install(world) {
					world.addResource('physics', { gravity: 9.8 });
				},
			});

			const world = ECSpresso
				.create()
				.withPlugin(plugin)
				.withResource('config', { debug: true })
				.build();

			expect(world.getResource('physics')).toEqual({ gravity: 9.8 });
			expect(world.getResource('config')).toEqual({ debug: true });
		});

		test('should infer types for merged resources', () => {
			const world = ECSpresso
				.create<{}, {}, { existing: string }>()
				.withResource('existing', 'test')
				.withResource('newNum', 42)
				.withResource('newBool', true)
				.build();

			// TypeScript should know all resources exist
			const str: string = world.getResource('existing');
			const num: number = world.getResource('newNum');
			const bool: boolean = world.getResource('newBool');

			expect(str).toBe('test');
			expect(num).toBe(42);
			expect(bool).toBe(true);
		});

		test('should work with withAssets() and withScreens()', () => {
			const world = ECSpresso
				.create()
				.withResource('config', { debug: true })
				.withAssets(assets => assets.add('test', () => Promise.resolve('texture')))
				.build();

			expect(world.getResource('config')).toEqual({ debug: true });
		});
	});

	describe('tryGetResource', () => {
		test('returns undefined for non-existent resource', () => {
			const world = ECSpresso.create<{}, {}, { score: number }>().build();
			expect(world.tryGetResource('score')).toBeUndefined();
		});

		test('returns value for existing resource', () => {
			const world = ECSpresso.create<{}, {}, { score: number }>()
				.withResource('score', 42)
				.build();
			expect(world.tryGetResource('score')).toBe(42);
		});

		test('initializes factory resource on access', async () => {
			const world = ECSpresso.create<{}, {}, { score: number }>()
				.withResource('score', () => 42)
				.build();
			// Factory not yet initialized, but tryGetResource should lazily init
			expect(world.tryGetResource('score')).toBe(42);
		});

		test('type: known key returns T | undefined', () => {
			const world = ECSpresso.create<{}, {}, { score: number }>().build();
			const result = world.tryGetResource('score');
			// @ts-expect-error - result may be undefined, cannot use as number directly
			const _n: number = result;
			void _n;
		});

		test('type: rejects unknown string key without explicit type param', () => {
			const world = ECSpresso.create<{}, {}, { score: number }>().build();
			// @ts-expect-error - 'missing' is not a known key, and no explicit type param provided
			world.tryGetResource('missing');
		});

		test('cross-plugin overload accepts string key with explicit type', () => {
			const world = ECSpresso.create().build();
			const result = world.tryGetResource<{ value: number }>('optionalResource');
			expect(result).toBeUndefined();
			// @ts-expect-error - result may be undefined, cannot assign to non-optional type
			const _v: { value: number } = result;
			void _v;
		});
	});

	describe('Direct Component Access', () => {
		test('getComponent returns the component value for an existing component', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ position: { x: 10, y: 20 } });

			const position = world.getComponent(entity.id, 'position');
			expect(position).toEqual({ x: 10, y: 20 });
		});

		test('getComponent returns undefined for a missing component', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ position: { x: 10, y: 20 } });

			const velocity = world.getComponent(entity.id, 'velocity');
			expect(velocity).toBeUndefined();
		});

		test('getComponent throws for a non-existent entity', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();

			expect(() => world.getComponent(999, 'position')).toThrow();
		});

		test('getComponent return type is T | undefined', () => {
			type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
			const world = ECSpresso.create<TestComponents>().build();
			const entity = world.spawn({ position: { x: 0, y: 0 } });
			const result = world.getComponent(entity.id, 'position');
			const _typeCheck: IsExact<typeof result, { x: number; y: number } | undefined> = true;
			expect(_typeCheck).toBe(true);
		});

		test('getComponent returns falsy values correctly', () => {
			interface FalsyComponents {
				count: number;
				flag: boolean;
				label: string;
			}
			const world = ECSpresso.create<FalsyComponents>().build();
			const entity = world.spawn({ count: 0, flag: false, label: '' });

			expect(world.getComponent(entity.id, 'count')).toBe(0);
			expect(world.getComponent(entity.id, 'flag')).toBe(false);
			expect(world.getComponent(entity.id, 'label')).toBe('');
		});

		test('getComponent rejects invalid component names at compile time', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			world.spawn({ position: { x: 0, y: 0 } });

			// @ts-expect-error - 'doesNotExist' is not a valid component name
			world.getComponent(1, 'doesNotExist');
		});

		test('addComponent adds a new component to an existing entity', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ position: { x: 0, y: 0 } });

			world.addComponent(entity.id, 'velocity', { x: 5, y: 10 });

			expect(world.getComponent(entity.id, 'velocity')).toEqual({ x: 5, y: 10 });
			expect(world.hasComponent(entity.id, 'velocity')).toBe(true);
		});

		test('addComponent replaces an existing component value', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ position: { x: 0, y: 0 } });

			world.addComponent(entity.id, 'position', { x: 99, y: 99 });

			expect(world.getComponent(entity.id, 'position')).toEqual({ x: 99, y: 99 });
		});

		test('addComponent throws for a non-existent entity', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();

			expect(() => world.addComponent(999, 'position', { x: 0, y: 0 })).toThrow();
		});

		test('addComponent rejects invalid component names at compile time', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			world.spawn({ position: { x: 0, y: 0 } });

			// @ts-expect-error - 'doesNotExist' is not a valid component name
			world.addComponent(1, 'doesNotExist', { value: 100 });
			// @ts-expect-error - wrong value type for 'position'
			world.addComponent(1, 'position', { x: 0, y: 0, z: 0 });
		});

		test('addComponent triggers component added callbacks', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ position: { x: 0, y: 0 } });
			let addedValue: TestComponents['health'] | undefined;

			world.onComponentAdded('health', (value) => {
				addedValue = value;
			});

			world.addComponent(entity.id, 'health', { value: 50 });

			expect(addedValue).toEqual({ value: 50 });
		});

		test('addComponent marks component as changed', () => {
			const world = ECSpresso.create<TestComponents>().build();
			const entity = world.spawn({ position: { x: 0, y: 0 } });

			// Run a frame to reset change detection
			world.update(1 / 60);

			// Add component after the frame
			world.addComponent(entity.id, 'velocity', { x: 1, y: 1 });

			const changed = world.getEntitiesWithQuery(['velocity'], [], ['velocity']);
			expect(changed.length).toBe(1);
		});

		test('addComponents adds multiple components at once', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ position: { x: 0, y: 0 } });

			world.addComponents(entity.id, {
				velocity: { x: 5, y: 10 },
				health: { value: 100 },
			});

			expect(world.getComponent(entity.id, 'velocity')).toEqual({ x: 5, y: 10 });
			expect(world.getComponent(entity.id, 'health')).toEqual({ value: 100 });
		});

		test('addComponents throws for a non-existent entity', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();

			expect(() => world.addComponents(999, { position: { x: 0, y: 0 } })).toThrow();
		});

		test('addComponents rejects invalid component names at compile time', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			world.spawn({ position: { x: 0, y: 0 } });

			world.addComponents(1, {
				velocity: { x: 1, y: 1 },
				// @ts-expect-error - 'nonExistent' is not a valid component name
				nonExistent: { x: 5, y: 10 },
			});
		});

		test('removeComponent removes a component from an entity', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ position: { x: 0, y: 0 }, velocity: { x: 1, y: 1 } });

			world.removeComponent(entity.id, 'velocity');

			expect(world.getComponent(entity.id, 'velocity')).toBeUndefined();
			expect(world.hasComponent(entity.id, 'velocity')).toBe(false);
			// position should still be there
			expect(world.hasComponent(entity.id, 'position')).toBe(true);
		});

		test('removeComponent throws for a non-existent entity', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();

			expect(() => world.removeComponent(999, 'position')).toThrow();
		});

		test('removeComponent triggers component removed callbacks', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ position: { x: 0, y: 0 }, velocity: { x: 5, y: 10 } });
			let removedValue: TestComponents['velocity'] | undefined;

			world.onComponentRemoved('velocity', (value) => {
				removedValue = value;
			});

			world.removeComponent(entity.id, 'velocity');

			expect(removedValue).toEqual({ x: 5, y: 10 });
		});

		test('removeComponent rejects invalid component names at compile time', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			world.spawn({ position: { x: 0, y: 0 } });

			// @ts-expect-error - 'doesNotExist' is not a valid component name
			world.removeComponent(1, 'doesNotExist');
		});

		test('direct component methods work in system process functions', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ velocity: { x: 5, y: 10 } });

			world.addSystem('test-system')
				.addQuery('entities', { with: ['velocity'] })
				.setProcess((_queries, _dt, ecs) => {
					if (!ecs.getComponent(entity.id, 'position')) {
						ecs.addComponent(entity.id, 'position', { x: 0, y: 0 });
					}
				});

			world.update(1 / 60);
			expect(world.getComponent(entity.id, 'position')).toEqual({ x: 0, y: 0 });
		});
	});

	describe('mutateComponent', () => {
		test('mutates a component in place and returns the component', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ position: { x: 10, y: 20 } });

			const result = world.mutateComponent(entity.id, 'position', (pos) => {
				pos.x = 99;
				pos.y = 42;
			});

			expect(result).toEqual({ x: 99, y: 42 });
			expect(world.getComponent(entity.id, 'position')).toEqual({ x: 99, y: 42 });
		});

		test('automatically marks the component as changed', () => {
			const world = ECSpresso.create<TestComponents>().build();
			const entity = world.spawn({ position: { x: 0, y: 0 } });

			// Run a frame to advance change detection past initial spawn
			world.update(1 / 60);

			// At this point, position should not appear as changed
			expect(world.getEntitiesWithQuery(['position'], [], ['position']).length).toBe(0);

			// Mutate the component
			world.mutateComponent(entity.id, 'position', (pos) => {
				pos.x = 5;
			});

			// Now position should appear as changed
			expect(world.getEntitiesWithQuery(['position'], [], ['position']).length).toBe(1);
		});

		test('throws for a non-existent entity', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();

			expect(() => world.mutateComponent(999, 'position', () => {})).toThrow();
		});

		test('throws when the component does not exist on the entity', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ position: { x: 0, y: 0 } });

			expect(() => world.mutateComponent(entity.id, 'velocity', () => {})).toThrow();
		});

		test('rejects invalid component names at compile time', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			world.spawn({ position: { x: 0, y: 0 } });

			try {
				// @ts-expect-error - 'doesNotExist' is not a valid component name
				world.mutateComponent(1, 'doesNotExist', () => {});
			} catch {
				// expected to throw at runtime since component doesn't exist
			}
		});

		test('mutator receives correctly typed component value', () => {
			type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ position: { x: 0, y: 0 } });

			world.mutateComponent(entity.id, 'position', (pos) => {
				// pos should be typed as { x: number; y: number }
				const _typeCheck: IsExact<typeof pos, { x: number; y: number }> = true;
				expect(_typeCheck).toBe(true);
				pos.x = 1;
			});
		});

		test('return type matches the component type', () => {
			type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ health: { value: 100 } });

			const result = world.mutateComponent(entity.id, 'health', (h) => {
				h.value = 50;
			});

			const _typeCheck: IsExact<typeof result, { value: number }> = true;
			expect(_typeCheck).toBe(true);
			expect(result).toEqual({ value: 50 });
		});

		test('works in system process functions', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({
				position: { x: 0, y: 0 },
				velocity: { x: 5, y: 10 },
			});

			world.addSystem('movement')
				.addQuery('entities', { with: ['position', 'velocity'] })
				.setProcess((queries, _dt, ecs) => {
					for (const e of queries.entities) {
						ecs.mutateComponent(e.id, 'position', (pos) => {
							pos.x += e.components.velocity.x;
							pos.y += e.components.velocity.y;
						});
					}
				});

			world.update(1 / 60);

			expect(world.getComponent(entity.id, 'position')).toEqual({ x: 5, y: 10 });
		});

		test('accepts entity object in addition to entity ID', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.spawn({ health: { value: 100 } });

			world.mutateComponent(entity, 'health', (h) => {
				h.value -= 25;
			});

			expect(world.getComponent(entity.id, 'health')).toEqual({ value: 75 });
		});
	});

	describe('Resource Disposal via ECSpresso', () => {
		test('disposeResource() should dispose a single resource', async () => {
			let disposed = false;
			const world = ECSpresso
				.create<{}, {}, { db: { value: number } }>()
				.withResource('db', {
					factory: () => ({ value: 42 }),
					onDispose: () => { disposed = true; }
				})
				.build();

			await world.initializeResources();
			expect(world.hasResource('db')).toBe(true);

			const result = await world.disposeResource('db');

			expect(result).toBe(true);
			expect(disposed).toBe(true);
			expect(world.hasResource('db')).toBe(false);
		});

		test('disposeResources() should dispose all resources in reverse dependency order', async () => {
			const order: string[] = [];
			const world = ECSpresso
				.create<{}, {}, { a: number; b: number; c: number }>()
				.withResource('a', {
					factory: () => 1,
					onDispose: () => { order.push('a'); }
				})
				.withResource('b', {
					dependsOn: ['a'],
					factory: () => 2,
					onDispose: () => { order.push('b'); }
				})
				.withResource('c', {
					dependsOn: ['b'],
					factory: () => 3,
					onDispose: () => { order.push('c'); }
				})
				.build();

			await world.initializeResources();
			await world.disposeResources();

			expect(order).toEqual(['c', 'b', 'a']);
		});

		test('disposeResource() should pass ECSpresso as context to onDispose', async () => {
			let receivedContext: any;
			const world = ECSpresso
				.create<{}, {}, { db: number }>()
				.withResource('db', {
					factory: () => 42,
					onDispose: (_resource, context) => {
						receivedContext = context;
					}
				})
				.build();

			await world.initializeResources();
			await world.disposeResource('db');

			expect(receivedContext).toBe(world);
		});

		test('dispose should work with resources added via addResource()', async () => {
			let disposed = false;
			const world = new ECSpresso<{}, {}, { counter: number }>();

			world.addResource('counter', {
				factory: () => 42,
				onDispose: () => { disposed = true; }
			});

			await world.initializeResources();
			await world.disposeResource('counter');

			expect(disposed).toBe(true);
		});
	});
});
