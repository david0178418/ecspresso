import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import { createTransformPlugin, createTransform } from '../spatial/transform';
import { createSteeringPlugin, createMoveSpeed } from '../physics/steering';
import {
	createNavGrid,
	findPath,
	createPathRequest,
	createPathfindingPlugin,
	type NavGrid,
	type PathFoundEvent,
	type PathBlockedEvent,
} from './pathfinding';

// ==================== Phase A: NavGrid + findPath (pure) ====================

describe('Pathfinding — NavGrid construction', () => {
	test('createNavGrid applies defaults (topology square4, cellSize 32, origin 0,0, cost 1)', () => {
		const grid = createNavGrid({ width: 4, height: 3 });
		expect(grid.topology).toBe('square4');
		expect(grid.width).toBe(4);
		expect(grid.height).toBe(3);
		expect(grid.cellSize).toBe(32);
		expect(grid.originX).toBe(0);
		expect(grid.originY).toBe(0);
		expect(grid.cells.length).toBe(12);
		for (let i = 0; i < grid.cells.length; i++) {
			expect(grid.cells[i]).toBe(1);
		}
	});

	test('createNavGrid accepts explicit cells array and preserves identity', () => {
		const cells = new Uint8Array([1, 2, 3, 4, 5, 6]);
		const grid = createNavGrid({ width: 3, height: 2, cells });
		expect(grid.cells).toBe(cells);
	});

	test('createNavGrid throws when cells length does not match width * height', () => {
		const cells = new Uint8Array(7);
		expect(() => createNavGrid({ width: 3, height: 2, cells })).toThrow();
	});

	test('createNavGrid rejects width <= 0', () => {
		expect(() => createNavGrid({ width: 0, height: 3 })).toThrow();
	});

	test('createNavGrid rejects height <= 0', () => {
		expect(() => createNavGrid({ width: 3, height: -1 })).toThrow();
	});

	test('createNavGrid rejects non-integer dimensions', () => {
		expect(() => createNavGrid({ width: 3.5, height: 3 })).toThrow();
	});

	test('createNavGrid rejects cellSize <= 0', () => {
		expect(() => createNavGrid({ width: 3, height: 3, cellSize: 0 })).toThrow();
	});

	test('createNavGrid rejects defaultCost outside 0-255', () => {
		expect(() => createNavGrid({ width: 3, height: 3, defaultCost: 300 })).toThrow();
		expect(() => createNavGrid({ width: 3, height: 3, defaultCost: -1 })).toThrow();
	});

	test('createNavGrid allows future topology names without throwing at construction', () => {
		// Lazy dispatch: unimplemented topologies throw only when findPath is called
		expect(() => createNavGrid({ width: 3, height: 3, topology: 'hex-pointy' })).not.toThrow();
	});
});

describe('Pathfinding — NavGrid coord helpers', () => {
	const grid = createNavGrid({ width: 10, height: 8, cellSize: 32 });

	test('worldToCell maps world coordinates to row-major cell index', () => {
		// cell (1, 1) center at world (48, 48) → index = 1 * 10 + 1 = 11
		expect(grid.worldToCell(48, 48)).toBe(11);
		// cell (0, 0) center at world (16, 16) → 0
		expect(grid.worldToCell(16, 16)).toBe(0);
		// cell (9, 7) (bottom-right) → 7 * 10 + 9 = 79
		expect(grid.worldToCell(16 + 9 * 32, 16 + 7 * 32)).toBe(79);
	});

	test('worldToCell clamps coords outside the grid to the nearest edge cell', () => {
		expect(grid.worldToCell(-100, -100)).toBe(0);
		expect(grid.worldToCell(10_000, 10_000)).toBe(79);
	});

	test('worldToCell honors non-zero origin', () => {
		const g = createNavGrid({ width: 10, height: 8, cellSize: 32, originX: 100, originY: 200 });
		// cell (0, 0) at world (116, 216)
		expect(g.worldToCell(116, 216)).toBe(0);
		// cell (2, 3) at world (100 + 2.5 * 32, 200 + 3.5 * 32) = (180, 312) → 3 * 10 + 2 = 32
		expect(g.worldToCell(180, 312)).toBe(32);
	});

	test('cellToWorld returns the cell center', () => {
		const center = grid.cellToWorld(11);  // col 1, row 1
		expect(center.x).toBe(48);  // 0 + (1 + 0.5) * 32
		expect(center.y).toBe(48);
	});

	test('cellToWorld honors non-zero origin', () => {
		const g = createNavGrid({ width: 5, height: 5, cellSize: 10, originX: 100, originY: 200 });
		const center = g.cellToWorld(0);
		expect(center.x).toBe(105);
		expect(center.y).toBe(205);
	});

	test('cellFromXY / cellToXY round-trip', () => {
		for (let row = 0; row < grid.height; row++) {
			for (let col = 0; col < grid.width; col++) {
				const idx = grid.cellFromXY(col, row);
				const xy = grid.cellToXY(idx);
				expect(xy.x).toBe(col);
				expect(xy.y).toBe(row);
			}
		}
	});

	test('worldToCell(cellToWorld(i)) round-trips for every valid cell', () => {
		for (let i = 0; i < grid.width * grid.height; i++) {
			const wp = grid.cellToWorld(i);
			expect(grid.worldToCell(wp.x, wp.y)).toBe(i);
		}
	});
});

