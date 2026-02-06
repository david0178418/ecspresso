import type ECSpresso from "./ecspresso";
import AssetManager, { AssetConfiguratorImpl, createAssetConfigurator } from "./asset-manager";
import ScreenManager, { ScreenConfiguratorImpl, createScreenConfigurator } from "./screen-manager";
import type { ResourceFactoryWithDeps } from "./resource-manager";
import type Bundle from "./bundle";
import type { BundlesAreCompatible, TypesAreCompatible } from "./type-utils";
import type { AssetConfigurator, AssetsResource } from "./asset-types";
import type { ScreenDefinition, ScreenConfigurator, ScreenResource } from "./screen-types";

/**
 * Helper type: finalize built-in resources ($assets, $screen) in the resource map.
 * Auto-injects $assets/$screen when bundles contribute asset/screen types even without
 * explicit withAssets()/withScreens(). Also narrows the AssetGroupNames on $assets.
 */
type FinalizeBuiltinResources<R, A extends Record<string, unknown>, S extends Record<string, ScreenDefinition<any, any>>, AG extends string> =
	Omit<R, '$assets' | '$screen'>
	& ([keyof A] extends [never] ? {} : { $assets: AssetsResource<A, AG> })
	& ([keyof S] extends [never] ? {} : { $screen: ScreenResource<S> });

/**
	* Builder class for ECSpresso that provides fluent type-safe bundle installation.
	* Handles type checking during build process to ensure type safety.
*/
export class ECSpressoBuilder<
	C extends Record<string, any> = {},
	E extends Record<string, any> = {},
	R extends Record<string, any> = {},
	A extends Record<string, unknown> = {},
	S extends Record<string, ScreenDefinition<any, any>> = {},
	Labels extends string = never,
	Groups extends string = never,
	AssetGroupNames extends string = never,
	ReactiveQueryNames extends string = never,
