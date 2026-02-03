/**
 * Physics 2D Bundle for ECSpresso
 *
 * Provides ECS-native arcade physics: gravity, forces, drag, semi-implicit Euler
 * integration, and impulse-based collision response with friction.
 *
 * Reuses collider types from the collision bundle for shape definitions.
 * Has its own collision detection in fixedUpdate for physics response;
 * the existing collision bundle can still run in postUpdate for game logic events.
 */

import { Bundle } from 'ecspresso';
import type { SystemPhase } from 'ecspresso';
import type { TransformComponentTypes } from './transform';
import type { CollisionComponentTypes, LayerFactories } from './collision';
import type { Vector2D } from 'ecspresso';
import type { SpatialIndex } from './spatial-index';
import { detectCollisions, type Contact, type BaseColliderInfo } from './narrowphase';

// ==================== Component Types ====================

/**
 * Rigid body types for physics simulation.
 * - 'dynamic': Fully simulated (gravity, forces, collisions)
 * - 'kinematic': Moves via velocity only (ignores gravity/forces, immovable in collisions)
 * - 'static': Immovable (ignores gravity, forces, and velocity)
 */
export type BodyType = 'dynamic' | 'kinematic' | 'static';

/**
 * Rigid body component controlling physics behavior.
 */
export interface RigidBody {
	type: BodyType;
	/** Mass in arbitrary units. Affects force→acceleration. Infinity = immovable. */
	mass: number;
	/** Linear velocity damping coefficient (units/sec, 0 = none) */
	drag: number;
	/** Bounciness 0–1 (0 = no bounce, 1 = perfectly elastic) */
	restitution: number;
	/** Surface friction coefficient 0–1 */
	friction: number;
	/** Per-entity gravity multiplier (0 = no gravity) */
	gravityScale: number;
}

/**
 * Component types provided by the physics bundle.
 */
export interface Physics2DComponentTypes<L extends string = never> extends TransformComponentTypes, CollisionComponentTypes<L> {
	rigidBody: RigidBody;
	velocity: Vector2D;
	force: Vector2D;
}

// ==================== Resource Types ====================

/**
 * Physics configuration resource.
 */
export interface Physics2DConfig {
	gravity: Vector2D;
}

export interface Physics2DResourceTypes {
	physicsConfig: Physics2DConfig;
}

// ==================== Event Types ====================

/**
 * Event emitted for each physics collision pair.
 */
export interface Physics2DCollisionEvent {
	entityA: number;
	entityB: number;
	/** Unit normal pointing from A toward B */
	normal: Vector2D;
	/** Penetration depth (positive) */
	depth: number;
}

export interface Physics2DEventTypes {
	physicsCollision: Physics2DCollisionEvent;
}

// ==================== Bundle Options ====================

export interface Physics2DBundleOptions<G extends string = 'physics2D', CG extends string = never> {
	/** World gravity vector (default: {x: 0, y: 0}) */
	gravity?: Vector2D;
	/** System group name (default: 'physics2D') */
	systemGroup?: G;
	/** Additional group for the collision system only (default: none).
	 * When set, the collision system belongs to both `systemGroup` and this group,
	 * allowing independent enable/disable of collision detection. */
	collisionSystemGroup?: CG;
	/** Priority for integration system (default: 1000) */
	integrationPriority?: number;
	/** Priority for collision system (default: 900) */
	collisionPriority?: number;
	/** Execution phase (default: 'fixedUpdate') */
	phase?: SystemPhase;
}

// ==================== Helper Functions ====================

export interface RigidBodyOptions {
	mass?: number;
	drag?: number;
	restitution?: number;
	friction?: number;
	gravityScale?: number;
}

/**
 * Create a rigid body + force component pair.
 * Static bodies automatically get mass=Infinity.
 */
export function createRigidBody(
	type: BodyType,
	options?: RigidBodyOptions,
): { rigidBody: RigidBody; force: Vector2D } {
	return {
		rigidBody: {
			type,
			mass: type === 'static' ? Infinity : (options?.mass ?? 1),
			drag: options?.drag ?? 0,
			restitution: options?.restitution ?? 0,
			friction: options?.friction ?? 0,
			gravityScale: options?.gravityScale ?? 1,
		},
		force: { x: 0, y: 0 },
	};
}

