import type { Entity, FilteredEntity } from "./types";

export default
class EntityManager<ComponentTypes> {
	private nextId: number = 1;
	private entities: Map<number, Entity<ComponentTypes>> = new Map();
	private componentIndices: Map<keyof ComponentTypes, Set<number>> = new Map();
	/**
	 * Callbacks registered for component additions
	 */
	private addedCallbacks: Map<keyof ComponentTypes, Set<(value: any, entity: Entity<ComponentTypes>) => void>> = new Map();
	/**
	 * Callbacks registered for component removals
	 */
	private removedCallbacks: Map<keyof ComponentTypes, Set<(oldValue: any, entity: Entity<ComponentTypes>) => void>> = new Map();

	createEntity(): Entity<ComponentTypes> {
		const id = this.nextId++;
		const entity: Entity<ComponentTypes> = { id, components: {} };
		this.entities.set(id, entity);
		return entity;
	}

	// TODO: Component object pooling if(/when) garbage collection is an issue...?
	addComponent<ComponentName extends keyof ComponentTypes>(
		entityOrId: number | Entity<ComponentTypes>,
		componentName: ComponentName,
		data: ComponentTypes[ComponentName]
	) {
		const entity = typeof entityOrId === 'number' ?
			this.entities.get(entityOrId) :
			entityOrId;

		if (!entity) throw new Error(`Entity ${entityOrId} does not exist`);

		entity.components[componentName] = data;

		// Update component index
		if (!this.componentIndices.has(componentName)) {
			this.componentIndices.set(componentName, new Set());
		}
		this.componentIndices.get(componentName)?.add(entity.id);
		// Trigger added callbacks
		const callbacks = this.addedCallbacks.get(componentName);
		if (callbacks) {
			for (const cb of callbacks) {
				cb(data, entity);
			}
		}
		return this;
	}

	/**
	 * Add multiple components to an entity at once
	 * @param entityOrId Entity or entity ID to add components to
	 * @param components Object with component names as keys and component data as values
	 */
	addComponents<
		T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }
	>(
		entityOrId: number | Entity<ComponentTypes>,
		components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
	) {
		const entity = typeof entityOrId === 'number' ?
			this.entities.get(entityOrId) :
			entityOrId;

		if (!entity) throw new Error(`Entity ${entityOrId} does not exist`);

		for (const componentName in components) {
			this.addComponent(
				entity,
				componentName as keyof ComponentTypes,
				components[componentName as keyof T] as ComponentTypes[keyof ComponentTypes]
			);
		}

		return this;
	}

	removeComponent<ComponentName extends keyof ComponentTypes>(
		entityOrId: number | Entity<ComponentTypes>,
		componentName: ComponentName
	) {
		const entity = typeof entityOrId === 'number' ?
			this.entities.get(entityOrId) :
			entityOrId;

		if (!entity) throw new Error(`Entity ${entityOrId} does not exist`);
		// Get old value for callbacks
		const oldValue = entity.components[componentName] as ComponentTypes[ComponentName] | undefined;

		delete entity.components[componentName];

		// Trigger removed callbacks
		const removeCbs = this.removedCallbacks.get(componentName);
		if (removeCbs && oldValue !== undefined) {
			for (const cb of removeCbs) {
				cb(oldValue, entity);
			}
		}

		// Update component index
		this.componentIndices.get(componentName)?.delete(entity.id);

		return this;
	}

	getComponent<ComponentName extends keyof ComponentTypes>(entityId: number, componentName: ComponentName): ComponentTypes[ComponentName] | null {
		const entity = this.entities.get(entityId);

		if (!entity) throw new Error(`Entity ${entityId} does not exist`);

		return entity.components[componentName] || null;
	}

	getEntitiesWithQuery<
		WithComponents extends keyof ComponentTypes = never,
		WithoutComponents extends keyof ComponentTypes = never
	>(
		required: ReadonlyArray<WithComponents> = [],
		excluded: ReadonlyArray<WithoutComponents> = [],
	): Array<FilteredEntity<ComponentTypes, WithComponents extends never ? never : WithComponents, WithoutComponents extends never ? never : WithoutComponents>> {
		// Use the smallest component set as base for better performance
		if (required.length === 0) {
			if (excluded.length === 0) {
				return Array.from(this.entities.values()) as any;
			}

			return Array
				.from(this.entities.values())
				.filter((entity) => {
					return excluded.every(comp => !(comp in entity.components));
				}) as any;
		}

		// Find the component with the smallest entity set to start with
		const smallestComponent = required.reduce((smallest, comp) => {
			const set = this.componentIndices.get(comp);
			const currentSize = set ? set.size : 0;
			const smallestSize = this.componentIndices.get(smallest!)?.size ?? Infinity;

			return currentSize < smallestSize ? comp : smallest;
		}, required[0])!;

		// Start with the entities from the smallest component set
		const candidates = Array.from(this.componentIndices.get(smallestComponent) || []);

		// Return full entity objects, not just IDs
		return candidates
			.filter(id => {
				const entity = this.entities.get(id);
				return (
					entity &&
					required.every(comp => comp in entity.components) &&
					excluded.every(comp => !(comp in entity.components))
				);
			})
			.map(id => this.entities.get(id)!) as Array<FilteredEntity<ComponentTypes, WithComponents extends never ? never : WithComponents, WithoutComponents extends never ? never : WithoutComponents>>;
	}

	removeEntity(entityOrId: number | Entity<ComponentTypes>): boolean {
		const entity = typeof entityOrId === 'number' ?
			this.entities.get(entityOrId) :
			entityOrId;

		if (!entity) return false;

		// Trigger removal callbacks for each component before removing the entity
		for (const componentName of Object.keys(entity.components) as Array<keyof ComponentTypes>) {
			const oldValue = entity.components[componentName];
			
			// Trigger removed callbacks if the component exists
			if (oldValue !== undefined) {
				const removeCbs = this.removedCallbacks.get(componentName);
				if (removeCbs) {
					for (const cb of removeCbs) {
						cb(oldValue, entity);
					}
				}
			}

			// Remove entity from component indices
			this.componentIndices.get(componentName)?.delete(entity.id);
		}

		// Remove the entity itself
		return this.entities.delete(entity.id);
	}

	getEntity(entityId: number): Entity<ComponentTypes> | undefined {
		return this.entities.get(entityId);
	}

	/**
	 * Register a callback when a specific component is added to any entity
	 * @param componentName The component key
	 * @param handler Function receiving the new component value and the entity
	 */
	onComponentAdded<ComponentName extends keyof ComponentTypes>(
		componentName: ComponentName,
		handler: (value: ComponentTypes[ComponentName], entity: Entity<ComponentTypes>) => void
	): this {
		if (!this.addedCallbacks.has(componentName)) {
			this.addedCallbacks.set(componentName, new Set());
		}
		this.addedCallbacks.get(componentName)!.add(handler as any);
		return this;
	}

	/**
	 * Register a callback when a specific component is removed from any entity
	 * @param componentName The component key
	 * @param handler Function receiving the old component value and the entity
	 */
	onComponentRemoved<ComponentName extends keyof ComponentTypes>(
		componentName: ComponentName,
		handler: (oldValue: ComponentTypes[ComponentName], entity: Entity<ComponentTypes>) => void
	): this {
		if (!this.removedCallbacks.has(componentName)) {
			this.removedCallbacks.set(componentName, new Set());
		}
		this.removedCallbacks.get(componentName)!.add(handler as any);
		return this;
	}
}
