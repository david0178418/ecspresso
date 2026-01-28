import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import {
	createCollisionBundle,
	createAABBCollider,
	createCircleCollider,
	createCollisionLayer,
	defineCollisionLayers,
	type CollisionComponentTypes,
	type CollisionEventTypes,
} from './collision';
import type { MovementComponentTypes } from './movement';

interface TestComponents extends MovementComponentTypes, CollisionComponentTypes {
	tag: string;
}

interface TestEvents extends CollisionEventTypes {}

interface TestResources {}

describe('Collision Bundle', () => {
	describe('AABB-AABB collision', () => {
		test('should detect collision when overlapping', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			const entityA = ecs.spawn({
				position: { x: 100, y: 100 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			const entityB = ecs.spawn({
				position: { x: 120, y: 120 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
			const col = collisions[0];
			if (!col) throw new Error('Expected collision');
			expect(col.entityA === entityA.id || col.entityB === entityA.id).toBe(true);
			expect(col.entityA === entityB.id || col.entityB === entityB.id).toBe(true);
		});

		test('should not detect collision when not overlapping', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				position: { x: 100, y: 100 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				position: { x: 200, y: 200 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});
	});

	describe('Circle-circle collision', () => {
		test('should detect collision when overlapping', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				position: { x: 100, y: 100 },
				...createCircleCollider(30),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				position: { x: 140, y: 100 }, // 40 units apart, both have radius 30 = overlap
				...createCircleCollider(30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});

		test('should not detect collision when not overlapping', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				position: { x: 100, y: 100 },
				...createCircleCollider(20),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				position: { x: 150, y: 100 }, // 50 units apart, both have radius 20 = no overlap
				...createCircleCollider(20),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});
	});

	describe('AABB-circle collision', () => {
		test('should detect collision when overlapping', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				position: { x: 100, y: 100 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				position: { x: 140, y: 100 },
				...createCircleCollider(20),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});

		test('should not detect collision when not overlapping', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				position: { x: 100, y: 100 },
				...createAABBCollider(30, 30),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				position: { x: 200, y: 100 },
				...createCircleCollider(20),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});
	});

	describe('Layer filtering', () => {
		test('should only collide when layers match', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			// Player collides with enemies
			ecs.spawn({
				position: { x: 100, y: 100 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			// Another player does not collide with players
			ecs.spawn({
				position: { x: 120, y: 120 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});

		test('should work with bidirectional layer configuration', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			// Only A specifies it collides with B
			ecs.spawn({
				position: { x: 100, y: 100 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('typeA', ['typeB']),
			});

			// B does not specify collision with A, but A→B should still work
			ecs.spawn({
				position: { x: 120, y: 120 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('typeB', []),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});
	});

	describe('Collision event data', () => {
		test('should contain correct entity IDs and layers', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: CollisionEventTypes['collision'][] = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			const player = ecs.spawn({
				position: { x: 100, y: 100 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			const enemy = ecs.spawn({
				position: { x: 120, y: 120 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
			const col = collisions[0];
			if (!col) throw new Error('Expected collision');

			// One should be player, one should be enemy
			const entities = [col.entityA, col.entityB].sort();
			const expectedEntities = [player.id, enemy.id].sort();
			expect(entities).toEqual(expectedEntities);

			// Layers should match
			const colLayers = [col.layerA, col.layerB].sort();
			expect(colLayers).toEqual(['enemy', 'player']);
		});
	});

	describe('Deduplication', () => {
		test('should only fire once per collision pair', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			// Both entities collide with each other
			ecs.spawn({
				position: { x: 100, y: 100 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				position: { x: 120, y: 120 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			// Should only have one collision event
			expect(collisions.length).toBe(1);
		});
	});

	describe('Collider offset', () => {
		test('should shift collision detection with offset', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			// Entity at 100,100 with offset 50,0 - effective position is 150,100
			ecs.spawn({
				position: { x: 100, y: 100 },
				...createAABBCollider(30, 30, 50, 0),
				...createCollisionLayer('player', ['enemy']),
			});

			// Entity at 160,100 - should collide with offset entity
			ecs.spawn({
				position: { x: 160, y: 100 },
				...createAABBCollider(30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});
	});

	describe('Multiple collisions', () => {
		test('should detect multiple collisions in single update', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			// Central player
			ecs.spawn({
				position: { x: 100, y: 100 },
				...createAABBCollider(80, 80),
				...createCollisionLayer('player', ['enemy']),
			});

			// Multiple enemies all overlapping player
			ecs.spawn({
				position: { x: 90, y: 90 },
				...createAABBCollider(30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.spawn({
				position: { x: 110, y: 110 },
				...createAABBCollider(30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.spawn({
				position: { x: 100, y: 120 },
				...createAABBCollider(30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(3);
		});
	});

	describe('Helper functions', () => {
		test('createAABBCollider should return correct shape', () => {
			const result = createAABBCollider(50, 30);
			expect(result).toEqual({
				aabbCollider: { width: 50, height: 30 },
			});
		});

		test('createAABBCollider should include offset when provided', () => {
			const result = createAABBCollider(50, 30, 10, 20);
			expect(result).toEqual({
				aabbCollider: { width: 50, height: 30, offsetX: 10, offsetY: 20 },
			});
		});

		test('createCircleCollider should return correct shape', () => {
			const result = createCircleCollider(25);
			expect(result).toEqual({
				circleCollider: { radius: 25 },
			});
		});

		test('createCircleCollider should include offset when provided', () => {
			const result = createCircleCollider(25, 5, 10);
			expect(result).toEqual({
				circleCollider: { radius: 25, offsetX: 5, offsetY: 10 },
			});
		});

		test('createCollisionLayer should return correct shape', () => {
			const result = createCollisionLayer('player', ['enemy', 'obstacle']);
			expect(result).toEqual({
				collisionLayer: { layer: 'player', collidesWith: ['enemy', 'obstacle'] },
			});
		});
	});

	describe('defineCollisionLayers', () => {
		test('should create layer factory functions', () => {
			const layers = defineCollisionLayers({
				player: ['enemy', 'enemyProjectile'],
				playerProjectile: ['enemy'],
				enemy: ['playerProjectile'],
				enemyProjectile: ['player'],
			});

			expect(typeof layers.player).toBe('function');
			expect(typeof layers.playerProjectile).toBe('function');
			expect(typeof layers.enemy).toBe('function');
			expect(typeof layers.enemyProjectile).toBe('function');
		});

		test('should return correct component when called', () => {
			const layers = defineCollisionLayers({
				player: ['enemy'],
				enemy: ['player'],
			});

			expect(layers.player()).toEqual({
				collisionLayer: { layer: 'player', collidesWith: ['enemy'] },
			});

			expect(layers.enemy()).toEqual({
				collisionLayer: { layer: 'enemy', collidesWith: ['player'] },
			});
		});

		test('should work with ecs.spawn', () => {
			const layers = defineCollisionLayers({
				player: ['enemy'],
				enemy: ['player'],
			});

			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				position: { x: 100, y: 100 },
				...createAABBCollider(50, 50),
				...layers.player(),
			});

			ecs.spawn({
				position: { x: 120, y: 120 },
				...createAABBCollider(50, 50),
				...layers.enemy(),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});
	});

	describe('Entities without colliders or layers', () => {
		test('should ignore entities without collision layer', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createCollisionBundle())
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				position: { x: 100, y: 100 },
				...createAABBCollider(50, 50),
				// No collision layer
			});

			ecs.spawn({
				position: { x: 120, y: 120 },
				...createAABBCollider(50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});
	});
});
