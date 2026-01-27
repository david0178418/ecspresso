import EntityManager from "./entity-manager";
import EventBus from "./event-bus";
import ResourceManager from "./resource-manager";
import AssetManager, { AssetConfiguratorImpl, createAssetConfigurator } from "./asset-manager";
import ScreenManager, { ScreenConfiguratorImpl, createScreenConfigurator } from "./screen-manager";
import ReactiveQueryManager, { type ReactiveQueryDefinition } from "./reactive-query-manager";
import type { System, FilteredEntity, Entity, RemoveEntityOptions, HierarchyEntry, HierarchyIteratorOptions } from "./types";
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
	/** Disabled system groups */
	private _disabledGroups: Set<string> = new Set();
	/** Asset manager for loading and accessing assets */
	private _assetManager: AssetManager<AssetTypes> | null = null;
	/** Screen manager for state/screen transitions */
	private _screenManager: ScreenManager<ScreenStates> | null = null;
	/** Reactive query manager for enter/exit callbacks */
	private _reactiveQueryManager: ReactiveQueryManager<ComponentTypes>;
	/** Post-update hooks to be called after all systems in update() */
	private _postUpdateHooks: Array<(ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>, deltaTime: number) => void> = [];

	/**
		* Creates a new ECSpresso instance.
	*/
	constructor() {
		this._entityManager = new EntityManager<ComponentTypes>();
		this._eventBus = new EventBus<EventTypes>();
		this._resourceManager = new ResourceManager<ResourceTypes>();
		this._reactiveQueryManager = new ReactiveQueryManager<ComponentTypes>(this._entityManager);
		this._sortedSystems = []; // Initialize the sorted systems array

		// Wire up component lifecycle hooks for reactive queries
		this._setupReactiveQueryHooks();
	}

	/**
	 * Sets up component lifecycle hooks for reactive query tracking
	 * @private
	 */
	private _setupReactiveQueryHooks(): void {
		// Batching mechanism: during addComponents, we defer reactive query checks
		// until all components are added to avoid intermediate state triggers
		let batchingDepth = 0;
		const pendingChecks = new Set<number>();

		const flushPendingChecks = () => {
			for (const entityId of pendingChecks) {
				const entity = this._entityManager.getEntity(entityId);
				if (entity) {
					// Do a full recheck of the entity against all queries
					this._reactiveQueryManager.recheckEntity(entity);
				}
			}
			pendingChecks.clear();
		};

		// Track added components for reactive queries
		const originalAddComponent = this._entityManager.addComponent.bind(this._entityManager);
		this._entityManager.addComponent = <K extends keyof ComponentTypes>(
			entityOrId: number | Entity<ComponentTypes>,
			componentName: K,
			data: ComponentTypes[K]
		) => {
			const result = originalAddComponent(entityOrId, componentName, data);
			const entityId = typeof entityOrId === 'number' ? entityOrId : entityOrId.id;

			if (batchingDepth > 0) {
				// During batching, just track that this entity needs checking
				pendingChecks.add(entityId);
			} else {
				// Not batching, check immediately
				const entity = this._entityManager.getEntity(entityId);
				if (entity) {
					this._reactiveQueryManager.onComponentAdded(entity, componentName);
				}
			}
			return result;
		};

		// Wrap addComponents to enable batching
		const originalAddComponents = this._entityManager.addComponents.bind(this._entityManager);
		this._entityManager.addComponents = <T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }>(
			entityOrId: number | Entity<ComponentTypes>,
			components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
		) => {
			batchingDepth++;
			const result = originalAddComponents(entityOrId, components);
			batchingDepth--;
			if (batchingDepth === 0) {
				flushPendingChecks();
			}
			return result;
		};

		// Track removed components for reactive queries
		const originalRemoveComponent = this._entityManager.removeComponent.bind(this._entityManager);
		this._entityManager.removeComponent = <K extends keyof ComponentTypes>(
			entityOrId: number | Entity<ComponentTypes>,
			componentName: K
		) => {
			const entityId = typeof entityOrId === 'number' ? entityOrId : entityOrId.id;
			const entity = this._entityManager.getEntity(entityId);
			const result = originalRemoveComponent(entityOrId, componentName);
			if (entity) {
				this._reactiveQueryManager.onComponentRemoved(entity, componentName);
			}
			return result;
		};

		// Track entity removal for reactive queries
		const originalRemoveEntity = this._entityManager.removeEntity.bind(this._entityManager);
		this._entityManager.removeEntity = (entityOrId, options?) => {
			const entityId = typeof entityOrId === 'number' ? entityOrId : entityOrId.id;
			// Notify reactive query manager about all entities being removed (including descendants)
			const entity = this._entityManager.getEntity(entityId);
			if (entity) {
				const cascade = options?.cascade ?? true;
				if (cascade) {
					const descendants = this._entityManager.getDescendants(entityId);
					for (const descId of descendants) {
						this._reactiveQueryManager.onEntityRemoved(descId);
					}
				}
				this._reactiveQueryManager.onEntityRemoved(entityId);
			}
			return originalRemoveEntity(entityOrId, options);
		};
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

			// Group filtering - skip if any of the system's groups is disabled (check first for efficiency)
			if (system.groups?.length) {
				let anyDisabled = false;
				for (const group of system.groups) {
					if (this._disabledGroups.has(group)) {
						anyDisabled = true;
						break;
					}
				}
				if (anyDisabled) continue;
			}

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

		// Call post-update hooks
		for (const hook of this._postUpdateHooks) {
			hook(this as unknown as ECSpresso<ComponentTypes, EventTypes, ResourceTypes>, deltaTime);
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

	// ==================== System Group Control ====================

	/**
	 * Disable a system group. Systems in this group will be skipped during update().
	 * @param groupName The name of the group to disable
	 */
	disableSystemGroup(groupName: string): void {
		this._disabledGroups.add(groupName);
	}

	/**
	 * Enable a system group. Systems in this group will run during update().
	 * @param groupName The name of the group to enable
	 */
	enableSystemGroup(groupName: string): void {
		this._disabledGroups.delete(groupName);
	}

	/**
	 * Check if a system group is enabled.
	 * @param groupName The name of the group to check
	 * @returns true if the group is enabled (or doesn't exist), false if disabled
	 */
	isSystemGroupEnabled(groupName: string): boolean {
		return !this._disabledGroups.has(groupName);
	}

	/**
	 * Get all system labels that belong to a specific group.
	 * @param groupName The name of the group
	 * @returns Array of system labels in the group
	 */
	getSystemsInGroup(groupName: string): string[] {
		return this._systems
			.filter(system => system.groups?.includes(groupName))
			.map(system => system.label);
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
		resource:
			| ResourceTypes[K]
			| ((ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>) => ResourceTypes[K] | Promise<ResourceTypes[K]>)
			| {
				dependsOn?: readonly string[];
				factory: (ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>) => ResourceTypes[K] | Promise<ResourceTypes[K]>;
				onDispose?: (resource: ResourceTypes[K], ecs?: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>) => void | Promise<void>;
			}
	): this {
		this._resourceManager.add(key, resource);
		return this;
	}

	/**
		* Remove a resource from the ECS instance (without calling onDispose)
		* @param key The resource key to remove
		* @returns True if the resource was removed, false if it didn't exist
	*/
	removeResource<K extends keyof ResourceTypes>(key: K): boolean {
		return this._resourceManager.remove(key);
	}

	/**
	 * Dispose a single resource, calling its onDispose callback if defined
	 * @param key The resource key to dispose
	 * @returns True if the resource existed and was disposed, false if it didn't exist
	 */
	async disposeResource<K extends keyof ResourceTypes>(key: K): Promise<boolean> {
		return this._resourceManager.disposeResource(key, this);
	}

	/**
	 * Dispose all initialized resources in reverse dependency order.
	 * Resources that depend on others are disposed first.
	 * Calls each resource's onDispose callback if defined.
	 */
	async disposeResources(): Promise<void> {
		return this._resourceManager.disposeResources(this);
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
	): FilteredEntity<ComponentTypes, keyof T & keyof ComponentTypes, never> {
		const entity = this._entityManager.createEntity();
		this._entityManager.addComponents(entity, components);
		return entity as FilteredEntity<ComponentTypes, keyof T & keyof ComponentTypes, never>;
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
	 * Remove an entity (and optionally its descendants)
	 * @param entityOrId Entity or entity ID to remove
	 * @param options Options for removal (cascade: true by default)
	 * @returns true if entity was removed
	 */
	removeEntity(entityOrId: number | Entity<ComponentTypes>, options?: RemoveEntityOptions): boolean {
		return this._entityManager.removeEntity(entityOrId, options);
	}

	// ==================== Hierarchy Methods ====================

	/**
	 * Create an entity as a child of another entity with initial components
	 * @param parentId The parent entity ID
	 * @param components Initial components to add
	 * @returns The created child entity
	 */
	spawnChild<T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }>(
		parentId: number,
		components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
	): FilteredEntity<ComponentTypes, keyof T & keyof ComponentTypes, never> {
		const entity = this._entityManager.spawnChild(parentId, components);
		this._emitHierarchyChanged(entity.id, null, parentId);
		return entity;
	}

	/**
	 * Set the parent of an entity
	 * @param childId The entity to set as a child
	 * @param parentId The entity to set as the parent
	 */
	setParent(childId: number, parentId: number): this {
		const oldParent = this._entityManager.getParent(childId);
		this._entityManager.setParent(childId, parentId);
		this._emitHierarchyChanged(childId, oldParent, parentId);
		return this;
	}

	/**
	 * Remove the parent relationship for an entity (orphan it)
	 * @param childId The entity to orphan
	 * @returns true if a parent was removed, false if entity had no parent
	 */
	removeParent(childId: number): boolean {
		const oldParent = this._entityManager.getParent(childId);
		const result = this._entityManager.removeParent(childId);
		if (result) {
			this._emitHierarchyChanged(childId, oldParent, null);
		}
		return result;
	}

	/**
	 * Get the parent of an entity
	 * @param entityId The entity to get the parent of
	 * @returns The parent entity ID, or null if no parent
	 */
	getParent(entityId: number): number | null {
		return this._entityManager.getParent(entityId);
	}

	/**
	 * Get all children of an entity in insertion order
	 * @param parentId The parent entity
	 * @returns Readonly array of child entity IDs
	 */
	getChildren(parentId: number): readonly number[] {
		return this._entityManager.getChildren(parentId);
	}

	/**
	 * Get a child at a specific index
	 * @param parentId The parent entity
	 * @param index The index of the child
	 * @returns The child entity ID, or null if index is out of bounds
	 */
	getChildAt(parentId: number, index: number): number | null {
		return this._entityManager.getChildAt(parentId, index);
	}

	/**
	 * Get the index of a child within its parent's children list
	 * @param parentId The parent entity
	 * @param childId The child entity to find
	 * @returns The index of the child, or -1 if not found
	 */
	getChildIndex(parentId: number, childId: number): number {
		return this._entityManager.getChildIndex(parentId, childId);
	}

	/**
	 * Get all ancestors of an entity in order [parent, grandparent, ...]
	 * @param entityId The entity to get ancestors of
	 * @returns Readonly array of ancestor entity IDs
	 */
	getAncestors(entityId: number): readonly number[] {
		return this._entityManager.getAncestors(entityId);
	}

	/**
	 * Get all descendants of an entity in depth-first order
	 * @param entityId The entity to get descendants of
	 * @returns Readonly array of descendant entity IDs
	 */
	getDescendants(entityId: number): readonly number[] {
		return this._entityManager.getDescendants(entityId);
	}

	/**
	 * Get the root ancestor of an entity (topmost parent), or self if no parent
	 * @param entityId The entity to get the root of
	 * @returns The root entity ID
	 */
	getRoot(entityId: number): number {
		return this._entityManager.getRoot(entityId);
	}

	/**
	 * Get siblings of an entity (other children of the same parent)
	 * @param entityId The entity to get siblings of
	 * @returns Readonly array of sibling entity IDs
	 */
	getSiblings(entityId: number): readonly number[] {
		return this._entityManager.getSiblings(entityId);
	}

	/**
	 * Check if an entity is a descendant of another entity
	 * @param entityId The potential descendant
	 * @param ancestorId The potential ancestor
	 * @returns true if entityId is a descendant of ancestorId
	 */
	isDescendantOf(entityId: number, ancestorId: number): boolean {
		return this._entityManager.isDescendantOf(entityId, ancestorId);
	}

	/**
	 * Check if an entity is an ancestor of another entity
	 * @param entityId The potential ancestor
	 * @param descendantId The potential descendant
	 * @returns true if entityId is an ancestor of descendantId
	 */
	isAncestorOf(entityId: number, descendantId: number): boolean {
		return this._entityManager.isAncestorOf(entityId, descendantId);
	}

	/**
	 * Get all root entities (entities that have children but no parent)
	 * @returns Readonly array of root entity IDs
	 */
	getRootEntities(): readonly number[] {
		return this._entityManager.getRootEntities();
	}

	/**
	 * Traverse the hierarchy in parent-first (breadth-first) order.
	 * Parents are guaranteed to be visited before their children.
	 * @param callback Function called for each entity with (entityId, parentId, depth)
	 * @param options Optional traversal options (roots to filter to specific subtrees)
	 */
	forEachInHierarchy(
		callback: (entityId: number, parentId: number | null, depth: number) => void,
		options?: HierarchyIteratorOptions
	): void {
		this._entityManager.forEachInHierarchy(callback, options);
	}

	/**
	 * Generator-based hierarchy traversal in parent-first (breadth-first) order.
	 * Supports early termination via break.
	 * @param options Optional traversal options (roots to filter to specific subtrees)
	 * @yields HierarchyEntry for each entity in parent-first order
	 */
	hierarchyIterator(options?: HierarchyIteratorOptions): Generator<HierarchyEntry, void, unknown> {
		return this._entityManager.hierarchyIterator(options);
	}

	/**
	 * Emit a hierarchy changed event
	 * @internal
	 */
	private _emitHierarchyChanged(entityId: number, oldParent: number | null, newParent: number | null): void {
		// Publish the event - if the user has declared hierarchyChanged in their EventTypes, it will be handled
		type HierarchyEventBus = EventBus<{ hierarchyChanged: { entityId: number; oldParent: number | null; newParent: number | null } }>;
		(this._eventBus as unknown as HierarchyEventBus).publish('hierarchyChanged', { entityId, oldParent, newParent });
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

	// ==================== Component Lifecycle Hooks ====================

	/**
	 * Register a callback when a specific component is added to any entity
	 * @param componentName The component key
	 * @param handler Function receiving the new component value and the entity
	 * @returns Unsubscribe function to remove the callback
	 */
	onComponentAdded<K extends keyof ComponentTypes>(
		componentName: K,
		handler: (value: ComponentTypes[K], entity: Entity<ComponentTypes>) => void
	): () => void {
		return this._entityManager.onComponentAdded(componentName, handler);
	}

	/**
	 * Register a callback when a specific component is removed from any entity
	 * @param componentName The component key
	 * @param handler Function receiving the old component value and the entity
	 * @returns Unsubscribe function to remove the callback
	 */
	onComponentRemoved<K extends keyof ComponentTypes>(
		componentName: K,
		handler: (oldValue: ComponentTypes[K], entity: Entity<ComponentTypes>) => void
	): () => void {
		return this._entityManager.onComponentRemoved(componentName, handler);
	}

	// ==================== Reactive Queries ====================

	/**
	 * Add a reactive query that triggers callbacks when entities enter/exit the query match.
	 * @param name Unique name for the query
	 * @param definition Query definition with with/without arrays and onEnter/onExit callbacks
	 */
	addReactiveQuery<
		WithComponents extends keyof ComponentTypes,
		WithoutComponents extends keyof ComponentTypes = never
	>(
		name: string,
		definition: ReactiveQueryDefinition<ComponentTypes, WithComponents, WithoutComponents>
	): void {
		this._reactiveQueryManager.addQuery(name, definition);
	}

	/**
	 * Remove a reactive query by name.
	 * @param name Name of the query to remove
	 * @returns true if the query existed and was removed, false otherwise
	 */
	removeReactiveQuery(name: string): boolean {
		return this._reactiveQueryManager.removeQuery(name);
	}

	// ==================== Event Convenience Methods ====================

	/**
	 * Subscribe to an event (convenience wrapper for eventBus.subscribe)
	 * @param eventType The event type to subscribe to
	 * @param callback The callback to invoke when the event is published
	 * @returns An unsubscribe function
	 */
	on<E extends keyof EventTypes>(
		eventType: E,
		callback: (data: EventTypes[E]) => void
	): () => void {
		return this._eventBus.subscribe(eventType, callback);
	}

	/**
	 * Unsubscribe from an event by callback reference (convenience wrapper for eventBus.unsubscribe)
	 * @param eventType The event type to unsubscribe from
	 * @param callback The callback to remove
	 * @returns true if the callback was found and removed, false otherwise
	 */
	off<E extends keyof EventTypes>(
		eventType: E,
		callback: (data: EventTypes[E]) => void
	): boolean {
		return this._eventBus.unsubscribe(eventType, callback);
	}

	/**
	 * Register a hook that runs after all systems in update()
	 * @param callback The hook to call after all systems have processed
	 * @returns An unsubscribe function to remove the hook
	 */
	onPostUpdate(
		callback: (ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>, deltaTime: number) => void
	): () => void {
		this._postUpdateHooks.push(callback);
		return () => {
			const index = this._postUpdateHooks.indexOf(callback);
			if (index !== -1) {
				this._postUpdateHooks.splice(index, 1);
			}
		};
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
 * Resource factory with optional dependencies and disposal callback
 */
type ResourceFactoryWithDeps<T> = {
	dependsOn?: readonly string[];
	factory: (context?: any) => T | Promise<T>;
	onDispose?: (resource: T, context?: any) => void | Promise<void>;
};

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
	/** Pending resources to add during build */
	private pendingResources: Array<{ key: string; value: unknown }> = [];

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
		resource: V | ((context?: any) => V | Promise<V>) | ResourceFactoryWithDeps<V>
	): ECSpressoBuilder<C, E, R & Record<K, V>, A, S> {
		this.pendingResources.push({ key, value: resource });
		return this as unknown as ECSpressoBuilder<C, E, R & Record<K, V>, A, S>;
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
		// Apply pending resources
		for (const { key, value } of this.pendingResources) {
			this.ecspresso.addResource(key as keyof R, value as any);
		}

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
