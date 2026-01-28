/**
 * Collision Bundle for ECSpresso
 *
 * Provides layer-based collision detection with events.
 * Uses worldTransform for position (world-space collision).
 * Supports AABB and circle colliders.
 */

import Bundle from '../../bundle';
import type { TransformComponentTypes } from './transform';

// ==================== Component Types ====================

/**
 * Axis-Aligned Bounding Box collider.
 */
export interface AABBCollider {
	/** Width of the bounding box */
	width: number;
	/** Height of the bounding box */
	height: number;
	/** X offset from entity position (default: 0) */
	offsetX?: number;
	/** Y offset from entity position (default: 0) */
	offsetY?: number;
}

/**
 * Circle collider.
 */
export interface CircleCollider {
	/** Radius of the circle */
	radius: number;
	/** X offset from entity position (default: 0) */
	offsetX?: number;
	/** Y offset from entity position (default: 0) */
	offsetY?: number;
}

/**
 * Collision layer configuration.
 */
export interface CollisionLayer {
	/** The layer this entity belongs to */
	layer: string;
	/** Layers this entity can collide with */
	collidesWith: readonly string[];
}

/**
 * Component types provided by the collision bundle.
 * Extend your component types with this interface.
 *
 * @example
 * ```typescript
 * interface GameComponents extends TransformComponentTypes, CollisionComponentTypes {
 *   sprite: Sprite;
 *   enemy: boolean;
 * }
 * ```
 */
export interface CollisionComponentTypes {
	aabbCollider: AABBCollider;
	circleCollider: CircleCollider;
	collisionLayer: CollisionLayer;
}

// ==================== Event Types ====================

/**
 * Event fired when two entities collide.
 */
export interface CollisionEvent {
	/** First entity in the collision */
	entityA: number;
	/** Second entity in the collision */
	entityB: number;
	/** Layer of the first entity */
	layerA: string;
	/** Layer of the second entity */
	layerB: string;
}

/**
 * Event types provided by the collision bundle.
 */
export interface CollisionEventTypes {
	collision: CollisionEvent;
}

// ==================== Bundle Options ====================

/**
 * Configuration options for the collision bundle.
 */
export interface CollisionBundleOptions {
	/** System group name (default: 'physics') */
	systemGroup?: string;
	/** Priority for collision system (default: 0) */
	priority?: number;
	/** Name of the collision event (default: 'collision') */
	collisionEventName?: string;
}

// ==================== Helper Functions ====================

/**
 * Create an AABB collider component.
 *
 * @param width Width of the bounding box
 * @param height Height of the bounding box
 * @param offsetX X offset from entity position
 * @param offsetY Y offset from entity position
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * ecs.spawn({
 *   ...createTransform(100, 200),
 *   ...createAABBCollider(50, 30),
 * });
 * ```
 */
export function createAABBCollider(
	width: number,
	height: number,
	offsetX?: number,
	offsetY?: number
): Pick<CollisionComponentTypes, 'aabbCollider'> {
	const collider: AABBCollider = { width, height };
	if (offsetX !== undefined) collider.offsetX = offsetX;
	if (offsetY !== undefined) collider.offsetY = offsetY;
	return { aabbCollider: collider };
}

/**
 * Create a circle collider component.
 *
 * @param radius Radius of the circle
 * @param offsetX X offset from entity position
 * @param offsetY Y offset from entity position
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * ecs.spawn({
 *   ...createTransform(100, 200),
 *   ...createCircleCollider(25),
 * });
 * ```
 */
export function createCircleCollider(
	radius: number,
	offsetX?: number,
	offsetY?: number
): Pick<CollisionComponentTypes, 'circleCollider'> {
	const collider: CircleCollider = { radius };
	if (offsetX !== undefined) collider.offsetX = offsetX;
	if (offsetY !== undefined) collider.offsetY = offsetY;
	return { circleCollider: collider };
}

