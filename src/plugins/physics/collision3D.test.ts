import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import type { WorldConfigFrom } from '../../type-utils';
import {
	createCollision3DPlugin,
	createAABB3DCollider,
	createSphereCollider,
	createCollisionLayer,
	defineCollisionLayers,
	createCollisionPairHandler,
	type Collision3DComponentTypes,
	type Collision3DEventTypes,
	type Collision3DEvent,
	type CollisionLayer,
	type LayersOf,
} from './collision3D';
import {
	createTransform3DPlugin,
	createTransform3D,
	type Transform3DComponentTypes,
} from '../spatial/transform3D';
import { createSpatialIndex3DPlugin } from '../spatial/spatial-index3D';

const playerEnemyLayers = defineCollisionLayers({ player: ['enemy'], enemy: ['player'] });
type PlayerEnemyLayer = LayersOf<typeof playerEnemyLayers>;

interface TestComponents extends Transform3DComponentTypes, Collision3DComponentTypes<PlayerEnemyLayer> {
	tag: string;
}

interface TestEvents extends Collision3DEventTypes<PlayerEnemyLayer> {}

interface TestResources {}

describe('Collision3D Plugin', () => {
	describe('AABB3D-AABB3D collision', () => {
		test('detects collision when overlapping', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			const entityA = ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			const entityB = ecs.spawn({
				...createTransform3D(120, 120, 120),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
			const col = collisions[0];
			if (!col) throw new Error('Expected collision');
			expect(col.entityA === entityA.id || col.entityB === entityA.id).toBe(true);
			expect(col.entityA === entityB.id || col.entityB === entityB.id).toBe(true);
		});

		test('no event when not overlapping', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform3D(300, 300, 300),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});
	});

	describe('Sphere-sphere collision', () => {
		test('detects collision when overlapping', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			// 40 units apart, radii sum = 60 → overlap
			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createSphereCollider(30),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform3D(140, 100, 100),
				...createSphereCollider(30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});

		test('no event when not overlapping', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			// 100 units apart, radii sum = 40 → no overlap
			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createSphereCollider(20),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform3D(200, 100, 100),
				...createSphereCollider(20),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});
	});

	describe('AABB3D-sphere collision', () => {
		test('detects collision when overlapping', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			// AABB right edge at 125, sphere center at 140, radius 20 → closest point dist = 15 < 20
			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform3D(140, 100, 100),
				...createSphereCollider(20),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});

		test('no event when not overlapping', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			// AABB right edge at 115, sphere center at 200, radius 20 → dist = 85 > 20
			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(30, 30, 30),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform3D(200, 100, 100),
				...createSphereCollider(20),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});
	});

	describe('Layer filtering', () => {
		test('non-matching layers → no event', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform3D(120, 120, 120),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});

		test('unidirectional layer config still fires', () => {
			const biLayers = defineCollisionLayers({ typeA: ['typeB'], typeB: [] });
			const ecs = ECSpresso
				.create()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: biLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(50, 50, 50),
				...biLayers.typeA(),
			});

			ecs.spawn({
				...createTransform3D(120, 120, 120),
				...createAABB3DCollider(50, 50, 50),
				...biLayers.typeB(),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});
	});

	describe('Collision event data', () => {
		test('contains correct entity IDs, layers, and normalZ field', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Collision3DEventTypes<PlayerEnemyLayer>['collision3D'][] = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			const player = ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			const enemy = ecs.spawn({
				...createTransform3D(120, 120, 120),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
			const col = collisions[0];
			if (!col) throw new Error('Expected collision');

			const entities = [col.entityA, col.entityB].sort();
			const expectedEntities = [player.id, enemy.id].sort();
			expect(entities).toEqual(expectedEntities);

			const colLayers = [col.layerA, col.layerB].sort();
			expect(colLayers).toEqual(['enemy', 'player']);

			// normalZ must be a number (present as a field)
			expect(typeof col.normalZ).toBe('number');
		});

		test('normalZ is non-zero when separation is along Z axis', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Collision3DEvent<PlayerEnemyLayer>[] = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push({ ...data });
			});

			// Large X/Y extents, small Z extents so Z has minimum penetration → normal along Z
			ecs.spawn({
				...createTransform3D(0, 0, 0),
				...createAABB3DCollider(100, 100, 20),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform3D(0, 0, 12),
				...createAABB3DCollider(100, 100, 20),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
			const col = collisions[0];
			if (!col) throw new Error('Expected collision');
			expect(col.normalX).toBe(0);
			expect(col.normalY).toBe(0);
			expect(col.normalZ).not.toBe(0);
		});
	});

	describe('Deduplication', () => {
		test('fires once per pair per update', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform3D(120, 120, 120),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});
	});

	describe('Collider offset', () => {
		test('offsetX shifts collision bounds', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			// Entity at (100,100,100) with offsetX=50 → effective X center = 150
			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(30, 30, 30, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			// Entity at (160,100,100) — overlaps with offset entity (|150-160| = 10 < 30)
			ecs.spawn({
				...createTransform3D(160, 100, 100),
				...createAABB3DCollider(30, 30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});

		test('without offset the same entities do not collide', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			// Without offset, (100,100,100) vs (160,100,100) with halfWidth=15 each → |60| > 30 → no overlap
			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(30, 30, 30),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform3D(160, 100, 100),
				...createAABB3DCollider(30, 30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});
	});

	describe('Multiple collisions', () => {
		test('detects multiple collisions in single update', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			// Central player
			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(80, 80, 80),
				...createCollisionLayer('player', ['enemy']),
			});

			// Three enemies all overlapping player
			ecs.spawn({
				...createTransform3D(90, 90, 90),
				...createAABB3DCollider(30, 30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.spawn({
				...createTransform3D(110, 110, 110),
				...createAABB3DCollider(30, 30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.spawn({
				...createTransform3D(100, 120, 100),
				...createAABB3DCollider(30, 30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(3);
		});
	});

	describe('Entities without colliders', () => {
		test('ignores entity with collisionLayer but no shape', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createCollisionLayer('player', ['enemy']),
				// no aabb3DCollider or sphereCollider
			});

			ecs.spawn({
				...createTransform3D(105, 105, 105),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(0);
		});
	});

	describe('World transform usage', () => {
		test('uses worldTransform3D — child entity collides at world position', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			// Parent at (100,100,100)
			const parent = ecs.spawn({
				...createTransform3D(100, 100, 100),
			});

			// Child at local (50,50,50) → world (150,150,150)
			ecs.spawnChild(parent.id, {
				...createTransform3D(50, 50, 50),
				...createAABB3DCollider(30, 30, 30),
				...createCollisionLayer('player', ['enemy']),
			});

			// Enemy at world (160,160,160) — should collide with child
			ecs.spawn({
				...createTransform3D(160, 160, 160),
				...createAABB3DCollider(30, 30, 30),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});
	});

	describe('Broadphase acceleration', () => {
		test('collision result is the same with spatialIndex3D installed', () => {
			const ecs = ECSpresso
				.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers: playerEnemyLayers }))
				.withPlugin(createSpatialIndex3DPlugin({ cellSize: 64 }))
				.build();

			const collisions: Array<{ entityA: number; entityB: number }> = [];
			ecs.eventBus.subscribe('collision3D', (data) => {
				collisions.push(data);
			});

			ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('player', ['enemy']),
			});

			ecs.spawn({
				...createTransform3D(120, 120, 120),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			// Non-overlapping enemy — should not fire
			ecs.spawn({
				...createTransform3D(500, 500, 500),
				...createAABB3DCollider(50, 50, 50),
				...createCollisionLayer('enemy', ['player']),
			});

			ecs.update(0.016);

			expect(collisions.length).toBe(1);
		});
	});

	describe('Helper functions', () => {
		test('createAABB3DCollider returns correct shape', () => {
			const result = createAABB3DCollider(50, 30, 20);
			expect(result).toEqual({
				aabb3DCollider: { width: 50, height: 30, depth: 20 },
			});
		});

		test('createAABB3DCollider includes offsets when provided', () => {
			const result = createAABB3DCollider(50, 30, 20, 10, 5, 2);
			expect(result).toEqual({
				aabb3DCollider: { width: 50, height: 30, depth: 20, offsetX: 10, offsetY: 5, offsetZ: 2 },
			});
		});

		test('createSphereCollider returns correct shape', () => {
			const result = createSphereCollider(25);
			expect(result).toEqual({
				sphereCollider: { radius: 25 },
			});
		});

		test('createSphereCollider includes offsets when provided', () => {
			const result = createSphereCollider(25, 5, 10, 3);
			expect(result).toEqual({
				sphereCollider: { radius: 25, offsetX: 5, offsetY: 10, offsetZ: 3 },
			});
		});

		test('createCollisionLayer (re-exported) returns correct shape', () => {
			const result = createCollisionLayer('player', ['enemy', 'obstacle']);
			expect(result).toEqual({
				collisionLayer: { layer: 'player', collidesWith: ['enemy', 'obstacle'] },
			});
		});
	});

	describe('defineCollisionLayers (re-exported)', () => {
		test('factory functions produce correct collisionLayer', () => {
			const layers = defineCollisionLayers({ player: ['enemy'], enemy: ['player'] });

			expect(layers.player()).toEqual({
				collisionLayer: { layer: 'player', collidesWith: ['enemy'] },
			});

			expect(layers.enemy()).toEqual({
				collisionLayer: { layer: 'enemy', collidesWith: ['player'] },
			});
		});
	});

	describe('createCollisionPairHandler integration with collision3D', () => {
		test('routes collision3D events to correct callback with correct entity order', () => {
			const layers = defineCollisionLayers({
				playerProjectile: ['enemy'],
				enemy: ['playerProjectile'],
			});

			const ecs = ECSpresso
				.create()
				.withPlugin(createTransform3DPlugin())
				.withPlugin(createCollision3DPlugin({ layers }))
				.build();

			type ECS = typeof ecs;

			const hits: Array<{ projectileId: number; enemyId: number }> = [];

			type Layer = LayersOf<typeof layers>;
			const handler = createCollisionPairHandler<ECS, Layer>({
				'playerProjectile:enemy': (projectileId, enemyId, ecsRef) => {
					expect(ecsRef).toBe(ecs);
					hits.push({ projectileId, enemyId });
				},
			});

			ecs.eventBus.subscribe('collision3D', (data) => handler({ data, ecs }));

			const projectile = ecs.spawn({
				...createTransform3D(100, 100, 100),
				...createAABB3DCollider(10, 10, 10),
				...layers.playerProjectile(),
			});

			const enemy = ecs.spawn({
				...createTransform3D(105, 105, 105),
				...createAABB3DCollider(20, 20, 20),
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
});

describe('Collision3D type narrowing', () => {
	test('bare types default to never', () => {
		const assertLayerIsNever: true = true as (CollisionLayer['layer'] extends never ? true : false);
		const assertEventLayerIsNever: true = true as (Collision3DEvent['layerA'] extends never ? true : false);
		const assertComponentLayerIsNever: true = true as (Collision3DComponentTypes['collisionLayer']['layer'] extends never ? true : false);
		const assertEventTypesIsNever: true = true as (Collision3DEventTypes['collision3D']['layerA'] extends never ? true : false);
		expect(assertLayerIsNever).toBe(true);
		expect(assertEventLayerIsNever).toBe(true);
		expect(assertComponentLayerIsNever).toBe(true);
		expect(assertEventTypesIsNever).toBe(true);
	});

	test('layer type flows from defineCollisionLayers through event without casts', () => {
		const layers = defineCollisionLayers({ player: ['enemy'], enemy: ['player'] });

		const ecs = ECSpresso
			.create()
			.withPlugin(createTransform3DPlugin())
			.withPlugin(createCollision3DPlugin({ layers }))
			.build();

		type ExpectedLayer = 'player' | 'enemy';

		ecs.eventBus.subscribe('collision3D', (data) => {
			const layerA: ExpectedLayer = data.layerA;
			const layerB: ExpectedLayer = data.layerB;
			void layerA;
			void layerB;
		});

		ecs.spawn({
			...createTransform3D(100, 100, 100),
			...createAABB3DCollider(50, 50, 50),
			...layers.player(),
		});

		ecs.spawn({
			...createTransform3D(120, 120, 120),
			...createAABB3DCollider(50, 50, 50),
			...layers.enemy(),
		});

		ecs.update(0.016);
		expect(true).toBe(true); // compile-time assertion
	});

	test('defineCollisionLayers rejects invalid collidesWith', () => {
		defineCollisionLayers({
			player: ['enemy'],
			// @ts-expect-error — 'enmey' is not a valid layer name
			enemy: ['enmey'],
		});
	});

	test('createCollisionPairHandler rejects invalid layer names', () => {
		type Layer = 'player' | 'enemy';
		createCollisionPairHandler<unknown, Layer>({
			// @ts-expect-error — 'player:goblin' is not a valid layer pair
			'player:goblin': () => {},
		});
	});
});
