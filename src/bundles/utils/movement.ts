/**
 * Movement Bundle for ECSpresso
 *
 * Provides velocity → localTransform integration for entities.
 * Works with the transform bundle's localTransform/worldTransform system.
 */

import Bundle from '../../bundle';
import type { TransformComponentTypes } from './transform';

// ==================== Component Types ====================

/**
 * Velocity component data structure.
 */
export interface Velocity {
	x: number;
	y: number;
}

/**
 * Component types provided by the movement bundle.
 * Extend your component types with this interface.
 *
 * @example
 * ```typescript
 * interface GameComponents extends TransformComponentTypes, MovementComponentTypes {
 *   sprite: Sprite;
 *   player: boolean;
 * }
 * ```
 */
export interface MovementComponentTypes extends TransformComponentTypes {
	velocity: Velocity;
}

// ==================== Bundle Options ====================

/**
 * Configuration options for the movement bundle.
 */
export interface MovementBundleOptions {
	/** System group name (default: 'physics') */
	systemGroup?: string;
	/** Priority for movement update system (default: 1000, runs early before transform propagation) */
	priority?: number;
}

// ==================== Helper Functions ====================

/**
 * Create a velocity component.
 *
 * @param x The x velocity
 * @param y The y velocity
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * ecs.spawn({
 *   ...createTransform(100, 200),
 *   ...createVelocity(50, -25),
 *   projectile: true,
 * });
 * ```
 */
export function createVelocity(x: number, y: number): Pick<MovementComponentTypes, 'velocity'> {
	return {
		velocity: { x, y },
	};
}

// ==================== Bundle Factory ====================

/**
 * Create a movement bundle for ECSpresso.
 *
 * This bundle provides:
 * - Movement update system that integrates velocity into localTransform
 * - Processes all entities with both localTransform and velocity components
 *
 * Note: This bundle modifies localTransform. The transform bundle's propagation
 * system will then compute worldTransform for use by other systems.
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso
 *   .create<Components, Events, Resources>()
 *   .withBundle(createTransformBundle())
 *   .withBundle(createMovementBundle())
 *   .build();
 *
 * // Spawn entity with movement
 * ecs.spawn({
 *   ...createTransform(100, 200),
 *   ...createVelocity(50, -25),
 *   sprite,
 * });
 * ```
 */
export function createMovementBundle(
	options?: MovementBundleOptions
): Bundle<MovementComponentTypes, {}, {}> {
	const {
		systemGroup = 'physics',
		priority = 1000,
	} = options ?? {};

	const bundle = new Bundle<MovementComponentTypes, {}, {}>('movement');

	bundle
		.addSystem('movement')
		.setPriority(priority)
		.inGroup(systemGroup)
		.addQuery('movingEntities', {
			with: ['localTransform', 'velocity'] as const,
		})
		.setProcess((queries, deltaTime) => {
			for (const entity of queries.movingEntities) {
				const { localTransform, velocity } = entity.components;
				localTransform.x += velocity.x * deltaTime;
				localTransform.y += velocity.y * deltaTime;
			}
		})
		.and();

	return bundle;
}