/**
 * Create a force component with initial values.
 */
export function createForce(x: number, y: number): { force: Vector2D } {
	return { force: { x, y } };
}

/**
 * Accumulate a force onto an entity's force component.
 */
export function applyForce(
	ecs: { entityManager: { getComponent(id: number, name: 'force'): Vector2D | null } },
	entityId: number,
	fx: number,
	fy: number,
): void {
	const force = ecs.entityManager.getComponent(entityId, 'force');
	if (!force) return;
	force.x += fx;
	force.y += fy;
}

/**
 * Apply an instantaneous impulse: velocity += impulse / mass.
 */
export function applyImpulse(
	ecs: { entityManager: { getComponent(id: number, name: string): unknown | null } },
	entityId: number,
	ix: number,
	iy: number,
): void {
	const velocity = ecs.entityManager.getComponent(entityId, 'velocity') as Vector2D | null;
	const rigidBody = ecs.entityManager.getComponent(entityId, 'rigidBody') as RigidBody | null;
	if (!velocity || !rigidBody) return;
	if (rigidBody.mass === Infinity || rigidBody.mass === 0) return;
	velocity.x += ix / rigidBody.mass;
	velocity.y += iy / rigidBody.mass;
}

/**
 * Directly set an entity's velocity.
 */
export function setVelocity(
	ecs: { entityManager: { getComponent(id: number, name: 'velocity'): Vector2D | null } },
	entityId: number,
	vx: number,
	vy: number,
): void {
	const velocity = ecs.entityManager.getComponent(entityId, 'velocity');
	if (!velocity) return;
	velocity.x = vx;
	velocity.y = vy;
}

// ==================== Internal: Collider Info ====================

interface Physics2DColliderInfo extends BaseColliderInfo {
	rigidBody: RigidBody;
	velocity: Vector2D;
}

// ==================== Collision Response ====================

interface PhysicsEcsLike {
	entityManager: { getComponent(id: number, name: string): unknown | null };
	eventBus: { publish(event: 'physicsCollision', data: Physics2DCollisionEvent): void };
	markChanged(entityId: number, componentName: string): void;
}

/**
 * Resolve a physics collision pair: position correction, impulse response, event.
 */
