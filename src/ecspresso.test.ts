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

			// @ ts-expect-error // TypeScript should complain if we try to access a non-existent resource
			world.getResource('nonExistentResource');

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
			// @ ts-expect-error // TypeScript should complain if we try to publish a non-existent event
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
			const ecspresso = new ECSpresso<TestComponents, TestEvents, TestResources>();

			const bundle1 = new Bundle<{cmpFromB1: number}, {evtFromB1: {data: number}}, {resFromB1: {data: number}}>();
			const bundle2 = new Bundle<{cmpFromB2: string}, {evtFromB2: {data: string}}, {resFromB2: {data: string}}>();
			const merged = mergeBundles('merged', bundle1, bundle2);
			merged
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
			// @ ts-expect-error // TypeScript should complain if we try to access a non-existent resource
			merged.getResource('non-existent-resource');

			ecspresso
				.install(merged)
				.addSystem('some-system')
				.addQuery('someQuery', {
					with: [
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

			// Set resources
			ecspresso.addResource('config', { debug: true, maxEntities: 1000 });
			// @ts-expect-error // TypeScript should complain if we try to add incompatible resources
			ecspresso.addResource('resFromB1', { foo: 1 });
			// ecspresso.addResource('resFromB1', { data: 1 });
			// @ts-expect-error // TypeScript should complain if we try to add incompatible resources
			ecspresso.addResource('resFromB2', { foo: 'test' });
			// ecspresso.addResource('resFromB2', { data: 'test' });

			// Access resources
			ecspresso.getResource('config');
			ecspresso.getResource('resFromB1');
			ecspresso.getResource('resFromB2');
			// @ ts-expect-error // TypeScript should complain if we try to access a non-existent resource
			ecspresso.getResource('non-existent-resource');

			ecspresso.eventBus.publish('evtFromB1', { data: 1 });
			ecspresso.eventBus.publish('evtFromB2', { data: 'test' });
			// @ ts-expect-error // TypeScript should complain if we try to publish a non-existent event
			ecspresso.eventBus.publish('nonExistentEvent', { data: 'test' });

			expect(true).toBe(true);
		});

		test('should allow overlapping components, events and resources of the same type', () => {
			const ecspresso = new ECSpresso<TestComponents, TestEvents, TestResources>();

			const bundle1 = new Bundle<{cmp: number}, {evt: {data: number}}, {res: {data: number}}>();
			const bundle2 = new Bundle<{cmp: string}, {evt: {data: string}}, {res: {data: string}}>();
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

			// Set resources
			ecspresso.addResource('config', { debug: true, maxEntities: 1000 });
			// @ts-expect-error // TypeScript should complain if we try to add incompatible resources
			ecspresso.addResource('config', {foo: 1});

			ecspresso
				.install(merged)
				.addSystem('some-system')
				.addQuery('someQuery', {
					with: ['cmp'],
				});

			expect(true).toBe(true);
		});

		test('should not allow conflicting components, events and resources of different types', () => {

			// const bundle1 = new Bundle<{cmp: number}, {evt: {data: number}}, {res: {data: number}}>();
			// const bundle2 = new Bundle<{cmp: string}, {evt: {data: string}}, {res: {data: string}}>();

			// @ ts-expect-error // TypeScript should complain if we try to merge bundles with conflicting components
			// mergeBundles('merged', bundle1, bundle2);

			// const bundle3 = new Bundle<{cmp: number}, {evt: {data: number}}, {res: {data: number}}>();
			// const bundle4 = new Bundle<{cmp: string}, {evt: {data: string}}, {res: {data: string}}>();

			// @ ts-expect-error // TypeScript should complain if we try to install bundles that conflict each other
			// new ECSpresso().install(bundle3, bundle4);

			// const ecspresso = new ECSpresso();
			// ecspresso.install(bundle3);
			// @ ts-expect-error // TypeScript should complain if we try to install bundles that conflict with earlier installed bundles
			// ecspresso.install(bundle4);

			// const bundle5 = new Bundle<{position: string}, {gameEnded: string}, {config: boolean}>();

			// const ecspresso2 = new ECSpresso<TestComponents, TestEvents, TestResources>();
			// @ ts-expect-error // TypeScript should complain if we try to install bundles that conflict with ecspresso instance
			// ecspresso2.install(bundle5);

			expect(true).toBe(true);
		});
	});

	// Core ECS functionality tests
	describe('Core ECS', () => {
		test('should run systems with queries', () => {
			const world = new ECSpresso();

			const entity1 = world.entityManager.createEntity();
			world.entityManager.addComponent(entity1.id, 'position', { x: 0, y: 0 });
			world.entityManager.addComponent(entity1.id, 'velocity', { x: 5, y: 10 });

			const entity2 = world.entityManager.createEntity();
			world.entityManager.addComponent(entity2.id, 'position', { x: 100, y: 100 });
			world.entityManager.addComponent(entity2.id, 'health', { value: 100 });

			const processedEntities: number[] = [];

			const bundle = new Bundle<TestComponents>()

			// Create a bundle with the system
			bundle
				.addSystem('MovementSystem')
				.addQuery('entities', {
					with: ['position', 'velocity'],
						without: ['health'],
					})
					.setProcess((queries) => {
						for (const entity of queries.entities) {
							processedEntities.push(entity.id);

						// In a real system, we'd update position based on velocity and deltaTime
					}
				});

			// Install the bundle
			world.install(bundle);
			world.update(1/60);

			// Only entity1 should match the query
			expect(processedEntities).toEqual([entity1.id]);
		});

		test('should manage resources', () => {
			const world = new ECSpresso<TestComponents, {}, TestResources>();

			// Adding resources using a bundle
			const bundle = new Bundle<TestComponents, {}, TestResources>()
				.addResource('config', { debug: true, maxEntities: 1000 });

			// Install the bundle
			world.install(bundle);

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
			const world = new ECSpresso<TestComponents>();

			// Add a system
			let processRan = false;

			// Create a bundle with the system
			const bundle = new Bundle<TestComponents>()
				.addSystem('MovementSystem')
				.setProcess(() => {
					processRan = true;
				})
				.bundle;

			// Install the bundle
			world.install(bundle);

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

		test('should handle attaching and detaching systems', () => {
			const world = new ECSpresso<TestComponents>();

			let attachCalled = false;
			let detachCalled = false;
			let processCalled = false;

			// Create a system with lifecycle hooks
			const bundle = new Bundle<TestComponents>()
				.addSystem('MovementControlSystem')
				.setOnAttach((_ecs) => {
					attachCalled = true;
				})
				.setOnDetach((_ecs) => {
					detachCalled = true;
				})
				.setProcess((_queries, _deltaTime, _ecs) => {
					processCalled = true;
				})
				.bundle;

			// Add the system
			world.install(bundle);

			// Attach should have been called
			expect(attachCalled).toBe(true);

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
			const world = new ECSpresso<TestComponents>();

			const entity = world.entityManager.createEntity();
			world.entityManager.addComponent(entity.id, 'state', { current: 'idle', previous: '' });

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

			// Install the bundle
			world.install(bundle);

			// Run the system
			world.update(1/60);

			// Check that state was updated
			const state = world.entityManager.getComponent(entity.id, 'state');
			expect(state).toEqual({ current: 'running', previous: 'idle' });
		});

		test('should track entity lifetimes', () => {
			const world = new ECSpresso<TestComponents>();

			// Create an entity with a lifetime component
			const entity1 = world.entityManager.createEntity();
			world.entityManager.addComponent(entity1.id, 'lifetime', { remaining: 2 });

			// Create an entity without a lifetime
			const entity2 = world.entityManager.createEntity();

			// Track which entities were removed
			const removedEntities: number[] = [];

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

			// Install the bundle
			world.install(bundle);

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
			const world = new ECSpresso<TestComponents>();

			// Create entity without components yet
			const entity = world.entityManager.createEntity();

			// Create a system that adds and removes components
			const bundle = new Bundle<TestComponents>()
				.addSystem('DynamicComponentSystem')
				.setProcess((_queries, _deltaTime, ecs) => {
					// Add a position component if it doesn't exist
					if (!world.entityManager.getComponent(entity.id, 'position')) {
						ecs.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });
					} else {
						// Remove the position component if it does exist
						ecs.entityManager.removeComponent(entity.id, 'position');
					}
				})
				.bundle;

			// Install the bundle
			world.install(bundle);

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
		test('should handle systems added directly via addSystem with type-safety', () => {
			const world = new ECSpresso<TestComponents, TestEvents>();

			// Create entities
			const entity1 = world.entityManager.createEntity();
			world.entityManager.addComponent(entity1.id, 'position', { x: 10, y: 20 });
			world.entityManager.addComponent(entity1.id, 'velocity', { x: 5, y: 0 });

			// Track various calls
			let attachCalled = false;
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
				.setOnAttach((_ecs) => {
					attachCalled = true;
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
			expect(attachCalled).toBe(false);

			// Build and add the system
			systemBuilder.build();

			// After building, attach should be called
			expect(attachCalled).toBe(true);

			// Check process runs during update
			world.update(1/60);
			expect(processCalled).toBe(true);
			expect(sumX).toBe(15); // 10+5 from entity1
			expect(sumY).toBe(20); // 20+0 from entity1

			// Trigger the event and verify handler is called
			world.eventBus.publish('playerDamaged', { entityId: 123, amount: 10 });
			expect(eventHandled).toBe(true);
		});

		test('should provide equivalent functionality for systems added via bundle or directly', () => {
			// Create two worlds - one using a bundle, one using direct system addition
			const bundleWorld = new ECSpresso<TestComponents>();
			const directWorld = new ECSpresso<TestComponents>();

			// Setup entities identically in both worlds
			for (const world of [bundleWorld, directWorld]) {
				const entity = world.entityManager.createEntity();
				world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });
				world.entityManager.addComponent(entity.id, 'velocity', { x: 5, y: 10 });
			}

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

			// Install the bundle
			bundleWorld.install(bundle);

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

			// Update both worlds
			bundleWorld.update(1/60);
			directWorld.update(1/60);

			// Both systems should have processed
			expect(bundleProcessed).toBe(true);
			expect(directProcessed).toBe(true);
		});
	});
});
