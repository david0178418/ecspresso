/**
 * Spatial Index Bundle for ECSpresso
 *
 * Provides a uniform-grid spatial hash for broadphase collision detection
 * and proximity queries. Replaces O(n²) brute-force with O(n·d) where
 * d = local density.
 *
 * Standalone usage: queryRect / queryRadius for proximity queries.
 * Automatic acceleration: collision and physics2D bundles detect the
 * spatialIndex resource at runtime and use it for broadphase when present.
 */

import { Bundle } from 'ecspresso';
import type { SystemPhase } from 'ecspresso';
import type { TransformComponentTypes } from './transform';
import type { CollisionComponentTypes } from './collision';

// ==================== Data Structure ====================

export interface SpatialEntry {
	entityId: number;
	x: number;
	y: number;
	halfW: number;
	halfH: number;
}

export interface SpatialHashGrid {
	cellSize: number;
	invCellSize: number;
	cells: Map<number, number[]>;
	entries: Map<number, SpatialEntry>;
}

// ==================== Pure Functions ====================

/**
 * Hash a cell coordinate pair to a single integer key.
 * Uses large-prime XOR to distribute values.
 */
export function hashCell(cx: number, cy: number): number {
	// Large primes for spatial hashing distribution
	return (cx * 73856093) ^ (cy * 19349663);
}

/**
 * Create a new empty spatial hash grid.
 */
export function createGrid(cellSize: number): SpatialHashGrid {
	return {
		cellSize,
		invCellSize: 1 / cellSize,
		cells: new Map(),
		entries: new Map(),
	};
}

/**
 * Clear all data from the grid without reallocating the Maps.
 */
export function clearGrid(grid: SpatialHashGrid): void {
	grid.cells.clear();
	grid.entries.clear();
}

/**
 * Insert an entity into all overlapping cells of the grid.
 */
export function insertEntity(
	grid: SpatialHashGrid,
	entityId: number,
	x: number,
	y: number,
	halfW: number,
	halfH: number,
): void {
	grid.entries.set(entityId, { entityId, x, y, halfW, halfH });

	const inv = grid.invCellSize;
	const minCX = Math.floor((x - halfW) * inv);
	const maxCX = Math.floor((x + halfW) * inv);
	const minCY = Math.floor((y - halfH) * inv);
	const maxCY = Math.floor((y + halfH) * inv);

	for (let cx = minCX; cx <= maxCX; cx++) {
		for (let cy = minCY; cy <= maxCY; cy++) {
			const key = hashCell(cx, cy);
			const bucket = grid.cells.get(key);
			if (bucket) {
				bucket.push(entityId);
			} else {
				grid.cells.set(key, [entityId]);
			}
		}
	}
}

/**
 * Collect entity IDs from all cells overlapping the given rectangle.
 */
export function gridQueryRect(
	grid: SpatialHashGrid,
	minX: number,
	minY: number,
	maxX: number,
	maxY: number,
	result: Set<number>,
): void {
	const inv = grid.invCellSize;
	const minCX = Math.floor(minX * inv);
	const maxCX = Math.floor(maxX * inv);
	const minCY = Math.floor(minY * inv);
	const maxCY = Math.floor(maxY * inv);

	for (let cx = minCX; cx <= maxCX; cx++) {
		for (let cy = minCY; cy <= maxCY; cy++) {
			const bucket = grid.cells.get(hashCell(cx, cy));
			if (!bucket) continue;
			for (let i = 0; i < bucket.length; i++) {
				result.add(bucket[i]!);
			}
		}
	}
}

/**
 * Collect entity IDs within a circle. Uses rect broadphase then
 * AABB-to-point distance filter.
 */
export function gridQueryRadius(
	grid: SpatialHashGrid,
	cx: number,
	cy: number,
	radius: number,
	result: Set<number>,
): void {
	// Broadphase: rect query for bounding box of circle
	const candidates = _radiusCandidates;
	candidates.clear();
	gridQueryRect(grid, cx - radius, cy - radius, cx + radius, cy + radius, candidates);

	const rSq = radius * radius;

	for (const entityId of candidates) {
		const entry = grid.entries.get(entityId);
		if (!entry) continue;

		// Closest point on entity AABB to query center
		const closestX = Math.max(entry.x - entry.halfW, Math.min(cx, entry.x + entry.halfW));
		const closestY = Math.max(entry.y - entry.halfH, Math.min(cy, entry.y + entry.halfH));
		const dx = cx - closestX;
		const dy = cy - closestY;

		if (dx * dx + dy * dy <= rSq) {
			result.add(entityId);
		}
	}
}

// Module-scoped reusable sets to reduce GC pressure
const _radiusCandidates = new Set<number>();
const _reusableQuerySet = new Set<number>();

// ==================== Resource API ====================

export interface SpatialIndex {
	readonly grid: SpatialHashGrid;
	queryRect(minX: number, minY: number, maxX: number, maxY: number): number[];
	queryRectInto(minX: number, minY: number, maxX: number, maxY: number, result: Set<number>): void;
	queryRadius(cx: number, cy: number, radius: number): number[];
	queryRadiusInto(cx: number, cy: number, radius: number, result: Set<number>): void;
	getEntry(entityId: number): SpatialEntry | undefined;
}

