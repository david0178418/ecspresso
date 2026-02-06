import type { Entity, FilteredEntity } from "./types";
import type EntityManager from "./entity-manager";

/**
 * Definition for a reactive query with enter/exit callbacks
 */
export interface ReactiveQueryDefinition<
	ComponentTypes extends Record<string, any>,
	WithComponents extends keyof ComponentTypes = keyof ComponentTypes,
	WithoutComponents extends keyof ComponentTypes = never,
	OptionalComponents extends keyof ComponentTypes = never,
> {
	/** Components the entity must have */
	with: ReadonlyArray<WithComponents>;
	/** Components the entity must not have */
	without?: ReadonlyArray<WithoutComponents>;
	/** Components to include in the entity type but not require for matching */
	optional?: ReadonlyArray<OptionalComponents>;
	/** Components the entity's direct parent must have */
	parentHas?: ReadonlyArray<keyof ComponentTypes>;
	/** Called when an entity starts matching the query */
	onEnter?: (entity: FilteredEntity<ComponentTypes, WithComponents, WithoutComponents, OptionalComponents>) => void;
	/** Called when an entity stops matching the query (receives just the ID since entity may be gone) */
	onExit?: (entityId: number) => void;
}

interface StoredQuery<ComponentTypes extends Record<string, any>> {
	definition: ReactiveQueryDefinition<ComponentTypes, any, any, any>;
	matchingEntities: Set<number>;
}

/**
 * Manages reactive queries that trigger callbacks when entities enter/exit query matches
 */
export default class ReactiveQueryManager<ComponentTypes extends Record<string, any>, QueryNames extends string = string> {
	private queries: Map<string, StoredQuery<ComponentTypes>> = new Map();
	private entityManager: EntityManager<ComponentTypes>;
	/** Whether any registered query uses parentHas */
	private _hasParentHasQueries: boolean = false;

	constructor(entityManager: EntityManager<ComponentTypes>) {
		this.entityManager = entityManager;
	}

	/**
	 * Whether any registered reactive query uses parentHas filters
	 */
	get hasParentHasQueries(): boolean {
		return this._hasParentHasQueries;
	}

	/**
	 * Add a reactive query
	 * @param name Unique name for the query
	 * @param definition Query definition with callbacks
	 */
	addQuery<
		WithComponents extends keyof ComponentTypes,
		WithoutComponents extends keyof ComponentTypes = never,
		OptionalComponents extends keyof ComponentTypes = never,
	>(
		name: QueryNames,
		definition: ReactiveQueryDefinition<ComponentTypes, WithComponents, WithoutComponents, OptionalComponents>
	): void {
		const storedQuery: StoredQuery<ComponentTypes> = {
			definition,
			matchingEntities: new Set(),
		};

		this.queries.set(name, storedQuery);

		// Update parentHas flag
		if (definition.parentHas?.length) {
			this._hasParentHasQueries = true;
		}

		// Check existing entities for initial matches
		const existingMatches = this.entityManager.getEntitiesWithQuery(
			definition.with as ReadonlyArray<keyof ComponentTypes>,
			(definition.without ?? []) as ReadonlyArray<keyof ComponentTypes>
		);

		for (const entity of existingMatches) {
			if (this.entityMatchesQuery(entity, storedQuery.definition)) {
				storedQuery.matchingEntities.add(entity.id);
				storedQuery.definition.onEnter?.(entity as FilteredEntity<ComponentTypes, any, any, any>);
			}
		}
	}

	/**
	 * Remove a reactive query
	 * @param name Name of the query to remove
	 * @returns true if the query existed and was removed
	 */
	removeQuery(name: QueryNames): boolean {
		const result = this.queries.delete(name);

		// Recalculate parentHas flag
		if (result) {
			this._recalcParentHasFlag();
		}

		return result;
	}

	/**
	 * Check if an entity matches a query definition
	 */
	private entityMatchesQuery(
		entity: Entity<ComponentTypes>,
		definition: ReactiveQueryDefinition<ComponentTypes, any, any, any>
	): boolean {
		// Check required components
		for (const comp of definition.with) {
			if (!(comp in entity.components)) {
				return false;
			}
		}

		// Check excluded components
		if (definition.without) {
			for (const comp of definition.without) {
				if (comp in entity.components) {
					return false;
				}
			}
		}

		// Check parentHas
		if (definition.parentHas?.length) {
			const parentId = this.entityManager.getParent(entity.id);
			if (parentId === null) return false;

			const parentEntity = this.entityManager.getEntity(parentId);
			if (!parentEntity) return false;

			for (const comp of definition.parentHas) {
				if (!(comp in parentEntity.components)) {
					return false;
				}
			}
		}

		return true;
	}

