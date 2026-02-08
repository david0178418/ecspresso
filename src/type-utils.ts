/**
 * Utility types for ECSpresso ECS framework
 * This file contains reusable type helpers used across the codebase
 */

import type { ScreenDefinition } from './screen-types';

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
 * Plugin compatibility checker.
 * Returns true if plugins can be merged without type conflicts.
 * All overlapping keys across all type categories must have identical types.
 */
export type PluginsAreCompatible<
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

// ==================== Wildcard Types ====================

/**
 * Wildcard ECSpresso type that any concrete instance is assignable to.
 * Use as a generic constraint for functions that accept any ECSpresso world.
 * Matches the phantom type properties declared on the ECSpresso class.
 */
export type AnyECSpresso = {
	readonly _componentTypes: any;
	readonly _eventTypes: any;
	readonly _resourceTypes: any;
	readonly _assetTypes: any;
	readonly _screenStates: any;
};

/**
 * Wildcard Plugin type that any concrete plugin is assignable to.
 * Matches the phantom type properties declared on the Plugin interface.
 */
export type AnyPlugin = {
	readonly _componentTypes?: any;
	readonly _eventTypes?: any;
	readonly _resourceTypes?: any;
	readonly _assetTypes?: any;
	readonly _screenStates?: any;
};

// ==================== Structural Type Extraction ====================
// These use phantom type properties for positional-independence.
// Works for both Plugin and ECSpresso instances since both declare
// the same phantom properties.

/**
 * Extract the ComponentTypes from a Plugin or ECSpresso instance
 */
export type ComponentsOf<B> = B extends { readonly _componentTypes: infer C extends Record<string, any> } ? C : B extends { readonly _componentTypes?: infer C extends Record<string, any> } ? C : never;

/**
 * Extract the EventTypes from a Plugin or ECSpresso instance
 */
export type EventsOf<B> = B extends { readonly _eventTypes: infer E extends Record<string, any> } ? E : B extends { readonly _eventTypes?: infer E extends Record<string, any> } ? E : never;

/**
 * Extract the ResourceTypes from a Plugin or ECSpresso instance
 */
export type ResourcesOf<B> = B extends { readonly _resourceTypes: infer R extends Record<string, any> } ? R : B extends { readonly _resourceTypes?: infer R extends Record<string, any> } ? R : never;

/**
 * Extract AssetTypes from a Plugin or ECSpresso instance
 */
export type AssetTypesOf<B> = B extends { readonly _assetTypes: infer A extends Record<string, unknown> } ? A : B extends { readonly _assetTypes?: infer A extends Record<string, unknown> } ? A : never;

/**
 * Extract ScreenStates from a Plugin or ECSpresso instance
 */
export type ScreenStatesOf<B> = B extends { readonly _screenStates: infer S extends Record<string, ScreenDefinition<any, any>> } ? S : B extends { readonly _screenStates?: infer S extends Record<string, ScreenDefinition<any, any>> } ? S : never;

// ==================== Phantom Type Extraction ====================
// These use phantom type properties for Labels, Groups, AssetGroupNames,
// and ReactiveQueryNames from Plugin instances.

/**
 * Extract the system Labels from a Plugin instance
 */
export type LabelsOf<B> = B extends { readonly _labels?: infer L } ? L extends string ? L : never : never;

/**
 * Extract the system Groups from a Plugin instance
 */
export type GroupsOf<B> = B extends { readonly _groups?: infer G } ? G extends string ? G : never : never;

/**
 * Extract the AssetGroupNames from a Plugin instance
 */
export type AssetGroupNamesOf<B> = B extends { readonly _assetGroupNames?: infer AG } ? AG extends string ? AG : never : never;

/**
 * Extract the ReactiveQueryNames from a Plugin instance
 */
export type ReactiveQueryNamesOf<B> = B extends { readonly _reactiveQueryNames?: infer RQ } ? RQ extends string ? RQ : never : never;

// ==================== World Type Extraction ====================
// Convenience aliases that read better for ECSpresso world instances.
// Structurally identical to the *Of types above since both classes
// share the same phantom properties.

/**
 * Extract ComponentTypes from an ECSpresso world instance type.
 */
export type ComponentsOfWorld<W> = W extends { readonly _componentTypes: infer C extends Record<string, any> } ? C : never;

/**
 * Extract EventTypes from an ECSpresso world instance type.
 */
export type EventsOfWorld<W> = W extends { readonly _eventTypes: infer E extends Record<string, any> } ? E : never;

/**
 * Extract AssetTypes from an ECSpresso world instance type.
 */
export type AssetsOfWorld<W> = W extends { readonly _assetTypes: infer A extends Record<string, unknown> } ? A : never;

/**
 * Extract ScreenStates from an ECSpresso world instance type
 */
export type ScreenStatesOfWorld<W> = W extends { readonly _screenStates: infer S extends Record<string, ScreenDefinition<any, any>> } ? S : never;

// ==================== Event Type Utilities ====================

/**
 * Extract event names from an EventTypes record whose payload extends the given shape.
 * Eliminates the need for each plugin to define its own mapped filter type.
 *
 * @example
 * ```typescript
 * interface MyEventData { entityId: number }
 * type MyEventName<ET> = EventNameMatching<ET, MyEventData>;
 * ```
 */
export type EventNameMatching<ET extends Record<string, any>, Payload> = {
	[K in keyof ET & string]: ET[K] extends Payload ? K : never
}[keyof ET & string];

// ==================== Component Type Extraction ====================

/**
 * Extract the channel type from a world's AudioSource component.
 * Falls back to `string` if the world has no audioSource component.
 */
export type ChannelOfWorld<W> =
	W extends { readonly _componentTypes: { audioSource: { channel: infer Ch extends string } } }
		? Ch
		: string;
