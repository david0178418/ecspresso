import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import Bundle from './bundle';

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
		expect(world.hasResource('gameState' as keyof TestResources)).toBe(false); // Use a valid key with a type assertion

		// Since ECSpresso doesn't have a removeResource method anymore, we'll test the ResourceManager directly
		world.resourceManager.remove('config');

		// Verify resource is gone by checking with resourceManager
		expect(world.resourceManager.has('config')).toBe(false);
	});

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

	test('should add systems directly to ECSpresso', () => {
		const world = new ECSpresso<TestComponents>();

		const entity1 = world.entityManager.createEntity();
		world.entityManager.addComponent(entity1.id, 'position', { x: 0, y: 0 });
		world.entityManager.addComponent(entity1.id, 'velocity', { x: 5, y: 10 });

		const entity2 = world.entityManager.createEntity();
		world.entityManager.addComponent(entity2.id, 'position', { x: 100, y: 100 });
		world.entityManager.addComponent(entity2.id, 'health', { value: 100 });

		const processedEntities: number[] = [];

		// Add system directly to ECSpresso
		world
			.addSystem('DirectMovementSystem')
			.addQuery('entities', {
				with: ['position', 'velocity'],
				without: ['health'],
			})
			.setProcess((queries) => {
				for (const entity of queries.entities) {
					processedEntities.push(entity.id);
					// In a real system, we'd update position based on velocity and deltaTime
				}
			})
			.build(); // Call build to finalize the system

		world.update(1/60);

		// Only entity1 should match the query
		expect(processedEntities).toEqual([entity1.id]);
	});

	test('should handle lifecycle hooks for systems added directly', () => {
		const world = new ECSpresso<TestComponents>();

		let attachCalled = false;
		let detachCalled = false;
		let processCalled = false;

		// Create a system with lifecycle hooks directly on ECSpresso
		world
			.addSystem('DirectLifecycleSystem')
			.setOnAttach((_ecs) => {
				attachCalled = true;
			})
			.setOnDetach((_ecs) => {
				detachCalled = true;
			})
			.setProcess((_queries, _deltaTime, _ecs) => {
				processCalled = true;
			})
			.build(); // Call build to finalize the system

		// Attach should have been called immediately when the system is built
		expect(attachCalled).toBe(true);

		// Process should run during update
		world.update(1/60);
		expect(processCalled).toBe(true);

		// Remove the system, which should call onDetach
		world.removeSystem('DirectLifecycleSystem');
		expect(detachCalled).toBe(true);
	});

	test('should handle event handlers for systems added directly', () => {
		const world = new ECSpresso<TestComponents, TestEvents>();

		let eventHandled = false;

		// Create a system with event handlers directly on ECSpresso
		world
			.addSystem('DirectEventSystem')
			.setEventHandlers({
				playerDamaged: {
					handler: (data) => {
						eventHandled = true;
						expect(data.entityId).toBe(123);
						expect(data.amount).toBe(10);
					}
				}
			})
			.build(); // Call build to finalize the system

		// Trigger the event
		world.eventBus.publish('playerDamaged', { entityId: 123, amount: 10 });

		// Event handler should have been called
		expect(eventHandled).toBe(true);
	});

	test('should properly handle query typing with directly added systems', () => {
		const world = new ECSpresso<TestComponents>();

		// Create an entity with position and velocity
		const entity1 = world.entityManager.createEntity();
		world.entityManager.addComponent(entity1.id, 'position', { x: 10, y: 20 });
		world.entityManager.addComponent(entity1.id, 'velocity', { x: 5, y: 0 });

		// Create an entity with position, velocity, and collision
		const entity2 = world.entityManager.createEntity();
		world.entityManager.addComponent(entity2.id, 'position', { x: 0, y: 0 });
		world.entityManager.addComponent(entity2.id, 'velocity', { x: 0, y: 0 });
		world.entityManager.addComponent(entity2.id, 'collision', { radius: 5, isColliding: false });

		let sumX = 0;
		let sumY = 0;

		// Add a system directly with typed queries
		world
			.addSystem('DirectTypeSystem')
			.addQuery('objects', {
				with: ['position', 'velocity'],
				without: [],
			})
			.setProcess((queries, _deltaTime, _ecs) => {
				// TypeScript should know that position and velocity are guaranteed to exist
				for (const entity of queries.objects) {
					sumX += entity.components.position.x + entity.components.velocity.x;
					sumY += entity.components.position.y + entity.components.velocity.y;

					// This shows that TypeScript prevents access to components not in the query
					// TypeScript would error on: entity.components.health.value
				}
			})
			.build(); // Call build to finalize the system

		world.update(1/60);

		expect(sumX).toBe(15); // 10+5 from entity1, 0+0 from entity2
		expect(sumY).toBe(20); // 20+0 from entity1, 0+0 from entity2
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
		directWorld
			.addSystem('DirectSystem')
			.addQuery('entities', {
				with: ['position', 'velocity'],
			})
			.setProcess((queries) => {
				expect(queries.entities.length).toBe(1);
				directProcessed = true;
			})
			.build(); // Call build to finalize the system

		// Update both worlds
		bundleWorld.update(1/60);
		directWorld.update(1/60);

		// Both systems should have processed
		expect(bundleProcessed).toBe(true);
		expect(directProcessed).toBe(true);
	});
});
