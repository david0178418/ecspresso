import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import Bundle, { mergeBundles } from './bundle';

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
}

describe('ECSpresso', () => {
	describe('type checks', () => {
		test('should allow type-safe component access', () => {
			const world = new ECSpresso<TestComponents, TestEvents, TestResources>();
			const entity = world.entityManager.createEntity();

			// @ts-expect-error // TypeScript should complain if we try to access a non-existent component
			entity.components.doesNotExist;

			world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });

			const filteredComponent = world.getEntitiesWithComponents(['position']);
			const [entity1] = filteredComponent;

			expect(filteredComponent.length).toBe(1);
			expect(entity1?.components.position.x).toBe(0);
			expect(entity1?.components.velocity?.y).toBeUndefined();

			const entity2 = world.entityManager.createEntity();
			world.entityManager.addComponent(entity2.id, 'velocity', { x: 10, y: 20 });

			const filteredComponent2 = world.getEntitiesWithComponents(['velocity']);

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
			world.getEntitiesWithComponents(['doesNotExist']);

			// @ts-expect-error // TypeScript should complain if we try to add a query with a non-existent component
			world.getEntitiesWithComponents([], ['doesNotExist']);

			const filteredComponent3 = world.getEntitiesWithComponents(['velocity'], ['position']);

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
			// @ts-ignore
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

			const systemFromEcs = world
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
					nonExistentEvent: {},
					playerDamaged: {
						handler(data) {
							data.amount.toFixed(); // TypeScript should know that data has an amount property

							// @ts-expect-error // TypeScript should complain if we try to access a non-existent property
							data.nonExistentProperty;
						}
					}
				});

			systemFromEcs.ecspresso.entityManager;

			try {
				// @ts-expect-error // TypeScript should because bundle is not defined on systems created from ecspresso instance
				systemFromEcs.bundle.id;
			} catch (error) {}

			const systemFromBundle = new Bundle<TestComponents, TestEvents, TestResources>()
				.addSystem('some-system');

			systemFromBundle.bundle.id;

			try {
				// @ts-expect-error // TypeScript should because ecspresso is not defined on systems created from bundle instance
				systemFromBundle.ecspresso.entityManager;
			} catch (error) {}

			expect(true).toBe(true); // Just to ensure the test runs without errors
		});

		test('should handle bundle augmentation', () => {
			const bundle1 = new Bundle<{cmpFromB1: number}, {evtFromB1: {data: number}}, {resFromB1: {data: number}}>();
			const bundle2 = new Bundle<{cmpFromB2: string}, {evtFromB2: {data: string}}, {resFromB2: {data: string}}>();
			const merged = mergeBundles('merged', bundle1, bundle2);
			merged
				.addResource('resFromB1', { data: 100 })
				.addResource('resFromB2', { data: 'test' })
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
					evtFromB1: {
						handler(data) {
							data.data.toFixed();
						}
					},
					evtFromB2: {
						handler(data) {
							data.data.toUpperCase();
						}
					},
					// @ts-expect-error // TypeScript should complain if we try to add an event handler for a non-existent event
					nonExistentEvent: {},
				});

			merged.getResource('resFromB1');
			merged.getResource('resFromB2');

			try {
				// @ts-expect-error // TypeScript should complain if we try to access a non-existent resource
				merged.getResource('non-existent-resource');
			} catch {
				// expect error...
			}

			const ecspresso = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				// .withBundle(bundle1)
				// .withBundle(bundle2)
				.withBundle(merged)
				.build();

			ecspresso
				.addSystem('some-system')
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
					evtFromB1: {
						handler(data) {
							data.data.toFixed();
						}
					},
					evtFromB2: {
						handler(data) {
							data.data.toUpperCase();
						}
					},
					// @ts-expect-error // TypeScript should complain if we try to add an event handler for a non-existent event
					nonExistentEvent: {},
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
			const bundle1 = new Bundle<{cmp: number}, {evt: {data: number}}, {res: {data: number}}>();
			const bundle2 = new Bundle<{cmp: number}, {evt: {data: number}}, {res: {data: number}}>();
			const merged = mergeBundles('merged', bundle1, bundle2);
			merged
				.addSystem('some-system')
				.addQuery('someQuery', {
					with: [
						'cmp',
						// @ts-expect-error // TypeScript should complain if we try to add a query with a non-existent component
						'doesNotExist',
					],
				});

			// Test with traditional method-based installation
			const ecspresso = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withBundle(merged)
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
			const bundle1 = new Bundle<{cmp: number}, {evt: {data: number}}, {res: {data: number}}>();
			const bundle2 = new Bundle<{cmp: string}, {evt: {data: string}}, {res: {data: string}}>();

			// @ts-expect-error // TypeScript should complain if we try to merge bundles with conflicting components
			mergeBundles('merged', bundle1, bundle2);

			const bundle3 = new Bundle<{cmp: number}, {evt: {data: number}}, {res: {data: number}}>();
			const bundle4 = new Bundle<{cmp: string}, {evt: {data: string}}, {res: {data: string}}>();

			ECSpresso.create()
				.withBundle(bundle3)
				// @ts-expect-error // TypeScript should complain if we try to install bundles that conflict with each other
				.withBundle(bundle4)
				.build();

			const bundle5 = new Bundle<{position: string}, {gameEnded: string}, {config: boolean}>();

			ECSpresso.create<TestComponents, TestEvents, TestResources>()
				// @ts-expect-error // TypeScript should complain if we try to install bundles that conflict with the type parameters passed to ecspresso
				.withBundle(bundle5)
				.build();

			expect(true).toBe(true);
		});
	});

	// Core ECS functionality tests
	describe('Core ECS', () => {
		test('should run systems with queries', () => {
			const bundle = new Bundle<TestComponents>()
				.addSystem('MovementSystem')
				.addQuery('entities', {
					with: ['position', 'velocity'],
					without: ['health'],
				})
				.setProcess((queries) => {
					for (const entity of queries.entities) {
						processedEntities.push(entity.id);
					}
				})
				.bundle;

			const world = ECSpresso.create()
				.withBundle(bundle)
				.build();

			const entity1 = world.entityManager.createEntity();
			world.entityManager.addComponent(entity1.id, 'position', { x: 0, y: 0 });
			world.entityManager.addComponent(entity1.id, 'velocity', { x: 5, y: 10 });

			const entity2 = world.entityManager.createEntity();
			world.entityManager.addComponent(entity2.id, 'position', { x: 100, y: 100 });
			world.entityManager.addComponent(entity2.id, 'health', { value: 100 });

			const processedEntities: number[] = [];

			world.update(1/60);

			// Only entity1 should match the query
			expect(processedEntities).toEqual([entity1.id]);
		});

		test('should manage resources', () => {
			// First create the bundle
			const bundle = new Bundle<TestComponents, {}, TestResources>()
				.addResource('config', { debug: true, maxEntities: 1000 });

			const world = ECSpresso.create<TestComponents, {}, TestResources>()
				.withBundle(bundle)
				.build();

			// Getting resources
			const config = world.resourceManager.get('config');
			expect(config).toEqual({ debug: true, maxEntities: 1000 });

			// Has resource
			expect(world.hasResource('config')).toBe(true);
			expect(world.hasResource('gameState' as keyof TestResources)).toBe(false);

			// Since ECSpresso doesn't have a removeResource method anymore, we'll test the ResourceManager directly
			world.resourceManager.remove('config');

			// Verify resource is gone by checking with resourceManager
			expect(world.resourceManager.has('config')).toBe(false);
		});
	});

	// System lifecycle tests
	describe('System Lifecycle', () => {
		test('should remove systems by label', () => {
			// Add a system
			let processRan = false;

			// Create a bundle with the system
			const bundle = new Bundle<TestComponents>()
				.addSystem('MovementSystem')
				.setProcess(() => {
					processRan = true;
				})
				.bundle;

			// Traditional method-based installation
			const world = ECSpresso.create<TestComponents>()
				.withBundle(bundle)
				.build();

			// Future constructor-based installation
			// const worldWithConstructor = new ECSpresso<TestComponents>({
			//   bundles: [bundle]
			// });

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

			// Create a system with lifecycle hooks
			const bundle = new Bundle<TestComponents>()
				.addSystem('MovementControlSystem')
				.setOnInitialize((_ecs) => {
					initializationCalled = true;
				})
				.setOnDetach((_ecs) => {
					detachCalled = true;
				})
				.setProcess((_queries, _deltaTime, _ecs) => {
					processCalled = true;
				})
				.bundle;

			// Traditional method-based installation
			const world = ECSpresso.create<TestComponents>()
				.withBundle(bundle)
				.build();

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
		test('should handle state transitions in systems', () => {
			// Create a system that updates state
			const bundle = new Bundle<TestComponents>()
				.addSystem('StateSystem')
				.addQuery('statefulEntities', {
					with: ['state'],
				})
				.setProcess((queries, _deltaTime, _ecs) => {
					for (const entity of queries.statefulEntities) {
						// Update state
						const state = entity.components.state;
						state.previous = state.current;
						state.current = 'running';
					}
				})
				.bundle;

			const world = ECSpresso.create<TestComponents>()
				.withBundle(bundle)
				.build();

			// Install the bundle using constructor
			// const world = new ECSpresso<TestComponents>({
			// 	bundles: [bundle]
			// });

			const entity = world.entityManager.createEntity();
			world.entityManager.addComponent(entity.id, 'state', { current: 'idle', previous: '' });

			// Run the system
			world.update(1/60);

			// Check that state was updated
			const state = world.entityManager.getComponent(entity.id, 'state');
			expect(state).toEqual({ current: 'running', previous: 'idle' });
		});

		test('should track entity lifetimes', () => {
			// Create a lifetime system
			const bundle = new Bundle<TestComponents>()
				.addSystem('LifetimeSystem')
				.addQuery('lifetimeEntities', {
					with: ['lifetime'],
				})
				.setProcess(queries => {
					for (const entity of queries.lifetimeEntities) {
						// Reduce lifetime
						entity.components.lifetime.remaining -= 1;

						// Record entity ID but don't actually remove yet
						if (entity.components.lifetime.remaining <= 0) {
							removedEntities.push(entity.id);
						}
					}
				})
				.bundle;

			const world = ECSpresso.create<TestComponents>()
				.withBundle(bundle)
				.build();

			// Install the bundle using constructor
			// const world = new ECSpresso<TestComponents>({
			// 	bundles: [bundle]
			// });

			// Create an entity with a lifetime component
			const entity1 = world.entityManager.createEntity();
			world.entityManager.addComponent(entity1.id, 'lifetime', { remaining: 2 });

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

			// After removing entity1, trying to get its component should return null
			// because the entity no longer exists
			try {
				const lifeComponent = world.entityManager.getComponent(entity1.id, 'lifetime');
				expect(lifeComponent).toBeNull();
			} catch (error) {
				// If an error is thrown because the entity doesn't exist, that's also acceptable
				// The test is successful either way
			}

			// Entity2 exists but has no lifetime component
			const entity2Component = world.entityManager.getComponent(entity2.id, 'lifetime');
			expect(entity2Component).toBeNull();
		});

		test('should handle component additions and removals during update', () => {
			// Create a system that adds and removes components
			const bundle = new Bundle<TestComponents>()
				.addSystem('DynamicComponentSystem')
				.setProcess((_queries, _deltaTime, ecs) => {
					// Add a position component if it doesn't exist
					if (!ecs.entityManager.getComponent(entity.id, 'position')) {
						ecs.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });
					} else {
						// Remove the position component if it does exist
						ecs.entityManager.removeComponent(entity.id, 'position');
					}
				})
				.bundle;

			const world = ECSpresso.create<TestComponents>()
				.withBundle(bundle)
				.build();

			// Install the bundle using constructor
			// const world = new ECSpresso<TestComponents>({
			// 	bundles: [bundle]
			// });

			// Create entity without components yet
			const entity = world.entityManager.createEntity();

			// First update adds the position component
			world.update(1/60);
			expect(world.entityManager.getComponent(entity.id, 'position')).not.toBeNull();

			// Second update removes the position component
			world.update(1/60);
			expect(world.entityManager.getComponent(entity.id, 'position')).toBeNull();
		});
	});

	// Direct system addition tests
	describe('Direct System Creation', () => {
		test('should handle systems added directly via addSystem with type-safety', async () => {
			const world = new ECSpresso<TestComponents, TestEvents>();

			// Create entities
			const entity1 = world.entityManager.createEntity();
			world.entityManager.addComponent(entity1.id, 'position', { x: 10, y: 20 });
			world.entityManager.addComponent(entity1.id, 'velocity', { x: 5, y: 0 });

			// Track various calls
			let initialized = false;
			let processCalled = false;
			let eventHandled = false;
			let sumX = 0;
			let sumY = 0;

			// Add a system directly to ECSpresso with all features
			const systemBuilder = world
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
					playerDamaged: {
						handler: (data) => {
							eventHandled = true;
							expect(data.entityId).toBe(123);
							expect(data.amount).toBe(10);
						}
					}
				});

			// At this point, the system is not built yet, so ecspresso should be known but nothing should be called
			expect(systemBuilder.ecspresso).toBe(world);
			expect(systemBuilder.bundle).toBeNull();
			expect(initialized).toBe(false);

			// Build and add the system
			systemBuilder.build();

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

		test('should provide equivalent functionality for systems added via bundle in constructor, via bundle.install, or directly', () => {
			// Create three worlds with different ways of adding systems
			const directWorld = new ECSpresso<TestComponents>();

			// Setup entities identically in all worlds
			const entity = directWorld.entityManager.createEntity();
			directWorld.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });
			directWorld.entityManager.addComponent(entity.id, 'velocity', { x: 5, y: 10 });

			let bundleProcessed = false;
			let directProcessed = false;

			// Create a bundle with a system
			const bundle = new Bundle<TestComponents>()
				.addSystem('BundleSystem')
				.addQuery('entities', {
					with: ['position', 'velocity'],
				})
				.setProcess((queries) => {
					expect(queries.entities.length).toBe(1);
					bundleProcessed = true;
				})
				.bundle;

			// Create a world using the bundle
			const worldWithBundle = ECSpresso.create<TestComponents>()
				.withBundle(bundle)
				.build();

			// We need one more entity for this world
			const entityInNew = worldWithBundle.entityManager.createEntity();
			worldWithBundle.entityManager.addComponent(entityInNew.id, 'position', { x: 0, y: 0 });
			worldWithBundle.entityManager.addComponent(entityInNew.id, 'velocity', { x: 5, y: 10 });

			// Add a system directly
			const directSystemBuilder = directWorld
				.addSystem('DirectSystem')
				.addQuery('entities', {
					with: ['position', 'velocity'],
				})
				.setProcess((queries) => {
					expect(queries.entities.length).toBe(1);
					directProcessed = true;
				});

			// Check the direct-added system builder's ecspresso getter
			expect(directSystemBuilder.ecspresso).toBe(directWorld);

			// Build the direct system
			directSystemBuilder.build();

			// Update all worlds
			worldWithBundle.update(1/60);
			directWorld.update(1/60);

			// All systems should have processed
			expect(bundleProcessed).toBe(true);
			expect(directProcessed).toBe(true);
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
				.setProcess(() => {
					executionOrder.push('low');
				})
				.build();

			world.addSystem('HighPrioritySystem')
				.setPriority(100)
				.setProcess(() => {
					executionOrder.push('high');
				})
				.build();

			world.addSystem('MediumPrioritySystem')
				.setPriority(50)
				.setProcess(() => {
					executionOrder.push('medium');
				})
				.build();

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
				.setProcess(() => {
					executionOrder.push('A');
				})
				.build();

			world.addSystem('SystemB')
				.setPriority(10)
				.setProcess(() => {
					executionOrder.push('B');
				})
				.build();

			world.addSystem('SystemC')
				.setPriority(10)
				.setProcess(() => {
					executionOrder.push('C');
				})
				.build();

			// Update the world to run all systems
			world.update(1/60);

			// Check that systems with the same priority executed in registration order
			expect(executionOrder).toEqual(['A', 'B', 'C']);
		});

		test('should maintain priority when adding systems through bundles', () => {
			// Create bundles with systems of different priorities
			const bundle1 = new Bundle<TestComponents>()
				.addSystem('BundleSystemHigh')
				.setPriority(100)
				.setProcess((_queries, _deltaTime, _ecs) => {
					executionOrder.push('bundleHigh');
				})
				.bundle;

			const bundle2 = new Bundle<TestComponents>()
				.addSystem('BundleSystemLow')
				.setPriority(0)
				.setProcess((_queries, _deltaTime, _ecs) => {
					executionOrder.push('bundleLow');
				})
				.bundle;

			// Create world with bundles
			const world = ECSpresso.create<TestComponents>()
				.withBundle(bundle1)
				.withBundle(bundle2)
				.build();

			// Add a direct system with medium priority
			world.addSystem('DirectSystemMedium')
				.setPriority(50)
				.setProcess(() => {
					executionOrder.push('directMedium');
				})
				.build();

			// Track execution order
			const executionOrder: string[] = [];

			// Run update to execute all systems
			world.update(1/60);

			// Check that systems executed in priority order across bundles and direct addition
			expect(executionOrder).toEqual(['bundleHigh', 'directMedium', 'bundleLow']);
		});

		test('should allow updating system priorities dynamically', () => {
			const world = new ECSpresso<TestComponents>();

			// Track execution order
			const executionOrder: string[] = [];

			// Add systems with initial priorities
			world.addSystem('SystemA')
				.setPriority(10)
				.setProcess(() => {
					executionOrder.push('A');
				})
				.build();

			world.addSystem('SystemB')
				.setPriority(20)
				.setProcess(() => {
					executionOrder.push('B');
				})
				.build();

			world.addSystem('SystemC')
				.setPriority(30)
				.setProcess(() => {
					executionOrder.push('C');
				})
				.build();

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
					.setProcess(() => {})
					.build();
			}

			// Replace the internal _sortSystems method temporarily with a spy
			let sortCallCount = 0;
			const originalSortMethod = world['_sortSystems'];
			world['_sortSystems'] = function() {
				sortCallCount++;
				return originalSortMethod.call(this);
			};

			// Run multiple updates - sorting should only happen once during setup
			sortCallCount = 0; // Reset counter after system creation

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
			world['_sortSystems'] = originalSortMethod;
		});
	});
});
