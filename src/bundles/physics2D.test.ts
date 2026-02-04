import { describe, test, expect } from 'bun:test';
import ECSpresso from '../ecspresso';
import { createTransform, createTransformBundle } from './transform';
import {
	createAABBCollider,
	createCircleCollider,
	defineCollisionLayers,
	createCollisionBundle,
} from './collision';
import {
	createPhysics2DBundle,
	createRigidBody,
	createForce,
	applyForce,
	applyImpulse,
	setVelocity,
	type Physics2DComponentTypes,
	type Physics2DEventTypes,
	type Physics2DResourceTypes,
	type Physics2DCollisionEvent,
} from './physics2D';

// ==================== Test Setup ====================

const defaultLayers = defineCollisionLayers({ default: ['default'] });

interface TestComponents extends Physics2DComponentTypes<'default'> {
	tag: string;
}

interface TestEvents extends Physics2DEventTypes {}

interface TestResources extends Physics2DResourceTypes {}

const FIXED_DT = 1 / 60;

function createEcs(options?: { gravity?: { x: number; y: number }; systemGroup?: string }) {
	return ECSpresso
		.create<TestComponents, TestEvents, TestResources>()
		.withBundle(createTransformBundle())
		.withBundle(createPhysics2DBundle({ ...options, layers: defaultLayers }))
		.withFixedTimestep(FIXED_DT)
		.build();
}

// ==================== Helper Function Tests ====================

