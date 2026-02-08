import type ECSpresso from './ecspresso';
import type { ScreenDefinition } from './screen-types';
import type {
	AnyECSpresso,
	ComponentsOf,
	EventsOf,
	ResourcesOf,
	AssetTypesOf,
	ScreenStatesOf,
} from './type-utils';

/**
 * Plugin interface for ECSpresso. A plugin is a plain object with an `install`
 * function that configures a world directly, plus phantom type properties for
 * compile-time type extraction.
 *
 * A plain object with an `install` function and phantom types for compile-time extraction.
 */
export interface Plugin<
	ComponentTypes extends Record<string, any> = {},
	EventTypes extends Record<string, any> = {},
	ResourceTypes extends Record<string, any> = {},
	AssetTypes extends Record<string, unknown> = {},
	ScreenStates extends Record<string, ScreenDefinition<any, any>> = {},
	Labels extends string = never,
	Groups extends string = never,
	AssetGroupNames extends string = never,
	ReactiveQueryNames extends string = never,
> {
	readonly id: string;
	readonly install: (world: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>) => void;
	// Phantom types for structural extraction (never set at runtime)
	readonly _componentTypes?: ComponentTypes;
	readonly _eventTypes?: EventTypes;
	readonly _resourceTypes?: ResourceTypes;
	readonly _assetTypes?: AssetTypes;
	readonly _screenStates?: ScreenStates;
	// Phantom types for positional extraction (never set at runtime)
	readonly _labels?: Labels;
	readonly _groups?: Groups;
	readonly _assetGroupNames?: AssetGroupNames;
	readonly _reactiveQueryNames?: ReactiveQueryNames;
}

/**
 * Factory function to create a type-safe Plugin with phantom type parameters.
 * The type assertion adds phantom types without runtime cost.
 *
 * @example
 * ```typescript
 * // Option 1: Explicit type params (original)
 * const myPlugin = definePlugin<MyComponents, MyEvents, MyResources>({
 *   id: 'my-plugin',
 *   install(world) { ... },
 * });
 *
 * // Option 2: Single world type param (extracts C/E/R/A/S automatically)
 * type MyWorld = typeof ecs;
 * const myPlugin = definePlugin<MyWorld>({
 *   id: 'my-plugin',
 *   install(world) { ... },
 * });
 * ```
 */

// Overload: single world type param
export function definePlugin<
	W extends AnyECSpresso,
	Labels extends string = never,
	Groups extends string = never,
	AssetGroupNames extends string = never,
	ReactiveQueryNames extends string = never,
>(
	config: { id: string; install: (world: W) => void }
): Plugin<
	ComponentsOf<W>, EventsOf<W>, ResourcesOf<W>,
	AssetTypesOf<W>, ScreenStatesOf<W>,
	Labels, Groups, AssetGroupNames, ReactiveQueryNames
>;

// Overload: explicit C/E/R/A/S type params (original)
export function definePlugin<
	C extends Record<string, any> = {},
	E extends Record<string, any> = {},
	R extends Record<string, any> = {},
	A extends Record<string, unknown> = {},
	S extends Record<string, ScreenDefinition<any, any>> = {},
	Labels extends string = never,
	Groups extends string = never,
	AssetGroupNames extends string = never,
	ReactiveQueryNames extends string = never,
>(
	config: { id: string; install: (world: ECSpresso<C, E, R, A, S>) => void }
): Plugin<C, E, R, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames>;

// Implementation
export function definePlugin(
	config: { id: string; install: (world: any) => void }
): Plugin {
	return config as Plugin;
}

/**
 * Creates a plugin factory function with types captured once.
 * Returns a `definePlugin`-equivalent that no longer requires type params.
 *
 * @example
 * ```typescript
 * // Capture types once from a world type
 * type MyWorld = typeof ecs;
 * const define = createPluginFactory<MyWorld>();
 *
 * // Every plugin call is zero-param
 * const movementPlugin = define({
 *   id: 'movement',
 *   install(world) { ... },
 * });
 * ```
 */

// Overload: world type param
export function createPluginFactory<W extends AnyECSpresso>(): <
	Labels extends string = never,
	Groups extends string = never,
	AssetGroupNames extends string = never,
	ReactiveQueryNames extends string = never,
>(config: { id: string; install: (world: W) => void }) =>
	Plugin<
		ComponentsOf<W>, EventsOf<W>, ResourcesOf<W>,
		AssetTypesOf<W>, ScreenStatesOf<W>,
		Labels, Groups, AssetGroupNames, ReactiveQueryNames
	>;

// Overload: explicit C/E/R/A/S type params
export function createPluginFactory<
	C extends Record<string, any> = {},
	E extends Record<string, any> = {},
	R extends Record<string, any> = {},
	A extends Record<string, unknown> = {},
	S extends Record<string, ScreenDefinition<any, any>> = {},
>(): <
	Labels extends string = never,
	Groups extends string = never,
	AssetGroupNames extends string = never,
	ReactiveQueryNames extends string = never,
>(config: { id: string; install: (world: ECSpresso<C, E, R, A, S>) => void }) =>
	Plugin<C, E, R, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames>;

// Implementation
export function createPluginFactory() {
	return (config: { id: string; install: (world: any) => void }) =>
		definePlugin(config);
}
