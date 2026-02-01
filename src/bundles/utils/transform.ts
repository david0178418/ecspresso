/**
 * Transform Bundle for ECSpresso
 *
 * Provides hierarchical transform propagation following Bevy's Transform/GlobalTransform pattern.
 * LocalTransform is modified by user code; WorldTransform is computed automatically.
 *
 * @see https://docs.rs/bevy/latest/bevy/transform/components/struct.GlobalTransform.html
 */

import { Bundle } from 'ecspresso';
import type { SystemPhase } from 'ecspresso';
import type ECSpresso from 'ecspresso';

// ==================== Component Types ====================

/**
 * Local transform relative to parent (or world if no parent).
 * This is the transform you modify directly.
 */
export interface LocalTransform {
	x: number;
	y: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
}

/**
 * Computed world transform (accumulated from parent chain).
 * Read-only - managed by the transform propagation system.
 */
export interface WorldTransform {
	x: number;
	y: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
}

/**
 * Component types provided by the transform bundle.
 * Extend your component types with this interface.
 *
 * @example
 * ```typescript
 * interface GameComponents extends TransformComponentTypes {
 *   sprite: Sprite;
 *   velocity: { x: number; y: number };
 * }
 * ```
 */
export interface TransformComponentTypes {
	localTransform: LocalTransform;
	worldTransform: WorldTransform;
}

// ==================== Bundle Options ====================

/**
 * Configuration options for the transform bundle.
 */
export interface TransformBundleOptions {
	/** System group name (default: 'transform') */
	systemGroup?: string;
	/** Priority for transform propagation (default: 500, runs after physics) */
	priority?: number;
	/** Execution phase (default: 'postUpdate') */
	phase?: SystemPhase;
}

// ==================== Default Values ====================

/**
 * Default local transform values.
 */
export const DEFAULT_LOCAL_TRANSFORM: Readonly<LocalTransform> = {
	x: 0,
	y: 0,
	rotation: 0,
	scaleX: 1,
	scaleY: 1,
};

/**
 * Default world transform values.
 */
export const DEFAULT_WORLD_TRANSFORM: Readonly<WorldTransform> = {
	x: 0,
	y: 0,
	rotation: 0,
	scaleX: 1,
	scaleY: 1,
};

// ==================== Helper Functions ====================

/**
 * Create a local transform component with position only.
 * Uses default rotation (0) and scale (1, 1).
 *
 * @param x The x coordinate
 * @param y The y coordinate
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * ecs.spawn({
 *   ...createLocalTransform(100, 200),
 *   sprite,
 * });
 * ```
 */
export function createLocalTransform(x: number, y: number): Pick<TransformComponentTypes, 'localTransform'> {
	return {
		localTransform: {
			x,
			y,
			rotation: 0,
			scaleX: 1,
			scaleY: 1,
		},
	};
}

/**
 * Create a world transform component with position only.
 * Typically used alongside createLocalTransform for initial state.
 *
 * @param x The x coordinate
 * @param y The y coordinate
 * @returns Component object suitable for spreading into spawn()
 */
export function createWorldTransform(x: number, y: number): Pick<TransformComponentTypes, 'worldTransform'> {
	return {
		worldTransform: {
			x,
			y,
			rotation: 0,
			scaleX: 1,
			scaleY: 1,
		},
	};
}

/**
 * Options for creating a full transform.
 */
export interface TransformOptions {
	rotation?: number;
	scaleX?: number;
	scaleY?: number;
	/** Uniform scale (overrides scaleX/scaleY if provided) */
	scale?: number;
}

/**
 * Create both local and world transform components.
 * World transform is initialized to match local transform.
 *
 * @param x The x coordinate
 * @param y The y coordinate
 * @param options Optional rotation and scale
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * ecs.spawn({
 *   ...createTransform(100, 200),
 *   sprite,
 * });
 *
 * // With rotation and scale
 * ecs.spawn({
 *   ...createTransform(100, 200, { rotation: Math.PI / 4, scale: 2 }),
 *   sprite,
 * });
 * ```
 */
export function createTransform(
	x: number,
	y: number,
	options?: TransformOptions
): TransformComponentTypes {
	const scaleX = options?.scale ?? options?.scaleX ?? 1;
	const scaleY = options?.scale ?? options?.scaleY ?? 1;
	const rotation = options?.rotation ?? 0;

	const transform = {
		x,
		y,
		rotation,
		scaleX,
		scaleY,
	};

	return {
		localTransform: { ...transform },
		worldTransform: { ...transform },
	};
}

// ==================== Bundle Factory ====================