describe('Physics 2D Bundle', () => {
	describe('Helper Functions', () => {
		test('createRigidBody("dynamic") returns rigidBody with defaults + force component', () => {
			const result = createRigidBody('dynamic');
			expect(result.rigidBody).toEqual({
				type: 'dynamic',
				mass: 1,
				drag: 0,
				restitution: 0,
				friction: 0,
				gravityScale: 1,
			});
			expect(result.force).toEqual({ x: 0, y: 0 });
		});

		test('createRigidBody("static") sets mass to Infinity', () => {
			const result = createRigidBody('static');
			expect(result.rigidBody.mass).toBe(Infinity);
			expect(result.rigidBody.type).toBe('static');
		});

		test('createRigidBody with custom options overrides defaults', () => {
			const result = createRigidBody('dynamic', {
				mass: 5,
				drag: 0.5,
				restitution: 0.8,
				friction: 0.3,
				gravityScale: 2,
			});
			expect(result.rigidBody).toEqual({
				type: 'dynamic',
				mass: 5,
				drag: 0.5,
				restitution: 0.8,
				friction: 0.3,
				gravityScale: 2,
			});
		});

		test('createRigidBody("kinematic") uses defaults', () => {
			const result = createRigidBody('kinematic');
			expect(result.rigidBody.type).toBe('kinematic');
			expect(result.rigidBody.mass).toBe(1);
		});

		test('createForce returns force component', () => {
			const result = createForce(10, -5);
			expect(result.force).toEqual({ x: 10, y: -5 });
		});
	});

	// ==================== Integration — Gravity ====================

	describe('Integration — Gravity', () => {
		test('dynamic body with gravity falls (velocity increases each step)', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 100 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			// velocity += gravity * dt = 100 * (1/60) ≈ 1.667
			expect(vel?.y).toBeCloseTo(100 * FIXED_DT, 5);

			const lt = ecs.entityManager.getComponent(entity.id, 'localTransform');
			// position += velocity * dt (after velocity update)
			expect(lt!.y).toBeGreaterThan(0);
		});

		test('dynamic body with gravityScale=0 ignores gravity', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 100 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic', { gravityScale: 0 }),
				velocity: { x: 0, y: 0 },
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel?.y).toBe(0);
		});

		test('dynamic body with gravityScale=2 falls twice as fast', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 100 } });

			const e1 = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic', { gravityScale: 1 }),
				velocity: { x: 0, y: 0 },
			});

			const e2 = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic', { gravityScale: 2 }),
				velocity: { x: 0, y: 0 },
			});

			ecs.update(FIXED_DT);

			const vel1 = ecs.entityManager.getComponent(e1.id, 'velocity');
			const vel2 = ecs.entityManager.getComponent(e2.id, 'velocity');
			expect(vel2!.y).toBeCloseTo(vel1!.y * 2, 5);
		});

		test('kinematic body ignores gravity', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 100 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('kinematic'),
				velocity: { x: 0, y: 0 },
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel?.y).toBe(0);
		});

		test('static body ignores gravity', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 100 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('static'),
				velocity: { x: 0, y: 0 },
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel?.y).toBe(0);
		});

		test('custom gravity vector (horizontal gravity)', () => {
			const ecs = createEcs({ gravity: { x: 50, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel!.x).toBeCloseTo(50 * FIXED_DT, 5);
			expect(vel!.y).toBe(0);
		});
	});

	// ==================== Integration — Forces ====================

	describe('Integration — Forces', () => {
		test('dynamic body with applied force accelerates (F=ma)', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic', { mass: 2 }),
				velocity: { x: 0, y: 0 },
				force: { x: 100, y: 0 },
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			// velocity += (force / mass) * dt = (100 / 2) * (1/60) ≈ 0.833
			expect(vel!.x).toBeCloseTo((100 / 2) * FIXED_DT, 5);
		});

		test('forces cleared after integration step', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				force: { x: 100, y: 50 },
			});

			ecs.update(FIXED_DT);

			const force = ecs.entityManager.getComponent(entity.id, 'force');
			expect(force!.x).toBe(0);
			expect(force!.y).toBe(0);
		});

		test('heavier mass = less acceleration for same force', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const light = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic', { mass: 1 }),
				velocity: { x: 0, y: 0 },
				force: { x: 100, y: 0 },
			});

			const heavy = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic', { mass: 10 }),
				velocity: { x: 0, y: 0 },
				force: { x: 100, y: 0 },
			});

			ecs.update(FIXED_DT);

			const velLight = ecs.entityManager.getComponent(light.id, 'velocity');
			const velHeavy = ecs.entityManager.getComponent(heavy.id, 'velocity');
			expect(velLight!.x).toBeCloseTo(velHeavy!.x * 10, 5);
		});

		test('kinematic body ignores forces', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('kinematic'),
				velocity: { x: 0, y: 0 },
				force: { x: 100, y: 100 },
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel!.x).toBe(0);
			expect(vel!.y).toBe(0);
		});
	});

	// ==================== Integration — Drag ====================

	describe('Integration — Drag', () => {
		test('dynamic body with drag slows down over time', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic', { drag: 5 }),
				velocity: { x: 100, y: 0 },
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			// velocity *= max(0, 1 - drag * dt) = max(0, 1 - 5 * 1/60) ≈ 0.917
			expect(vel!.x).toBeCloseTo(100 * Math.max(0, 1 - 5 * FIXED_DT), 5);
			expect(vel!.x).toBeLessThan(100);
		});

		test('drag=0 means no damping', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic', { drag: 0 }),
				velocity: { x: 100, y: 0 },
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			// No drag, velocity only changes from forces/gravity (both zero)
			expect(vel!.x).toBeCloseTo(100, 5);
		});

		test('high drag approaches stop', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic', { drag: 1000 }),
				velocity: { x: 100, y: 0 },
			});

			// Run several steps
			for (let i = 0; i < 10; i++) {
				ecs.update(FIXED_DT);
			}

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(Math.abs(vel!.x)).toBeLessThan(1);
		});
	});

	// ==================== Integration — Position ====================

	describe('Integration — Position', () => {
		test('dynamic body with velocity moves (velocity * dt)', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createRigidBody('dynamic'),
				velocity: { x: 60, y: -30 },
			});

			ecs.update(FIXED_DT);

			const lt = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(lt!.x).toBeCloseTo(100 + 60 * FIXED_DT, 5);
			expect(lt!.y).toBeCloseTo(100 + (-30) * FIXED_DT, 5);
		});

		test('kinematic body with velocity moves', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(50, 50),
				...createRigidBody('kinematic'),
				velocity: { x: 120, y: -60 },
			});

			ecs.update(FIXED_DT);

			const lt = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(lt!.x).toBeCloseTo(50 + 120 * FIXED_DT, 5);
			expect(lt!.y).toBeCloseTo(50 + (-60) * FIXED_DT, 5);
		});

		test('static body does not move even with velocity', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createRigidBody('static'),
				velocity: { x: 600, y: 600 },
			});

			ecs.update(FIXED_DT);

			const lt = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(lt!.x).toBe(100);
			expect(lt!.y).toBe(100);
		});
	});

	// ==================== Collision Response — Position Correction ====================

	describe('Collision Response — Position Correction', () => {
		test('two overlapping dynamic AABBs are pushed apart', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const a = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			const b = ecs.spawn({
				...createTransform(15, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			const ltA = ecs.entityManager.getComponent(a.id, 'localTransform');
			const ltB = ecs.entityManager.getComponent(b.id, 'localTransform');
			// They should be pushed apart so their AABBs no longer overlap
			const distance = Math.abs(ltB!.x - ltA!.x);
			expect(distance).toBeGreaterThanOrEqual(20 - 0.01); // at least width apart
		});

		test('dynamic vs static: only dynamic moves', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const dynamic = ecs.spawn({
				...createTransform(5, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			const staticEntity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('static'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			const ltStatic = ecs.entityManager.getComponent(staticEntity.id, 'localTransform');
			expect(ltStatic!.x).toBe(0);
			expect(ltStatic!.y).toBe(0);

			const ltDynamic = ecs.entityManager.getComponent(dynamic.id, 'localTransform');
			// Dynamic should have been pushed away from static
			expect(ltDynamic!.x).toBeGreaterThan(5);
		});

		test('dynamic vs kinematic: only dynamic moves', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const dynamic = ecs.spawn({
				...createTransform(5, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			const kinematic = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('kinematic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			const ltKinematic = ecs.entityManager.getComponent(kinematic.id, 'localTransform');
			expect(ltKinematic!.x).toBe(0);
			expect(ltKinematic!.y).toBe(0);

			const ltDynamic = ecs.entityManager.getComponent(dynamic.id, 'localTransform');
			expect(ltDynamic!.x).toBeGreaterThan(5);
		});

		test('mass ratio affects push distribution', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const light = ecs.spawn({
				...createTransform(-5, 0),
				...createRigidBody('dynamic', { mass: 1 }),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			const heavy = ecs.spawn({
				...createTransform(5, 0),
				...createRigidBody('dynamic', { mass: 10 }),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			const ltLight = ecs.entityManager.getComponent(light.id, 'localTransform');
			const ltHeavy = ecs.entityManager.getComponent(heavy.id, 'localTransform');
			// Light body should move more than heavy body
			const lightDisplacement = Math.abs(ltLight!.x - (-5));
			const heavyDisplacement = Math.abs(ltHeavy!.x - 5);
			expect(lightDisplacement).toBeGreaterThan(heavyDisplacement);
		});

		test('circle-circle position correction', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const a = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createCircleCollider(10),
				...defaultLayers.default(),
			});

			const b = ecs.spawn({
				...createTransform(15, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createCircleCollider(10),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			const ltA = ecs.entityManager.getComponent(a.id, 'localTransform');
			const ltB = ecs.entityManager.getComponent(b.id, 'localTransform');
			const dx = ltB!.x - ltA!.x;
			const dy = ltB!.y - ltA!.y;
			const distance = Math.sqrt(dx * dx + dy * dy);
			// Should be pushed apart to at least radius sum
			expect(distance).toBeGreaterThanOrEqual(20 - 0.01);
		});

		test('AABB-circle position correction', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const aabb = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			const circle = ecs.spawn({
				...createTransform(12, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createCircleCollider(5),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			const ltAABB = ecs.entityManager.getComponent(aabb.id, 'localTransform');
			const ltCircle = ecs.entityManager.getComponent(circle.id, 'localTransform');
			// They should have been pushed apart
			expect(ltCircle!.x - ltAABB!.x).toBeGreaterThan(12);
		});
	});

	// ==================== Collision Response — Velocity ====================

	describe('Collision Response — Velocity', () => {
		test('head-on collision with restitution=1: velocities swap (elastic)', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const a = ecs.spawn({
				...createTransform(-5, 0),
				...createRigidBody('dynamic', { restitution: 1, mass: 1 }),
				velocity: { x: 100, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			const b = ecs.spawn({
				...createTransform(5, 0),
				...createRigidBody('dynamic', { restitution: 1, mass: 1 }),
				velocity: { x: -100, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			const velA = ecs.entityManager.getComponent(a.id, 'velocity');
			const velB = ecs.entityManager.getComponent(b.id, 'velocity');
			// After elastic collision with equal masses, velocities should swap
			// Note: velocities were also integrated by dt, but the impulse should dominate
			expect(velA!.x).toBeLessThan(0);
			expect(velB!.x).toBeGreaterThan(0);
		});

		test('head-on collision with restitution=0: bodies stop along normal (inelastic)', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const a = ecs.spawn({
				...createTransform(-5, 0),
				...createRigidBody('dynamic', { restitution: 0, mass: 1 }),
				velocity: { x: 100, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			const b = ecs.spawn({
				...createTransform(5, 0),
				...createRigidBody('dynamic', { restitution: 0, mass: 1 }),
				velocity: { x: -100, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			const velA = ecs.entityManager.getComponent(a.id, 'velocity');
			const velB = ecs.entityManager.getComponent(b.id, 'velocity');
			// After perfectly inelastic collision with equal masses, both should have ~0 along normal
			expect(Math.abs(velA!.x)).toBeLessThan(5); // close to zero
			expect(Math.abs(velB!.x)).toBeLessThan(5);
		});

		test('collision against static body reflects velocity', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const dynamic = ecs.spawn({
				...createTransform(5, 0),
				...createRigidBody('dynamic', { restitution: 1 }),
				velocity: { x: -100, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('static', { restitution: 1 }),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(dynamic.id, 'velocity');
			// Should bounce back — positive x
			expect(vel!.x).toBeGreaterThan(0);
		});

		test('already-separating bodies not affected', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			// Overlapping but moving apart
			const a = ecs.spawn({
				...createTransform(-5, 0),
				...createRigidBody('dynamic', { restitution: 1 }),
				velocity: { x: -100, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			const b = ecs.spawn({
				...createTransform(5, 0),
				...createRigidBody('dynamic', { restitution: 1 }),
				velocity: { x: 100, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			const velA = ecs.entityManager.getComponent(a.id, 'velocity');
			const velB = ecs.entityManager.getComponent(b.id, 'velocity');
			// Still moving apart (impulse should not slow them)
			expect(velA!.x).toBeLessThan(0);
			expect(velB!.x).toBeGreaterThan(0);
		});
	});

	// ==================== Collision Response — Friction ====================

	describe('Collision Response — Friction', () => {
		test('sliding body against surface loses tangential velocity', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			// Dynamic body overlapping with a static floor, sliding along x
			// Dynamic approaching floor (positive y velocity toward floor at y=10)
			const dynamic = ecs.spawn({
				...createTransform(0, -8),
				...createRigidBody('dynamic', { restitution: 0, friction: 1 }),
				velocity: { x: 100, y: 10 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.spawn({
				...createTransform(0, 10),
				...createRigidBody('static', { restitution: 0, friction: 1 }),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(40, 20),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(dynamic.id, 'velocity');
			// Tangential velocity (x) should be reduced by friction
			expect(Math.abs(vel!.x)).toBeLessThan(100);
		});

		test('friction=0 means no tangential damping', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const dynamic = ecs.spawn({
				...createTransform(0, -8),
				...createRigidBody('dynamic', { restitution: 0, friction: 0 }),
				velocity: { x: 100, y: 10 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.spawn({
				...createTransform(0, 10),
				...createRigidBody('static', { restitution: 0, friction: 0 }),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(40, 20),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(dynamic.id, 'velocity');
			// X velocity should be largely unchanged (only position integration changed it)
			// After integration: vx stays ~100 (no friction)
			expect(vel!.x).toBeCloseTo(100, 0);
		});
	});

	// ==================== Collision — Layer Filtering ====================

	describe('Collision — Layer Filtering', () => {
		const filterLayers = defineCollisionLayers({ player: ['enemy'], enemy: ['player'], neutral: ['other'], other: ['neutral'] });

		test('physics collision respects collisionLayer', () => {
			const ecs = ECSpresso
				.create()
				.withBundle(createTransformBundle())
				.withBundle(createPhysics2DBundle({ gravity: { x: 0, y: 0 }, layers: filterLayers }))
				.withFixedTimestep(FIXED_DT)
				.build();
			const collisions: Physics2DCollisionEvent[] = [];
			ecs.eventBus.subscribe('physicsCollision', (e: Physics2DCollisionEvent) => collisions.push(e));

			ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...filterLayers.player(),
			});

			ecs.spawn({
				...createTransform(5, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...filterLayers.enemy(),
			});

			ecs.update(FIXED_DT);

			expect(collisions.length).toBe(1);
		});

		test('non-matching layers do not respond', () => {
			const ecs = ECSpresso
				.create()
				.withBundle(createTransformBundle())
				.withBundle(createPhysics2DBundle({ gravity: { x: 0, y: 0 }, layers: filterLayers }))
				.withFixedTimestep(FIXED_DT)
				.build();
			const collisions: Physics2DCollisionEvent[] = [];
			ecs.eventBus.subscribe('physicsCollision', (e: Physics2DCollisionEvent) => collisions.push(e));

			const a = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...filterLayers.player(),
			});

			const b = ecs.spawn({
				...createTransform(5, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...filterLayers.neutral(),
			});

			ecs.update(FIXED_DT);

			expect(collisions.length).toBe(0);

			// Positions should not be corrected
			const ltA = ecs.entityManager.getComponent(a.id, 'localTransform');
			const ltB = ecs.entityManager.getComponent(b.id, 'localTransform');
			expect(ltA!.x).toBeCloseTo(0, 1);
			expect(ltB!.x).toBeCloseTo(5, 1);
		});
	});

	// ==================== Events ====================

	describe('Events', () => {
		test('physicsCollision event fires with correct contact data', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });
			const collisions: Physics2DCollisionEvent[] = [];
			ecs.eventBus.subscribe('physicsCollision', (e: Physics2DCollisionEvent) => collisions.push(e));

			const a = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			const b = ecs.spawn({
				...createTransform(15, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			expect(collisions.length).toBe(1);
			const event = collisions[0]!;
			expect(event.entityA).toBe(a.id);
			expect(event.entityB).toBe(b.id);
			expect(event.depth).toBeGreaterThan(0);
		});

		test('contact normal points from A toward B', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });
			const collisions: Physics2DCollisionEvent[] = [];
			ecs.eventBus.subscribe('physicsCollision', (e: Physics2DCollisionEvent) => collisions.push(e));

			ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			// B is to the right of A
			ecs.spawn({
				...createTransform(15, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
				...createAABBCollider(20, 20),
				...defaultLayers.default(),
			});

			ecs.update(FIXED_DT);

			expect(collisions.length).toBe(1);
			const event = collisions[0]!;
			// Normal should point from A toward B (positive x direction)
			expect(event.normal.x).toBeGreaterThan(0);
		});
	});

	// ==================== Utility Functions ====================

	describe('Utility Functions', () => {
		test('applyForce accumulates onto force component', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
			});

			applyForce(ecs, entity.id, 50, 30);
			applyForce(ecs, entity.id, 10, -10);

			const force = ecs.entityManager.getComponent(entity.id, 'force');
			expect(force!.x).toBe(60);
			expect(force!.y).toBe(20);
		});

		test('applyImpulse modifies velocity directly (respects mass)', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic', { mass: 2 }),
				velocity: { x: 0, y: 0 },
			});

			applyImpulse(ecs, entity.id, 100, 50);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel!.x).toBe(50); // 100 / 2
			expect(vel!.y).toBe(25); // 50 / 2
		});

		test('setVelocity sets velocity directly', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 100, y: 100 },
			});

			setVelocity(ecs, entity.id, -50, 25);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel!.x).toBe(-50);
			expect(vel!.y).toBe(25);
		});
	});

	// ==================== Bundle Configuration ====================

	describe('Bundle Configuration', () => {
		test('custom gravity via options', () => {
			const ecs = createEcs({ gravity: { x: -10, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
			});

			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel!.x).toBeCloseTo(-10 * FIXED_DT, 5);
			expect(vel!.y).toBe(0);
		});

		test('custom system group', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createPhysics2DBundle({ gravity: { x: 0, y: 100 }, systemGroup: 'custom-physics', layers: defaultLayers }))
				.withFixedTimestep(FIXED_DT)
				.build();

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
			});

			ecs.update(FIXED_DT);
			const vel1 = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel1!.y).toBeGreaterThan(0);

			// Disable and check no further velocity changes
			ecs.disableSystemGroup('custom-physics');
			const velBefore = { ...vel1! };
			ecs.update(FIXED_DT);
			const vel2 = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel2!.y).toBe(velBefore.y);
		});

		test('system group disable/enable works', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 100 } });

			const entity = ecs.spawn({
				...createTransform(0, 0),
				...createRigidBody('dynamic'),
				velocity: { x: 0, y: 0 },
			});

			ecs.disableSystemGroup('physics2D');
			ecs.update(FIXED_DT);

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel!.y).toBe(0);

			ecs.enableSystemGroup('physics2D');
			ecs.update(FIXED_DT);

			const vel2 = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel2!.y).toBeGreaterThan(0);
		});
	});

	// ==================== Integration with Transform Bundle ====================

	describe('Integration with Transform Bundle', () => {
		test('localTransform modified by physics, worldTransform propagated in postUpdate', () => {
			const ecs = createEcs({ gravity: { x: 0, y: 0 } });

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createRigidBody('dynamic'),
				velocity: { x: 600, y: 0 },
			});

			ecs.update(FIXED_DT);

			const wt = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			expect(wt!.x).toBeCloseTo(110, 5); // 100 + 600/60
		});
	});
});

describe('Physics2D type narrowing', () => {
	test('Physics2D + Collision compose with narrow types', () => {
		const layers = defineCollisionLayers({ ball: ['ball'], wall: ['ball'] });

		const ecs = ECSpresso
			.create()
			.withBundle(createTransformBundle())
			.withBundle(createPhysics2DBundle({ gravity: { x: 0, y: 100 }, layers }))
			.withBundle(createCollisionBundle({ layers }))
			.build();

		const entity = ecs.spawn({
			...createTransform(0, 0),
			...createRigidBody('dynamic'),
			velocity: { x: 0, y: 0 },
			...createCircleCollider(10),
			...layers.ball(),
		});

		const cl = ecs.entityManager.getComponent(entity.id, 'collisionLayer');
		if (!cl) throw new Error('Expected collisionLayer');

		// layer should be 'ball' | 'wall', not string
		const _layer: 'ball' | 'wall' = cl.layer;
		void _layer;
		expect(cl.layer).toBe('ball');
	});

	test('Physics2DColliderInfo inherits narrow layer type from BaseColliderInfo', () => {
		const layers = defineCollisionLayers({ ball: ['wall'], wall: ['ball'] });

		const ecs = ECSpresso
			.create()
			.withBundle(createTransformBundle())
			.withBundle(createPhysics2DBundle({ gravity: { x: 0, y: 100 }, layers }))
			.build();

		const entity = ecs.spawn({
			...createTransform(0, 0),
			...createRigidBody('dynamic'),
			velocity: { x: 0, y: 0 },
			...createCircleCollider(10),
			...layers.ball(),
		});

		const cl = ecs.entityManager.getComponent(entity.id, 'collisionLayer');
		if (!cl) throw new Error('Expected collisionLayer');

		// layer should be 'ball' | 'wall', not string
		const _layer: 'ball' | 'wall' = cl.layer;
		void _layer;
		expect(cl.layer).toBe('ball');
	});

	test('Physics2DComponentTypes bare defaults to never', () => {
		type Bare = Physics2DComponentTypes;
		const assertLayerIsNever: true = true as (Bare['collisionLayer']['layer'] extends never ? true : false);
		expect(assertLayerIsNever).toBe(true);
	});
});
