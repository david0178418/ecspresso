import EntityManager from "./entity-manager";
import EventBus from "./event-bus";
import ResourceManager from "./resource-manager";
import type { System } from "./types";
import type Bundle from "./bundle";
import { version } from "../package.json";


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
	 */
	install<
		Bundles extends Array<Bundle<any, any, any>>
	>(...bundles: Bundles): this {
		for (const bundle of bundles) {
			// Check if this bundle is already installed
			if (this._installedBundles.has(bundle.id)) {
				console.warn(`Bundle ${bundle.id} is already installed`);
				continue;
			}

			const systems = bundle.getSystems();

			// Check if bundle has systems
			if (!systems.length) {
				console.warn(`Bundle ${bundle.id} has no systems`);
			}

			// Register all systems from the bundle
			for (const system of systems) {
				// Need to cast here because we can't fully type the system generics
				const typedSystem = system as unknown as System<ComponentTypes, any, any, EventTypes, ResourceTypes>;
				this._systems.push(typedSystem);

				// Call onAttach lifecycle hook if defined
				if (typedSystem.onAttach) {
					typedSystem.onAttach(
						this._entityManager,
						this._resourceManager,
						this._eventBus
					);
				}

				// Auto-subscribe to events if eventHandlers are defined
				if (typedSystem.eventHandlers) {
					for (const eventName in typedSystem.eventHandlers) {
						const handler = typedSystem.eventHandlers[eventName];
						if (handler?.handler) {
							// Create a wrapper that passes the additional parameters to the handler
							const wrappedHandler = (data: any) => {
								handler.handler(
									data,
									this
								);
							};

							this._eventBus.subscribe(eventName, wrappedHandler);
						}
					}
				}
			}

			// Register all resources from the bundle
			const resources = bundle.getResources();
			for (const [key, value] of resources.entries()) {
				// We need to cast here because TypeScript can't verify the type compatibility
				// between bundles, but we trust that the bundle's resource types are compatible
				this._resourceManager.add(key as unknown as keyof ResourceTypes, value as any);
			}

			// Mark this bundle as installed
			this._installedBundles.add(bundle.id);
		}

		return this;
	}

	/**
	 * Remove a system by its label
	 */
	removeSystem(label: string): boolean {
		const index = this._systems.findIndex(system => system.label === label);
		if (index === -1) return false;

		const system = this._systems[index];
		if (!system) return false;

		system.onDetach?.(
			this._entityManager,
			this._resourceManager,
			this._eventBus
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
	getResource<K extends keyof ResourceTypes>(key: K): ResourceTypes[K] | undefined {
		return this._resourceManager.getOptional(key);
	}

	/**
	 * Get a resource, throws error if not found
	 */
	getResourceOrThrow<K extends keyof ResourceTypes>(key: K): ResourceTypes[K] {
		return this._resourceManager.get(key);
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
					this._entityManager,
					this._resourceManager,
					this._eventBus
				);
			} else {
				// No queries defined, pass an empty array
				system.process(
					[],
					deltaTime,
					this._entityManager,
					this._resourceManager,
					this._eventBus
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
}