/**
 * Create a transform bundle for ECSpresso.
 *
 * This bundle provides:
 * - Transform propagation system that computes world transforms from local transforms
 * - Parent-first traversal ensures parents are processed before children
 * - Supports full transform hierarchy (position, rotation, scale)
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso
 *   .create<Components, Events, Resources>()
 *   .withBundle(createTransformBundle())
 *   .withBundle(createPhysicsBundle())
 *   .build();
 *
 * // Spawn entity with transform
 * ecs.spawn({
 *   ...createTransform(100, 200),
 *   velocity: { x: 50, y: 0 },
 * });
 * ```
 */
export function createTransformBundle(
	options?: TransformBundleOptions
): Bundle<TransformComponentTypes> {
	const {
		systemGroup = 'transform',
		priority = 500,
		phase = 'postUpdate',
	} = options ?? {};

	const bundle = new Bundle<TransformComponentTypes, {}, {}>('transform');

	bundle
		.addSystem('transform-propagation')
		.setPriority(priority)
		.inPhase(phase)
		.inGroup(systemGroup)
		.setProcess((_queries, _deltaTime, ecs) => {
			propagateTransforms(ecs);
		})
		.and();

	return bundle;
}

/**
 * Propagate transforms through the hierarchy.
 * Parent-first traversal ensures parents are computed before children.
 *
 * Only recomputes entities whose localTransform changed since this system
 * last ran, or whose parent's worldTransform changed (cascade).
 * Uses per-system monotonic sequence threshold for change detection.
 */
function propagateTransforms(ecs: ECSpresso<TransformComponentTypes>): void {
	const threshold = ecs.changeThreshold;
	const em = ecs.entityManager;

	// Use parent-first traversal for entities in hierarchy
	ecs.forEachInHierarchy((entityId, parentId) => {
		const localTransform = em.getComponent(entityId, 'localTransform');
		const worldTransform = em.getComponent(entityId, 'worldTransform');

		if (!localTransform || !worldTransform) return;

		const localChanged = em.getChangeSeq(entityId, 'localTransform') > threshold;
		const parentWorldChanged = parentId !== null
			&& em.getChangeSeq(parentId, 'worldTransform') > threshold;

		if (!localChanged && !parentWorldChanged) return;

		if (parentId === null) {
			// Root entity: world transform equals local transform
			copyTransform(localTransform, worldTransform);
		} else {
			// Child entity: combine with parent's world transform
			const parentWorld = em.getComponent(parentId, 'worldTransform');
			if (parentWorld) {
				combineTransforms(parentWorld, localTransform, worldTransform);
			} else {
				// Parent has no world transform, treat as root
				copyTransform(localTransform, worldTransform);
			}
		}

		ecs.markChanged(entityId, 'worldTransform');
	});

	// Process orphaned entities (not in hierarchy but have transforms)
	const orphanedEntities = ecs.getEntitiesWithQuery(['localTransform', 'worldTransform']);
	for (const entity of orphanedEntities) {
		const parentId = ecs.getParent(entity.id);
		// Only process if truly orphaned (no parent and not a root with children)
		if (parentId === null && ecs.getChildren(entity.id).length === 0) {
			const localChanged = em.getChangeSeq(entity.id, 'localTransform') > threshold;
			if (!localChanged) continue;

			const { localTransform, worldTransform } = entity.components;
			copyTransform(localTransform, worldTransform);
			ecs.markChanged(entity.id, 'worldTransform');
		}
	}
}

/**
 * Copy transform values from source to destination.
 */
function copyTransform(src: LocalTransform, dest: WorldTransform): void {
	dest.x = src.x;
	dest.y = src.y;
	dest.rotation = src.rotation;
	dest.scaleX = src.scaleX;
	dest.scaleY = src.scaleY;
}

/**
 * Combine parent world transform with child local transform into child world transform.
 */
function combineTransforms(
	parent: WorldTransform,
	local: LocalTransform,
	world: WorldTransform
): void {
	// Apply parent's scale to local position
	const scaledLocalX = local.x * parent.scaleX;
	const scaledLocalY = local.y * parent.scaleY;

	// Rotate local position by parent's rotation
	const cos = Math.cos(parent.rotation);
	const sin = Math.sin(parent.rotation);
	const rotatedX = scaledLocalX * cos - scaledLocalY * sin;
	const rotatedY = scaledLocalX * sin + scaledLocalY * cos;

	// Add to parent's position
	world.x = parent.x + rotatedX;
	world.y = parent.y + rotatedY;
	world.rotation = parent.rotation + local.rotation;
	world.scaleX = parent.scaleX * local.scaleX;
	world.scaleY = parent.scaleY * local.scaleY;
}