/**
 * Create a collision layer component.
 *
 * @param layer The layer this entity belongs to
 * @param collidesWith Layers this entity can collide with
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * ecs.spawn({
 *   ...createTransform(100, 200),
 *   ...createAABBCollider(50, 30),
 *   ...createCollisionLayer('player', ['enemy', 'obstacle']),
 * });
 * ```
 */
export function createCollisionLayer(
	layer: string,
	collidesWith: readonly string[]
): Pick<CollisionComponentTypes, 'collisionLayer'> {
	return {
		collisionLayer: { layer, collidesWith },
	};
}

/**
 * Layer factory result from defineCollisionLayers.
 */
export type LayerFactories<T extends Record<string, readonly string[]>> = {
	[K in keyof T]: () => Pick<CollisionComponentTypes, 'collisionLayer'>;
};

/**
 * Define collision layer relationships and get factory functions.
 *
 * @param rules Object mapping layer names to arrays of layers they collide with
 * @returns Object with factory functions for each layer
 *
 * @example
 * ```typescript
 * const layers = defineCollisionLayers({
 *   player: ['enemy', 'enemyProjectile'],
 *   playerProjectile: ['enemy'],
 *   enemy: ['playerProjectile'],
 *   enemyProjectile: ['player'],
 * });
 *
 * // Usage
 * ecs.spawn({
 *   ...createTransform(100, 200),
 *   ...createAABBCollider(50, 30),
 *   ...layers.player(),
 * });
 * ```
 */
export function defineCollisionLayers<T extends Record<string, readonly string[]>>(
	rules: T
): LayerFactories<T> {
	const factories = {} as LayerFactories<T>;

	for (const layer of Object.keys(rules) as Array<keyof T & string>) {
		const collidesWith = rules[layer] as readonly string[];
		factories[layer] = () => createCollisionLayer(layer, collidesWith);
	}

	return factories;
}

// ==================== Internal Types ====================

type CombinedComponentTypes = CollisionComponentTypes & TransformComponentTypes;

interface ColliderInfo {
	entityId: number;
	x: number;
	y: number;
	layer: string;
	collidesWith: readonly string[];
	aabb?: { halfWidth: number; halfHeight: number };
	circle?: { radius: number };
}

// ==================== Bundle Factory ====================

/**
 * Create a collision bundle for ECSpresso.
 *
 * This bundle provides:
 * - O(n²) collision detection between entities with colliders
 * - AABB-AABB, circle-circle, and AABB-circle collision
 * - Layer-based filtering for collision pairs
 * - Deduplication of A-B / B-A collisions
 *
 * Uses worldTransform for position (world-space collision detection).
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso
 *   .create<Components, Events, Resources>()
 *   .withBundle(createTransformBundle())
 *   .withBundle(createCollisionBundle())
 *   .build();
 *
 * // Entity with collision
 * ecs.spawn({
 *   ...createTransform(100, 200),
 *   ...createAABBCollider(50, 30),
 *   ...createCollisionLayer('player', ['enemy']),
 * });
 * ```
 */
