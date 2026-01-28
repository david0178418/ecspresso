/**
 * Utility types for ECSpresso ECS framework
 * This file contains reusable type helpers used across the codebase
 */

/**
 * Check if two types are exactly the same for overlapping keys
 */
type ExactlyCompatible<T, U> = T extends U ? U extends T ? true : false : false;

/**
 * Check if two record types are compatible (no conflicting keys).
 * Returns true if no overlapping keys or all overlapping keys have exactly the same type.
 */
export type TypesAreCompatible<T extends Record<string, any>, U extends Record<string, any>> =
	[keyof T & keyof U] extends [never]
		? true  // No overlapping keys = compatible
		: {
			[K in keyof T & keyof U]: ExactlyCompatible<T[K], U[K]>;
		}[keyof T & keyof U] extends false
			? false
			: true;

/**
 * Bundle compatibility checker.
 * Returns true if bundles can be merged without type conflicts.
 * All overlapping keys across all type categories must have identical types.
 */
export type BundlesAreCompatible<
	C1 extends Record<string, any>,
	C2 extends Record<string, any>,
	E1 extends Record<string, any>,
	E2 extends Record<string, any>,
	R1 extends Record<string, any>,
	R2 extends Record<string, any>,
	A1 extends Record<string, unknown> = {},
	A2 extends Record<string, unknown> = {},
	S1 extends Record<string, any> = {},
	S2 extends Record<string, any> = {},
> = TypesAreCompatible<C1, C2> extends true
	? TypesAreCompatible<E1, E2> extends true
		? TypesAreCompatible<R1, R2> extends true
			? TypesAreCompatible<A1, A2> extends true
				? TypesAreCompatible<S1, S2>
				: false
			: false
		: false
	: false;

/**
 * Utility type for merging two types
 */
export type Merge<T1, T2> = T1 & T2;

/**
 * Utility type for merging an array of types
 */
export type MergeAll<T extends any[]> = T extends [infer First, ...infer Rest] ?
	Rest extends [] ?
		First: Merge<First, MergeAll<Rest>>:
	{};

/**
 * Basic utility types that can be used independently
 */