/**
 * Utility types for ECSpresso ECS framework
 * This file contains reusable type helpers used across the codebase
 */

/**
 * Check if two types have conflicting keys (same key, different type).
 * Returns true if there are no conflicts.
 */
export type TypesAreCompatible<T, U> = {
	[K in keyof T & keyof U]: T[K] extends U[K]
		? U[K] extends T[K]
			? true
			: false
		: false
}[keyof T & keyof U] extends false ? false : true;

/**
 * Simplified bundle compatibility checker.
 * Allows merging when there are no type conflicts between shared keys.
 * If types don't share keys, they are always compatible.
 */
export type BundlesAreCompatible<
	C1 extends Record<string, any>,
	C2 extends Record<string, any>,
	E1 extends Record<string, any>,
	E2 extends Record<string, any>,
	R1 extends Record<string, any>,
	R2 extends Record<string, any>
> = 
	// Check if there are any shared keys first
	keyof C1 & keyof C2 extends never
		? keyof E1 & keyof E2 extends never
			? keyof R1 & keyof R2 extends never
				? true  // No shared keys at all - always compatible
				: TypesAreCompatible<R1, R2>  // Only resource conflicts possible
			: TypesAreCompatible<E1, E2> extends true
				? keyof R1 & keyof R2 extends never
					? true
					: TypesAreCompatible<R1, R2>
				: false
		: TypesAreCompatible<C1, C2> extends true
			? keyof E1 & keyof E2 extends never
				? keyof R1 & keyof R2 extends never
					? true
					: TypesAreCompatible<R1, R2>
				: TypesAreCompatible<E1, E2> extends true
					? keyof R1 & keyof R2 extends never
						? true
						: TypesAreCompatible<R1, R2>
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