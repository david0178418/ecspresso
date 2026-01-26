import type { Entity, FilteredEntity, RemoveEntityOptions } from "./types";
import HierarchyManager from "./hierarchy-manager";

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
	/**
	 * Hierarchy manager for parent-child relationships
	 */
	private hierarchyManager: HierarchyManager = new HierarchyManager();

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

		if (!entity) {
			const id = typeof entityOrId === 'number' ? entityOrId : entityOrId.id;
			throw new Error(`Cannot add component '${String(componentName)}': Entity with ID ${id} does not exist`);
		}

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

		if (!entity) {
			const id = typeof entityOrId === 'number' ? entityOrId : entityOrId.id;
			throw new Error(`Cannot add components: Entity with ID ${id} does not exist`);
		}

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

		if (!entity) {
			const id = typeof entityOrId === 'number' ? entityOrId : entityOrId.id;
			throw new Error(`Cannot remove component '${String(componentName)}': Entity with ID ${id} does not exist`);
		}
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

		if (!entity) throw new Error(`Cannot get component '${String(componentName)}': Entity with ID ${entityId} does not exist`);

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
			const currentSize = this.componentIndices.get(comp)?.size ?? 0;
			const smallestSize = this.componentIndices.get(smallest!)?.size ?? Infinity;
			return currentSize < smallestSize ? comp : smallest;
		}, required[0])!;

		// Start with the entities from the smallest component set
		const candidateSet = this.componentIndices.get(smallestComponent);
		if (!candidateSet || candidateSet.size === 0) {
			return [] as any;
		}

		// Return full entity objects, not just IDs
		const result: Array<FilteredEntity<ComponentTypes, WithComponents extends never ? never : WithComponents, WithoutComponents extends never ? never : WithoutComponents>> = [];
		const hasExclusions = excluded.length > 0;
		
		for (const id of candidateSet) {
			const entity = this.entities.get(id);
			if (
				entity &&
				required.every(comp => comp in entity.components) &&
				(!hasExclusions || excluded.every(comp => !(comp in entity.components)))
			) {
				result.push(entity as any);
			}
		}
		
		return result;
	}

	removeEntity(entityOrId: number | Entity<ComponentTypes>, options?: RemoveEntityOptions): boolean {
		const entity = typeof entityOrId === 'number' ?
			this.entities.get(entityOrId) :
			entityOrId;

		if (!entity) return false;

		const cascade = options?.cascade ?? true;

		if (cascade) {
			// Get all descendants first (depth-first order)
			const descendants = this.hierarchyManager.getDescendants(entity.id);
			// Remove descendants in reverse order (children before parents) for proper cleanup
			for (const descendantId of [...descendants].reverse()) {
				this.removeEntityInternal(descendantId);
			}
		}

		return this.removeEntityInternal(entity.id);
	}

	/**
	 * Internal method to remove a single entity without cascade logic
	 */
	private removeEntityInternal(entityId: number): boolean {
		const entity = this.entities.get(entityId);
		if (!entity) return false;

		// Clean up hierarchy
		this.hierarchyManager.removeEntity(entityId);

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
		const entity = this.createEntity();
		this.addComponents(entity, components);
		this.setParent(entity.id, parentId);
		return entity as FilteredEntity<ComponentTypes, keyof T & keyof ComponentTypes, never>;
	}

	/**
	 * Set the parent of an entity
	 * @param childId The entity to set as a child
	 * @param parentId The entity to set as the parent
	 */
	setParent(childId: number, parentId: number): this {
		this.hierarchyManager.setParent(childId, parentId);
		return this;
	}

	/**
	 * Remove the parent relationship for an entity (orphan it)
	 * @param childId The entity to orphan
	 * @returns true if a parent was removed, false if entity had no parent
	 */
	removeParent(childId: number): boolean {
		return this.hierarchyManager.removeParent(childId);
	}

	/**
	 * Get the parent of an entity
	 * @param entityId The entity to get the parent of
	 * @returns The parent entity ID, or null if no parent
	 */
	getParent(entityId: number): number | null {
		return this.hierarchyManager.getParent(entityId);
	}

	/**
	 * Get all children of an entity in insertion order
	 * @param parentId The parent entity
	 * @returns Readonly array of child entity IDs
	 */
	getChildren(parentId: number): readonly number[] {
		return this.hierarchyManager.getChildren(parentId);
	}

	/**
	 * Get a child at a specific index
	 * @param parentId The parent entity
	 * @param index The index of the child
	 * @returns The child entity ID, or null if index is out of bounds
	 */
	getChildAt(parentId: number, index: number): number | null {
		return this.hierarchyManager.getChildAt(parentId, index);
	}

	/**
	 * Get the index of a child within its parent's children list
	 * @param parentId The parent entity
	 * @param childId The child entity to find
	 * @returns The index of the child, or -1 if not found
	 */
	getChildIndex(parentId: number, childId: number): number {
		return this.hierarchyManager.getChildIndex(parentId, childId);
	}

	/**
	 * Get all ancestors of an entity in order [parent, grandparent, ...]
	 * @param entityId The entity to get ancestors of
	 * @returns Readonly array of ancestor entity IDs
	 */
	getAncestors(entityId: number): readonly number[] {
		return this.hierarchyManager.getAncestors(entityId);
	}

	/**
	 * Get all descendants of an entity in depth-first order
	 * @param entityId The entity to get descendants of
	 * @returns Readonly array of descendant entity IDs
	 */
	getDescendants(entityId: number): readonly number[] {
		return this.hierarchyManager.getDescendants(entityId);
	}

	/**
	 * Get the root ancestor of an entity (topmost parent), or self if no parent
	 * @param entityId The entity to get the root of
	 * @returns The root entity ID
	 */
	getRoot(entityId: number): number {
		return this.hierarchyManager.getRoot(entityId);
	}

	/**
	 * Get siblings of an entity (other children of the same parent)
	 * @param entityId The entity to get siblings of
	 * @returns Readonly array of sibling entity IDs
	 */
	getSiblings(entityId: number): readonly number[] {
		return this.hierarchyManager.getSiblings(entityId);
	}

	/**
	 * Check if an entity is a descendant of another entity
	 * @param entityId The potential descendant
	 * @param ancestorId The potential ancestor
	 * @returns true if entityId is a descendant of ancestorId
	 */
	isDescendantOf(entityId: number, ancestorId: number): boolean {
		return this.hierarchyManager.isDescendantOf(entityId, ancestorId);
	}

	/**
	 * Check if an entity is an ancestor of another entity
	 * @param entityId The potential ancestor
	 * @param descendantId The potential descendant
	 * @returns true if entityId is an ancestor of descendantId
	 */
	isAncestorOf(entityId: number, descendantId: number): boolean {
		return this.hierarchyManager.isAncestorOf(entityId, descendantId);
	}

	/**
	 * Get all root entities (entities that have children but no parent)
	 * @returns Readonly array of root entity IDs
	 */
	getRootEntities(): readonly number[] {
		return this.hierarchyManager.getRootEntities();
	}
}
