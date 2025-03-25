import EntityManager from "./entity-manager";
import EventBus from "./event-bus";
import ResourceManager from "./resource-manager";
import type { System } from "./types";
import type Bundle from "./bundle";
import { createEcspressoSystemBuilder } from "./system-builder";
import { version } from "../package.json";

// Type to detect conflicting types between two record types
type GetConflictingKeys<T, U> = {
  [K in keyof T & keyof U]: T[K] extends U[K]
    ? U[K] extends T[K]
      ? never
      : K
    : K
}[keyof T & keyof U];

/**
 * This type helps identify bundles that would have conflicting types.
 * It allows the first bundle to be added without conflicts when the base types are empty.
 */
type BundlesAreCompatible<
  C1 extends Record<string, any>,
  C2 extends Record<string, any>,
  E1 extends Record<string, any>,
  E2 extends Record<string, any>,
  R1 extends Record<string, any>,
  R2 extends Record<string, any>
> = keyof C1 extends never // If C1 is empty
    ? keyof E1 extends never // If E1 is empty
      ? keyof R1 extends never // If R1 is empty
        ? true // Allow any first bundle
        : GetConflictingKeys<R1, R2> extends never ? true : false
      : GetConflictingKeys<E1, E2> extends never
        ? (keyof R1 extends never ? true : GetConflictingKeys<R1, R2> extends never ? true : false)
        : false
    : GetConflictingKeys<C1, C2> extends never
      ? GetConflictingKeys<E1, E2> extends never
        ? GetConflictingKeys<R1, R2> extends never
          ? true
          : false
        : false
      : false;

// Create a type error for incompatible bundles
type CheckConflicts<
  C1 extends Record<string, any>,
  C2 extends Record<string, any>,
  E1 extends Record<string, any>,
  E2 extends Record<string, any>,
  R1 extends Record<string, any>,
  R2 extends Record<string, any>
> =
  GetConflictingKeys<C1, C2> extends never
    ? GetConflictingKeys<E1, E2> extends never
      ? GetConflictingKeys<R1, R2> extends never
        ? Bundle<C2, E2, R2>
        : never
      : never
    : never;

/**
 * This is a special declaration that types the ECSpresso constructor to work properly with test files
 * that expect type augmentation directly from the constructor.
 *
 * This interface declaration merges with the class declaration below.
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

// Declare static methods on the ECSpresso class
export default interface ECSpresso {
    /**
     * Create a new ECSpresso builder with type-safe bundle installation.
     * This is the preferred way to create an ECSpresso instance with bundles.
     *
     * Example:
     * ```typescript
     * const ecs = ECSpresso.create<MyComponents, MyEvents, MyResources>()
     *   .withBundle(bundle1)
     *   .withBundle(bundle2)
     *   .build();
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
	public static readonly VERSION = version;

	/** Access/modify stored components and entities */
	private _entityManager: EntityManager<ComponentTypes>;
	/** Publish/subscribe to events */
	private _eventBus: EventBus<EventTypes>;
	/** Access/modify registered resources */
	private _resourceManager: ResourceManager<ResourceTypes>;

	/** Registered systems that will be updated in order */
	private _systems: Array<System<ComponentTypes, any, any, EventTypes, ResourceTypes>> = [];
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
	 *   .withBundle(bundle1)
	 *   .withBundle(bundle2)
	 *   .build();
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
	 * @deprecated Use ECSpresso.create() builder pattern instead:
	 * ```typescript
	 * const ecs = ECSpresso.create<Types>()
	 *   .withBundle(bundle1)
	 *   .withBundle(bundle2)
	 *   .build();
	 * ```
	 */
	install<
		C1 extends Record<string, any>,
		E1 extends Record<string, any>,
		R1 extends Record<string, any>
	>(
		bundle: CheckConflicts<ComponentTypes, C1, EventTypes, E1, ResourceTypes, R1>
	): ECSpresso<
		ComponentTypes & C1,
		EventTypes & E1,
		ResourceTypes & R1
	>;

	/**
	 * @deprecated Use ECSpresso.create() builder pattern instead
	 */
	install(
		...bundles: (Bundle<any, any, any> | null)[]
	): ECSpresso<ComponentTypes, EventTypes, ResourceTypes>;

	/**
	 * Install a bundle into this ECSpresso instance
	 * This method is kept for backward compatibility
	 *
	 * @deprecated Use ECSpresso.create() builder pattern instead:
	 * ```typescript
	 * const ecs = ECSpresso.create<Types>()
	 *   .withBundle(bundle1)
	 *   .withBundle(bundle2)
	 *   .build();
	 * ```
	 */
	install(
		...bundles: (Bundle<any, any, any> | null)[]
	): ECSpresso<ComponentTypes, EventTypes, ResourceTypes> {
		for (const bundle of bundles) {
			if (bundle) this._installBundle(bundle);
		}
		return this as unknown as ECSpresso<ComponentTypes, EventTypes, ResourceTypes>;
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
			const queryResults: any = {};

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
	 * Internal method to install a bundle into this ECSpresso instance
	 * Handles registering systems and resources from the bundle
	 */
	_installBundle<
		C extends Record<string, any>,
		E extends Record<string, any>,
		R extends Record<string, any>
	>(bundle: Bundle<C, E, R>) {
		if (this._installedBundles.has(bundle.id)) {
			return this;
		}

		this._installedBundles.add(bundle.id);

		// Register systems
		bundle.registerSystemsWithEcspresso(this as any);

		// Register resources - we need to cast here since TS can't verify compatibility
		const resources = bundle.getResources();
		for (const [key, value] of resources.entries()) {
			// We need to cast here because TypeScript can't verify the type compatibility
			// between bundles, but we trust that the bundle's resource types are compatible
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
		if (!system) return false;

		system.onDetach?.(
			this
		);

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
		return this._resourceManager.getOptional(key) as ResourceTypes[K];
	}

	/**
	 * Get a resource, throws error if not found
	 */
	getResourceOrThrow<K extends keyof ResourceTypes>(key: K): ResourceTypes[K] {
		return this._resourceManager.get(key) as ResourceTypes[K];
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
 * Builder class for ECSpresso that provides fluent type-safe bundle installation
 */
export class ECSpressoBuilder<
  C extends Record<string, any> = {},
  E extends Record<string, any> = {},
  R extends Record<string, any> = {}
> {
  private ecspresso: ECSpresso<C, E, R>;

  constructor() {
    this.ecspresso = new ECSpresso<C, E, R>();
  }

  /**
   * Add the first bundle when starting with empty types
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
   * Add a subsequent bundle with type checking
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
   * Implementation of both overloads
   */
  withBundle<
    BC extends Record<string, any>,
    BE extends Record<string, any>,
    BR extends Record<string, any>
  >(
    bundle: Bundle<BC, BE, BR>
  ): ECSpressoBuilder<C & BC, E & BE, R & BR> {
    // Install the bundle using type assertion to bypass the conflicting constraint systems
    this.ecspresso._installBundle(bundle as any);

    // Return a new builder with the updated types
    return this as unknown as ECSpressoBuilder<C & BC, E & BE, R & BR>;
  }

  /**
   * Complete the build process and return the built ECSpresso instance
   */
  build(): ECSpresso<C, E, R> {
    return this.ecspresso;
  }
}
