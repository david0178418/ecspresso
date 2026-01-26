import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import type { FilteredEntity } from './types';

interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	health: { value: number };
	hidden: boolean;
	sprite: { texture: string };
}

describe('Reactive Queries', () => {
	describe('onEnter callback', () => {
		test('should be called when entity spawned matching query', () => {
			const world = new ECSpresso<TestComponents>();
			const enteredEntities: number[] = [];

			world.addReactiveQuery('moving', {
				with: ['position', 'velocity'],
				onEnter: (entity) => {
					enteredEntities.push(entity.id);
				},
			});

			const entity = world.spawn({
				position: { x: 0, y: 0 },
				velocity: { x: 1, y: 1 }
			});

			expect(enteredEntities).toEqual([entity.id]);
		});

		test('should be called when component added makes entity match', () => {
			const world = new ECSpresso<TestComponents>();
			const enteredEntities: number[] = [];

			world.addReactiveQuery('moving', {
				with: ['position', 'velocity'],
				onEnter: (entity) => {
					enteredEntities.push(entity.id);
				},
			});

			const entity = world.spawn({ position: { x: 0, y: 0 } });
			expect(enteredEntities).toEqual([]); // Not matching yet

			world.entityManager.addComponent(entity.id, 'velocity', { x: 1, y: 1 });
			expect(enteredEntities).toEqual([entity.id]);
		});

		test('should not be called twice for same entity', () => {
			const world = new ECSpresso<TestComponents>();
			let callCount = 0;

			world.addReactiveQuery('positioned', {
				with: ['position'],
				onEnter: () => { callCount++; },
			});

			const entity = world.spawn({ position: { x: 0, y: 0 } });

			// Adding another component shouldn't trigger onEnter again
			world.entityManager.addComponent(entity.id, 'velocity', { x: 1, y: 1 });

			expect(callCount).toBe(1);
		});

		test('should receive typed entity with guaranteed components', () => {
			const world = new ECSpresso<TestComponents>();
			let receivedEntity: FilteredEntity<TestComponents, 'position' | 'velocity'> | undefined;

			world.addReactiveQuery('moving', {
				with: ['position', 'velocity'],
				onEnter: (entity) => {
					receivedEntity = entity;
				},
			});

			world.spawn({
				position: { x: 10, y: 20 },
				velocity: { x: 1, y: 2 }
			});

			expect(receivedEntity).toBeDefined();
			expect(receivedEntity?.components.position).toEqual({ x: 10, y: 20 });
			expect(receivedEntity?.components.velocity).toEqual({ x: 1, y: 2 });
		});
	});

	describe('onExit callback', () => {
		test('should be called when component removed makes entity stop matching', () => {
			const world = new ECSpresso<TestComponents>();
			const exitedEntityIds: number[] = [];

			world.addReactiveQuery('moving', {
				with: ['position', 'velocity'],
				onExit: (entityId) => {
					exitedEntityIds.push(entityId);
				},
			});

			const entity = world.spawn({
				position: { x: 0, y: 0 },
				velocity: { x: 1, y: 1 }
			});

			world.entityManager.removeComponent(entity.id, 'velocity');

			expect(exitedEntityIds).toEqual([entity.id]);
		});

		test('should be called when entity is removed', () => {
			const world = new ECSpresso<TestComponents>();
			const exitedEntityIds: number[] = [];

			world.addReactiveQuery('moving', {
				with: ['position', 'velocity'],
				onExit: (entityId) => {
					exitedEntityIds.push(entityId);
				},
			});

			const entity = world.spawn({
				position: { x: 0, y: 0 },
				velocity: { x: 1, y: 1 }
			});

			world.removeEntity(entity.id);

			expect(exitedEntityIds).toEqual([entity.id]);
		});

		test('should receive entityId (not entity object)', () => {
			const world = new ECSpresso<TestComponents>();
			let receivedId: number | undefined;

			world.addReactiveQuery('positioned', {
				with: ['position'],
				onExit: (entityId) => {
					receivedId = entityId;
				},
			});

			const entity = world.spawn({ position: { x: 0, y: 0 } });
			world.removeEntity(entity.id);

			expect(receivedId).toBe(entity.id);
		});
	});

	describe('without clause', () => {
		test('onEnter when excluded component removed', () => {
			const world = new ECSpresso<TestComponents>();
			const enteredEntities: number[] = [];

			world.addReactiveQuery('visible', {
				with: ['sprite'],
				without: ['hidden'],
				onEnter: (entity) => {
					enteredEntities.push(entity.id);
				},
			});

			// Spawn with hidden component - should NOT trigger onEnter
			const entity = world.spawn({
				sprite: { texture: 'player.png' },
				hidden: true
			});

			expect(enteredEntities).toEqual([]);

			// Remove hidden component - should trigger onEnter
			world.entityManager.removeComponent(entity.id, 'hidden');

			expect(enteredEntities).toEqual([entity.id]);
		});

		test('onExit when excluded component added', () => {
			const world = new ECSpresso<TestComponents>();
			const exitedEntityIds: number[] = [];

			world.addReactiveQuery('visible', {
				with: ['sprite'],
				without: ['hidden'],
				onExit: (entityId) => {
					exitedEntityIds.push(entityId);
				},
			});

			const entity = world.spawn({ sprite: { texture: 'player.png' } });

			// Add hidden component - should trigger onExit
			world.entityManager.addComponent(entity.id, 'hidden', true);

			expect(exitedEntityIds).toEqual([entity.id]);
		});
	});

	describe('removeReactiveQuery', () => {
		test('should stop callbacks after removal', () => {
			const world = new ECSpresso<TestComponents>();
			let callCount = 0;

			world.addReactiveQuery('positioned', {
				with: ['position'],
				onEnter: () => { callCount++; },
			});

			world.spawn({ position: { x: 0, y: 0 } });
			expect(callCount).toBe(1);

			world.removeReactiveQuery('positioned');

			world.spawn({ position: { x: 10, y: 10 } });
			expect(callCount).toBe(1); // Should not increase
		});

		test('should return true if query existed', () => {
			const world = new ECSpresso<TestComponents>();

			world.addReactiveQuery('test', {
				with: ['position'],
				onEnter: () => {},
			});

			const result = world.removeReactiveQuery('test');
			expect(result).toBe(true);
		});

		test('should return false if query did not exist', () => {
			const world = new ECSpresso<TestComponents>();

			const result = world.removeReactiveQuery('nonExistent');
			expect(result).toBe(false);
		});
	});

	describe('integration', () => {
		test('multiple reactive queries should work independently', () => {
			const world = new ECSpresso<TestComponents>();
			const entered1: number[] = [];
			const entered2: number[] = [];

			world.addReactiveQuery('query1', {
				with: ['position'],
				onEnter: (entity) => { entered1.push(entity.id); },
			});

			world.addReactiveQuery('query2', {
				with: ['velocity'],
				onEnter: (entity) => { entered2.push(entity.id); },
			});

			const entity1 = world.spawn({ position: { x: 0, y: 0 } });
			const entity2 = world.spawn({ velocity: { x: 1, y: 1 } });
			const entity3 = world.spawn({
				position: { x: 10, y: 10 },
				velocity: { x: 2, y: 2 }
			});

			expect(entered1).toEqual([entity1.id, entity3.id]);
			expect(entered2).toEqual([entity2.id, entity3.id]);
		});

		test('existing matching entities should trigger onEnter when query added', () => {
			const world = new ECSpresso<TestComponents>();

			// Spawn entities first
			const entity1 = world.spawn({ position: { x: 0, y: 0 } });
			const entity2 = world.spawn({ position: { x: 10, y: 10 } });
			world.spawn({ velocity: { x: 1, y: 1 } }); // No position

			const enteredEntities: number[] = [];

			// Add query after entities exist
			world.addReactiveQuery('positioned', {
				with: ['position'],
				onEnter: (entity) => {
					enteredEntities.push(entity.id);
				},
			});

			expect(enteredEntities.sort()).toEqual([entity1.id, entity2.id].sort());
		});

		test('component replaced should NOT trigger enter/exit', () => {
			const world = new ECSpresso<TestComponents>();
			let enterCount = 0;
			let exitCount = 0;

			world.addReactiveQuery('positioned', {
				with: ['position'],
				onEnter: () => { enterCount++; },
				onExit: () => { exitCount++; },
			});

			const entity = world.spawn({ position: { x: 0, y: 0 } });
			expect(enterCount).toBe(1);
			expect(exitCount).toBe(0);

			// Replace component with new value (addComponent overwrites)
			world.entityManager.addComponent(entity.id, 'position', { x: 100, y: 100 });

			// Should NOT have triggered additional callbacks
			expect(enterCount).toBe(1);
			expect(exitCount).toBe(0);
		});
	});
});