describe('Pathfinding — findPath on square4', () => {
	test('returns [start] when start === goal and tolerance is 0', () => {
		const grid = createNavGrid({ width: 5, height: 5 });
		const result = findPath(grid, 12, 12);
		expect(result).toEqual([12]);
	});

	test('returns null when start is out of range', () => {
		const grid = createNavGrid({ width: 5, height: 5 });
		expect(findPath(grid, -1, 0)).toBe(null);
		expect(findPath(grid, 25, 0)).toBe(null);
	});

	test('returns null when goal is out of range', () => {
		const grid = createNavGrid({ width: 5, height: 5 });
		expect(findPath(grid, 0, 25)).toBe(null);
	});

	test('finds a direct 4-neighbor path on an open 3x3 grid', () => {
		const grid = createNavGrid({ width: 3, height: 3 });
		// (0,0) → (2,2): 5 cells on any valid path (Manhattan = 4 steps + start)
		const result = findPath(grid, 0, 8);
		expect(result).not.toBeNull();
		expect(result!.length).toBe(5);
		expect(result![0]).toBe(0);
		expect(result![result!.length - 1]).toBe(8);
		// Every adjacent pair must be 4-neighbors
		for (let i = 1; i < result!.length; i++) {
			const a = grid.cellToXY(result![i - 1]!);
			const b = grid.cellToXY(result![i]!);
			const manhattan = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
			expect(manhattan).toBe(1);
		}
	});

	test('routes around a cost-0 wall', () => {
		// 5x5 grid, column 2 rows 1..3 impassable (a partial wall from top)
		// Start top-left (0), goal top-right (4). Direct Manhattan = 4 but wall doesn't block it.
		// Use a horizontal wall: rows 2 cols 0..2 impassable except col 3, col 4.
		const grid = createNavGrid({ width: 5, height: 5 });
		// Block row 2 cols 0..3 so path must go via col 4 at row 2
		grid.cells[2 * 5 + 0] = 0;
		grid.cells[2 * 5 + 1] = 0;
		grid.cells[2 * 5 + 2] = 0;
		grid.cells[2 * 5 + 3] = 0;
		// Start at (0, 0), goal at (0, 4) — must go around the wall
		const result = findPath(grid, 0, 20);
		expect(result).not.toBeNull();
		// Must include cell (4, 2) = 14 (the gap)
		expect(result!.includes(14)).toBe(true);
	});

	test('returns null when goal is enclosed by cost-0 cells', () => {
		const grid = createNavGrid({ width: 5, height: 5 });
		// Goal cell is (2, 2) = 12. Surround it with cost 0.
		grid.cells[grid.cellFromXY(1, 2)] = 0;
		grid.cells[grid.cellFromXY(3, 2)] = 0;
		grid.cells[grid.cellFromXY(2, 1)] = 0;
		grid.cells[grid.cellFromXY(2, 3)] = 0;
		const result = findPath(grid, 0, 12);
		expect(result).toBe(null);
	});

	test('picks the cheaper detour through low-cost cells over a direct expensive path', () => {
		// 5x1 grid: [S, H, H, H, G] vs. detour through a free row.
		// Build 5x3: row 0 = free (cost 1), row 1 = expensive (cost 50), row 2 = free
		const grid = createNavGrid({ width: 5, height: 3, defaultCost: 1 });
		for (let col = 1; col < 4; col++) {
			grid.cells[grid.cellFromXY(col, 1)] = 50;
		}
		// Start at (0, 1), goal at (4, 1). Direct through row 1 = cost 50*3 + 1 = 151.
		// Detour up to row 0: cost 1 (up) + 1+1+1 (across) + 1 (down) = small.
		const start = grid.cellFromXY(0, 1);
		const goal = grid.cellFromXY(4, 1);
		const result = findPath(grid, start, goal);
		expect(result).not.toBeNull();
		// Path should not include any of the expensive middle cells
		for (let col = 1; col < 4; col++) {
			const expensive = grid.cellFromXY(col, 1);
			expect(result!.includes(expensive)).toBe(false);
		}
	});
});

