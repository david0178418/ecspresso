/**
 * Utility types for ECSpresso ECS framework
 * This file contains reusable type helpers used across the codebase
 */

/**
 * Check if two types are exactly the same for overlapping keys
 */
type ExactlyCompatible<T, U> = T extends U ? U extends T ? true : false : false;

/**
 * Check if two record types are compatible (no conflicting keys)
 */
export type TypesAreCompatible<T extends Record<string, any>, U extends Record<string, any>> = {
	[K in keyof T & keyof U]: ExactlyCompatible<T[K], U[K]>;
}[keyof T & keyof U] extends false ? false : true;

/**
 * Simplified bundle compatibility checker
 * Returns true if bundles can be merged without type conflicts
 * More lenient - allows bundles without shared keys to be merged
 */
export type BundlesAreCompatible<
	C1 extends Record<string, any>,
	C2 extends Record<string, any>,
	E1 extends Record<string, any>,
	E2 extends Record<string, any>,
	R1 extends Record<string, any>,
	R2 extends Record<string, any>
> = keyof C1 & keyof C2 extends never
	? keyof E1 & keyof E2 extends never
		? keyof R1 & keyof R2 extends never
			? true
			: TypesAreCompatible<R1, R2>
		: TypesAreCompatible<E1, E2>
	: TypesAreCompatible<C1, C2>;

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