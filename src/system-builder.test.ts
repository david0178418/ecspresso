import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import Bundle from './bundle';

// Define some test component types for the ECS
interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	health: { value: number };
	collision: { radius: number; isColliding: boolean };
	damage: { value: number };
	lifetime: { remaining: number };
	state: { current: string; previous: string };
}

describe('SystemBuilder', () => {
	test('should create a system that can query entities', () => {
		const world = new ECSpresso<TestComponents>();

		// Create an entity with all necessary components
		const entity1 = world.entityManager.createEntity();
		world.entityManager.addComponent(entity1.id, 'position', { x: 0, y: 0 });
		world.entityManager.addComponent(entity1.id, 'velocity', { x: 0, y: 0 });

		// Create an entity with only one necessary component
		const entity2 = world.entityManager.createEntity();
		world.entityManager.addComponent(entity2.id, 'position', { x: 10, y: 10 });

		const processedEntities: number[] = [];

		// Create a bundle with the system
		const bundle = new Bundle<TestComponents>()
			.addSystem('movement')
			.addQuery('entities', {
				with: ['position', 'velocity'],
				without: [],
			})
			.setProcess((queries) => {
				for (const entity of queries.entities) {
					processedEntities.push(entity.id);
				}
			})
			.bundle;

		// Install the bundle
		world.install(bundle);
		world.update(1/60);

		expect(processedEntities).toEqual([entity1.id]);
	});

	test('should handle multiple query definitions', () => {
		const world = new ECSpresso<TestComponents>();

		// Create an entity with position and velocity
		const entity1 = world.entityManager.createEntity();
		world.entityManager.addComponent(entity1.id, 'position', { x: 0, y: 0 });
		world.entityManager.addComponent(entity1.id, 'velocity', { x: 0, y: 0 });

		// Create an entity with position and collision
		const entity2 = world.entityManager.createEntity();
		world.entityManager.addComponent(entity2.id, 'position', { x: 10, y: 10 });
		world.entityManager.addComponent(entity2.id, 'collision', { radius: 5, isColliding: false });

		// Create an entity with position, velocity, and collision
		const entity3 = world.entityManager.createEntity();
		world.entityManager.addComponent(entity3.id, 'position', { x: 20, y: 20 });
		world.entityManager.addComponent(entity3.id, 'velocity', { x: 0, y: 0 });
		world.entityManager.addComponent(entity3.id, 'collision', { radius: 5, isColliding: false });

		const processedMovingEntities: number[] = [];
		const processedCollidingEntities: number[] = [];

		// Create a bundle with the system
		const bundle = new Bundle<TestComponents>()
			.addSystem('multiQuery')
			.addQuery('movingEntities', {
				with: ['position', 'velocity'],
			})
			.addQuery('collidingEntities', {
				with: ['position', 'collision'],
			})
			.setProcess((queries) => {
				for (const entity of queries.movingEntities) {
					processedMovingEntities.push(entity.id);
				}

				for (const entity of queries.collidingEntities) {
					processedCollidingEntities.push(entity.id);
				}
			})
			.bundle;

		// Install the bundle
		world.install(bundle);
		world.update(1/60);

		expect(processedMovingEntities).toEqual([entity1.id, entity3.id]);
		expect(processedCollidingEntities).toEqual([entity2.id, entity3.id]);
	});

	test('should support lifecycle hooks', () => {
		const world = new ECSpresso<TestComponents>();

		let onAttachCalled = false;
		let onDetachCalled = false;

		// Create a bundle with the system that has lifecycle hooks
		const bundle = new Bundle<TestComponents>()
			.addSystem('lifecycle')
			.setOnAttach(() => {
				onAttachCalled = true;
			})
			.setOnDetach(() => {
				onDetachCalled = true;
			})
			.bundle;

		// Installing the bundle should call onAttach
		world.install(bundle);
		expect(onAttachCalled).toBe(true);

		// Removing the system should call onDetach
		world.removeSystem('lifecycle');
		expect(onDetachCalled).toBe(true);
	});

	test('should support statically typed queries with correct component access', () => {
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

		// Create a bundle with the system
		const bundle = new Bundle<TestComponents>()
			.addSystem('staticObjects')
			.addQuery('objects', {
				with: ['position', 'velocity'],
				without: [],
			})
			.setProcess((queries) => {
				// TypeScript should know that position and velocity are guaranteed to exist
				for (const entity of queries.objects) {
					sumX += entity.components.position.x + entity.components.velocity.x;
					sumY += entity.components.position.y + entity.components.velocity.y;

					// Directly accessing a component that's not in the 'with' array would cause a type error
					// This line would fail to compile: entity.components.health.value
				}
			})
			.bundle;

		// Install the bundle
		world.install(bundle);
		world.update(1/60);

		expect(sumX).toBe(15); // 10+5 from entity1, 0+0 from entity2
		expect(sumY).toBe(20); // 20+0 from entity1, 0+0 from entity2
	});
});