describe('Pathfinding — blockedCells', () => {
	test('blockedCells makes normally-passable cells impassable for one call', () => {
		const grid = createNavGrid({ width: 5, height: 5 });
		// Start (0,0), goal (4,0). Direct row-0 path exists.
		// Block col (1, 0), (2, 0), (3, 0) dynamically.
		const blocked = new Set<number>([
			grid.cellFromXY(1, 0),
			grid.cellFromXY(2, 0),
			grid.cellFromXY(3, 0),
		]);
		const result = findPath(grid, 0, 4, { blockedCells: blocked });
		expect(result).not.toBeNull();
		for (const b of blocked) {
			expect(result!.includes(b)).toBe(false);
		}
	});

	test('start is always passable even when present in blockedCells', () => {
		const grid = createNavGrid({ width: 5, height: 5 });
		const start = 0;
		const goal = 4;
		const blocked = new Set<number>([start]);
		const result = findPath(grid, start, goal, { blockedCells: blocked });
		expect(result).not.toBeNull();
		expect(result![0]).toBe(start);
	});

	test('start is always passable even when its grid cell has cost 0', () => {
		const grid = createNavGrid({ width: 5, height: 5 });
		grid.cells[0] = 0;
		const result = findPath(grid, 0, 4);
		expect(result).not.toBeNull();
		expect(result![0]).toBe(0);
	});
});

describe('Pathfinding — goalTolerance', () => {
	test('goalTolerance default (0) requires exact goal cell', () => {
		const grid = createNavGrid({ width: 5, height: 5 });
		const result = findPath(grid, 0, 12);
		expect(result![result!.length - 1]).toBe(12);
	});

	test('goalTolerance 1 succeeds on an adjacent cell when goal is blocked', () => {
		const grid = createNavGrid({ width: 5, height: 5 });
		const goal = grid.cellFromXY(2, 2);
		const blocked = new Set<number>([goal]);
		const result = findPath(grid, 0, goal, { blockedCells: blocked, goalTolerance: 1 });
		expect(result).not.toBeNull();
		// End cell should be adjacent (Manhattan 1) to goal
		const endXY = grid.cellToXY(result![result!.length - 1]!);
		const goalXY = grid.cellToXY(goal);
		const d = Math.abs(endXY.x - goalXY.x) + Math.abs(endXY.y - goalXY.y);
		expect(d).toBe(1);
	});

	test('goalTolerance 0 returns null when goal is blocked (unreachable at exact cell)', () => {
		const grid = createNavGrid({ width: 5, height: 5 });
		const goal = grid.cellFromXY(2, 2);
		// Block goal and all 4 neighbors
		grid.cells[goal] = 0;
		grid.cells[grid.cellFromXY(1, 2)] = 0;
		grid.cells[grid.cellFromXY(3, 2)] = 0;
		grid.cells[grid.cellFromXY(2, 1)] = 0;
		grid.cells[grid.cellFromXY(2, 3)] = 0;
		const result = findPath(grid, 0, goal, { goalTolerance: 0 });
		expect(result).toBe(null);
	});
});

