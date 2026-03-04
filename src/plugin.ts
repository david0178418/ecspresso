import type ECSpresso from './ecspresso';
import type { SystemPhase } from './types';
import type {
	WorldConfig,
	EmptyConfig,
	MergeConfigs,
	AnyECSpresso,
	ConfigOf,
} from './type-utils';

/**
 * Plugin interface for ECSpresso. A plugin is a plain object with an `install`
 * function that configures a world directly, plus phantom properties for
 * compile-time type extraction.
 *
 * @typeParam Cfg - The WorldConfig this plugin provides (components, events, resources, etc.)
 * @typeParam Requires - The WorldConfig this plugin requires from other plugins
 */
export interface Plugin<
	Cfg extends WorldConfig = EmptyConfig,
	Requires extends WorldConfig = EmptyConfig,
	Labels extends string = never,
	Groups extends string = never,
	AssetGroupNames extends string = never,
	ReactiveQueryNames extends string = never,
> {
	readonly id: string;
	readonly install: (world: ECSpresso<MergeConfigs<Cfg, Requires>>) => void;
	// Phantom type for structural extraction (never set at runtime)
	readonly _cfg?: Cfg;
	readonly _requires?: Requires;
	// Phantom types for positional extraction (never set at runtime)
	readonly _labels?: Labels;
	readonly _groups?: Groups;
	readonly _assetGroupNames?: AssetGroupNames;
	readonly _reactiveQueryNames?: ReactiveQueryNames;
}

/**
 * Common configuration options shared by most plugins.
 * Plugin-specific options interfaces extend this with additional fields.
 */
export interface BasePluginOptions<G extends string = string> {
	/** System group name for all systems registered by this plugin */
	systemGroup?: G;
	/** Priority for the plugin's primary system (default varies per plugin) */
	priority?: number;
	/** Execution phase for the plugin's primary system */
	phase?: SystemPhase;
}

/**
 * Factory function to create a type-safe Plugin with phantom type parameters.
 * The type assertion adds phantom types without runtime cost.
 *
 * @example
 * ```typescript
 * // Option 1: Explicit config type param
 * const myPlugin = definePlugin<WorldConfigFrom<MyComponents, MyEvents, MyResources>>({
 *   id: 'my-plugin',
 *   install(world) { ... },
 * });
 *
 * // Option 2: Single world type param (extracts config automatically)
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
	Requires extends WorldConfig = EmptyConfig,
	Labels extends string = never,
	Groups extends string = never,
	AssetGroupNames extends string = never,
	ReactiveQueryNames extends string = never,
>(
	config: {
		id: string;
		install: (world: W) => void;
	}
): Plugin<ConfigOf<W>, Requires, Labels, Groups, AssetGroupNames, ReactiveQueryNames>;

// Overload: explicit config type param
export function definePlugin<
	Cfg extends WorldConfig = EmptyConfig,
	Requires extends WorldConfig = EmptyConfig,
	Labels extends string = never,
	Groups extends string = never,
	AssetGroupNames extends string = never,
	ReactiveQueryNames extends string = never,
>(
	config: {
		id: string;
		install: (world: ECSpresso<MergeConfigs<Cfg, Requires>>) => void;
	}
): Plugin<Cfg, Requires, Labels, Groups, AssetGroupNames, ReactiveQueryNames>;

// Implementation
export function definePlugin(
	config: {
		id: string;
		install: (world: any) => void;
	}
): Plugin {
	return config as Plugin;
}