> {
	/** The ECSpresso instance being built*/
	private ecspresso: ECSpresso<C, E, R, A, S>;
	/** Asset configurator for collecting asset definitions */
	private assetConfigurator: AssetConfiguratorImpl<A> | null = null;
	/** Screen configurator for collecting screen definitions */
	private screenConfigurator: ScreenConfiguratorImpl<S> | null = null;
	/** Pending resources to add during build */
	private pendingResources: Array<{ key: string; value: unknown }> = [];
	/** Pending dispose callbacks to register during build */
	private pendingDisposeCallbacks: Array<{ key: string; callback: (value: unknown) => void }> = [];
	/** Pending required component registrations to apply during build */
	private pendingRequiredComponents: Array<{ trigger: string; required: string; factory: (triggerValue: any) => unknown }> = [];
	/** Fixed timestep interval (null means use default 1/60) */
	private _fixedDt: number | null = null;

	constructor() {
		// Dynamic import to avoid circular dependency at module level.
		// ECSpresso imports ECSpressoBuilder (for create()), and ECSpressoBuilder
		// needs to instantiate ECSpresso. Using require() defers the resolution.
		const { default: ECSpressoClass } = require("./ecspresso");
		this.ecspresso = new ECSpressoClass() as ECSpresso<C, E, R, A, S>;
	}

	/**
		* Add the first bundle when starting with empty types.
		* This overload allows any bundle to be added to an empty ECSpresso instance.
	*/
	withBundle<
		BC extends Record<string, any>,
		BE extends Record<string, any>,
		BR extends Record<string, any>,
		BA extends Record<string, unknown> = {},
		BS extends Record<string, ScreenDefinition<any, any>> = {},
		BL extends string = never,
		BG extends string = never,
		BAG extends string = never,
		BRQ extends string = never,
	>(
		this: ECSpressoBuilder<{}, {}, {}, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames>,
		bundle: Bundle<BC, BE, BR, BA, BS, BL, BG, BAG, BRQ>
	): ECSpressoBuilder<BC, BE, BR, A & BA, S & BS, Labels | BL, Groups | BG, AssetGroupNames | BAG, ReactiveQueryNames | BRQ>;

	/**
		* Add a subsequent bundle with type checking.
		* This overload enforces bundle type compatibility.
	*/
	withBundle<
		BC extends Record<string, any>,
		BE extends Record<string, any>,
		BR extends Record<string, any>,
		BA extends Record<string, unknown> = {},
		BS extends Record<string, ScreenDefinition<any, any>> = {},
		BL extends string = never,
		BG extends string = never,
		BAG extends string = never,
		BRQ extends string = never,
	>(
		bundle: BundlesAreCompatible<C, BC, E, BE, R, BR, A, BA, S, BS> extends true
			? Bundle<BC, BE, BR, BA, BS, BL, BG, BAG, BRQ>
			: never
	): ECSpressoBuilder<C & BC, E & BE, R & BR, A & BA, S & BS, Labels | BL, Groups | BG, AssetGroupNames | BAG, ReactiveQueryNames | BRQ>;

	/**
		* Implementation of both overloads.
		* Since the type compatibility is checked in the method signature,
		* we can safely assume the bundle is compatible here.
	*/
	withBundle<
		BC extends Record<string, any>,
		BE extends Record<string, any>,
		BR extends Record<string, any>,
		BA extends Record<string, unknown> = {},
		BS extends Record<string, ScreenDefinition<any, any>> = {},
		BL extends string = never,
		BG extends string = never,
		BAG extends string = never,
		BRQ extends string = never,
	>(
		bundle: Bundle<BC, BE, BR, BA, BS, BL, BG, BAG, BRQ>
	): ECSpressoBuilder<C & BC, E & BE, R & BR, A & BA, S & BS, Labels | BL, Groups | BG, AssetGroupNames | BAG, ReactiveQueryNames | BRQ> {
		// Install the bundle
		// Type compatibility is guaranteed by method overloads
		this.ecspresso._installBundle(bundle);

		// Return a builder with the updated type parameters
		return this as unknown as ECSpressoBuilder<C & BC, E & BE, R & BR, A & BA, S & BS, Labels | BL, Groups | BG, AssetGroupNames | BAG, ReactiveQueryNames | BRQ>;
	}

	/**
	 * Add application-specific component types to the builder chain.
	 * This is a pure type-level operation with no runtime cost.
	 * Conflicts with existing component types (same key, different type) produce a `never` return.
	 */
	withComponentTypes<T extends Record<string, any>>(): TypesAreCompatible<C, T> extends true
		? ECSpressoBuilder<C & T, E, R, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames>
		: never;
	withComponentTypes<T extends Record<string, any>>(): ECSpressoBuilder<C & T, E, R, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames> {
		return this as unknown as ECSpressoBuilder<C & T, E, R, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames>;
	}

	/**
	 * Add application-specific event types to the builder chain.
	 * This is a pure type-level operation with no runtime cost.
	 * Conflicts with existing event types (same key, different type) produce a `never` return.
	 */
	withEventTypes<T extends Record<string, any>>(): TypesAreCompatible<E, T> extends true
		? ECSpressoBuilder<C, E & T, R, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames>
		: never;
	withEventTypes<T extends Record<string, any>>(): ECSpressoBuilder<C, E & T, R, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames> {
		return this as unknown as ECSpressoBuilder<C, E & T, R, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames>;
	}

	/**
	 * Add a resource during ECSpresso construction
	 * @param key The resource key
	 * @param resource The resource value, factory function, or factory with dependencies/disposal
	 * @returns This builder with updated resource types
	 *
	 * @example
	 * ```typescript
	 * ECSpresso.create<Components, Events, Resources>()
	 *   .withResource('config', { debug: true })
	 *   .withResource('counter', () => 42)
	 *   .withResource('derived', {
	 *     dependsOn: ['base'],
	 *     factory: (ecs) => ecs.getResource('base') * 2,
	 *     onDispose: (value) => console.log('Disposed:', value)
	 *   })
	 *   .build();
	 * ```
	 */
	withResource<K extends string, V>(
		key: K,
		resource: V | ((context: ECSpresso<C, E, R & Record<K, V>, A, S>) => V | Promise<V>) | ResourceFactoryWithDeps<V, ECSpresso<C, E, R & Record<K, V>, A, S>, keyof (R & Record<K, V>) & string>
	): ECSpressoBuilder<C, E, R & Record<K, V>, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames> {
		this.pendingResources.push({ key, value: resource });
		return this as unknown as ECSpressoBuilder<C, E, R & Record<K, V>, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames>;
	}

	/**
	 * Register a dispose callback for a component type during build.
	 * Called when a component is removed (explicit removal, entity destruction, or replacement).
	 * @param componentName The component type to register disposal for
	 * @param callback Function receiving the component value being disposed
	 * @returns This builder for method chaining
	 */
	withDispose<K extends keyof C & string>(
		componentName: K,
		callback: (value: C[K]) => void
	): this {
		this.pendingDisposeCallbacks.push({ key: componentName, callback: callback as (value: unknown) => void });
		return this;
	}

	/**
	 * Register a required component relationship during build.
	 * When an entity gains `trigger`, the `required` component is auto-added
	 * (using `factory` for the default value) if not already present.
	 * @param trigger The component whose presence triggers auto-addition
	 * @param required The component to auto-add
	 * @param factory Function that creates the default value for the required component
	 * @returns This builder for method chaining
	 */
	withRequired<
		Trigger extends keyof C & string,
		Required extends keyof C & string,
	>(
		trigger: Trigger,
		required: Required,
		factory: (triggerValue: C[Trigger]) => C[Required]
	): this {
		this.pendingRequiredComponents.push({
			trigger,
			required,
			factory: factory as (triggerValue: any) => unknown,
		});
		return this;
	}

	/**
	 * Configure assets for this ECSpresso instance
	 * @param configurator Function that receives an AssetConfigurator and returns it after adding assets
	 * @returns This builder with updated asset types
	 *
	 * @example
	 * ```typescript
	 * ECSpresso.create<Components, Events, Resources>()
	 *   .withAssets(assets => assets
	 *     .add('playerSprite', () => loadTexture('player.png'))
	 *     .addGroup('level1', {
	 *       background: () => loadTexture('level1-bg.png'),
	 *       music: () => loadAudio('level1.mp3'),
	 *     })
	 *   )
	 *   .build();
	 * ```
	 */
	withAssets<NewA extends Record<string, unknown>, NewG extends string = never>(
		configurator: (assets: AssetConfigurator<{}, never>) => AssetConfigurator<NewA, NewG>
	): ECSpressoBuilder<C, E, R & { $assets: AssetsResource<A & NewA, string> }, A & NewA, S, Labels, Groups, AssetGroupNames | NewG, ReactiveQueryNames> {
		const assetConfig = createAssetConfigurator<{}, never>();
		configurator(assetConfig);
		this.assetConfigurator = assetConfig as unknown as AssetConfiguratorImpl<A>;
		return this as unknown as ECSpressoBuilder<C, E, R & { $assets: AssetsResource<A & NewA, string> }, A & NewA, S, Labels, Groups, AssetGroupNames | NewG, ReactiveQueryNames>;
	}

	/**
	 * Configure screens for this ECSpresso instance
	 * @param configurator Function that receives a ScreenConfigurator and returns it after adding screens
	 * @returns This builder with updated screen types
	 *
	 * @example
	 * ```typescript
	 * ECSpresso.create<Components, Events, Resources>()
	 *   .withScreens(screens => screens
	 *     .add('loading', {
	 *       initialState: () => ({ progress: 0 }),
	 *     })
	 *     .add('gameplay', {
	 *       initialState: ({ level }) => ({ score: 0, level }),
	 *       requiredAssetGroups: ['level1'],
	 *     })
	 *   )
	 *   .build();
	 * ```
	 */
	withScreens<NewS extends Record<string, ScreenDefinition<any, any>>>(
		configurator: (screens: ScreenConfigurator<{}, ECSpresso<C, E, R, A, Record<string, ScreenDefinition>>>) => ScreenConfigurator<NewS, ECSpresso<C, E, R, A, Record<string, ScreenDefinition>>>
	): ECSpressoBuilder<C, E, R & { $screen: ScreenResource<S & NewS> }, A, S & NewS, Labels, Groups, AssetGroupNames, ReactiveQueryNames> {
		const screenConfig = createScreenConfigurator<{}, ECSpresso<C, E, R, A, Record<string, ScreenDefinition>>>();
		configurator(screenConfig);
		this.screenConfigurator = screenConfig as unknown as ScreenConfiguratorImpl<S>;
		return this as unknown as ECSpressoBuilder<C, E, R & { $screen: ScreenResource<S & NewS> }, A, S & NewS, Labels, Groups, AssetGroupNames, ReactiveQueryNames>;
	}

	/**
	 * Configure the fixed timestep interval for the fixedUpdate phase.
	 * @param dt The fixed timestep in seconds (e.g., 1/60 for 60Hz physics)
	 * @returns This builder for method chaining
	 */
	withFixedTimestep(dt: number): this {
		this._fixedDt = dt;
		return this;
	}

	/**
	 * Declare reactive query names that will be registered at runtime.
	 * This is a pure type-level operation with no runtime cost.
	 */
	withReactiveQueryNames<N extends string>(): ECSpressoBuilder<C, E, R, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames | N> {
		return this as unknown as ECSpressoBuilder<C, E, R, A, S, Labels, Groups, AssetGroupNames, ReactiveQueryNames | N>;
	}

	/**
		* Complete the build process and return the built ECSpresso instance
	*/
	build(): ECSpresso<
		C, E,
		FinalizeBuiltinResources<R, A, S, [AssetGroupNames] extends [never] ? string : AssetGroupNames>,
		A, S,
		[Labels] extends [never] ? string : Labels,
		[Groups] extends [never] ? string : Groups,
		[AssetGroupNames] extends [never] ? string : AssetGroupNames,
		[ReactiveQueryNames] extends [never] ? string : ReactiveQueryNames
	> {
		// Apply pending resources
		for (const { key, value } of this.pendingResources) {
			this.ecspresso.addResource(key as keyof R, value as any);
		}

		// Apply pending dispose callbacks
		for (const { key, callback } of this.pendingDisposeCallbacks) {
			this.ecspresso.registerDispose(key as keyof C, callback as (value: C[keyof C]) => void);
		}

		// Apply pending required component registrations
		for (const { trigger, required, factory } of this.pendingRequiredComponents) {
			this.ecspresso.registerRequired(
				trigger as keyof C,
				required as keyof C,
				factory as () => C[keyof C]
			);
		}

		// Set up asset manager if configured via withAssets(), or auto-create if bundles contributed assets
		if (this.assetConfigurator) {
			this.ecspresso._setAssetManager(this.assetConfigurator.getManager() as unknown as AssetManager<A>);
		} else if (this.ecspresso._hasPendingBundleAssets()) {
			this.ecspresso._setAssetManager(new AssetManager() as unknown as AssetManager<A>);
		}

		// Set up screen manager if configured via withScreens(), or auto-create if bundles contributed screens
		if (this.screenConfigurator) {
			this.ecspresso._setScreenManager(this.screenConfigurator.getManager() as unknown as ScreenManager<S>);
		} else if (this.ecspresso._hasPendingBundleScreens()) {
			this.ecspresso._setScreenManager(new ScreenManager() as unknown as ScreenManager<S>);
		}

		// Set fixed timestep if configured
		if (this._fixedDt !== null) {
			this.ecspresso._setFixedDt(this._fixedDt);
		}

		return this.ecspresso as unknown as ECSpresso<
			C, E,
			FinalizeBuiltinResources<R, A, S, [AssetGroupNames] extends [never] ? string : AssetGroupNames>,
			A, S,
			[Labels] extends [never] ? string : Labels,
			[Groups] extends [never] ? string : Groups,
			[AssetGroupNames] extends [never] ? string : AssetGroupNames,
			[ReactiveQueryNames] extends [never] ? string : ReactiveQueryNames
		>;
	}
}
