/**
 * Shared Narrowphase Module
 *
 * Provides contact-computing narrowphase tests and a generic collision
 * iteration pipeline used by both the collision bundle (event-only) and
 * the physics2D bundle (impulse response).
 */

import type { SpatialIndex } from './spatial-index';

// ==================== Contact ====================

/** Contact result from a narrowphase test. Normal points from A toward B. */
export interface Contact {
	normalX: number;
	normalY: number;
	/** Penetration depth (positive = overlapping) */
	depth: number;
}

// ==================== BaseColliderInfo ====================

/** Minimum collider data shared by collision and physics bundles. */
export interface BaseColliderInfo {
	entityId: number;
	x: number;
	y: number;
	layer: string;
	collidesWith: readonly string[];
	aabb?: { halfWidth: number; halfHeight: number };
	circle?: { radius: number };
}

// ==================== Narrowphase Tests ====================

export function computeAABBvsAABB(
	ax: number, ay: number, ahw: number, ahh: number,
	bx: number, by: number, bhw: number, bhh: number,
): Contact | null {
	const dx = bx - ax;
	const dy = by - ay;
	const overlapX = (ahw + bhw) - Math.abs(dx);
	const overlapY = (ahh + bhh) - Math.abs(dy);

	if (overlapX <= 0 || overlapY <= 0) return null;

	if (overlapX < overlapY) {
		return {
			normalX: dx >= 0 ? 1 : -1,
			normalY: 0,
			depth: overlapX,
		};
	}
	return {
		normalX: 0,
		normalY: dy >= 0 ? 1 : -1,
		depth: overlapY,
	};
}

export function computeCircleVsCircle(
	ax: number, ay: number, ar: number,
	bx: number, by: number, br: number,
): Contact | null {
	const dx = bx - ax;
	const dy = by - ay;
	const distSq = dx * dx + dy * dy;
	const radiusSum = ar + br;

	if (distSq >= radiusSum * radiusSum) return null;

	const dist = Math.sqrt(distSq);
	if (dist === 0) {
		return { normalX: 1, normalY: 0, depth: radiusSum };
	}
	return {
		normalX: dx / dist,
		normalY: dy / dist,
		depth: radiusSum - dist,
	};
}

export function computeAABBvsCircle(
	aabbX: number, aabbY: number, ahw: number, ahh: number,
	circleX: number, circleY: number, radius: number,
): Contact | null {
	const closestX = Math.max(aabbX - ahw, Math.min(circleX, aabbX + ahw));
	const closestY = Math.max(aabbY - ahh, Math.min(circleY, aabbY + ahh));

	const dx = circleX - closestX;
	const dy = circleY - closestY;
	const distSq = dx * dx + dy * dy;

	if (distSq >= radius * radius) return null;

	// Circle center inside AABB
	if (distSq === 0) {
		const pushLeft = (circleX - (aabbX - ahw));
		const pushRight = ((aabbX + ahw) - circleX);
		const pushUp = (circleY - (aabbY - ahh));
		const pushDown = ((aabbY + ahh) - circleY);
		const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown);

		if (minPush === pushRight) return { normalX: 1, normalY: 0, depth: pushRight + radius };
		if (minPush === pushLeft) return { normalX: -1, normalY: 0, depth: pushLeft + radius };
		if (minPush === pushDown) return { normalX: 0, normalY: 1, depth: pushDown + radius };
		return { normalX: 0, normalY: -1, depth: pushUp + radius };
	}

	const dist = Math.sqrt(distSq);
	return {
		normalX: dx / dist,
		normalY: dy / dist,
		depth: radius - dist,
	};
}

// ==================== Contact Dispatcher ====================

export function computeContact(a: BaseColliderInfo, b: BaseColliderInfo): Contact | null {
	if (a.aabb && b.aabb) {
		return computeAABBvsAABB(
			a.x, a.y, a.aabb.halfWidth, a.aabb.halfHeight,
			b.x, b.y, b.aabb.halfWidth, b.aabb.halfHeight,
		);
	}

	if (a.circle && b.circle) {
		return computeCircleVsCircle(
			a.x, a.y, a.circle.radius,
			b.x, b.y, b.circle.radius,
		);
	}

	if (a.aabb && b.circle) {
		return computeAABBvsCircle(
			a.x, a.y, a.aabb.halfWidth, a.aabb.halfHeight,
			b.x, b.y, b.circle.radius,
		);
	}

	if (a.circle && b.aabb) {
		const contact = computeAABBvsCircle(
			b.x, b.y, b.aabb.halfWidth, b.aabb.halfHeight,
			a.x, a.y, a.circle.radius,
		);
		if (!contact) return null;
		return {
			normalX: -contact.normalX,
			normalY: -contact.normalY,
			depth: contact.depth,
		};
	}

	return null;
}

// ==================== Collision Iteration ====================

/** Module-level reusable set for broadphase candidates. */
const _broadphaseCandidates = new Set<number>();

/**
 * Generic collision detection pipeline: brute-force or broadphase,
 * with layer filtering and contact computation.
 *
 * Uses a context parameter forwarded to the callback to avoid
 * per-frame closure allocation.
 */
export function detectCollisions<I extends BaseColliderInfo, C>(
	colliders: I[],
	spatialIndex: SpatialIndex | null,
	onContact: (a: I, b: I, contact: Contact, context: C) => void,
	context: C,
): void {
	if (spatialIndex) {
		broadphaseDetect(colliders, spatialIndex, onContact, context);
	} else {
		bruteForceDetect(colliders, onContact, context);
	}
}

function bruteForceDetect<I extends BaseColliderInfo, C>(
	colliders: I[],
	onContact: (a: I, b: I, contact: Contact, context: C) => void,
	context: C,
): void {
	for (let i = 0; i < colliders.length; i++) {
		const a = colliders[i]!;

		for (let j = i + 1; j < colliders.length; j++) {
			const b = colliders[j]!;

			if (!a.collidesWith.includes(b.layer) && !b.collidesWith.includes(a.layer)) continue;

			const contact = computeContact(a, b);
			if (!contact) continue;

			onContact(a, b, contact, context);
		}
	}
}

function broadphaseDetect<I extends BaseColliderInfo, C>(
	colliders: I[],
	spatialIndex: SpatialIndex,
	onContact: (a: I, b: I, contact: Contact, context: C) => void,
	context: C,
): void {
	const colliderMap = new Map<number, I>();
	for (let i = 0; i < colliders.length; i++) {
		const c = colliders[i]!;
		colliderMap.set(c.entityId, c);
	}

	for (let i = 0; i < colliders.length; i++) {
		const a = colliders[i]!;

		const aHalfW = a.aabb ? a.aabb.halfWidth : (a.circle ? a.circle.radius : 0);
		const aHalfH = a.aabb ? a.aabb.halfHeight : (a.circle ? a.circle.radius : 0);

		_broadphaseCandidates.clear();
		spatialIndex.queryRectInto(
			a.x - aHalfW, a.y - aHalfH,
			a.x + aHalfW, a.y + aHalfH,
			_broadphaseCandidates,
		);

		for (const bId of _broadphaseCandidates) {
			if (bId <= a.entityId) continue;

			const b = colliderMap.get(bId);
			if (!b) continue;

			if (!a.collidesWith.includes(b.layer) && !b.collidesWith.includes(a.layer)) continue;

			const contact = computeContact(a, b);
			if (!contact) continue;

			onContact(a, b, contact, context);
		}
	}
}