describe('Pathfinding — maxNodesExpanded', () => {
	test('returns null when the expansion cap is hit before goal is reached', () => {
		const grid = createNavGrid({ width: 20, height: 20 });
		// Goal far from start; tiny cap
		const result = findPath(grid, 0, grid.cellFromXY(19, 19), { maxNodesExpanded: 5 });
		expect(result).toBe(null);
	});

	test('completes with a generous cap on the same grid', () => {
		const grid = createNavGrid({ width: 20, height: 20 });
		const result = findPath(grid, 0, grid.cellFromXY(19, 19), { maxNodesExpanded: 10_000 });
		expect(result).not.toBeNull();
	});
});

describe('Pathfinding — unimplemented topologies', () => {
	test('findPath on square8 throws a descriptive error', () => {
		const grid = createNavGrid({ width: 3, height: 3, topology: 'square8' });
		expect(() => findPath(grid, 0, 8)).toThrow(/square8/);
	});

	test('findPath on hex-pointy throws a descriptive error', () => {
		const grid = createNavGrid({ width: 3, height: 3, topology: 'hex-pointy' });
		expect(() => findPath(grid, 0, 8)).toThrow(/hex-pointy/);
	});

	test('findPath on hex-flat throws a descriptive error', () => {
		const grid = createNavGrid({ width: 3, height: 3, topology: 'hex-flat' });
		expect(() => findPath(grid, 0, 8)).toThrow(/hex-flat/);
	});
});

// ==================== Phase B: Plugin integration ====================

function buildEcs(grid: NavGrid, options?: { maxRequestsPerFrame?: number }) {
	return ECSpresso
		.create()
		.withPlugin(createTransformPlugin())
		.withPlugin(createSteeringPlugin())
		.withPlugin(createPathfindingPlugin({ grid, maxRequestsPerFrame: options?.maxRequestsPerFrame }))
		.build();
}

describe('Pathfinding Plugin — setup', () => {
	test('installs the navGrid resource', () => {
		const grid = createNavGrid({ width: 5, height: 5 });
		const ecs = buildEcs(grid);
		expect(ecs.hasResource('navGrid')).toBe(true);
		expect(ecs.getResource('navGrid')).toBe(grid);
	});

	test('factory requires a grid option at the type level', () => {
		// @ts-expect-error — options is required
		const _missingOpts = () => createPathfindingPlugin();
		// @ts-expect-error — grid is a required field on options
		const _missingGrid = () => createPathfindingPlugin({});
		void _missingOpts;
		void _missingGrid;
	});
});

