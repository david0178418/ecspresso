import { describe, test, expect } from 'bun:test';
import {
	computeAABBvsAABB,
	computeCircleVsCircle,
	computeAABBvsCircle,
	computeContact,
	detectCollisions,
	type Contact,
	type BaseColliderInfo,
} from './narrowphase';

// ==================== AABB vs AABB ====================

describe('computeAABBvsAABB', () => {
	test('overlapping AABBs return contact with correct depth', () => {
		// Two 20x20 AABBs, 15 apart on x axis → overlap of 5 on x, 20 on y
		const contact = computeAABBvsAABB(0, 0, 10, 10, 15, 0, 10, 10);
		expect(contact).not.toBeNull();
		// Minimum penetration axis is x (5 < 20)
		expect(contact!.depth).toBeCloseTo(5);
		// Normal points from A toward B (positive x)
		expect(contact!.normalX).toBe(1);
		expect(contact!.normalY).toBe(0);
	});

	test('non-overlapping AABBs return null', () => {
		const contact = computeAABBvsAABB(0, 0, 10, 10, 25, 0, 10, 10);
		expect(contact).toBeNull();
	});

	test('touching edges (zero overlap) return null', () => {
		// Exact edge touch: halfWidths sum = distance
		const contact = computeAABBvsAABB(0, 0, 10, 10, 20, 0, 10, 10);
		expect(contact).toBeNull();
	});

	test('selects axis of least penetration', () => {
		// 10 overlap on x, 5 overlap on y → normal along y
		const contact = computeAABBvsAABB(0, 0, 10, 10, 10, 15, 10, 10);
		expect(contact).not.toBeNull();
		expect(contact!.normalX).toBe(0);
		expect(contact!.normalY).toBe(1);
		expect(contact!.depth).toBeCloseTo(5);
	});

	test('normal points A→B when B is left of A', () => {
		const contact = computeAABBvsAABB(15, 0, 10, 10, 0, 0, 10, 10);
		expect(contact).not.toBeNull();
		expect(contact!.normalX).toBe(-1);
		expect(contact!.normalY).toBe(0);
	});

	test('normal points A→B when B is above A', () => {
		const contact = computeAABBvsAABB(0, 15, 10, 10, 0, 0, 10, 10);
		expect(contact).not.toBeNull();
		expect(contact!.normalX).toBe(0);
		expect(contact!.normalY).toBe(-1);
	});
});

// ==================== Circle vs Circle ====================

describe('computeCircleVsCircle', () => {
	test('overlapping circles return contact', () => {
		// radius 10 each, 15 apart → overlap of 5
		const contact = computeCircleVsCircle(0, 0, 10, 15, 0, 10);
		expect(contact).not.toBeNull();
		expect(contact!.depth).toBeCloseTo(5);
		// Normal points from A toward B (positive x)
		expect(contact!.normalX).toBeCloseTo(1);
		expect(contact!.normalY).toBeCloseTo(0);
	});

	test('non-overlapping circles return null', () => {
		const contact = computeCircleVsCircle(0, 0, 10, 25, 0, 10);
		expect(contact).toBeNull();
	});

	test('touching circles (zero overlap) return null', () => {
		const contact = computeCircleVsCircle(0, 0, 10, 20, 0, 10);
		expect(contact).toBeNull();
	});

	test('coincident centers use arbitrary normal', () => {
		const contact = computeCircleVsCircle(5, 5, 10, 5, 5, 10);
		expect(contact).not.toBeNull();
		expect(contact!.depth).toBeCloseTo(20);
		// Arbitrary but deterministic: normalX=1, normalY=0
		expect(contact!.normalX).toBe(1);
		expect(contact!.normalY).toBe(0);
	});

	test('normal direction for diagonal separation', () => {
		// B is at (10, 10) from A at (0, 0), radius 15 each → overlap
		const contact = computeCircleVsCircle(0, 0, 15, 10, 10, 15);
		expect(contact).not.toBeNull();
		// Normal should point toward (10,10) direction, normalized
		const len = Math.sqrt(10 * 10 + 10 * 10);
		expect(contact!.normalX).toBeCloseTo(10 / len);
		expect(contact!.normalY).toBeCloseTo(10 / len);
	});
});

// ==================== AABB vs Circle ====================

