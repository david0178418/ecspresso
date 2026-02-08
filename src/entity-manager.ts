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
	 * Per-type component dispose callbacks.
	 * Called when a component is removed (explicit removal, entity destruction, or replacement).
	 */
	private disposeCallbacks: Map<keyof ComponentTypes, (value: any, entityId: number) => void> = new Map();
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

	// ==================== Lifecycle Hook Arrays ====================
	private _afterComponentAddedHooks: Array<(entityId: number, componentName: keyof ComponentTypes) => void> = [];
	private _afterEntityMutatedHooks: Array<(entityId: number) => void> = [];
	private _afterComponentRemovedHooks: Array<(entityId: number, componentName: keyof ComponentTypes) => void> = [];
	private _beforeEntityRemovedHooks: Array<(entityId: number) => void> = [];
	private _afterParentChangedHooks: Array<(childId: number) => void> = [];

	// ==================== Batching Fields ====================
	private _batchingDepth: number = 0;
	private _batchedEntityIds: Set<number> = new Set();
	/** Component keys being added in the current addComponents batch, if any.
	 *  Used by required component resolution to skip auto-adding explicitly provided components. */
	_pendingBatchKeys: ReadonlySet<keyof ComponentTypes> | null = null;

	get entityCount(): number {
		return this.entities.size;
	}

	createEntity(): Entity<ComponentTypes> {
		const id = this.nextId++;
		const entity: Entity<ComponentTypes> = { id, components: {} };
		this.entities.set(id, entity);
		return entity;
	}

	/**
	 * Register a dispose callback for a component type.
	 * Called when a component is removed (explicit removal, entity destruction, or replacement).
	 * Later registrations replace earlier ones for the same component type.
	 * @param componentName The component type to register disposal for
	 * @param callback Function receiving the component value being disposed and the entity ID
	 */
	registerDispose<ComponentName extends keyof ComponentTypes>(
		componentName: ComponentName,
		callback: (value: ComponentTypes[ComponentName], entityId: number) => void
	): void {
		this.disposeCallbacks.set(componentName, callback);
	}

	/**
	 * Get all registered dispose callbacks.
	 * @internal Used by ECSpresso for plugin installation
	 */
	getDisposeCallbacks(): Map<keyof ComponentTypes, (value: any, entityId: number) => void> {
		return this.disposeCallbacks;
	}

	/**
	 * Invoke the dispose callback for a component, if registered.
	 * Errors are caught and logged to prevent blocking removal.
	 */
	private invokeDispose<ComponentName extends keyof ComponentTypes>(
		componentName: ComponentName,
		value: ComponentTypes[ComponentName],
		entityId: number
	): void {
		const cb = this.disposeCallbacks.get(componentName);
		if (!cb) return;
		try {
			cb(value, entityId);
		} catch (error) {
			console.warn(`Component dispose callback for '${String(componentName)}' threw:`, error);
		}
	}

	private resolveEntity(entityOrId: number | Entity<ComponentTypes>): Entity<ComponentTypes> | undefined {
		return typeof entityOrId === 'number' ? this.entities.get(entityOrId) : entityOrId;
	}

	private resolveEntityId(entityOrId: number | Entity<ComponentTypes>): number {
		return typeof entityOrId === 'number' ? entityOrId : entityOrId.id;
	}

	// TODO: Component object pooling if(/when) garbage collection is an issue...?
	addComponent<ComponentName extends keyof ComponentTypes>(
		entityOrId: number | Entity<ComponentTypes>,
		componentName: ComponentName,
		data: ComponentTypes[ComponentName]
	) {
		const entity = this.resolveEntity(entityOrId);

		if (!entity) {
			throw new Error(`Cannot add component '${String(componentName)}': Entity with ID ${this.resolveEntityId(entityOrId)} does not exist`);
		}

		// Dispose old value if replacing an existing component
		const existing = entity.components[componentName];
		if (existing !== undefined) {
			this.invokeDispose(componentName, existing as ComponentTypes[ComponentName], entity.id);
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

		// Fire afterComponentAdded hooks (may trigger recursive addComponent)
		this._batchingDepth++;
		for (const hook of this._afterComponentAddedHooks) {
			hook(entity.id, componentName);
		}
		this._batchedEntityIds.add(entity.id);
		this._batchingDepth--;

		// Flush afterEntityMutated when outermost batch completes
		if (this._batchingDepth === 0) {
			for (const entityId of this._batchedEntityIds) {
				for (const hook of this._afterEntityMutatedHooks) {
					hook(entityId);
				}
			}
			this._batchedEntityIds.clear();
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
		const entity = this.resolveEntity(entityOrId);

		if (!entity) {
			throw new Error(`Cannot add components: Entity with ID ${this.resolveEntityId(entityOrId)} does not exist`);
		}

		const outerPending = this._pendingBatchKeys;
		this._pendingBatchKeys = new Set(Object.keys(components) as (keyof ComponentTypes)[]);
		this._batchingDepth++;
		for (const componentName in components) {
			this.addComponent(
				entity,
				componentName as keyof ComponentTypes,
				components[componentName as keyof T] as ComponentTypes[keyof ComponentTypes]
			);
		}
		this._batchingDepth--;
		this._pendingBatchKeys = outerPending;

		if (this._batchingDepth === 0) {
			for (const entityId of this._batchedEntityIds) {
				for (const hook of this._afterEntityMutatedHooks) {
					hook(entityId);
				}
			}
			this._batchedEntityIds.clear();
		}

		return this;
	}

	removeComponent<ComponentName extends keyof ComponentTypes>(
		entityOrId: number | Entity<ComponentTypes>,
		componentName: ComponentName
	) {
		const entity = this.resolveEntity(entityOrId);

		if (!entity) {
			throw new Error(`Cannot remove component '${String(componentName)}': Entity with ID ${this.resolveEntityId(entityOrId)} does not exist`);
		}
		// Get old value for callbacks
		const oldValue = entity.components[componentName] as ComponentTypes[ComponentName] | undefined;

		// Invoke dispose before deletion and removal callbacks
		if (oldValue !== undefined) {
			this.invokeDispose(componentName, oldValue, entity.id);
		}

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

		// Fire afterComponentRemoved hooks (only if component was present)
		if (oldValue !== undefined) {
			for (const hook of this._afterComponentRemovedHooks) {
				hook(entity.id, componentName);
			}
		}

		return this;
	}

	getComponent<ComponentName extends keyof ComponentTypes>(entityId: number, componentName: ComponentName): ComponentTypes[ComponentName] | undefined {
		const entity = this.entities.get(entityId);

		if (!entity) throw new Error(`Cannot get component '${String(componentName)}': Entity with ID ${entityId} does not exist`);

		return entity.components[componentName];
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
						if (!changed.some(comp => (entitySeqs.get(comp) ?? -1) > changeThreshold)) return false;
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
					if (!entitySeqs || !changed.some(comp => (entitySeqs.get(comp) ?? -1) > changeThreshold)) {
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
		const entity = this.resolveEntity(entityOrId);

		if (!entity) return false;

		const cascade = options?.cascade ?? true;

		if (cascade) {
			// Get all descendants first (depth-first order)
			const descendants = this.hierarchyManager.getDescendants(entity.id);
			// Fire beforeEntityRemoved for descendants (reverse: children before parents)
			for (let i = descendants.length - 1; i >= 0; i--) {
				for (const hook of this._beforeEntityRemovedHooks) {
					hook(descendants[i]!);
				}
			}
			// Fire beforeEntityRemoved for the entity itself
			for (const hook of this._beforeEntityRemovedHooks) {
				hook(entity.id);
			}
			// Now do actual removal (descendants in reverse order)
			for (let i = descendants.length - 1; i >= 0; i--) {
				this.removeEntityInternal(descendants[i]!);
			}
		} else {
			// Fire beforeEntityRemoved for just this entity
			for (const hook of this._beforeEntityRemovedHooks) {
				hook(entity.id);
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

		// Trigger disposal and removal callbacks for each component before removing the entity
		for (const componentName of Object.keys(entity.components) as Array<keyof ComponentTypes>) {
			const oldValue = entity.components[componentName];

			if (oldValue !== undefined) {
				// Invoke dispose before removal callbacks
				this.invokeDispose(componentName, oldValue as ComponentTypes[keyof ComponentTypes], entity.id);

				// Trigger removed callbacks (iterate over copy to allow mid-iteration unsubscribe)
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

	// ==================== Lifecycle Hook Registration ====================

	onAfterComponentAdded(hook: (entityId: number, componentName: keyof ComponentTypes) => void): () => void {
		this._afterComponentAddedHooks.push(hook);
		return () => {
			const idx = this._afterComponentAddedHooks.indexOf(hook);
			if (idx !== -1) this._afterComponentAddedHooks.splice(idx, 1);
		};
	}

	onAfterEntityMutated(hook: (entityId: number) => void): () => void {
		this._afterEntityMutatedHooks.push(hook);
		return () => {
			const idx = this._afterEntityMutatedHooks.indexOf(hook);
			if (idx !== -1) this._afterEntityMutatedHooks.splice(idx, 1);
		};
	}

	onAfterComponentRemoved(hook: (entityId: number, componentName: keyof ComponentTypes) => void): () => void {
		this._afterComponentRemovedHooks.push(hook);
		return () => {
			const idx = this._afterComponentRemovedHooks.indexOf(hook);
			if (idx !== -1) this._afterComponentRemovedHooks.splice(idx, 1);
		};
	}

	onBeforeEntityRemoved(hook: (entityId: number) => void): () => void {
		this._beforeEntityRemovedHooks.push(hook);
		return () => {
			const idx = this._beforeEntityRemovedHooks.indexOf(hook);
			if (idx !== -1) this._beforeEntityRemovedHooks.splice(idx, 1);
		};
	}

	onAfterParentChanged(hook: (childId: number) => void): () => void {
		this._afterParentChangedHooks.push(hook);
		return () => {
			const idx = this._afterParentChangedHooks.indexOf(hook);
			if (idx !== -1) this._afterParentChangedHooks.splice(idx, 1);
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
	 * @param entityOrId The entity or entity ID
	 * @param componentName The component that changed
	 */
	markChanged<K extends keyof ComponentTypes>(entityOrId: number | Entity<ComponentTypes>, componentName: K): void {
		const entityId = this.resolveEntityId(entityOrId);
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

	// ==================== Hierarchy Methods ====================

	/**
	 * Create an entity as a child of another entity with initial components
	 * @param parentOrId The parent entity or entity ID
	 * @param components Initial components to add
	 * @returns The created child entity
	 */
	spawnChild<T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }>(
		parentOrId: number | Entity<ComponentTypes>,
		components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
	): FilteredEntity<ComponentTypes, keyof T & keyof ComponentTypes> {
		const entity = this.createEntity();
		this.addComponents(entity, components);
		this.setParent(entity.id, this.resolveEntityId(parentOrId));
		return entity as FilteredEntity<ComponentTypes, keyof T & keyof ComponentTypes>;
	}

	/**
	 * Set the parent of an entity
	 * @param childOrId The entity or entity ID to set as a child
	 * @param parentOrId The entity or entity ID to set as the parent
	 */
	setParent(childOrId: number | Entity<ComponentTypes>, parentOrId: number | Entity<ComponentTypes>): this {
		const childId = this.resolveEntityId(childOrId);
		this.hierarchyManager.setParent(childId, this.resolveEntityId(parentOrId));
		for (const hook of this._afterParentChangedHooks) {
			hook(childId);
		}
		return this;
	}

	/**
	 * Remove the parent relationship for an entity (orphan it)
	 * @param childOrId The entity or entity ID to orphan
	 * @returns true if a parent was removed, false if entity had no parent
	 */
	removeParent(childOrId: number | Entity<ComponentTypes>): boolean {
		const childId = this.resolveEntityId(childOrId);
		const result = this.hierarchyManager.removeParent(childId);
		if (result) {
			for (const hook of this._afterParentChangedHooks) {
				hook(childId);
			}
		}
		return result;
	}

	/**
	 * Get the parent of an entity
	 * @param entityOrId The entity or entity ID to get the parent of
	 * @returns The parent entity ID, or null if no parent
	 */
	getParent(entityOrId: number | Entity<ComponentTypes>): number | null {
		return this.hierarchyManager.getParent(this.resolveEntityId(entityOrId));
	}

	/**
	 * Get all children of an entity in insertion order
	 * @param parentOrId The parent entity or entity ID
	 * @returns Readonly array of child entity IDs
	 */
	getChildren(parentOrId: number | Entity<ComponentTypes>): readonly number[] {
		return this.hierarchyManager.getChildren(this.resolveEntityId(parentOrId));
	}

	/**
	 * Get a child at a specific index
	 * @param parentOrId The parent entity or entity ID
	 * @param index The index of the child
	 * @returns The child entity ID, or null if index is out of bounds
	 */
	getChildAt(parentOrId: number | Entity<ComponentTypes>, index: number): number | null {
		return this.hierarchyManager.getChildAt(this.resolveEntityId(parentOrId), index);
	}

	/**
	 * Get the index of a child within its parent's children list
	 * @param parentOrId The parent entity or entity ID
	 * @param childOrId The child entity or entity ID to find
	 * @returns The index of the child, or -1 if not found
	 */
	getChildIndex(parentOrId: number | Entity<ComponentTypes>, childOrId: number | Entity<ComponentTypes>): number {
		return this.hierarchyManager.getChildIndex(this.resolveEntityId(parentOrId), this.resolveEntityId(childOrId));
	}

	/**
	 * Get all ancestors of an entity in order [parent, grandparent, ...]
	 * @param entityOrId The entity or entity ID to get ancestors of
	 * @returns Readonly array of ancestor entity IDs
	 */
	getAncestors(entityOrId: number | Entity<ComponentTypes>): readonly number[] {
		return this.hierarchyManager.getAncestors(this.resolveEntityId(entityOrId));
	}

	/**
	 * Get all descendants of an entity in depth-first order
	 * @param entityOrId The entity or entity ID to get descendants of
	 * @returns Readonly array of descendant entity IDs
	 */
	getDescendants(entityOrId: number | Entity<ComponentTypes>): readonly number[] {
		return this.hierarchyManager.getDescendants(this.resolveEntityId(entityOrId));
	}

	/**
	 * Get the root ancestor of an entity (topmost parent), or self if no parent
	 * @param entityOrId The entity or entity ID to get the root of
	 * @returns The root entity ID
	 */
	getRoot(entityOrId: number | Entity<ComponentTypes>): number {
		return this.hierarchyManager.getRoot(this.resolveEntityId(entityOrId));
	}

	/**
	 * Get siblings of an entity (other children of the same parent)
	 * @param entityOrId The entity or entity ID to get siblings of
	 * @returns Readonly array of sibling entity IDs
	 */
	getSiblings(entityOrId: number | Entity<ComponentTypes>): readonly number[] {
		return this.hierarchyManager.getSiblings(this.resolveEntityId(entityOrId));
	}

	/**
	 * Check if an entity is a descendant of another entity
	 * @param entityOrId The potential descendant (entity or ID)
	 * @param ancestorOrId The potential ancestor (entity or ID)
	 * @returns true if entityOrId is a descendant of ancestorOrId
	 */
	isDescendantOf(entityOrId: number | Entity<ComponentTypes>, ancestorOrId: number | Entity<ComponentTypes>): boolean {
		return this.hierarchyManager.isDescendantOf(this.resolveEntityId(entityOrId), this.resolveEntityId(ancestorOrId));
	}

	/**
	 * Check if an entity is an ancestor of another entity
	 * @param entityOrId The potential ancestor (entity or ID)
	 * @param descendantOrId The potential descendant (entity or ID)
	 * @returns true if entityOrId is an ancestor of descendantOrId
	 */
	isAncestorOf(entityOrId: number | Entity<ComponentTypes>, descendantOrId: number | Entity<ComponentTypes>): boolean {
		return this.hierarchyManager.isAncestorOf(this.resolveEntityId(entityOrId), this.resolveEntityId(descendantOrId));
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
