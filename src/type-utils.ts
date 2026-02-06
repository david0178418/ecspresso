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
 * Extract the ComponentTypes from a Bundle instance
 */
export type ComponentsOf<B> = B extends import('./bundle').default<infer C extends Record<string, any>, any, any, any, any, any, any, any, any> ? C : never;

/**
 * Extract the EventTypes from a Bundle instance
 */
export type EventsOf<B> = B extends import('./bundle').default<any, infer E extends Record<string, any>, any, any, any, any, any, any, any> ? E : never;

/**
 * Extract the ResourceTypes from a Bundle instance
 */
export type ResourcesOf<B> = B extends import('./bundle').default<any, any, infer R extends Record<string, any>, any, any, any, any, any, any> ? R : never;

/**
 * Extract the system Labels from a Bundle instance
 */
export type LabelsOf<B> = B extends import('./bundle').default<any, any, any, any, any, infer L extends string, any, any, any> ? L : never;

/**
 * Extract the system Groups from a Bundle instance
 */
export type GroupsOf<B> = B extends import('./bundle').default<any, any, any, any, any, any, infer G extends string, any, any> ? G : never;

/**
 * Extract the AssetGroupNames from a Bundle instance
 */
export type AssetGroupNamesOf<B> = B extends import('./bundle').default<any, any, any, any, any, any, any, infer AG extends string, any> ? AG : never;

/**
 * Extract the ReactiveQueryNames from a Bundle instance
 */
export type ReactiveQueryNamesOf<B> = B extends import('./bundle').default<any, any, any, any, any, any, any, any, infer RQ extends string> ? RQ : never;

/**
 * Extract AssetTypes from a Bundle instance
 */
export type AssetTypesOf<B> = B extends import('./bundle').default<any, any, any, infer A extends Record<string, unknown>, any, any, any, any, any> ? A : never;

/**
 * Extract ScreenStates from a Bundle instance
 */
export type ScreenStatesOf<B> = B extends import('./bundle').default<any, any, any, any, infer S extends Record<string, import('./screen-types').ScreenDefinition<any, any>>, any, any, any, any> ? S : never;

/**
 * Extract ScreenStates from an ECSpresso world instance type
 */
export type ScreenStatesOfWorld<W> = W extends import('./ecspresso').default<any, any, any, any, infer S extends Record<string, import('./screen-types').ScreenDefinition<any, any>>, any, any, any, any> ? S : never;

/**
 * Extract ComponentTypes from an ECSpresso world instance type.
 */
export type ComponentsOfWorld<W> = W extends import('./ecspresso').default<
	infer C extends Record<string, any>, any, any, any, any, any, any, any, any
> ? C : never;

/**
 * Extract EventTypes from an ECSpresso world instance type.
 */
export type EventsOfWorld<W> = W extends import('./ecspresso').default<
	any, infer E extends Record<string, any>, any, any, any, any, any, any, any
> ? E : never;

/**
 * Extract AssetTypes from an ECSpresso world instance type.
 */
export type AssetsOfWorld<W> = W extends import('./ecspresso').default<
	any, any, any, infer A extends Record<string, unknown>, any, any, any, any, any
> ? A : never;