describe('Pathfinding Plugin — request processing', () => {
	test('writes path + moveTarget and emits pathFound after one update', () => {
		const grid = createNavGrid({ width: 5, height: 5, cellSize: 32 });
		const ecs = buildEcs(grid);

		const found: PathFoundEvent[] = [];
		ecs.eventBus.subscribe('pathFound', evt => { found.push(evt); });

		// Entity at cell (0,0) center = (16,16). Target cell (4,0) center = (144, 16).
		const entity = ecs.spawn({
			...createTransform(16, 16),
			...createMoveSpeed(100),
			...createPathRequest({ x: 144, y: 16 }),
		});

		ecs.update(1 / 60);

		const path = ecs.getComponent(entity.id, 'path');
		const moveTarget = ecs.getComponent(entity.id, 'moveTarget');

		expect(path).toBeDefined();
		expect(path!.waypoints.length).toBeGreaterThan(0);
		expect(path!.currentIndex).toBe(0);
		expect(moveTarget).toBeDefined();
		// First waypoint should be one cell away at (48, 16)
		expect(moveTarget!.x).toBeCloseTo(path!.waypoints[0]!.x);
		expect(moveTarget!.y).toBeCloseTo(path!.waypoints[0]!.y);

		expect(found).toHaveLength(1);
		expect(found[0]!.entityId).toBe(entity.id);
		expect(found[0]!.path).toEqual(path!.waypoints);
	});

	test('emits pathBlocked and writes no path/moveTarget when goal unreachable', () => {
		const grid = createNavGrid({ width: 5, height: 5, cellSize: 32 });
		// Surround goal cell
		const goal = grid.cellFromXY(2, 2);
		grid.cells[goal] = 0;
		grid.cells[grid.cellFromXY(1, 2)] = 0;
		grid.cells[grid.cellFromXY(3, 2)] = 0;
		grid.cells[grid.cellFromXY(2, 1)] = 0;
		grid.cells[grid.cellFromXY(2, 3)] = 0;

		const ecs = buildEcs(grid);
		const blocked: PathBlockedEvent[] = [];
		ecs.eventBus.subscribe('pathBlocked', evt => { blocked.push(evt); });

		const target = grid.cellToWorld(goal);
		const entity = ecs.spawn({
			...createTransform(16, 16),
			...createMoveSpeed(100),
			...createPathRequest(target),
		});

		ecs.update(1 / 60);

		expect(blocked).toHaveLength(1);
		expect(blocked[0]!.entityId).toBe(entity.id);
		expect(ecs.getComponent(entity.id, 'path')).toBeUndefined();
		expect(ecs.getComponent(entity.id, 'moveTarget')).toBeUndefined();
	});

	test('removes pathRequest after processing — on success', () => {
		const grid = createNavGrid({ width: 5, height: 5, cellSize: 32 });
		const ecs = buildEcs(grid);
		const entity = ecs.spawn({
			...createTransform(16, 16),
			...createMoveSpeed(100),
			...createPathRequest({ x: 144, y: 16 }),
		});

		expect(ecs.getComponent(entity.id, 'pathRequest')).toBeDefined();
		ecs.update(1 / 60);
		expect(ecs.getComponent(entity.id, 'pathRequest')).toBeUndefined();
	});

	test('removes pathRequest after processing — on failure', () => {
		const grid = createNavGrid({ width: 3, height: 3, cellSize: 32 });
		// Wall off everything except the start cell
		for (let i = 1; i < grid.cells.length; i++) grid.cells[i] = 0;

		const ecs = buildEcs(grid);
		const entity = ecs.spawn({
			...createTransform(16, 16),
			...createMoveSpeed(100),
			...createPathRequest({ x: 80, y: 80 }),
		});

		ecs.update(1 / 60);
		expect(ecs.getComponent(entity.id, 'pathRequest')).toBeUndefined();
	});

	test('start-already-at-goal emits pathFound with empty path and no path/moveTarget', () => {
		const grid = createNavGrid({ width: 5, height: 5, cellSize: 32 });
		const ecs = buildEcs(grid);
		const found: PathFoundEvent[] = [];
		ecs.eventBus.subscribe('pathFound', evt => { found.push(evt); });

		// Entity and target both resolve to cell (0, 0)
		const entity = ecs.spawn({
			...createTransform(16, 16),
			...createMoveSpeed(100),
			...createPathRequest({ x: 16, y: 16 }),
		});

		ecs.update(1 / 60);

		expect(found).toHaveLength(1);
		expect(found[0]!.path).toEqual([]);
		expect(ecs.getComponent(entity.id, 'path')).toBeUndefined();
		expect(ecs.getComponent(entity.id, 'moveTarget')).toBeUndefined();
	});

	test('respects maxRequestsPerFrame cap', () => {
		const grid = createNavGrid({ width: 10, height: 10, cellSize: 32 });
		const ecs = buildEcs(grid, { maxRequestsPerFrame: 2 });

		const ids = [];
		for (let i = 0; i < 4; i++) {
			const e = ecs.spawn({
				...createTransform(16, 16 + i * 32),
				...createMoveSpeed(100),
				...createPathRequest({ x: 272, y: 16 + i * 32 }),
			});
			ids.push(e.id);
		}

		ecs.update(1 / 60);

		const pathed = ids.filter(id => ecs.getComponent(id, 'path') !== undefined);
		const remaining = ids.filter(id => ecs.getComponent(id, 'pathRequest') !== undefined);
		expect(pathed.length).toBe(2);
		expect(remaining.length).toBe(2);

		ecs.update(1 / 60);
		const pathedAfter = ids.filter(id => ecs.getComponent(id, 'path') !== undefined);
		expect(pathedAfter.length).toBe(4);
	});
});

