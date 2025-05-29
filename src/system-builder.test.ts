import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import Bundle from './bundle';

// Define component types for testing
interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	health: { value: number };
	marker: { id: string };
}

describe('SystemBuilder', () => {
	test('should create a system that can query entities', () => {
		// Track processed entities
		const processedIds: number[] = [];

		// Define a system in a bundle
		const bundle = new Bundle<TestComponents>()
			.addSystem('TestSystem')
			.addQuery('movingEntities', {
				with: ['position', 'velocity'],
				without: ['health']
			})
			.setProcess((queries) => {
				// Process each entity that matches the query
				for (const entity of queries.movingEntities) {
					processedIds.push(entity.id);
				}
			})
			.bundle;

		// Create world with the bundle
		const world = ECSpresso.create<TestComponents>()
			.withBundle(bundle)
			.build();

		// Create entities to test with
		const entity1 = world.spawn({
			position: { x: 0, y: 0 },
			velocity: { x: 5, y: 10 }
		});

		const entity2 = world.spawn({
			position: { x: 10, y: 20 },
			velocity: { x: -5, y: 0 },
			health: { value: 100 }
		});

		// Update the world to run the systems
		world.update(1/60);

		// entity1 should be processed, entity2 should not (because it has health)
		expect(processedIds).toContain(entity1.id);
		expect(processedIds).not.toContain(entity2.id);
	});

	test('should handle multiple query definitions', () => {
		// Track which entities are processed by each query
		const queriesProcessed = {
			withMarker: [] as number[],
			withHealth: [] as number[],
		};

		// Define a system with multiple queries
		const bundle = new Bundle<TestComponents>()
			.addSystem('MultiQuerySystem')
			.addQuery('withMarker', {
				with: ['marker']
			})
			.addQuery('withHealth', {
				with: ['health']
			})
			.setProcess((queries) => {
				// Record entities from each query
				for (const entity of queries.withMarker) {
					queriesProcessed.withMarker.push(entity.id);
				}
				for (const entity of queries.withHealth) {
					queriesProcessed.withHealth.push(entity.id);
				}
			})
			.bundle;

		// Create world with the bundle
		const world = ECSpresso.create<TestComponents>()
			.withBundle(bundle)
			.build();

		// Create entities with different component combinations
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

		// Update the world to run the systems
		world.update(1/60);

		// Check that entities were processed by the correct queries
		expect(queriesProcessed['withMarker']).toContain(entity1.id);
		expect(queriesProcessed['withMarker']).toContain(entity3.id);
		expect(queriesProcessed['withMarker']).not.toContain(entity2.id);

		expect(queriesProcessed['withHealth']).toContain(entity2.id);
		expect(queriesProcessed['withHealth']).toContain(entity3.id);
		expect(queriesProcessed['withHealth']).not.toContain(entity1.id);
	});

	test('should support lifecycle hooks', async () => {
		// Track lifecycle hooks
		let onInitializeCalled = false;
		let onDetachCalled = false;
		let processCalledCount = 0;

		// Define a system with lifecycle hooks
		const bundle = new Bundle<TestComponents>()
			.addSystem('LifecycleSystem')
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
			})
			.bundle;

		// Create world with the bundle
		const world = ECSpresso.create<TestComponents>()
			.withBundle(bundle)
			.build();

		await world.initialize();

		// onAttach should have been called when the bundle was added
		expect(onInitializeCalled).toBe(true);
		expect(onDetachCalled).toBe(false);
		expect(processCalledCount).toBe(0);

		world.spawn({
			position: { x: 0, y: 0 }
		});

		// Update the world
		world.update(1/60);
		expect(processCalledCount).toBe(1);

		// Remove the system
		world.removeSystem('LifecycleSystem');
		expect(onDetachCalled).toBe(true);

		// Update again - process shouldn't be called
		world.update(1/60);
		expect(processCalledCount).toBe(1);
	});

	test('should support statically typed queries with correct component access', () => {
		// Define a bundle with a system that uses statically typed component access
		const bundle = new Bundle<TestComponents>()
			.addSystem('TypedSystem')
			.addQuery('entities', {
				with: ['position', 'health'] // Only entities with both components
			})
			.setProcess((queries) => {
				for (const entity of queries.entities) {
					// Type-safe component access
					const pos = entity.components.position;
					const health = entity.components.health;

					// Should be able to access x and y properties
					pos.x += 1;
					pos.y += 2;

					// Should be able to access health.value
					health.value -= 1;
				}
			})
			.bundle;

		// Create world with the bundle
		const world = ECSpresso.create<TestComponents>()
			.withBundle(bundle)
			.build();

		// Create an entity with the required components
		const entity = world.spawn({
			position: { x: 10, y: 20 },
			health: { value: 100 }
		});

		// Run the system
		world.update(1/60);

		// Verify components were updated correctly
		const updatedPos = world.entityManager.getComponent(entity.id, 'position');
		const updatedHealth = world.entityManager.getComponent(entity.id, 'health');

		expect(updatedPos).toEqual({ x: 11, y: 22 });
		expect(updatedHealth).toEqual({ value: 99 });
	});
});