	/**
	 * Called when a component is added to an entity
	 * Checks all queries for potential enter/exit events
	 */
	onComponentAdded(entity: Entity<ComponentTypes>, _componentName: keyof ComponentTypes): void {
		for (const [_name, query] of this.queries) {
			const wasMatching = query.matchingEntities.has(entity.id);
			const nowMatches = this.entityMatchesQuery(entity, query.definition);

			if (!wasMatching && nowMatches) {
				// Entity started matching - trigger onEnter
				query.matchingEntities.add(entity.id);
				query.definition.onEnter?.(entity as FilteredEntity<ComponentTypes, any, any, any>);
			} else if (wasMatching && !nowMatches) {
				// Entity stopped matching (added excluded component) - trigger onExit
				query.matchingEntities.delete(entity.id);
				query.definition.onExit?.(entity.id);
			}
			// If component was replaced (wasMatching && nowMatches), do nothing
		}

		// If any query uses parentHas, recheck children of this entity
		if (this._hasParentHasQueries) {
			this._recheckChildren(entity.id);
		}
	}

	/**
	 * Called when a component is removed from an entity
	 * Checks all queries for potential enter/exit events
	 */
	onComponentRemoved(entity: Entity<ComponentTypes>, _componentName: keyof ComponentTypes): void {
		for (const [_name, query] of this.queries) {
			const wasMatching = query.matchingEntities.has(entity.id);
			const nowMatches = this.entityMatchesQuery(entity, query.definition);

			if (wasMatching && !nowMatches) {
				// Entity stopped matching - trigger onExit
				query.matchingEntities.delete(entity.id);
				query.definition.onExit?.(entity.id);
			} else if (!wasMatching && nowMatches) {
				// Entity started matching (removed excluded component) - trigger onEnter
				query.matchingEntities.add(entity.id);
				query.definition.onEnter?.(entity as FilteredEntity<ComponentTypes, any, any, any>);
			}
		}

		// If any query uses parentHas, recheck children of this entity
		if (this._hasParentHasQueries) {
			this._recheckChildren(entity.id);
		}
	}

	/**
	 * Called when an entity is removed
	 * Triggers onExit for all queries the entity was matching
	 */
	onEntityRemoved(entityId: number): void {
		for (const [_name, query] of this.queries) {
			if (query.matchingEntities.has(entityId)) {
				query.matchingEntities.delete(entityId);
				query.definition.onExit?.(entityId);
			}
		}
	}

	/**
	 * Recheck an entity against all queries (used after batch component additions)
	 * Fires enter/exit callbacks as appropriate based on current state vs tracked state
	 */
	recheckEntity(entity: Entity<ComponentTypes>): void {
		for (const [_name, query] of this.queries) {
			const wasMatching = query.matchingEntities.has(entity.id);
			const nowMatches = this.entityMatchesQuery(entity, query.definition);

			if (!wasMatching && nowMatches) {
				// Entity started matching - trigger onEnter
				query.matchingEntities.add(entity.id);
				query.definition.onEnter?.(entity as FilteredEntity<ComponentTypes, any, any, any>);
			} else if (wasMatching && !nowMatches) {
				// Entity stopped matching - trigger onExit
				query.matchingEntities.delete(entity.id);
				query.definition.onExit?.(entity.id);
			}
		}
	}

	/**
	 * Recheck an entity and its children against all queries.
	 * Used after component mutations to handle both the entity's own queries
	 * and parentHas queries on its children.
	 */
	recheckEntityAndChildren(entity: Entity<ComponentTypes>): void {
		this.recheckEntity(entity);
		if (this._hasParentHasQueries) {
			this._recheckChildren(entity.id);
		}
	}

	/**
	 * Recheck all children of a parent entity against parentHas queries.
	 * Called when a component is added/removed from a parent entity.
	 */
	private _recheckChildren(parentId: number): void {
		const children = this.entityManager.getChildren(parentId);
		for (const childId of children) {
			const childEntity = this.entityManager.getEntity(childId);
			if (childEntity) {
				this.recheckEntity(childEntity);
			}
		}
	}

	/**
	 * Recalculate the _hasParentHasQueries flag from all registered queries
	 */
	private _recalcParentHasFlag(): void {
		this._hasParentHasQueries = false;
		for (const [, query] of this.queries) {
			if (query.definition.parentHas?.length) {
				this._hasParentHasQueries = true;
				return;
			}
		}
	}
}
