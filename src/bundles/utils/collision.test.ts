import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import {
	createCollisionBundle,
	createCollisionPairHandler,
	createAABBCollider,
	createCircleCollider,
	createCollisionLayer,
	defineCollisionLayers,
	type CollisionComponentTypes,
	type CollisionEventTypes,
	type CollisionEvent,
	type LayersOf,
} from './collision';
import { createTransformBundle, createTransform, type TransformComponentTypes } from './transform';

const playerEnemyLayers = defineCollisionLayers({ player: ['enemy'], enemy: ['player'] });
type PlayerEnemyLayer = LayersOf<typeof playerEnemyLayers>;

interface TestComponents extends TransformComponentTypes, CollisionComponentTypes<PlayerEnemyLayer> {
	tag: string;
}

interface TestEvents extends CollisionEventTypes<PlayerEnemyLayer> {}

interface TestResources {}

describe('Collision Bundle', () => {
	describe('AABB-AABB collision', () => {
		test('should detect collision when overlapping', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			const entityA = ecs.spawn({
				...createTransform(100, 100),
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			const entityB = ecs.spawn({
				...createTransform(120, 120),
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
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform(100, 100),
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform(200, 200),
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
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform(100, 100),
				...createCircleCollider(30),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform(140, 100), // 40 units apart, both have radius 30 = overlap
				...createCircleCollider(30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});

		test('should not detect collision when not overlapping', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform(100, 100),
				...createCircleCollider(20),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform(150, 100), // 50 units apart, both have radius 20 = no overlap
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
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform(100, 100),
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform(140, 100),
				...createCircleCollider(20),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});

		test('should not detect collision when not overlapping', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform(100, 100),
				...createAABBCollider(30, 30),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform(200, 100),
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
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			// Player collides with enemies
			ecs.spawn({
				...createTransform(100, 100),
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			// Another player does not collide with players
			ecs.spawn({
				...createTransform(120, 120),
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});

		test('should work with bidirectional layer configuration', () => {
			const biLayers = defineCollisionLayers({ typeA: ['typeB'], typeB: [] });
			const ecs = ECSpresso
				.create()
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: biLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			// Only A specifies it collides with B
			ecs.spawn({
				...createTransform(100, 100),
				...createAABBCollider(50, 50),
				...biLayers.typeA(),
			});

			// B does not specify collision with A, but A→B should still work
			ecs.spawn({
				...createTransform(120, 120),
				...createAABBCollider(50, 50),
				...biLayers.typeB(),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});
	});

	describe('Collision event data', () => {
		test('should contain correct entity IDs and layers', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: CollisionEventTypes<PlayerEnemyLayer>['collision'][] = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			const player = ecs.spawn({
				...createTransform(100, 100),
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			const enemy = ecs.spawn({
				...createTransform(120, 120),
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
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			// Both entities collide with each other
			ecs.spawn({
				...createTransform(100, 100),
				...createAABBCollider(50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform(120, 120),
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
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			// Entity at 100,100 with offset 50,0 - effective position is 150,100
			ecs.spawn({
				...createTransform(100, 100),
				...createAABBCollider(30, 30, 50, 0),
				...createCollisionLayer('player', ['enemy']),
			});

			// Entity at 160,100 - should collide with offset entity
			ecs.spawn({
				...createTransform(160, 100),
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
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			// Central player
			ecs.spawn({
				...createTransform(100, 100),
				...createAABBCollider(80, 80),
				...createCollisionLayer('player', ['enemy']),
			});

			// Multiple enemies all overlapping player
			ecs.spawn({
				...createTransform(90, 90),
				...createAABBCollider(30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.spawn({
				...createTransform(110, 110),
				...createAABBCollider(30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.spawn({
				...createTransform(100, 120),
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
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform(100, 100),
				...createAABBCollider(50, 50),
				...layers.player(),
			});

			ecs.spawn({
				...createTransform(120, 120),
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
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform(100, 100),
				...createAABBCollider(50, 50),
				// No collision layer
			});

			ecs.spawn({
				...createTransform(120, 120),
				...createAABBCollider(50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});
	});

	describe('World transform usage', () => {
		test('should use world transform for collision detection with hierarchy', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createCollisionBundle({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision', (data) => {
				collisions.push(data);
			});

			// Parent at 100, 100
			const parent = ecs.spawn({
				...createTransform(100, 100),
			});

			// Child at local 50, 50 - world position is 150, 150
			ecs.spawnChild(parent.id, {
				...createTransform(50, 50),
				...createAABBCollider(30, 30),
				...createCollisionLayer('player', ['enemy']),
			});

			// Enemy at world position 160, 160 - should collide with child
			ecs.spawn({
				...createTransform(160, 160),
				...createAABBCollider(30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});
	});
});

describe('createCollisionPairHandler', () => {
	test('basic pair routing — correct callback invoked with correct entity order', () => {
		const calls: Array<{ first: number; second: number }> = [];

		const handler = createCollisionPairHandler({
			'player:enemy': (playerId, enemyId) => {
				calls.push({ first: playerId, second: enemyId });
			},
		});

		handler({ entityA: 1, entityB: 2, layerA: 'player', layerB: 'enemy', normal: { x: 1, y: 0 }, depth: 1 }, undefined);

		expect(calls).toEqual([{ first: 1, second: 2 }]);
	});

	test('symmetric matching — reversed layer order still matches, entities swapped', () => {
		const calls: Array<{ first: number; second: number }> = [];

		const handler = createCollisionPairHandler({
			'player:enemy': (playerId, enemyId) => {
				calls.push({ first: playerId, second: enemyId });
			},
		});

		// Event arrives with layers in reverse order
		handler({ entityA: 10, entityB: 20, layerA: 'enemy', layerB: 'player', normal: { x: 1, y: 0 }, depth: 1 }, undefined);

		// Entities should be swapped so player is first
		expect(calls).toEqual([{ first: 20, second: 10 }]);
	});

	test('multiple pair handlers — each pair routes to its own callback', () => {
		const playerEnemyCalls: Array<{ first: number; second: number }> = [];
		const bulletWallCalls: Array<{ first: number; second: number }> = [];

		const handler = createCollisionPairHandler({
			'player:enemy': (playerId, enemyId) => {
				playerEnemyCalls.push({ first: playerId, second: enemyId });
			},
			'bullet:wall': (bulletId, wallId) => {
				bulletWallCalls.push({ first: bulletId, second: wallId });
			},
		});

		handler({ entityA: 1, entityB: 2, layerA: 'player', layerB: 'enemy', normal: { x: 1, y: 0 }, depth: 1 }, undefined);
		handler({ entityA: 3, entityB: 4, layerA: 'bullet', layerB: 'wall', normal: { x: 1, y: 0 }, depth: 1 }, undefined);

		expect(playerEnemyCalls).toEqual([{ first: 1, second: 2 }]);
		expect(bulletWallCalls).toEqual([{ first: 3, second: 4 }]);
	});

	test('self-collision — "enemy:enemy" handler works', () => {
		const calls: Array<{ first: number; second: number }> = [];

		const handler = createCollisionPairHandler({
			'enemy:enemy': (enemyA, enemyB) => {
				calls.push({ first: enemyA, second: enemyB });
			},
		});

		handler({ entityA: 5, entityB: 6, layerA: 'enemy', layerB: 'enemy', normal: { x: 1, y: 0 }, depth: 1 }, undefined);

		expect(calls).toEqual([{ first: 5, second: 6 }]);
	});

	test('explicit bidirectional — "a:b" and "b:a" with different callbacks', () => {
		const abCalls: Array<{ first: number; second: number }> = [];
		const baCalls: Array<{ first: number; second: number }> = [];

		const handler = createCollisionPairHandler({
			'a:b': (aId, bId) => {
				abCalls.push({ first: aId, second: bId });
			},
			'b:a': (bId, aId) => {
				baCalls.push({ first: bId, second: aId });
			},
		});

		// Forward: layerA=a, layerB=b → should call a:b handler
		handler({ entityA: 1, entityB: 2, layerA: 'a', layerB: 'b', normal: { x: 1, y: 0 }, depth: 1 }, undefined);
		// Reverse: layerA=b, layerB=a → should call b:a handler
		handler({ entityA: 3, entityB: 4, layerA: 'b', layerB: 'a', normal: { x: -1, y: 0 }, depth: 1 }, undefined);

		expect(abCalls).toEqual([{ first: 1, second: 2 }]);
		expect(baCalls).toEqual([{ first: 3, second: 4 }]);
	});

	test('unmatched collision — no callback fires, no error', () => {
		const calls: Array<{ first: number; second: number }> = [];

		const handler = createCollisionPairHandler({
			'player:enemy': (playerId, enemyId) => {
				calls.push({ first: playerId, second: enemyId });
			},
		});

		// This pair has no handler
		handler({ entityA: 1, entityB: 2, layerA: 'bullet', layerB: 'wall', normal: { x: 1, y: 0 }, depth: 1 }, undefined);

		expect(calls).toEqual([]);
	});

	test('empty handlers — no errors on any collision', () => {
		const handler = createCollisionPairHandler({});

		// Should not throw
		handler({ entityA: 1, entityB: 2, layerA: 'a', layerB: 'b', normal: { x: 1, y: 0 }, depth: 1 }, undefined);
	});

	test('invalid key format — throws on construction (missing colon)', () => {
		expect(() => {
			createCollisionPairHandler({
				// @ts-expect-error — intentionally testing invalid key (no colon)
				'playerenemy': () => {},
			});
		}).toThrow();
	});

	test('empty layer name — throws on construction (":b")', () => {
		expect(() => {
			createCollisionPairHandler({
				':enemy': () => {},
			});
		}).toThrow();
	});

	test('empty layer name — throws on construction ("a:")', () => {
		expect(() => {
			createCollisionPairHandler({
				'player:': () => {},
			});
		}).toThrow();
	});

	test('integration — full ECS with collision detection and pair handler via eventBus', () => {
		const layers = defineCollisionLayers({
			playerProjectile: ['enemy'],
			enemy: ['playerProjectile'],
		});

		const ecs = ECSpresso
			.create()
			.withBundle(createTransformBundle())
			.withBundle(createCollisionBundle({ layers }))
			.build();

		type ECS = typeof ecs;

		const hits: Array<{ projectileId: number; enemyId: number }> = [];

		type Layer = LayersOf<typeof layers>;
		const handler = createCollisionPairHandler<ECS, Layer>({
			'playerProjectile:enemy': (projectileId, enemyId, ecsRef) => {
				// Verify we get the ecs reference
				expect(ecsRef).toBe(ecs);
				hits.push({ projectileId, enemyId });
			},
		});

		ecs.eventBus.subscribe('collision', (data) => handler(data, ecs));

		const projectile = ecs.spawn({
			...createTransform(100, 100),
			...createAABBCollider(10, 10),
			...layers.playerProjectile(),
		});

		const enemy = ecs.spawn({
			...createTransform(105, 105),
			...createAABBCollider(20, 20),
			...layers.enemy(),
		});

		ecs.update(0.016);

		expect(hits.length).toBe(1);
		const hit = hits[0];
		if (!hit) throw new Error('Expected hit');
		expect(hit.projectileId).toBe(projectile.id);
		expect(hit.enemyId).toBe(enemy.id);
	});
});

describe('Collision type narrowing', () => {
	test('createCollisionLayer narrows layer type', () => {
		const result = createCollisionLayer('player', ['enemy']);
		const layer: 'player' | 'enemy' = result.collisionLayer.layer;
		const collidesWith: readonly ('player' | 'enemy')[] = result.collisionLayer.collidesWith;
		expect(layer).toBe('player');
		expect(collidesWith).toEqual(['enemy']);
	});

	test('defineCollisionLayers factories return typed layers', () => {
		const layers = defineCollisionLayers({ player: ['enemy'], enemy: ['player'] });
		const result = layers.player();
		// layer should be 'player' | 'enemy', not string
		const layer: 'player' | 'enemy' = result.collisionLayer.layer;
		expect(layer).toBe('player');
	});

	test('defineCollisionLayers rejects invalid collidesWith', () => {
		defineCollisionLayers({
			player: ['enemy'],
			// @ts-expect-error — 'enmey' is not a valid layer name
			enemy: ['enmey'],
		});
	});

	test('createCollisionPairHandler returns typed event handler', () => {
		const layers = defineCollisionLayers({ player: ['enemy'], enemy: ['player'] });
		type Layer = LayersOf<typeof layers>;

		const handler = createCollisionPairHandler<unknown, Layer>({
			'player:enemy': () => {},
		});

		// handler accepts CollisionEvent<Layer>
		const event: CollisionEvent<Layer> = { entityA: 1, entityB: 2, layerA: 'player', layerB: 'enemy', normal: { x: 1, y: 0 }, depth: 1 };
		handler(event, undefined);
	});

	test('createCollisionBundle with layers produces typed bundle', () => {
		const layers = defineCollisionLayers({ player: ['enemy'], enemy: ['player'] });

		const ecs = ECSpresso
			.create()
			.withBundle(createTransformBundle())
			.withBundle(createCollisionBundle({ layers }))
			.build();

		const entity = ecs.spawn({
			...createTransform(0, 0),
			...createAABBCollider(10, 10),
			...layers.player(),
		});

		const collisionLayer = ecs.entityManager.getComponent(entity.id, 'collisionLayer');
		if (!collisionLayer) throw new Error('Expected collisionLayer');

		// collisionLayer.layer should be 'player' | 'enemy'
		const layer: 'player' | 'enemy' = collisionLayer.layer;
		expect(layer).toBe('player');
	});
});