export interface SpatialIndexResourceTypes {
	spatialIndex: SpatialIndex;
}

function createSpatialIndexResource(grid: SpatialHashGrid): SpatialIndex {
	return {
		grid,
		queryRect(minX: number, minY: number, maxX: number, maxY: number): number[] {
			_reusableQuerySet.clear();
			gridQueryRect(grid, minX, minY, maxX, maxY, _reusableQuerySet);
			return Array.from(_reusableQuerySet);
		},
		queryRectInto(minX: number, minY: number, maxX: number, maxY: number, result: Set<number>): void {
			gridQueryRect(grid, minX, minY, maxX, maxY, result);
		},
		queryRadius(cx: number, cy: number, radius: number): number[] {
			_reusableQuerySet.clear();
			gridQueryRadius(grid, cx, cy, radius, _reusableQuerySet);
			return Array.from(_reusableQuerySet);
		},
		queryRadiusInto(cx: number, cy: number, radius: number, result: Set<number>): void {
			gridQueryRadius(grid, cx, cy, radius, result);
		},
		getEntry(entityId: number): SpatialEntry | undefined {
			return grid.entries.get(entityId);
		},
	};
}

// ==================== Component Types ====================

type SpatialIndexComponentTypes =
	TransformComponentTypes & Pick<CollisionComponentTypes<string>, 'aabbCollider' | 'circleCollider'>;

// ==================== Bundle Options ====================

export type SpatialIndexPhase = 'fixedUpdate' | 'postUpdate';

export interface SpatialIndexBundleOptions {
	/** Cell size for the spatial hash grid (default: 64) */
	cellSize?: number;
	/** System group name (default: 'spatialIndex') */
	systemGroup?: string;
	/** Priority for rebuild systems (default: 2000, before collision) */
	priority?: number;
	/** Phases to register rebuild systems in (default: ['fixedUpdate', 'postUpdate']) */
	phases?: ReadonlyArray<SpatialIndexPhase>;
}

// ==================== Bundle Factory ====================

/**
 * Create a spatial index bundle for ECSpresso.
 *
 * Provides a uniform-grid spatial hash that accelerates collision detection.
 * When installed alongside the collision or physics2D bundles, they
 * automatically use the spatial index for broadphase instead of O(n²)
 * brute-force.
 *
 * Also provides proximity query methods for game logic (e.g. "find all
 * enemies within 200 units").
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso.create()
 *   .withBundle(createTransformBundle())
 *   .withBundle(createCollisionBundle({ layers }))
 *   .withBundle(createSpatialIndexBundle({ cellSize: 128 }))
 *   .build();
 *
 * // Proximity query in a system:
 * const si = ecs.getResource('spatialIndex');
 * const nearby = si.queryRadius(playerX, playerY, 200);
 * ```
 */
export function createSpatialIndexBundle(
	options?: SpatialIndexBundleOptions,
): Bundle<SpatialIndexComponentTypes, {}, SpatialIndexResourceTypes> {
	const {
		cellSize = 64,
		systemGroup = 'spatialIndex',
		priority = 2000,
		phases = ['fixedUpdate', 'postUpdate'] as const,
	} = options ?? {};

	const grid = createGrid(cellSize);
	const resource = createSpatialIndexResource(grid);

	const bundle = new Bundle<SpatialIndexComponentTypes, {}, SpatialIndexResourceTypes>('spatialIndex');

	bundle.addResource('spatialIndex', resource);

	// Register a rebuild system for each requested phase
	for (const phase of phases) {
		const transformComponent = phase === 'fixedUpdate' ? 'localTransform' : 'worldTransform';

		bundle
			.addSystem(`spatial-index-rebuild-${phase}`)
			.setPriority(priority)
			.inPhase(phase as SystemPhase)
			.inGroup(systemGroup)
			.addQuery('transforms', {
				with: [transformComponent],
			})
			.setProcess((queries, _deltaTime, ecs) => {
				clearGrid(grid);

				for (const entity of queries.transforms) {
					const transform = entity.components[transformComponent];
					const aabb = ecs.entityManager.getComponent(entity.id, 'aabbCollider');
					const circle = ecs.entityManager.getComponent(entity.id, 'circleCollider');

					// Only insert entities that have a collider
					if (!aabb && !circle) continue;

					let x = transform.x;
					let y = transform.y;
					let halfW = 0;
					let halfH = 0;

					if (aabb) {
						x += aabb.offsetX ?? 0;
						y += aabb.offsetY ?? 0;
						halfW = aabb.width / 2;
						halfH = aabb.height / 2;
					}

					if (circle) {
						x += circle.offsetX ?? 0;
						y += circle.offsetY ?? 0;
						// Circle: use radius as half-extent in both dimensions
						halfW = Math.max(halfW, circle.radius);
						halfH = Math.max(halfH, circle.radius);
					}

					insertEntity(grid, entity.id, x, y, halfW, halfH);
				}
			})
			.and();
	}

	return bundle;
}
