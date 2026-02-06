/**
 * Screen/State management types for ECSpresso ECS framework
 */

import type ECSpresso from './ecspresso';

/**
 * Definition for a screen including its state, lifecycle hooks, and requirements
 */
export interface ScreenDefinition<
	Config extends Record<string, unknown> = Record<string, never>,
	State extends Record<string, unknown> = Record<string, never>,
	W = ECSpresso<any, any, any, any, any>,
> {
	/**
	 * Function to create initial state from config
	 */
	readonly initialState: (config: Config) => State;
	/**
	 * Lifecycle hook called when entering this screen
	 */
	readonly onEnter?: (config: Config, ecs: W) => void | Promise<void>;
	/**
	 * Lifecycle hook called when exiting this screen
	 */
	readonly onExit?: (ecs: W) => void | Promise<void>;
	/**
	 * Asset keys that must be loaded before entering this screen
	 */
	readonly requiredAssets?: ReadonlyArray<string>;
	/**
	 * Asset groups that must be loaded before entering this screen
	 */
	readonly requiredAssetGroups?: ReadonlyArray<string>;
}

/**
 * Entry in the screen stack for overlay support
 */
export interface ScreenStackEntry<
	Screens extends Record<string, ScreenDefinition<any, any>>,
	K extends keyof Screens = keyof Screens
> {
	readonly name: K;
	readonly config: Screens[K] extends ScreenDefinition<infer C, any> ? Readonly<C> : never;
	state: Screens[K] extends ScreenDefinition<any, infer S> ? S : never;
}

/**
 * Helper to extract config type from a screen definition
 */
export type ScreenConfig<S extends ScreenDefinition<any, any>> =
	S extends ScreenDefinition<infer C, any> ? C : never;

/**
 * Helper to extract state type from a screen definition
 */
export type ScreenState<S extends ScreenDefinition<any, any>> =
	S extends ScreenDefinition<any, infer St> ? St : never;

/**
 * Resource interface for accessing screen state in systems
 * Exposed as $screen resource
 */
export interface ScreenResource<Screens extends Record<string, ScreenDefinition<any, any>>> {
	/**
	 * Current active screen name, or null if no screen
	 */
	readonly current: keyof Screens | null;
	/**
	 * Immutable config of the current screen
	 */
	readonly config: Readonly<ScreenConfig<Screens[keyof Screens]>> | null;
	/**
	 * Mutable state of the current screen
	 */
	state: ScreenState<Screens[keyof Screens]> | null;
	/**
	 * The screen stack (read-only view)
	 */
	readonly stack: ReadonlyArray<ScreenStackEntry<Screens>>;
	/**
	 * Whether the current screen is an overlay (has screens beneath it)
	 */
	readonly isOverlay: boolean;
	/**
	 * Current depth of the screen stack
	 */
	readonly stackDepth: number;
	/**
	 * Check if a specific screen is currently active (either current or in stack)
	 */
	isActive(screenName: keyof Screens): boolean;
	/**
	 * Check if a specific screen is the current screen
	 */
	isCurrent(screenName: keyof Screens): boolean;
}

/**
 * Events emitted by the screen system.
 * @typeParam S - Screen name type (defaults to `string` for backward compatibility)
 */
export interface ScreenEvents<S extends string = string> {
	screenEnter: { screen: S; config: unknown };
	screenExit: { screen: S };
	screenPush: { screen: S; config: unknown };
	screenPop: { screen: S };
}

/**
 * Configuration for screen definitions during builder setup
 */
export interface ScreenConfigurator<Screens extends Record<string, ScreenDefinition<any, any>>, W = unknown> {
	/**
	 * Add a screen definition
	 */
	add<K extends string, Config extends Record<string, unknown>, State extends Record<string, unknown>>(
		name: K,
		definition: ScreenDefinition<Config, State, W>
	): ScreenConfigurator<Screens & Record<K, ScreenDefinition<Config, State, W>>, W>;
}

/**
 * Type-safe screen state getter result
 */
export type CurrentScreenState<
	Screens extends Record<string, ScreenDefinition<any, any>>,
	CurrentScreen extends keyof Screens
> = Screens[CurrentScreen] extends ScreenDefinition<any, infer S> ? S : never;

/**
 * Type-safe screen config getter result
 */
export type CurrentScreenConfig<
	Screens extends Record<string, ScreenDefinition<any, any>>,
	CurrentScreen extends keyof Screens
> = Screens[CurrentScreen] extends ScreenDefinition<infer C, any> ? Readonly<C> : never;
