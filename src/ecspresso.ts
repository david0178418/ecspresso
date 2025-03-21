import EntityManager from "./entity-manager";
import EventBus from "./event-bus";
import ResourceManager from "./resource-manager";
import type { System, MergeAll } from "./types";
import type Bundle from "./bundle";
import { createEcspressoSystemBuilder } from "./system-builder";
import { version } from "../package.json";


/**
 * The main ECS (Entity Component System) container class
 *
 * This class manages entities, components, systems, resources, and events.
 *
 * Systems interact with the ECS through a single parameter that provides access
 * to the entire ECSpresso instance. This provides a simplified API for systems
 * and allows them access to all ECS functionality through a single reference.
 *
 * @template ComponentTypes Record of component types used in this ECS instance
 * @template EventTypes Record of event types used in this ECS instance
 * @template ResourceTypes Record of resource types used in this ECS instance
 */
export default
class ECSpresso<
	ComponentTypes extends Record<string, any> = Record<string, any>,
	EventTypes extends Record<string, any> = Record<string, any>,
	ResourceTypes extends Record<string, any> = Record<string, any>,
> {
	public static readonly VERSION = version;
	private _entityManager: EntityManager<ComponentTypes>;
	private _systems: System<ComponentTypes, any, any, EventTypes, ResourceTypes>[] = [];
	private _eventBus: EventBus<EventTypes>;
	private _resourceManager: ResourceManager<ResourceTypes>;
	private _installedBundles: Set<string> = new Set();

	constructor() {
		this._entityManager = new EntityManager<ComponentTypes>();
		this._eventBus = new EventBus<EventTypes>();
		this._resourceManager = new ResourceManager<ResourceTypes>();
	}

	/**
	 * Install one or more bundles into this ECS instance
	 * Systems in the bundle will have their onAttach method called with this ECSpresso instance
	 * @param bundles One or more bundles to install
	 * @returns A new ECSpresso instance with merged types from all bundles
	 */
	install<
		Bundles extends Array<Bundle<any, any, any> | null>
	>(...bundles: Bundles): ECSpresso<
		ComponentTypes & MergeAll<{ [K in keyof Bundles]: Bundles[K] extends Bundle<infer C, any, any> ? C : {} }>,
		EventTypes & MergeAll<{ [K in keyof Bundles]: Bundles[K] extends Bundle<any, infer E, any> ? E : {} }>,
		ResourceTypes & MergeAll<{ [K in keyof Bundles]: Bundles[K] extends Bundle<any, any, infer R> ? R : {} }>
	> {
		for (const bundle of bundles) {
			if (!bundle) continue;

			// Check if this bundle is already installed
			if (this._installedBundles.has(bundle.id)) {
				console.warn(`Bundle ${bundle.id} is already installed`);
				continue;
			}

			// Register all systems from the bundle
			bundle.registerSystemsWithEcspresso(this);

			// Register all resources from the bundle
			const resources = bundle.getResources();
			for (const [key, value] of resources.entries()) {
				// We need to cast here because TypeScript can't verify the type compatibility
				// between bundles, but we trust that the bundle's resource types are compatible
				this._resourceManager.add(key as unknown as keyof ResourceTypes, value);
			}

			// Mark this bundle as installed
			this._installedBundles.add(bundle.id);
		}

		return this as any;
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
	 * Update all systems
	 * Calls each system's process method with this ECSpresso instance
	 * @param deltaTime Time elapsed since the last update in seconds
	 */
	update(deltaTime: number) {
		for (const system of this._systems) {
			if (!system.process) continue;

			// Prepare query results
			const queryResults: Record<string, any[]> = {};

			// Process entity queries if defined
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

				// Call the system's process method
				system.process(
					queryResults,
					deltaTime,
					this
				);
			} else {
				// No queries defined, pass an empty array
				system.process(
					[],
					deltaTime,
					this
				);
			}
		}
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

	/**
	 * Get all installed bundle IDs
	 */
	get installedBundles(): string[] {
		return Array.from(this._installedBundles);
	}

	/**
	 * Add a system directly to this ECSpresso instance
	 * @param label Unique identifier for the system
	 * @returns A SystemBuilder instance for method chaining
	 */
	addSystem(label: string) {
		const system = createEcspressoSystemBuilder<ComponentTypes, EventTypes, ResourceTypes>(label, this);

		return system;
	}
}