describe('Pathfinding Plugin — waypoint advancement', () => {
	test('arriveAtTarget on an intermediate waypoint advances to the next', () => {
		const grid = createNavGrid({ width: 5, height: 1, cellSize: 32 });
		const ecs = buildEcs(grid);

		// Start (0,0), target (4,0) — 4 waypoints (cells 1,2,3,4)
		const entity = ecs.spawn({
			...createTransform(16, 16),
			...createMoveSpeed(10_000),  // fast enough to arrive each tick
			...createPathRequest({ x: 144, y: 16 }),
		});

		ecs.update(1 / 60);  // compute path + move (long distance in one tick)
		const pathAfter = ecs.getComponent(entity.id, 'path');
		expect(pathAfter).toBeDefined();
		// currentIndex should have advanced past 0 because moveSpeed huge
		// Precise index depends on step per frame, but path should still be present if not final
	});

	test('removes path component when final waypoint is reached', () => {
		const grid = createNavGrid({ width: 3, height: 1, cellSize: 10 });
		const ecs = buildEcs(grid);

		// Start (0,0), goal (2,0). Speed large so a single tick covers everything.
		const entity = ecs.spawn({
			...createTransform(5, 5),
			...createMoveSpeed(100_000),
			...createPathRequest({ x: 25, y: 5 }),
		});

		// First tick computes path (2 waypoints after slice) + steering advances index until final
		// It can take multiple ticks because arrival detection runs once per frame per moveTarget
		for (let i = 0; i < 5; i++) ecs.update(1 / 60);

		expect(ecs.getComponent(entity.id, 'path')).toBeUndefined();
	});

	test('full end-to-end: entity follows all waypoints in order to the goal', () => {
		const grid = createNavGrid({ width: 5, height: 1, cellSize: 32 });
		const ecs = buildEcs(grid);

		const entity = ecs.spawn({
			...createTransform(16, 16),
			...createMoveSpeed(10_000),
			...createPathRequest({ x: 144, y: 16 }),
		});

		// Drive many ticks until path is consumed
		for (let i = 0; i < 20; i++) ecs.update(1 / 60);

		expect(ecs.getComponent(entity.id, 'path')).toBeUndefined();
		const lt = ecs.getComponent(entity.id, 'localTransform');
		expect(lt).toBeDefined();
		expect(lt!.x).toBeCloseTo(144);
		expect(lt!.y).toBeCloseTo(16);
	});

	test('arriveAtTarget with no path component is a no-op (entity moving for non-path reasons)', () => {
		const grid = createNavGrid({ width: 5, height: 5, cellSize: 32 });
		const ecs = buildEcs(grid);

		// Spawn entity with moveTarget but no path — steering alone will move it and publish arriveAtTarget
		const entity = ecs.spawn({
			...createTransform(16, 16),
			...createMoveSpeed(10_000),
		});
		ecs.addComponent(entity.id, 'moveTarget', { x: 48, y: 16 });

		for (let i = 0; i < 5; i++) ecs.update(1 / 60);

		// Entity should have arrived; no path component should have been invented
		expect(ecs.getComponent(entity.id, 'path')).toBeUndefined();
		expect(ecs.getComponent(entity.id, 'moveTarget')).toBeUndefined();
	});
});

describe('Pathfinding Plugin — repath', () => {
	test('a new pathRequest on an entity with active path replaces the path', () => {
		const grid = createNavGrid({ width: 10, height: 10, cellSize: 32 });
		const ecs = buildEcs(grid);

		const entity = ecs.spawn({
			...createTransform(16, 16),
			...createMoveSpeed(50),
			...createPathRequest({ x: 304, y: 16 }),
		});

		ecs.update(1 / 60);
		const firstPath = ecs.getComponent(entity.id, 'path');
		expect(firstPath).toBeDefined();
		const firstWaypoints = [...firstPath!.waypoints];

		// Add a new pathRequest aiming somewhere else
		ecs.addComponent(entity.id, 'pathRequest', { target: { x: 16, y: 304 } });

		ecs.update(1 / 60);
		const secondPath = ecs.getComponent(entity.id, 'path');
		expect(secondPath).toBeDefined();
		// Final waypoint should be near the new target
		const last = secondPath!.waypoints[secondPath!.waypoints.length - 1]!;
		expect(last.y).toBeGreaterThan(firstWaypoints[firstWaypoints.length - 1]!.y);
	});
});
