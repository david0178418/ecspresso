import EntityManager from "./entity-manager";
import EventBus from "./event-bus";
import ResourceManager from "./resource-manager";
import AssetManager, { AssetConfiguratorImpl, createAssetConfigurator } from "./asset-manager";
import ScreenManager, { ScreenConfiguratorImpl, createScreenConfigurator } from "./screen-manager";
import type { System, FilteredEntity, Entity } from "./types";
import type Bundle from "./bundle";
import { createEcspressoSystemBuilder } from "./system-builder";
import { version } from "../package.json";
import type { BundlesAreCompatible } from "./type-utils";
import type { AssetHandle, AssetConfigurator } from "./asset-types";
import type { ScreenDefinition, ScreenConfigurator } from "./screen-types";

/**
	* Interface declaration for ECSpresso constructor to ensure type augmentation works properly.
	* This merges with the class declaration below.
*/
export default interface ECSpresso<
	ComponentTypes extends Record<string, any> = {},
	EventTypes extends Record<string, any> = {},
	ResourceTypes extends Record<string, any> = {},
	AssetTypes extends Record<string, unknown> = {},
	ScreenStates extends Record<string, ScreenDefinition<any, any>> = {},
> {
	/**
		* Default constructor
	*/
	new(): ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>;
}

const EmptyQueryResults = {};

/**
	* ECSpresso is the central ECS framework class that connects all features.
	* It handles creation and management of entities, components, and systems, and provides lifecycle hooks.
*/
export default class ECSpresso<
	ComponentTypes extends Record<string, any> = {},
	EventTypes extends Record<string, any> = {},
	ResourceTypes extends Record<string, any> = {},
	AssetTypes extends Record<string, unknown> = {},
	ScreenStates extends Record<string, ScreenDefinition<any, any>> = {},
