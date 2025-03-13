import type { Entity, FilteredEntity } from "./types";

export default
class EntityManager<ComponentTypes> {
	private nextId: number = 1;
	private entities: Map<number, Entity<ComponentTypes>> = new Map();
	private componentIndices: Map<keyof ComponentTypes, Set<number>> = new Map();
	
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
		return this;
	}

	removeComponent<ComponentName extends keyof ComponentTypes>(entityId: number, componentName: ComponentName) {
		const entity = this.entities.get(entityId);
		if (!entity) throw new Error(`Entity ${entityId} does not exist`);

		delete entity.components[componentName];
		
		// Update component index
		this.componentIndices.get(componentName)?.delete(entityId);
	}

	getComponent<ComponentName extends keyof ComponentTypes>(entityId: number, componentName: ComponentName): ComponentTypes[ComponentName] | null {
		const entity = this.entities.get(entityId);

		if (!entity) throw new Error(`Entity ${entityId} does not exist`);

		return entity.components[componentName] || null;
	}

	getEntitiesWithComponents<
		WithComponents extends keyof ComponentTypes = never,
		WithoutComponents extends keyof ComponentTypes = never
	>(
		required: ReadonlyArray<WithComponents> = [] as any, 
		excluded: ReadonlyArray<WithoutComponents> = [] as any,
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

	removeEntity(entityId: number): boolean {
		const entity = this.entities.get(entityId);
		if (!entity) return false;
		
		// Remove entity from all component indices
		for (const componentName of Object.keys(entity.components) as Array<keyof ComponentTypes>) {
			this.componentIndices.get(componentName)?.delete(entityId);
		}
		
		// Remove the entity itself
		return this.entities.delete(entityId);
	}

	getEntity(entityId: number): Entity<ComponentTypes> | undefined {
		return this.entities.get(entityId);
	}
}