export function createCollisionBundle(
	options?: CollisionBundleOptions
): Bundle<CombinedComponentTypes, CollisionEventTypes, {}> {
	const {
		systemGroup = 'physics',
		priority = 0,
	} = options ?? {};

	const bundle = new Bundle<CombinedComponentTypes, CollisionEventTypes, {}>('collision');

	bundle
		.addSystem('collision-detection')
		.setPriority(priority)
		.inGroup(systemGroup)
		.addQuery('collidables', {
			with: ['worldTransform', 'collisionLayer'] as const,
		})
		.setProcess((queries, _deltaTime, ecs) => {
			// Build list of collidable entities with their computed positions
			const colliders: ColliderInfo[] = [];

			for (const entity of queries.collidables) {
				const { worldTransform, collisionLayer } = entity.components;

				// Get collider info
				const aabb = ecs.entityManager.getComponent(entity.id, 'aabbCollider') as AABBCollider | null;
				const circle = ecs.entityManager.getComponent(entity.id, 'circleCollider') as CircleCollider | null;

				// Must have at least one collider
				if (!aabb && !circle) continue;

				const info: ColliderInfo = {
					entityId: entity.id,
					x: worldTransform.x,
					y: worldTransform.y,
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

			// Track processed pairs to avoid duplicates
			const processedPairs = new Set<string>();

			// O(n²) collision detection
			for (let i = 0; i < colliders.length; i++) {
				const a = colliders[i];
				if (!a) continue;

				for (let j = i + 1; j < colliders.length; j++) {
					const b = colliders[j];
					if (!b) continue;

					// Check layer compatibility (A→B or B→A)
					const aCollidesWithB = a.collidesWith.includes(b.layer);
					const bCollidesWithA = b.collidesWith.includes(a.layer);

					if (!aCollidesWithB && !bCollidesWithA) continue;

					// Create unique pair key
					const pairKey = a.entityId < b.entityId
						? `${a.entityId}:${b.entityId}`
						: `${b.entityId}:${a.entityId}`;

					if (processedPairs.has(pairKey)) continue;

					// Check collision based on collider types
					const colliding = checkCollision(a, b);

					if (colliding) {
						processedPairs.add(pairKey);
						ecs.eventBus.publish('collision', {
							entityA: a.entityId,
							entityB: b.entityId,
							layerA: a.layer,
							layerB: b.layer,
						});
					}
				}
			}
		})
		.and();

	return bundle;
}

/**
 * Check if two colliders are overlapping.
 */
function checkCollision(a: ColliderInfo, b: ColliderInfo): boolean {
	// AABB vs AABB
	if (a.aabb && b.aabb) {
		return aabbVsAabb(
			a.x, a.y, a.aabb.halfWidth, a.aabb.halfHeight,
			b.x, b.y, b.aabb.halfWidth, b.aabb.halfHeight
		);
	}

	// Circle vs Circle
	if (a.circle && b.circle) {
		return circleVsCircle(
			a.x, a.y, a.circle.radius,
			b.x, b.y, b.circle.radius
		);
	}

	// AABB vs Circle
	if (a.aabb && b.circle) {
		return aabbVsCircle(
			a.x, a.y, a.aabb.halfWidth, a.aabb.halfHeight,
			b.x, b.y, b.circle.radius
		);
	}

	if (a.circle && b.aabb) {
		return aabbVsCircle(
			b.x, b.y, b.aabb.halfWidth, b.aabb.halfHeight,
			a.x, a.y, a.circle.radius
		);
	}

	return false;
}

/**
 * AABB vs AABB collision test.
 */
function aabbVsAabb(
	ax: number, ay: number, aHalfWidth: number, aHalfHeight: number,
	bx: number, by: number, bHalfWidth: number, bHalfHeight: number
): boolean {
	const dx = Math.abs(ax - bx);
	const dy = Math.abs(ay - by);
	return dx < (aHalfWidth + bHalfWidth) && dy < (aHalfHeight + bHalfHeight);
}

/**
 * Circle vs Circle collision test.
 */
function circleVsCircle(
	ax: number, ay: number, aRadius: number,
	bx: number, by: number, bRadius: number
): boolean {
	const dx = ax - bx;
	const dy = ay - by;
	const distSq = dx * dx + dy * dy;
	const radiusSum = aRadius + bRadius;
	return distSq < radiusSum * radiusSum;
}

/**
 * AABB vs Circle collision test.
 */
function aabbVsCircle(
	aabbX: number, aabbY: number, halfWidth: number, halfHeight: number,
	circleX: number, circleY: number, radius: number
): boolean {
	// Find the closest point on the AABB to the circle center
	const closestX = Math.max(aabbX - halfWidth, Math.min(circleX, aabbX + halfWidth));
	const closestY = Math.max(aabbY - halfHeight, Math.min(circleY, aabbY + halfHeight));

	// Calculate distance from closest point to circle center
	const dx = circleX - closestX;
	const dy = circleY - closestY;
	const distSq = dx * dx + dy * dy;

	return distSq < radius * radius;
}