> {
	/** Library version*/
	public static readonly VERSION = version;

	/** Access/modify stored components and entities*/
	private _entityManager: EntityManager<ComponentTypes>;
	/** Publish/subscribe to events*/
	private _eventBus: EventBus<EventTypes>;
	/** Access/modify registered resources*/
	private _resourceManager: ResourceManager<ResourceTypes>;

	/** Registered systems that will be updated in order*/
	private _systems: Array<System<ComponentTypes, any, any, EventTypes, ResourceTypes, AssetTypes, ScreenStates>> = [];
	/** Cached sorted systems for efficient updates */
	private _sortedSystems: Array<System<ComponentTypes, any, any, EventTypes, ResourceTypes, AssetTypes, ScreenStates>> = [];
	/** Track installed bundles to prevent duplicates*/
	private _installedBundles: Set<string> = new Set();
	/** Asset manager for loading and accessing assets */
	private _assetManager: AssetManager<AssetTypes> | null = null;
	/** Screen manager for state/screen transitions */
	private _screenManager: ScreenManager<ScreenStates> | null = null;

	/**
		* Creates a new ECSpresso instance.
	*/
	constructor() {
		this._entityManager = new EntityManager<ComponentTypes>();
		this._eventBus = new EventBus<EventTypes>();
		this._resourceManager = new ResourceManager<ResourceTypes>();
		this._sortedSystems = []; // Initialize the sorted systems array
	}

	/**
		* Creates a new ECSpresso builder for type-safe bundle installation.
		* This is the preferred way to create an ECSpresso instance with bundles.
	 *
		* @returns A builder instance for fluent method chaining
	 *
		* @example
		* ```typescript
		* const ecs = ECSpresso.create<BaseComponents, BaseEvents, BaseResources>()
	 *	 .withBundle(bundle1)
	 *	 .withBundle(bundle2)
	 *	 .build();
		* ```
	*/
	static create<
		C extends Record<string, any> = {},
		E extends Record<string, any> = {},
		R extends Record<string, any> = {},
		A extends Record<string, unknown> = {},
		S extends Record<string, ScreenDefinition<any, any>> = {},
	>(): ECSpressoBuilder<C, E, R, A, S> {
		return new ECSpressoBuilder<C, E, R, A, S>();
	}

	/**
		* Adds a system directly to this ECSpresso instance
		* @param label Unique name to identify the system
		* @returns A SystemBuilder instance for method chaining
	*/
	addSystem(label: string) {
		return createEcspressoSystemBuilder<
			ComponentTypes,
			EventTypes,
			ResourceTypes
		>(label, this);
	}

	/**
		* Update all systems, passing deltaTime and query results to each system's process function
		* @param deltaTime Time elapsed since the last update (in seconds)
	*/
	update(deltaTime: number) {
		const currentScreen = this._screenManager?.getCurrentScreen() ?? null;

		// Use the cached sorted systems array instead of re-sorting on every update
		for (const system of this._sortedSystems) {
			if (!system.process) continue;

			// Screen filtering - skip if system is restricted to specific screens
			if (system.inScreens?.length) {
				if (currentScreen === null || !system.inScreens.includes(currentScreen as string)) {
					continue;
				}
			}

			// Screen exclusion - skip if system excludes current screen
			if (system.excludeScreens?.length) {
				if (currentScreen !== null && system.excludeScreens.includes(currentScreen as string)) {
					continue;
				}
			}

			// Asset requirements - skip if required assets not loaded
			if (system.requiredAssets?.length && this._assetManager) {
				let assetsReady = true;
				for (const assetKey of system.requiredAssets) {
					if (!this._assetManager.isLoaded(assetKey as keyof AssetTypes)) {
						assetsReady = false;
						break;
					}
				}
				if (!assetsReady) continue;
			}

			// Prepare query results for each defined query in the system
			const queryResults: Record<string, any> = {};
			let hasResults = false;
			let hasQueries = false;

			if (system.entityQueries) {
				for (const queryName in system.entityQueries) {
					hasQueries = true;

					const query = system.entityQueries[queryName];

					if (query) {
						queryResults[queryName] = this._entityManager.getEntitiesWithQuery(
							query.with,
							query.without || []
						);

						if(queryResults[queryName].length) {
							hasResults = true; // At least one query has results
						}
					}
				}
			}

			// Call the system's process function only if there are results or there is no query.
			if (hasResults) {
				system.process(queryResults, deltaTime, this);
			} else if(!hasQueries) {
				system.process(EmptyQueryResults, deltaTime, this);
			}
		}
	}

	/**
	 * Initialize all resources and systems
	 * This method:
	 * 1. Initializes all resources that were added as factory functions
	 * 2. Sets up asset manager and loads eager assets
	 * 3. Sets up screen manager
	 * 4. Calls the onInitialize lifecycle hook on all systems
	 *
	 * This is useful for game startup to ensure all resources are ready
	 * and systems are properly initialized before the game loop begins.
	 *
	 * @param resourceKeys Optional array of specific resource keys to initialize
	 * @returns Promise that resolves when everything is initialized
	 */
	async initialize(): Promise<void> {
		await this.initializeResources();

		// Set up asset manager if present
		if (this._assetManager) {
			this._assetManager.setEventBus(this._eventBus as unknown as EventBus<any>);
			await this._assetManager.loadEagerAssets();
			this._resourceManager.add('$assets' as keyof ResourceTypes, this._assetManager.createResource() as unknown as ResourceTypes[keyof ResourceTypes]);
		}

		// Set up screen manager if present
		if (this._screenManager) {
			this._screenManager.setDependencies(
				this._eventBus as unknown as EventBus<any>,
				this._assetManager,
				this as unknown as ECSpresso<any, any, any, any, any>
			);
			this._resourceManager.add('$screen' as keyof ResourceTypes, this._screenManager.createResource() as unknown as ResourceTypes[keyof ResourceTypes]);
		}

		for (const system of this._systems) {
			await system.onInitialize?.(this);
		}
	}

	/**
	 * Initialize specific resources or all resources that were added as factory functions but haven't been initialized yet.
	 * This is useful when you need to ensure resources are ready before proceeding.
	 * @param keys Optional array of resource keys to initialize. If not provided, all pending resources will be initialized.
	 * @returns Promise that resolves when the specified resources are initialized
	 */
	async initializeResources<K extends keyof ResourceTypes>(...keys: K[]): Promise<void> {
		await this._resourceManager.initializeResources(this, ...keys);
	}

	/**
		* Sort the systems array by priority (higher priority first)
		* Called internally when system list changes
		* @private
	*/
	private _sortSystems(): void {
		this._sortedSystems = [...this._systems].sort((a, b) => {
			const priorityA = a.priority ?? 0;
			const priorityB = b.priority ?? 0;
			return priorityB - priorityA; // Higher priority executes first
		});
	}

	/**
		* Update the priority of a system
		* @param label The unique label of the system to update
		* @param priority The new priority value (higher values execute first)
		* @returns true if the system was found and updated, false otherwise
	*/
	updateSystemPriority(label: string, priority: number): boolean {
		const system = this._systems.find(system => system.label === label);
		if (!system) return false;

		// Set the new priority
		system.priority = priority;

		// Re-sort the systems array
		this._sortSystems();

		return true;
	}

	/**
		* Remove a system by its label
		* Calls the system's onDetach method with this ECSpresso instance if defined
		* @param label The unique label of the system to remove
		* @returns true if the system was found and removed, false otherwise
	*/
	removeSystem(label: string): boolean {
		const index = this._systems.findIndex(system => system.label === label);
		if (index === -1) return false;

		const system = this._systems[index];
		// This should never happen since we just found the system by index
		if (!system) return false;

		// Call the onDetach lifecycle hook if defined
		if (system.onDetach) {
			system.onDetach(this);
		}

		// Remove system
		this._systems.splice(index, 1);

		// Re-sort systems
		this._sortSystems();

		return true;
	}

	/**
		* Internal method to register a system with this ECSpresso instance
		* @internal Used by SystemBuilder - replaces direct private property access
	*/
	_registerSystem(system: System<ComponentTypes, any, any, EventTypes, ResourceTypes, AssetTypes, ScreenStates>): void {
		this._systems.push(system);
		this._sortSystems();

		// Set up event handlers if they exist
		if (!system.eventHandlers) return;

		for (const eventName in system.eventHandlers) {
			const handler = system.eventHandlers[eventName]?.handler;
			if (handler) {
				this._eventBus.subscribe(eventName, (data) => {
					handler(data, this);
				});
			}
		}
	}

	/**
		* Check if a resource exists
	*/
	hasResource<K extends keyof ResourceTypes>(key: K): boolean {
		return this._resourceManager.has(key);
	}

	/**
		* Get a resource if it exists, or undefined if not
	*/
	getResource<K extends keyof ResourceTypes>(key: K): ResourceTypes[K] {
		const resource = this._resourceManager.get(key, this);

		if (!resource) throw new Error(`Resource '${String(key)}' not found. Available resources: [${this.getResourceKeys().map(k => String(k)).join(', ')}]`);

		return resource;
	}

	/**
		* Add a resource to the ECS instance
	*/
	addResource<K extends keyof ResourceTypes>(
		key: K,
		resource: ResourceTypes[K] | ((ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>) => ResourceTypes[K] | Promise<ResourceTypes[K]>)
	): this {
		this._resourceManager.add(key, resource);
		return this;
	}

	/**
		* Remove a resource from the ECS instance
		* @param key The resource key to remove
		* @returns True if the resource was removed, false if it didn't exist
	*/
	removeResource<K extends keyof ResourceTypes>(key: K): boolean {
		return this._resourceManager.remove(key);
	}

	/**
		* Update an existing resource using an updater function
		* @param key The resource key to update
		* @param updater Function that receives the current resource value and returns the new value
		* @returns This ECSpresso instance for chaining
		* @throws Error if the resource doesn't exist
	*/
	updateResource<K extends keyof ResourceTypes>(
		key: K,
		updater: (current: ResourceTypes[K]) => ResourceTypes[K]
	): this {
		const currentResource = this.getResource(key);
		const updatedResource = updater(currentResource);
		this._resourceManager.add(key, updatedResource);
		return this;
	}

	/**
		* Get all resource keys that are currently registered
		* @returns Array of resource keys
	*/
	getResourceKeys(): Array<keyof ResourceTypes> {
		return this._resourceManager.getKeys() as Array<keyof ResourceTypes>;
	}

	/**
		* Check if a resource needs initialization (was added as a factory function)
		* @param key The resource key to check
		* @returns True if the resource needs initialization
	*/
	resourceNeedsInitialization<K extends keyof ResourceTypes>(key: K): boolean {
		return this._resourceManager.needsInitialization(key);
	}

	/**
		* Check if an entity has a component
	*/
	hasComponent<K extends keyof ComponentTypes>(
		entityId: number,
		componentName: K
	): boolean {
		const component = this._entityManager.getComponent(entityId, componentName);
		return component !== null;
	}

	/**
		* Create an entity and add components to it in one call
		* @param components Object with component names as keys and component data as values
		* @returns The created entity with all components added
		*/
	spawn<T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }>(
		components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
	): Entity<ComponentTypes> {
		const entity = this._entityManager.createEntity();
		this._entityManager.addComponents(entity, components);
		return entity;
	}

	/**
		* Get all entities with specific components
	*/
	getEntitiesWithQuery<
		WithComponents extends keyof ComponentTypes,
		WithoutComponents extends keyof ComponentTypes = never
	>(
		withComponents: ReadonlyArray<WithComponents>,
		withoutComponents: ReadonlyArray<WithoutComponents> = []
	): Array<FilteredEntity<ComponentTypes, WithComponents, WithoutComponents>> {
		return this._entityManager.getEntitiesWithQuery(
			withComponents,
			withoutComponents
		);
	}

	/**
		* Get all installed bundle IDs
	*/
	get installedBundles(): string[] {
		return Array.from(this._installedBundles);
	}

	// Getters for the internal managers
	get entityManager() {
		return this._entityManager;
	}

	get eventBus() {
		return this._eventBus;
	}

	// ==================== Asset Management ====================

	/**
	 * Get a loaded asset by key. Throws if not loaded.
	 */
	getAsset<K extends keyof AssetTypes>(key: K): AssetTypes[K] {
		if (!this._assetManager) {
			throw new Error('Asset manager not configured. Use withAssets() in builder.');
		}
		return this._assetManager.get(key);
	}

	/**
	 * Get a loaded asset or undefined if not loaded
	 */
	getAssetOrUndefined<K extends keyof AssetTypes>(key: K): AssetTypes[K] | undefined {
		return this._assetManager?.getOrUndefined(key);
	}

	/**
	 * Get a handle to an asset with status information
	 */
	getAssetHandle<K extends keyof AssetTypes>(key: K): AssetHandle<AssetTypes[K]> {
		if (!this._assetManager) {
			throw new Error('Asset manager not configured. Use withAssets() in builder.');
		}
		return this._assetManager.getHandle(key);
	}

	/**
	 * Check if an asset is loaded
	 */
	isAssetLoaded<K extends keyof AssetTypes>(key: K): boolean {
		return this._assetManager?.isLoaded(key) ?? false;
	}

	/**
	 * Load a single asset
	 */
	async loadAsset<K extends keyof AssetTypes>(key: K): Promise<AssetTypes[K]> {
		if (!this._assetManager) {
			throw new Error('Asset manager not configured. Use withAssets() in builder.');
		}
		return this._assetManager.loadAsset(key);
	}

	/**
	 * Load all assets in a group
	 */
	async loadAssetGroup(groupName: string): Promise<void> {
		if (!this._assetManager) {
			throw new Error('Asset manager not configured. Use withAssets() in builder.');
		}
		return this._assetManager.loadAssetGroup(groupName);
	}

	/**
	 * Check if all assets in a group are loaded
	 */
	isAssetGroupLoaded(groupName: string): boolean {
		return this._assetManager?.isGroupLoaded(groupName) ?? false;
	}

	/**
	 * Get the loading progress of a group (0-1)
	 */
	getAssetGroupProgress(groupName: string): number {
		return this._assetManager?.getGroupProgress(groupName) ?? 0;
	}

	// ==================== Screen Management ====================

	/**
	 * Transition to a new screen, clearing the stack
	 */
	async setScreen<K extends keyof ScreenStates>(
		name: K,
		config: ScreenStates[K] extends ScreenDefinition<infer C, any> ? C : never
	): Promise<void> {
		if (!this._screenManager) {
			throw new Error('Screen manager not configured. Use withScreens() in builder.');
		}
		return this._screenManager.setScreen(name, config);
	}

	/**
	 * Push a screen onto the stack (overlay)
	 */
	async pushScreen<K extends keyof ScreenStates>(
		name: K,
		config: ScreenStates[K] extends ScreenDefinition<infer C, any> ? C : never
	): Promise<void> {
		if (!this._screenManager) {
			throw new Error('Screen manager not configured. Use withScreens() in builder.');
		}
		return this._screenManager.pushScreen(name, config);
	}

	/**
	 * Pop the current screen and return to the previous one
	 */
	async popScreen(): Promise<void> {
		if (!this._screenManager) {
			throw new Error('Screen manager not configured. Use withScreens() in builder.');
		}
		return this._screenManager.popScreen();
	}

	/**
	 * Get the current screen name
	 */
	getCurrentScreen(): keyof ScreenStates | null {
		return this._screenManager?.getCurrentScreen() ?? null;
	}

	/**
	 * Get the current screen config (immutable)
	 */
	getScreenConfig<K extends keyof ScreenStates>(): ScreenStates[K] extends ScreenDefinition<infer C, any> ? Readonly<C> : never {
		if (!this._screenManager) {
			throw new Error('Screen manager not configured. Use withScreens() in builder.');
		}
		return this._screenManager.getConfig();
	}

	/**
	 * Get the current screen config or null
	 */
	getScreenConfigOrNull<K extends keyof ScreenStates>(): (ScreenStates[K] extends ScreenDefinition<infer C, any> ? Readonly<C> : never) | null {
		return this._screenManager?.getConfigOrNull() ?? null;
	}

	/**
	 * Get the current screen state (mutable)
	 */
	getScreenState<K extends keyof ScreenStates>(): ScreenStates[K] extends ScreenDefinition<any, infer S> ? S : never {
		if (!this._screenManager) {
			throw new Error('Screen manager not configured. Use withScreens() in builder.');
		}
		return this._screenManager.getState();
	}

	/**
	 * Get the current screen state or null
	 */
	getScreenStateOrNull<K extends keyof ScreenStates>(): (ScreenStates[K] extends ScreenDefinition<any, infer S> ? S : never) | null {
		return this._screenManager?.getStateOrNull() ?? null;
	}

	/**
	 * Update the current screen state
	 */
	updateScreenState<K extends keyof ScreenStates>(
		update: Partial<ScreenStates[K] extends ScreenDefinition<any, infer S> ? S : never> |
			((current: ScreenStates[K] extends ScreenDefinition<any, infer S> ? S : never) => Partial<ScreenStates[K] extends ScreenDefinition<any, infer S> ? S : never>)
	): void {
		if (!this._screenManager) {
			throw new Error('Screen manager not configured. Use withScreens() in builder.');
		}
		this._screenManager.updateState(update as any);
	}

	/**
	 * Check if a screen is the current screen
	 */
	isCurrentScreen(screenName: keyof ScreenStates): boolean {
		return this._screenManager?.isCurrent(screenName) ?? false;
	}

	/**
	 * Check if a screen is active (current or in stack)
	 */
	isScreenActive(screenName: keyof ScreenStates): boolean {
		return this._screenManager?.isActive(screenName) ?? false;
	}

	/**
	 * Get the screen stack depth
	 */
	getScreenStackDepth(): number {
		return this._screenManager?.getStackDepth() ?? 0;
	}

	// ==================== Internal Methods ====================

	/**
	 * Internal method to set the asset manager
	 * @internal Used by ECSpressoBuilder
	 */
	_setAssetManager(manager: AssetManager<AssetTypes>): void {
		this._assetManager = manager;
	}

	/**
	 * Internal method to set the screen manager
	 * @internal Used by ECSpressoBuilder
	 */
	_setScreenManager(manager: ScreenManager<ScreenStates>): void {
		this._screenManager = manager;
	}

	/**
		* Internal method to install a bundle into this ECSpresso instance.
		* Called by the ECSpressoBuilder during the build process.
		* The type safety is guaranteed by the builder's type system.
	*/
	_installBundle<
		C extends Record<string, any>,
		E extends Record<string, any>,
		R extends Record<string, any>,
		A extends Record<string, unknown> = {},
		S extends Record<string, ScreenDefinition<any, any>> = {},
	>(bundle: Bundle<C, E, R, A, S>): this {
		// Prevent duplicate installation of the same bundle
		if (this._installedBundles.has(bundle.id)) {
			return this;
		}

		// Mark this bundle as installed
		this._installedBundles.add(bundle.id);

		// Register systems from the bundle
		// The type compatibility is ensured by the builder's withBundle method
		// We need this cast due to TypeScript's limitations with generics
		type BundleEcspresso = ECSpresso<C, E, R>;
		bundle.registerSystemsWithEcspresso(this as unknown as BundleEcspresso);

		// Register resources from the bundle
		const resources = bundle.getResources();
		for (const [key, value] of resources.entries()) {
			// Instead of casting, use the add method's flexibility
			this._resourceManager.add(key as string, value);
		}

		// Register assets from the bundle if asset manager exists
		if (this._assetManager) {
			const assets = bundle.getAssets();
			for (const [key, definition] of assets.entries()) {
				this._assetManager.register(key, definition as any);
			}
		}

		// Register screens from the bundle if screen manager exists
		if (this._screenManager) {
			const screens = bundle.getScreens();
			for (const [name, definition] of screens.entries()) {
				this._screenManager.register(name, definition as any);
			}
		}

		return this;
	}
}

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
> {
	/** The ECSpresso instance being built*/
	private ecspresso: ECSpresso<C, E, R, A, S>;
	/** Asset configurator for collecting asset definitions */
	private assetConfigurator: AssetConfiguratorImpl<A> | null = null;
	/** Screen configurator for collecting screen definitions */
	private screenConfigurator: ScreenConfiguratorImpl<S> | null = null;

	constructor() {
		this.ecspresso = new ECSpresso<C, E, R, A, S>();
	}

	/**
		* Add the first bundle when starting with empty types.
		* This overload allows any bundle to be added to an empty ECSpresso instance.
	*/
	withBundle<
		BC extends Record<string, any>,
		BE extends Record<string, any>,
		BR extends Record<string, any>
	>(
		this: ECSpressoBuilder<{}, {}, {}, A, S>,
		bundle: Bundle<BC, BE, BR>
	): ECSpressoBuilder<BC, BE, BR, A, S>;

	/**
		* Add a subsequent bundle with type checking.
		* This overload enforces bundle type compatibility.
	*/
	withBundle<
		BC extends Record<string, any>,
		BE extends Record<string, any>,
		BR extends Record<string, any>
	>(
		bundle: BundlesAreCompatible<C, BC, E, BE, R, BR> extends true
			? Bundle<BC, BE, BR>
			: never
	): ECSpressoBuilder<C & BC, E & BE, R & BR, A, S>;

	/**
		* Implementation of both overloads.
		* Since the type compatibility is checked in the method signature,
		* we can safely assume the bundle is compatible here.
	*/
	withBundle<
		BC extends Record<string, any>,
		BE extends Record<string, any>,
		BR extends Record<string, any>
	>(
		bundle: Bundle<BC, BE, BR>
	): ECSpressoBuilder<C & BC, E & BE, R & BR, A, S> {
		// Install the bundle
		// Type compatibility is guaranteed by method overloads
		this.ecspresso._installBundle(bundle);

		// Return a builder with the updated type parameters
		return this as unknown as ECSpressoBuilder<C & BC, E & BE, R & BR, A, S>;
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
	withAssets<NewA extends Record<string, unknown>>(
		configurator: (assets: AssetConfigurator<{}>) => AssetConfigurator<NewA>
	): ECSpressoBuilder<C, E, R, A & NewA, S> {
		const assetConfig = createAssetConfigurator<{}>();
		configurator(assetConfig);
		this.assetConfigurator = assetConfig as unknown as AssetConfiguratorImpl<A>;
		return this as unknown as ECSpressoBuilder<C, E, R, A & NewA, S>;
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
		configurator: (screens: ScreenConfigurator<{}>) => ScreenConfigurator<NewS>
	): ECSpressoBuilder<C, E, R, A, S & NewS> {
		const screenConfig = createScreenConfigurator<{}>();
		configurator(screenConfig);
		this.screenConfigurator = screenConfig as unknown as ScreenConfiguratorImpl<S>;
		return this as unknown as ECSpressoBuilder<C, E, R, A, S & NewS>;
	}

	/**
		* Complete the build process and return the built ECSpresso instance
	*/
	build(): ECSpresso<C, E, R, A, S> {
		// Set up asset manager if configured
		if (this.assetConfigurator) {
			this.ecspresso._setAssetManager(this.assetConfigurator.getManager() as unknown as AssetManager<A>);
		}

		// Set up screen manager if configured
		if (this.screenConfigurator) {
			this.ecspresso._setScreenManager(this.screenConfigurator.getManager() as unknown as ScreenManager<S>);
		}

		return this.ecspresso;
	}
}