function resolvePhysicsContact(
	a: Physics2DColliderInfo,
	b: Physics2DColliderInfo,
	contact: Contact,
	ecs: PhysicsEcsLike,
): void {
	const invMassA = (a.rigidBody.type === 'dynamic' && a.rigidBody.mass > 0 && a.rigidBody.mass !== Infinity)
		? 1 / a.rigidBody.mass
		: 0;
	const invMassB = (b.rigidBody.type === 'dynamic' && b.rigidBody.mass > 0 && b.rigidBody.mass !== Infinity)
		? 1 / b.rigidBody.mass
		: 0;
	const totalInvMass = invMassA + invMassB;

	// Position correction
	if (totalInvMass > 0) {
		const correctionScale = contact.depth / totalInvMass;

		if (invMassA > 0) {
			const ltA = ecs.entityManager.getComponent(a.entityId, 'localTransform') as { x: number; y: number };
			ltA.x -= correctionScale * invMassA * contact.normalX;
			ltA.y -= correctionScale * invMassA * contact.normalY;
			// Update cached position for subsequent pairs (collider offset already baked in)
			a.x = ltA.x;
			ecs.markChanged(a.entityId, 'localTransform');
		}

		if (invMassB > 0) {
			const ltB = ecs.entityManager.getComponent(b.entityId, 'localTransform') as { x: number; y: number };
			ltB.x += correctionScale * invMassB * contact.normalX;
			ltB.y += correctionScale * invMassB * contact.normalY;
			ecs.markChanged(b.entityId, 'localTransform');
		}

		// Velocity response (impulse-based)
		const relVelX = b.velocity.x - a.velocity.x;
		const relVelY = b.velocity.y - a.velocity.y;
		const velAlongNormal = relVelX * contact.normalX + relVelY * contact.normalY;

		if (velAlongNormal < 0) {
			const restitution = Math.min(a.rigidBody.restitution, b.rigidBody.restitution);
			const normalImpulse = -(1 + restitution) * velAlongNormal / totalInvMass;

			a.velocity.x -= normalImpulse * invMassA * contact.normalX;
			a.velocity.y -= normalImpulse * invMassA * contact.normalY;
			b.velocity.x += normalImpulse * invMassB * contact.normalX;
			b.velocity.y += normalImpulse * invMassB * contact.normalY;

			// Friction (tangential impulse)
			const tangentX = relVelX - velAlongNormal * contact.normalX;
			const tangentY = relVelY - velAlongNormal * contact.normalY;
			const tangentSpeed = Math.sqrt(tangentX * tangentX + tangentY * tangentY);

			if (tangentSpeed > 1e-6) {
				const tangentNX = tangentX / tangentSpeed;
				const tangentNY = tangentY / tangentSpeed;
				const friction = Math.sqrt(a.rigidBody.friction * b.rigidBody.friction);
				const maxFrictionImpulse = friction * Math.abs(normalImpulse);
				const tangentImpulse = Math.min(tangentSpeed / totalInvMass, maxFrictionImpulse);

				a.velocity.x += tangentImpulse * invMassA * tangentNX;
				a.velocity.y += tangentImpulse * invMassA * tangentNY;
				b.velocity.x -= tangentImpulse * invMassB * tangentNX;
				b.velocity.y -= tangentImpulse * invMassB * tangentNY;
			}
		}

		ecs.markChanged(a.entityId, 'velocity');
		ecs.markChanged(b.entityId, 'velocity');
	}

	ecs.eventBus.publish('physicsCollision', {
		entityA: a.entityId,
		entityB: b.entityId,
		normal: { x: contact.normalX, y: contact.normalY },
		depth: contact.depth,
	});
}

// ==================== Module-level Physics Callback ====================

function onPhysicsContact(
	a: Physics2DColliderInfo,
	b: Physics2DColliderInfo,
	contact: Contact,
	ecs: PhysicsEcsLike,
): void {
	resolvePhysicsContact(a, b, contact, ecs);
}

// ==================== Bundle Factory ====================

/**
 * Create a 2D physics bundle for ECSpresso.
 *
 * Provides:
 * - Semi-implicit Euler integration (gravity, forces, drag → velocity → position)
 * - Impulse-based collision response with restitution and friction
 * - physicsCollision events with contact normal and depth
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso.create()
 *   .withBundle(createTransformBundle())
 *   .withBundle(createPhysics2DBundle({ gravity: { x: 0, y: 980 } }))
 *   .withFixedTimestep(1/60)
 *   .build();
 *
 * ecs.spawn({
 *   ...createTransform(100, 200),
 *   ...createRigidBody('dynamic', { mass: 1, restitution: 0.5 }),
 *   velocity: { x: 0, y: 0 },
 *   ...createAABBCollider(32, 32),
 *   ...createCollisionLayer('player', ['ground']),
 * });
 * ```
 */
