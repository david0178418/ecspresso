/**
 * Movement Bundle for ECSpresso
 *
 * Provides velocity → position integration for entities with both components.
 * Follows the "data, not callbacks" philosophy with simple position updates.
 */

import Bundle from '../../bundle';

// ==================== Component Types ====================

/**
 * Position component data structure.
 */
export interface Position {
	x: number;
	y: number;
}

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
 * interface GameComponents extends MovementComponentTypes {
 *   sprite: Sprite;
 *   player: boolean;
 * }
 * ```
 */
export interface MovementComponentTypes {
	position: Position;
	velocity: Velocity;
}

// ==================== Bundle Options ====================

/**
 * Configuration options for the movement bundle.
 */
export interface MovementBundleOptions {
	/** System group name (default: 'physics') */
	systemGroup?: string;
	/** Priority for movement update system (default: 100) */
	priority?: number;
}

// ==================== Helper Functions ====================

/**
 * Create a position component.
 *
 * @param x The x coordinate
 * @param y The y coordinate
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * ecs.spawn({
 *   ...createPosition(100, 200),
 *   sprite,
 * });
 * ```
 */
export function createPosition(x: number, y: number): Pick<MovementComponentTypes, 'position'> {
	return {
		position: { x, y },
	};
}

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

/**
 * Create both position and velocity components.
 *
 * @param x The x coordinate
 * @param y The y coordinate
 * @param vx The x velocity (default: 0)
 * @param vy The y velocity (default: 0)
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * ecs.spawn({
 *   ...createMovable(100, 200, 50, -25),
 *   sprite,
 *   projectile: true,
 * });
 * ```
 */
export function createMovable(
	x: number,
	y: number,
	vx: number = 0,
	vy: number = 0
): MovementComponentTypes {
	return {
		position: { x, y },
		velocity: { x: vx, y: vy },
	};
}

// ==================== Bundle Factory ====================

/**
 * Create a movement bundle for ECSpresso.
 *
 * This bundle provides:
 * - Movement update system that integrates velocity into position
 * - Processes all entities with both position and velocity components
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso
 *   .create<Components, Events, Resources>()
 *   .withBundle(createMovementBundle())
 *   .build();
 *
 * // Spawn entity with movement
 * ecs.spawn({
 *   ...createMovable(100, 200, 50, -25),
 *   sprite,
 * });
 * ```
 */
export function createMovementBundle(
	options?: MovementBundleOptions
): Bundle<MovementComponentTypes, {}, {}> {
	const {
		systemGroup = 'physics',
		priority = 100,
	} = options ?? {};

	const bundle = new Bundle<MovementComponentTypes, {}, {}>('movement');

	bundle
		.addSystem('movement')
		.setPriority(priority)
		.inGroup(systemGroup)
		.addQuery('movingEntities', {
			with: ['position', 'velocity'] as const,
		})
		.setProcess((queries, deltaTime) => {
			for (const entity of queries.movingEntities) {
				const { position, velocity } = entity.components;
				position.x += velocity.x * deltaTime;
				position.y += velocity.y * deltaTime;
			}
		})
		.and();

	return bundle;
}