describe('computeAABBvsCircle', () => {
	test('circle overlapping AABB edge returns contact', () => {
		// AABB at (0,0) half 10x10 → extends from -10 to 10
		// Circle at (12, 0) radius 5 → closest point on AABB is (10, 0), distance=2, overlap=3
		const contact = computeAABBvsCircle(0, 0, 10, 10, 12, 0, 5);
		expect(contact).not.toBeNull();
		expect(contact!.depth).toBeCloseTo(3);
		// Normal points from AABB toward circle (positive x)
		expect(contact!.normalX).toBeCloseTo(1);
		expect(contact!.normalY).toBeCloseTo(0);
	});

	test('non-overlapping AABB and circle return null', () => {
		const contact = computeAABBvsCircle(0, 0, 10, 10, 20, 0, 5);
		expect(contact).toBeNull();
	});

	test('circle center inside AABB pushes out along shortest axis', () => {
		// AABB at (0,0) half 20x20, circle at (18, 0) radius 5
		// Circle center is inside AABB. Push distances: right=2, left=38, up=20, down=20
		// Minimum push is right (2), depth = 2 + radius = 7
		const contact = computeAABBvsCircle(0, 0, 20, 20, 18, 0, 5);
		expect(contact).not.toBeNull();
		expect(contact!.normalX).toBe(1);
		expect(contact!.normalY).toBe(0);
		expect(contact!.depth).toBeCloseTo(7);
	});

	test('circle at corner of AABB', () => {
		// AABB at (0,0) half 10x10, circle at (12, 12) radius 5
		// Closest point is (10, 10), distance = sqrt(8) ≈ 2.83, depth = 5 - 2.83 ≈ 2.17
		const contact = computeAABBvsCircle(0, 0, 10, 10, 12, 12, 5);
		expect(contact).not.toBeNull();
		const expectedDist = Math.sqrt(4 + 4);
		expect(contact!.depth).toBeCloseTo(5 - expectedDist);
		// Normal from closest point toward circle center
		expect(contact!.normalX).toBeCloseTo(2 / expectedDist);
		expect(contact!.normalY).toBeCloseTo(2 / expectedDist);
	});
});

// ==================== computeContact dispatcher ====================

describe('computeContact', () => {
	test('routes AABB-AABB', () => {
		const a: BaseColliderInfo = {
			entityId: 1, x: 0, y: 0, layer: 'a', collidesWith: ['b'],
			aabb: { halfWidth: 10, halfHeight: 10 },
		};
		const b: BaseColliderInfo = {
			entityId: 2, x: 15, y: 0, layer: 'b', collidesWith: ['a'],
			aabb: { halfWidth: 10, halfHeight: 10 },
		};
		const contact = computeContact(a, b);
		expect(contact).not.toBeNull();
		expect(contact!.normalX).toBe(1);
	});

	test('routes Circle-Circle', () => {
		const a: BaseColliderInfo = {
			entityId: 1, x: 0, y: 0, layer: 'a', collidesWith: ['b'],
			circle: { radius: 10 },
		};
		const b: BaseColliderInfo = {
			entityId: 2, x: 15, y: 0, layer: 'b', collidesWith: ['a'],
			circle: { radius: 10 },
		};
		const contact = computeContact(a, b);
		expect(contact).not.toBeNull();
	});

	test('routes AABB-Circle', () => {
		const a: BaseColliderInfo = {
			entityId: 1, x: 0, y: 0, layer: 'a', collidesWith: ['b'],
			aabb: { halfWidth: 10, halfHeight: 10 },
		};
		const b: BaseColliderInfo = {
			entityId: 2, x: 12, y: 0, layer: 'b', collidesWith: ['a'],
			circle: { radius: 5 },
		};
		const contact = computeContact(a, b);
		expect(contact).not.toBeNull();
		// Normal should point from A (AABB) toward B (Circle)
		expect(contact!.normalX).toBeGreaterThan(0);
	});

	test('routes Circle-AABB and flips normal', () => {
		const a: BaseColliderInfo = {
			entityId: 1, x: 12, y: 0, layer: 'a', collidesWith: ['b'],
			circle: { radius: 5 },
		};
		const b: BaseColliderInfo = {
			entityId: 2, x: 0, y: 0, layer: 'b', collidesWith: ['a'],
			aabb: { halfWidth: 10, halfHeight: 10 },
		};
		const contact = computeContact(a, b);
		expect(contact).not.toBeNull();
		// Normal should point from A (Circle at x=12) toward B (AABB at x=0) → negative x
		expect(contact!.normalX).toBeLessThan(0);
	});

	test('returns null when no colliders', () => {
		const a: BaseColliderInfo = {
			entityId: 1, x: 0, y: 0, layer: 'a', collidesWith: ['b'],
		};
		const b: BaseColliderInfo = {
			entityId: 2, x: 5, y: 0, layer: 'b', collidesWith: ['a'],
		};
		expect(computeContact(a, b)).toBeNull();
	});
});

// ==================== detectCollisions ====================

