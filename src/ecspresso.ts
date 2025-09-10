import EntityManager from "./entity-manager";
import EventBus from "./event-bus";
import ResourceManager from "./resource-manager";
import type { System, FilteredEntity, Entity } from "./types";
import type Bundle from "./bundle";
import { createEcspressoSystemBuilder } from "./system-builder";
import { version } from "../package.json";
import type { BundlesAreCompatible } from "./type-utils";

/**
	* Interface declaration for ECSpresso constructor to ensure type augmentation works properly.
	* This merges with the class declaration below.
*/
export default interface ECSpresso<
	ComponentTypes extends Record<string, any> = {},
	EventTypes extends Record<string, any> = {},
	ResourceTypes extends Record<string, any> = {},
> {
	/**
		* Default constructor
	*/
	new(): ECSpresso<ComponentTypes, EventTypes, ResourceTypes>;
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
	private _systems: Array<System<ComponentTypes, any, any, EventTypes, ResourceTypes>> = [];
	/** Cached sorted systems for efficient updates */
	private _sortedSystems: Array<System<ComponentTypes, any, any, EventTypes, ResourceTypes>> = [];
	/** Track installed bundles to prevent duplicates*/
	private _installedBundles: Set<string> = new Set();

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
	>(): ECSpressoBuilder<C, E, R> {
		return new ECSpressoBuilder<C, E, R>();
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
		// Use the cached sorted systems array instead of re-sorting on every update
		for (const system of this._sortedSystems) {
			if (!system.process) continue;

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
	 * 2. Calls the onInitialize lifecycle hook on all systems
	 *
	 * This is useful for game startup to ensure all resources are ready
	 * and systems are properly initialized before the game loop begins.
	 *
	 * @param resourceKeys Optional array of specific resource keys to initialize
	 * @returns Promise that resolves when everything is initialized
	 */
	async initialize(): Promise<void> {
		await this.initializeResources();

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
	_registerSystem(system: System<ComponentTypes, any, any, EventTypes, ResourceTypes>): void {
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

	/**
		* Internal method to install a bundle into this ECSpresso instance.
		* Called by the ECSpressoBuilder during the build process.
		* The type safety is guaranteed by the builder's type system.
	*/
	_installBundle<
		C extends Record<string, any>,
		E extends Record<string, any>,
		R extends Record<string, any>
	>(bundle: Bundle<C, E, R>): this {
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
	R extends Record<string, any> = {}
> {
	/** The ECSpresso instance being built*/
	private ecspresso: ECSpresso<C, E, R>;

	constructor() {
		this.ecspresso = new ECSpresso<C, E, R>();
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
		this: ECSpressoBuilder<{}, {}, {}>,
		bundle: Bundle<BC, BE, BR>
	): ECSpressoBuilder<BC, BE, BR>;

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
	): ECSpressoBuilder<C & BC, E & BE, R & BR>;

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
	): ECSpressoBuilder<C & BC, E & BE, R & BR> {
		// Install the bundle
		// Type compatibility is guaranteed by method overloads
		this.ecspresso._installBundle(bundle);

		// Return a builder with the updated type parameters
		return this as unknown as ECSpressoBuilder<C & BC, E & BE, R & BR>;
	}

	/**
		* Complete the build process and return the built ECSpresso instance
	*/
	build(): ECSpresso<C, E, R> {
		return this.ecspresso;
	}
}