export function createPhysics2DBundle<L extends string = never, G extends string = 'physics2D', CG extends string = never>(
	options?: Physics2DBundleOptions<G, CG> & { layers?: LayerFactories<Record<L, readonly string[]>> },
): Bundle<Physics2DComponentTypes<L>, Physics2DEventTypes, Physics2DResourceTypes, {}, {}, 'physics2D-integration' | 'physics2D-collision', G | CG> {
	const {
		gravity = { x: 0, y: 0 },
		systemGroup = 'physics2D',
		collisionSystemGroup,
		integrationPriority = 1000,
		collisionPriority = 900,
		phase = 'fixedUpdate',
	} = options ?? {};

	const bundle = new Bundle<Physics2DComponentTypes<L>, Physics2DEventTypes, Physics2DResourceTypes>('physics2D');

	// rigidBody requires velocity and force — auto-add with zero defaults
	bundle.registerRequired('rigidBody', 'velocity', () => ({ x: 0, y: 0 }));
	bundle.registerRequired('rigidBody', 'force', () => ({ x: 0, y: 0 }));

	bundle.addResource('physicsConfig', { gravity: { x: gravity.x, y: gravity.y } });

	// ==================== Integration System ====================

	bundle
		.addSystem('physics2D-integration')
		.setPriority(integrationPriority)
		.inPhase(phase)
		.inGroup(systemGroup)
		.addQuery('bodies', {
			with: ['localTransform', 'velocity', 'rigidBody', 'force'],
		})
		.setProcess((queries, deltaTime, ecs) => {
			const config = ecs.getResource('physicsConfig');
			const gx = config.gravity.x;
			const gy = config.gravity.y;

			for (const entity of queries.bodies) {
				const { localTransform, velocity, rigidBody, force } = entity.components;

				// Static bodies: skip entirely
				if (rigidBody.type === 'static') continue;

				// Dynamic bodies: apply gravity, forces, drag
				if (rigidBody.type === 'dynamic') {
					// 1. Gravity
					velocity.x += gx * rigidBody.gravityScale * deltaTime;
					velocity.y += gy * rigidBody.gravityScale * deltaTime;

					// 2. Forces (F = ma → a = F/m)
					if (rigidBody.mass > 0 && rigidBody.mass !== Infinity) {
						velocity.x += (force.x / rigidBody.mass) * deltaTime;
						velocity.y += (force.y / rigidBody.mass) * deltaTime;
					}

					// 3. Drag
					if (rigidBody.drag > 0) {
						const damping = Math.max(0, 1 - rigidBody.drag * deltaTime);
						velocity.x *= damping;
						velocity.y *= damping;
					}
				}

				// Both dynamic and kinematic: integrate position
				localTransform.x += velocity.x * deltaTime;
				localTransform.y += velocity.y * deltaTime;

				// Clear accumulated forces
				force.x = 0;
				force.y = 0;

				ecs.markChanged(entity.id, 'localTransform');
			}
		})
		.and();

	// ==================== Collision System ====================

	const collisionSystem = bundle
		.addSystem('physics2D-collision')
		.setPriority(collisionPriority)
		.inPhase(phase)
		.inGroup(systemGroup);

	if (collisionSystemGroup) {
		collisionSystem.inGroup(collisionSystemGroup);
	}

	collisionSystem
		.addQuery('collidables', {
			with: ['localTransform', 'rigidBody', 'velocity', 'collisionLayer'],
		})
		.setProcess((queries, _deltaTime, ecs) => {
			const colliders: Physics2DColliderInfo[] = [];

			for (const entity of queries.collidables) {
				const { localTransform, rigidBody, velocity, collisionLayer } = entity.components;

				const aabb = ecs.entityManager.getComponent(entity.id, 'aabbCollider');
				const circle = ecs.entityManager.getComponent(entity.id, 'circleCollider');

				if (!aabb && !circle) continue;

				const info: Physics2DColliderInfo = {
					entityId: entity.id,
					x: localTransform.x,
					y: localTransform.y,
					rigidBody,
					velocity,
					layer: collisionLayer.layer,
					collidesWith: collisionLayer.collidesWith,
				};

				if (aabb) {
					info.x += aabb.offsetX ?? 0;
					info.y += aabb.offsetY ?? 0;
					info.aabb = {
						halfWidth: aabb.width / 2,
						halfHeight: aabb.height / 2,
					};
				}

				if (circle) {
					info.x += circle.offsetX ?? 0;
					info.y += circle.offsetY ?? 0;
					info.circle = { radius: circle.radius };
				}

				colliders.push(info);
			}

			const hasSpatial = (ecs as unknown as { hasResource(k: string): boolean }).hasResource('spatialIndex');
			const si = hasSpatial
				? (ecs as unknown as { getResource(k: string): SpatialIndex }).getResource('spatialIndex')
				: null;

			detectCollisions(colliders, si, onPhysicsContact, ecs);
		})
		.and();

	return bundle as Bundle<Physics2DComponentTypes<L>, Physics2DEventTypes, Physics2DResourceTypes, {}, {}, 'physics2D-integration' | 'physics2D-collision', G | CG>;
}