describe('detectCollisions', () => {
	test('brute-force detects overlapping pair', () => {
		const colliders: BaseColliderInfo[] = [
			{ entityId: 1, x: 0, y: 0, layer: 'a', collidesWith: ['b'], aabb: { halfWidth: 10, halfHeight: 10 } },
			{ entityId: 2, x: 15, y: 0, layer: 'b', collidesWith: ['a'], aabb: { halfWidth: 10, halfHeight: 10 } },
		];

		const contacts: Array<{ a: number; b: number; contact: Contact }> = [];
		detectCollisions(
			colliders,
			null,
			(a, b, contact, ctx) => { ctx.push({ a: a.entityId, b: b.entityId, contact }); },
			contacts,
		);

		expect(contacts.length).toBe(1);
		expect(contacts[0]!.a).toBe(1);
		expect(contacts[0]!.b).toBe(2);
	});

	test('layer filtering excludes non-matching pairs', () => {
		const colliders: BaseColliderInfo[] = [
			{ entityId: 1, x: 0, y: 0, layer: 'a', collidesWith: ['a'], aabb: { halfWidth: 10, halfHeight: 10 } },
			{ entityId: 2, x: 5, y: 0, layer: 'b', collidesWith: ['b'], aabb: { halfWidth: 10, halfHeight: 10 } },
		];

		const contacts: Array<{ a: number; b: number }> = [];
		detectCollisions(
			colliders,
			null,
			(a, b, _contact, ctx) => { ctx.push({ a: a.entityId, b: b.entityId }); },
			contacts,
		);

		expect(contacts.length).toBe(0);
	});

	test('unidirectional layer match still triggers detection', () => {
		const colliders: BaseColliderInfo[] = [
			{ entityId: 1, x: 0, y: 0, layer: 'a', collidesWith: ['b'], aabb: { halfWidth: 10, halfHeight: 10 } },
			{ entityId: 2, x: 5, y: 0, layer: 'b', collidesWith: [], aabb: { halfWidth: 10, halfHeight: 10 } },
		];

		const contacts: Array<{ a: number; b: number }> = [];
		detectCollisions(
			colliders,
			null,
			(a, b, _contact, ctx) => { ctx.push({ a: a.entityId, b: b.entityId }); },
			contacts,
		);

		expect(contacts.length).toBe(1);
	});

	test('no duplicate pairs in brute-force (j = i+1 pattern)', () => {
		const colliders: BaseColliderInfo[] = [
			{ entityId: 1, x: 0, y: 0, layer: 'a', collidesWith: ['a'], aabb: { halfWidth: 50, halfHeight: 50 } },
			{ entityId: 2, x: 5, y: 0, layer: 'a', collidesWith: ['a'], aabb: { halfWidth: 50, halfHeight: 50 } },
			{ entityId: 3, x: 10, y: 0, layer: 'a', collidesWith: ['a'], aabb: { halfWidth: 50, halfHeight: 50 } },
		];

		const contacts: Array<{ a: number; b: number }> = [];
		detectCollisions(
			colliders,
			null,
			(a, b, _contact, ctx) => { ctx.push({ a: a.entityId, b: b.entityId }); },
			contacts,
		);

		// 3 entities = 3 pairs: (1,2), (1,3), (2,3)
		expect(contacts.length).toBe(3);
		const pairKeys = contacts.map(c => `${c.a}:${c.b}`).sort();
		expect(pairKeys).toEqual(['1:2', '1:3', '2:3']);
	});

	test('context is forwarded to callback', () => {
		const colliders: BaseColliderInfo[] = [
			{ entityId: 1, x: 0, y: 0, layer: 'a', collidesWith: ['b'], aabb: { halfWidth: 10, halfHeight: 10 } },
			{ entityId: 2, x: 5, y: 0, layer: 'b', collidesWith: ['a'], aabb: { halfWidth: 10, halfHeight: 10 } },
		];

		const context = { called: false };
		detectCollisions(
			colliders,
			null,
			(_a, _b, _contact, ctx) => { ctx.called = true; },
			context,
		);

		expect(context.called).toBe(true);
	});

	test('empty colliders array produces no callbacks', () => {
		let called = false;
		detectCollisions(
			[],
			null,
			() => { called = true; },
			null,
		);
		expect(called).toBe(false);
	});

	test('single collider produces no callbacks', () => {
		let called = false;
		detectCollisions(
			[{ entityId: 1, x: 0, y: 0, layer: 'a', collidesWith: ['b'], aabb: { halfWidth: 10, halfHeight: 10 } }],
			null,
			() => { called = true; },
			null,
		);
		expect(called).toBe(false);
	});
});
