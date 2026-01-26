import type { Entity, FilteredEntity } from "./types";
import type EntityManager from "./entity-manager";

/**
 * Definition for a reactive query with enter/exit callbacks
 */
export interface ReactiveQueryDefinition<
	ComponentTypes extends Record<string, any>,
	WithComponents extends keyof ComponentTypes = keyof ComponentTypes,
	WithoutComponents extends keyof ComponentTypes = never
> {
	/** Components the entity must have */
	with: ReadonlyArray<WithComponents>;
	/** Components the entity must not have */
	without?: ReadonlyArray<WithoutComponents>;
	/** Called when an entity starts matching the query */
	onEnter?: (entity: FilteredEntity<ComponentTypes, WithComponents, WithoutComponents>) => void;
	/** Called when an entity stops matching the query (receives just the ID since entity may be gone) */
	onExit?: (entityId: number) => void;
}

interface StoredQuery<ComponentTypes extends Record<string, any>> {
	definition: ReactiveQueryDefinition<ComponentTypes, any, any>;
	matchingEntities: Set<number>;
}

/**
 * Manages reactive queries that trigger callbacks when entities enter/exit query matches
 */
export default class ReactiveQueryManager<ComponentTypes extends Record<string, any>> {
	private queries: Map<string, StoredQuery<ComponentTypes>> = new Map();
	private entityManager: EntityManager<ComponentTypes>;

	constructor(entityManager: EntityManager<ComponentTypes>) {
		this.entityManager = entityManager;
	}

	/**
	 * Add a reactive query
	 * @param name Unique name for the query
	 * @param definition Query definition with callbacks
	 */
	addQuery<
		WithComponents extends keyof ComponentTypes,
		WithoutComponents extends keyof ComponentTypes = never
	>(
		name: string,
		definition: ReactiveQueryDefinition<ComponentTypes, WithComponents, WithoutComponents>
	): void {
		const storedQuery: StoredQuery<ComponentTypes> = {
			definition,
			matchingEntities: new Set(),
		};

		this.queries.set(name, storedQuery);

		// Check existing entities for initial matches
		const existingMatches = this.entityManager.getEntitiesWithQuery(
			definition.with as ReadonlyArray<keyof ComponentTypes>,
			(definition.without ?? []) as ReadonlyArray<keyof ComponentTypes>
		);

		for (const entity of existingMatches) {
			storedQuery.matchingEntities.add(entity.id);
			definition.onEnter?.(entity as FilteredEntity<ComponentTypes, WithComponents, WithoutComponents>);
		}
	}

	/**
	 * Remove a reactive query
	 * @param name Name of the query to remove
	 * @returns true if the query existed and was removed
	 */
	removeQuery(name: string): boolean {
		return this.queries.delete(name);
	}

	/**
	 * Check if an entity matches a query definition
	 */
	private entityMatchesQuery(
		entity: Entity<ComponentTypes>,
		definition: ReactiveQueryDefinition<ComponentTypes, any, any>
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
				query.definition.onEnter?.(entity as FilteredEntity<ComponentTypes, any, any>);
			} else if (wasMatching && !nowMatches) {
				// Entity stopped matching (added excluded component) - trigger onExit
				query.matchingEntities.delete(entity.id);
				query.definition.onExit?.(entity.id);
			}
			// If component was replaced (wasMatching && nowMatches), do nothing
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
				query.definition.onEnter?.(entity as FilteredEntity<ComponentTypes, any, any>);
			}
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
				query.definition.onEnter?.(entity as FilteredEntity<ComponentTypes, any, any>);
			} else if (wasMatching && !nowMatches) {
				// Entity stopped matching - trigger onExit
				query.matchingEntities.delete(entity.id);
				query.definition.onExit?.(entity.id);
			}
		}
	}
}
