/**
 * Shared vector math utilities for ECSpresso bundles.
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

// ==================== Vector3D ====================

/**
 * A 3D vector with x, y, and z components.
 */
export interface Vector3D {
	x: number;
	y: number;
	z: number;
}

/**
 * Create a Vector3D from x, y, and z components.
 */
export function vec3(x: number, y: number, z: number): Vector3D {
	return { x, y, z };
}

/**
 * Return a zero vector {x: 0, y: 0, z: 0}.
 */
export function vec3Zero(): Vector3D {
	return { x: 0, y: 0, z: 0 };
}

/**
 * Add two vectors component-wise.
 */
export function vec3Add(a: Vector3D, b: Vector3D): Vector3D {
	return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * Subtract b from a component-wise.
 */
export function vec3Sub(a: Vector3D, b: Vector3D): Vector3D {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * Scale a vector by a scalar.
 */
export function vec3Scale(v: Vector3D, scalar: number): Vector3D {
	return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

/**
 * Negate a vector (flip all components).
 */
export function vec3Negate(v: Vector3D): Vector3D {
	return { x: -v.x, y: -v.y, z: -v.z };
}

/**
 * Compute the dot product of two vectors.
 */
export function vec3Dot(a: Vector3D, b: Vector3D): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Compute the cross product of two vectors.
 */
export function vec3Cross(a: Vector3D, b: Vector3D): Vector3D {
	return {
		x: a.y * b.z - a.z * b.y,
		y: a.z * b.x - a.x * b.z,
		z: a.x * b.y - a.y * b.x,
	};
}

/**
 * Compute the squared length of a vector. Avoids sqrt when only comparing magnitudes.
 */
export function vec3LengthSq(v: Vector3D): number {
	return v.x * v.x + v.y * v.y + v.z * v.z;
}

/**
 * Compute the length (magnitude) of a vector.
 */
export function vec3Length(v: Vector3D): number {
	return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Return a unit vector in the same direction. Returns zero vector if input is zero-length.
 */
export function vec3Normalize(v: Vector3D): Vector3D {
	const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
	if (len === 0) return { x: 0, y: 0, z: 0 };
	return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Compute the squared distance between two points. Avoids sqrt when only comparing.
 */
export function vec3DistanceSq(a: Vector3D, b: Vector3D): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	const dz = a.z - b.z;
	return dx * dx + dy * dy + dz * dz;
}

/**
 * Compute the distance between two points.
 */
export function vec3Distance(a: Vector3D, b: Vector3D): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	const dz = a.z - b.z;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Check if two vectors are approximately equal within an epsilon tolerance.
 */
export function vec3Equals(a: Vector3D, b: Vector3D, epsilon = 1e-10): boolean {
	return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon && Math.abs(a.z - b.z) <= epsilon;
}
