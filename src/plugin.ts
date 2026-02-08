import type ECSpresso from './ecspresso';
import type { ScreenDefinition } from './screen-types';

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
 * const myPlugin = definePlugin<MyComponents, MyEvents, MyResources>({
 *   id: 'my-plugin',
 *   install(world) {
 *     world.addSystem('mySystem')
 *       .addQuery('entities', { with: ['position'] })
 *       .setProcess((queries) => { ... })
 *       .and();
 *     world.addResource('myResource', { value: 42 });
 *   },
 * });
 * ```
 */
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
): Plugin<C, E, R, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames> {
	return config as Plugin<C, E, R, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames>;
}
