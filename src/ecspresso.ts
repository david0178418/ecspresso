import EntityManager from "./entity-manager";
import EventBus from "./event-bus";
import ResourceManager from "./resource-manager";
import type { System } from "./types";
import type Bundle from "./bundle";
import { createEcspressoSystemBuilder } from "./system-builder";
import { version } from "../package.json";

/**
 * Type helper to detect conflicting types between two record types.
 * Returns a union of keys that exist in both T and U but have incompatible types.
 */
type GetConflictingKeys<T, U> = {
	[K in keyof T & keyof U]: T[K] extends U[K]
		? U[K] extends T[K]
			? never
			: K
		: K
}[keyof T & keyof U];

/**
 * Simplified type helper to check bundle type compatibility.
 * Returns true if bundles can be merged without type conflicts.
 */
type BundlesAreCompatible<
	C1 extends Record<string, any>,
	C2 extends Record<string, any>,
	E1 extends Record<string, any>,
	E2 extends Record<string, any>,
	R1 extends Record<string, any>,
	R2 extends Record<string, any>
> =
	// If all base types are empty, any bundle is compatible
	[keyof C1] extends [never]
		? [keyof E1] extends [never]
			? [keyof R1] extends [never]
				? true
				: GetConflictingKeys<R1, R2> extends never ? true : false
			: GetConflictingKeys<E1, E2> extends never
				? GetConflictingKeys<R1, R2> extends never ? true : false
				: false
		: GetConflictingKeys<C1, C2> extends never
			? GetConflictingKeys<E1, E2> extends never
				? GetConflictingKeys<R1, R2> extends never
					? true
					: false
				: false
			: false;

/**
 * Interface declaration for ECSpresso constructor to ensure type augmentation works properly.
 * This merges with the class declaration below.
 */
export default interface ECSpresso<
	ComponentTypes extends Record<string, any> = Record<string, any>,
	EventTypes extends Record<string, any> = Record<string, any>,
	ResourceTypes extends Record<string, any> = Record<string, any>,
> {
	/**
	 * Default constructor
	 */
	new(): ECSpresso<ComponentTypes, EventTypes, ResourceTypes>;
}

/**
 * Static methods on the ECSpresso class
 */
export default interface ECSpresso {
		/**
		 * Create a new ECSpresso builder with type-safe bundle installation.
		 * This is the preferred way to create an ECSpresso instance with bundles.
		 *
		 * Example:
		 * ```typescript
		 * const ecs = ECSpresso.create<MyComponents, MyEvents, MyResources>()
		 *	 .withBundle(bundle1)
		 *	 .withBundle(bundle2)
		 *	 .build();
		 * ```
		 */
		create(): ECSpressoBuilder<{}, {}, {}>; // No type parameters - returns a builder with empty types

		/**
		 * Create a new ECSpresso builder with type-safe bundle installation and explicit starting types.
		 */
		create<
				BaseC extends Record<string, any>,
				BaseE extends Record<string, any>,
				BaseR extends Record<string, any>
		>(): ECSpressoBuilder<BaseC, BaseE, BaseR>;
}

/**
 * ECSpresso is the central ECS framework class that connects all features.
 * It handles creation and management of entities, components, and systems, and provides lifecycle hooks.
 */
export default class ECSpresso<
	ComponentTypes extends Record<string, any> = Record<string, any>,
	EventTypes extends Record<string, any> = Record<string, any>,
	ResourceTypes extends Record<string, any> = Record<string, any>,
> {
	/** Library version */
	public static readonly VERSION = version;

	/** Access/modify stored components and entities */
	private _entityManager: EntityManager<ComponentTypes>;
	/** Publish/subscribe to events */
	private _eventBus: EventBus<EventTypes>;
	/** Access/modify registered resources */
	private _resourceManager: ResourceManager<ResourceTypes>;

	/** Registered systems that will be updated in order */
	private _systems: Array<System<ComponentTypes, any, any, EventTypes, ResourceTypes>> = [];
	/** Track installed bundles to prevent duplicates */
	private _installedBundles: Set<string> = new Set();

	/**
	 * Creates a new ECSpresso instance.
	 */
	constructor() {
		this._entityManager = new EntityManager<ComponentTypes>();
		this._eventBus = new EventBus<EventTypes>();
		this._resourceManager = new ResourceManager<ResourceTypes>();
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
		R extends Record<string, any> = {}
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
		for (const system of this._systems) {
			if (!system.process) continue;

			// Prepare query results for each defined query in the system
			const queryResults: Record<string, any> = {};

			if (system.entityQueries) {
				for (const queryName in system.entityQueries) {
					const query = system.entityQueries[queryName];
					if (query) {
						queryResults[queryName] = this._entityManager.getEntitiesWithComponents(
							query.with,
							query.without || []
						);
					}
				}
			}

			// Call the system's process function
			system.process(queryResults, deltaTime, this);
		}
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
		// Type casting is necessary because the generic parameters don't match
		bundle.registerSystemsWithEcspresso(this as any);

		// Register resources from the bundle
		const resources = bundle.getResources();
		for (const [key, value] of resources.entries()) {
			// Type compatibility is guaranteed by the builder's type system
			this._resourceManager.add(key as unknown as keyof ResourceTypes, value as any);
		}

		return this;
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
		return true;
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
		const resource = this._resourceManager.getOptional(key);

		if (!resource) throw new Error(`Resource "${key.toString()}" not found`);

		return resource;
	}

	/**
	 * Add a resource to the ECS instance
	 */
	addResource<K extends keyof ResourceTypes>(key: K, resource: ResourceTypes[K]): this {
		this._resourceManager.add(key, resource);
		return this;
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
	 * Get all entities with specific components
	 */
	getEntitiesWithComponents(
		withComponents: (keyof ComponentTypes)[],
		withoutComponents: (keyof ComponentTypes)[] = []
	) {
		return this._entityManager.getEntitiesWithComponents(
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

	get resourceManager() {
		return this._resourceManager;
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
	/** The ECSpresso instance being built */
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
		this.ecspresso._installBundle(bundle as any);

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
