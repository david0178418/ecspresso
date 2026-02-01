/**
 * Shared 2D vector math utilities for ECSpresso bundles.
 * All functions are pure — they return new vectors, never mutate inputs.
 */

/**
 * A 2D vector with x and y components.
 */
export interface Vector2D {
	x: number;
	y: number;
}

/**
 * Create a Vector2D from x and y components.
 */
export function vec2(x: number, y: number): Vector2D {
	return { x, y };
}

/**
 * Return a zero vector {x: 0, y: 0}.
 */
export function vec2Zero(): Vector2D {
	return { x: 0, y: 0 };
}

/**
 * Add two vectors component-wise.
 */
export function vec2Add(a: Vector2D, b: Vector2D): Vector2D {
	return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * Subtract b from a component-wise.
 */
export function vec2Sub(a: Vector2D, b: Vector2D): Vector2D {
	return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Scale a vector by a scalar.
 */
export function vec2Scale(v: Vector2D, scalar: number): Vector2D {
	return { x: v.x * scalar, y: v.y * scalar };
}

/**
 * Negate a vector (flip both components).
 */
export function vec2Negate(v: Vector2D): Vector2D {
	return { x: -v.x, y: -v.y };
}

/**
 * Compute the dot product of two vectors.
 */
export function vec2Dot(a: Vector2D, b: Vector2D): number {
	return a.x * b.x + a.y * b.y;
}

/**
 * Compute the 2D cross product (scalar z-component of the 3D cross product).
 */
export function vec2Cross(a: Vector2D, b: Vector2D): number {
	return a.x * b.y - a.y * b.x;
}

/**
 * Compute the squared length of a vector. Avoids sqrt when only comparing magnitudes.
 */
export function vec2LengthSq(v: Vector2D): number {
	return v.x * v.x + v.y * v.y;
}

/**
 * Compute the length (magnitude) of a vector.
 */
export function vec2Length(v: Vector2D): number {
	return Math.sqrt(v.x * v.x + v.y * v.y);
}

/**
 * Return a unit vector in the same direction. Returns zero vector if input is zero-length.
 */
export function vec2Normalize(v: Vector2D): Vector2D {
	const len = Math.sqrt(v.x * v.x + v.y * v.y);
	if (len === 0) return { x: 0, y: 0 };
	return { x: v.x / len, y: v.y / len };
}

/**
 * Compute the squared distance between two points. Avoids sqrt when only comparing.
 */
export function vec2DistanceSq(a: Vector2D, b: Vector2D): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return dx * dx + dy * dy;
}

/**
 * Compute the distance between two points.
 */
export function vec2Distance(a: Vector2D, b: Vector2D): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if two vectors are approximately equal within an epsilon tolerance.
 */
export function vec2Equals(a: Vector2D, b: Vector2D, epsilon = 1e-10): boolean {
	return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}
