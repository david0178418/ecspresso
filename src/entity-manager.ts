import type { Entity, FilteredEntity, RemoveEntityOptions, HierarchyEntry, HierarchyIteratorOptions } from "./types";
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
	/**
	 * Per-entity per-component change sequence tracking.
	 * Maps entityId -> (componentName -> sequence number when last changed)
	 */
	private changeSeqs: Map<number, Map<keyof ComponentTypes, number>> = new Map();
	/**
	 * Monotonic sequence counter for change detection.
	 * Each markChanged call increments this and stamps the new value.
	 */
	private _changeSeq: number = 0;

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
		// Trigger added callbacks (iterate over copy to allow mid-iteration unsubscribe)
		const callbacks = this.addedCallbacks.get(componentName);
		if (callbacks) {
			for (const cb of [...callbacks]) {
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

		// Trigger removed callbacks (iterate over copy to allow mid-iteration unsubscribe)
		const removeCbs = this.removedCallbacks.get(componentName);
		if (removeCbs && oldValue !== undefined) {
			for (const cb of [...removeCbs]) {
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
		changed?: ReadonlyArray<keyof ComponentTypes>,
		changeThreshold?: number,
		parentHas?: ReadonlyArray<keyof ComponentTypes>,
	): Array<FilteredEntity<ComponentTypes, WithComponents extends never ? never : WithComponents, WithoutComponents extends never ? never : WithoutComponents>> {
		const hasChangedFilter = changed !== undefined && changed.length > 0 && changeThreshold !== undefined;
		const hasParentHasFilter = parentHas !== undefined && parentHas.length > 0;

		// Use the smallest component set as base for better performance
		if (required.length === 0) {
			if (excluded.length === 0 && !hasChangedFilter && !hasParentHasFilter) {
				return Array.from(this.entities.values()) as any;
			}

			return Array
				.from(this.entities.values())
				.filter((entity) => {
					if (excluded.length > 0 && !excluded.every(comp => !(comp in entity.components))) {
						return false;
					}
					if (hasChangedFilter) {
						const entitySeqs = this.changeSeqs.get(entity.id);
						if (!entitySeqs) return false;
						if (!changed.some(comp => (entitySeqs.get(comp) ?? -1) > changeThreshold!)) return false;
					}
					if (hasParentHasFilter && !this.parentHasComponents(entity.id, parentHas)) {
						return false;
					}
					return true;
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
				if (hasChangedFilter) {
					const entitySeqs = this.changeSeqs.get(id);
					if (!entitySeqs || !changed.some(comp => (entitySeqs.get(comp) ?? -1) > changeThreshold!)) {
						continue;
					}
				}
				if (hasParentHasFilter && !this.parentHasComponents(id, parentHas)) {
					continue;
				}
				result.push(entity as any);
			}
		}

		return result;
	}

	/**
	 * Check if an entity's direct parent has all specified components
	 */
	private parentHasComponents(entityId: number, components: ReadonlyArray<keyof ComponentTypes>): boolean {
		const parentId = this.hierarchyManager.getParent(entityId);
		if (parentId === null) return false;

		const parentEntity = this.entities.get(parentId);
		if (!parentEntity) return false;

		for (const comp of components) {
			if (!(comp in parentEntity.components)) {
				return false;
			}
		}
		return true;
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

			// Trigger removed callbacks if the component exists (iterate over copy to allow mid-iteration unsubscribe)
			if (oldValue !== undefined) {
				const removeCbs = this.removedCallbacks.get(componentName);
				if (removeCbs) {
					for (const cb of [...removeCbs]) {
						cb(oldValue, entity);
					}
				}
			}

			// Remove entity from component indices
			this.componentIndices.get(componentName)?.delete(entity.id);
		}

		// Clean up change sequences
		this.changeSeqs.delete(entity.id);

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
	 * @returns Unsubscribe function to remove the callback
	 */
	onComponentAdded<ComponentName extends keyof ComponentTypes>(
		componentName: ComponentName,
		handler: (value: ComponentTypes[ComponentName], entity: Entity<ComponentTypes>) => void
	): () => void {
		if (!this.addedCallbacks.has(componentName)) {
			this.addedCallbacks.set(componentName, new Set());
		}
		this.addedCallbacks.get(componentName)!.add(handler as any);
		return () => {
			this.addedCallbacks.get(componentName)?.delete(handler as any);
		};
	}

	/**
	 * Register a callback when a specific component is removed from any entity
	 * @param componentName The component key
	 * @param handler Function receiving the old component value and the entity
	 * @returns Unsubscribe function to remove the callback
	 */
	onComponentRemoved<ComponentName extends keyof ComponentTypes>(
		componentName: ComponentName,
		handler: (oldValue: ComponentTypes[ComponentName], entity: Entity<ComponentTypes>) => void
	): () => void {
		if (!this.removedCallbacks.has(componentName)) {
			this.removedCallbacks.set(componentName, new Set());
		}
		this.removedCallbacks.get(componentName)!.add(handler as any);
		return () => {
			this.removedCallbacks.get(componentName)?.delete(handler as any);
		};
	}

	// ==================== Change Detection Methods ====================

	/**
	 * The current monotonic change sequence value.
	 * Each markChanged call increments this before stamping.
	 */
	get changeSeq(): number {
		return this._changeSeq;
	}

	/**
	 * Mark a component as changed on an entity, stamping the next sequence number.
	 * @param entityId The entity ID
	 * @param componentName The component that changed
	 */
	markChanged<K extends keyof ComponentTypes>(entityId: number, componentName: K): void {
		const seq = ++this._changeSeq;
		let entitySeqs = this.changeSeqs.get(entityId);
		if (!entitySeqs) {
			entitySeqs = new Map();
			this.changeSeqs.set(entityId, entitySeqs);
		}
		entitySeqs.set(componentName, seq);
	}

	/**
	 * Get the sequence number at which a component was last changed on an entity
	 * @param entityId The entity ID
	 * @param componentName The component to check
	 * @returns The sequence number when last changed, or -1 if never changed
	 */
	getChangeSeq<K extends keyof ComponentTypes>(entityId: number, componentName: K): number {
		return this.changeSeqs.get(entityId)?.get(componentName) ?? -1;
	}

	/**
	 * Clear all change sequences for an entity
	 * @param entityId The entity ID
	 */
	clearChangeSeqs(entityId: number): void {
		this.changeSeqs.delete(entityId);
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
		this.hierarchyManager.forEachInHierarchy(callback, options);
	}

	/**
	 * Generator-based hierarchy traversal in parent-first (breadth-first) order.
	 * Supports early termination via break.
	 * @param options Optional traversal options (roots to filter to specific subtrees)
	 * @yields HierarchyEntry for each entity in parent-first order
	 */
	hierarchyIterator(options?: HierarchyIteratorOptions): Generator<HierarchyEntry, void, unknown> {
		return this.hierarchyManager.hierarchyIterator(options);
	}
}
