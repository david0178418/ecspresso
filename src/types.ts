import ECSpresso from "./ecspresso";

/**
 * Execution phase for systems. Systems are grouped by phase and executed
 * in this fixed order: preUpdate -> fixedUpdate -> update -> postUpdate -> render.
 * Within each phase, systems are sorted by priority (higher first).
 */
export type SystemPhase = 'preUpdate' | 'fixedUpdate' | 'update' | 'postUpdate' | 'render';

export
interface Entity<ComponentTypes> {
	id: number;
	components: Partial<ComponentTypes>;
}

/**
 * Options for removing an entity
 */
export
interface RemoveEntityOptions {
	/**
	 * Whether to also remove all descendants (default: true)
	 */
	cascade?: boolean;
}

/**
 * Event data emitted when an entity's parent changes
 */
export
interface HierarchyChangedEvent {
	/** The entity whose parent changed */
	entityId: number;
	/** The previous parent, or null if entity had no parent */
	oldParent: number | null;
	/** The new parent, or null if entity was orphaned */
	newParent: number | null;
}

/**
 * Options for hierarchy traversal methods
 */
export
interface HierarchyIteratorOptions {
	/** Specific root entities to start traversal from. If not provided, all root entities are used. */
	roots?: readonly number[];
}

/**
 * Entry yielded during hierarchy traversal
 */
export
interface HierarchyEntry {
	/** The entity being visited */
	entityId: number;
	/** The parent entity ID, or null for root entities */
	parentId: number | null;
	/** Depth in the hierarchy (0 for roots) */
	depth: number;
}

export
interface EventHandler<T> {
	callback: (data: T) => void;
	once: boolean;
}

export
interface FilteredEntity<
	ComponentTypes,
	WithComponents extends keyof ComponentTypes = never,
	WithoutComponents extends keyof ComponentTypes = never,
	OptionalComponents extends keyof ComponentTypes = never,
> {
	id: number;
	components: Omit<Partial<ComponentTypes>, WithoutComponents | OptionalComponents> & {
		[K in WithComponents]: ComponentTypes[K]
	} & {
		[K in OptionalComponents]: ComponentTypes[K] | undefined
	};
}

export
interface QueryConfig<
	ComponentTypes,
	WithComponents extends keyof ComponentTypes,
	WithoutComponents extends keyof ComponentTypes,
	OptionalComponents extends keyof ComponentTypes = WithComponents,
> {
	with: ReadonlyArray<WithComponents>;
	without?: ReadonlyArray<WithoutComponents>;
	changed?: ReadonlyArray<WithComponents>;
	optional?: ReadonlyArray<OptionalComponents>;
	parentHas?: ReadonlyArray<keyof ComponentTypes>;
}

/**
 * Utility type to derive the entity type that would result from a query definition.
 * This is useful for creating helper functions that operate on query results.
 *
 * @example
 * ```typescript
 * const queryDef = {
 *   with: ['position', 'sprite'],
 *   without: ['dead']
 * };
 *
 * type EntityType = QueryResultEntity<Components, typeof queryDef>;
 *
 * function updateSpritePosition(entity: EntityType) {
 *   entity.components.sprite.position.set(
 *     entity.components.position.x,
 *     entity.components.position.y
 *   );
 * }
 * ```
 */
export type QueryResultEntity<
	ComponentTypes extends Record<string, any>,
	QueryDef extends {
		with: ReadonlyArray<keyof ComponentTypes>;
		without?: ReadonlyArray<keyof ComponentTypes>;
		changed?: ReadonlyArray<keyof ComponentTypes>;
		optional?: ReadonlyArray<keyof ComponentTypes>;
		parentHas?: ReadonlyArray<keyof ComponentTypes>;
	}
> = FilteredEntity<
	ComponentTypes,
	QueryDef['with'][number],
	QueryDef['without'] extends ReadonlyArray<any> ? QueryDef['without'][number] : never,
	QueryDef['optional'] extends ReadonlyArray<any> ? QueryDef['optional'][number] : never
>;

/**
 * Simplified query definition type for creating reusable queries
 */
export type QueryDefinition<
	ComponentTypes extends Record<string, any>,
	WithComponents extends keyof ComponentTypes = keyof ComponentTypes,
	WithoutComponents extends keyof ComponentTypes = keyof ComponentTypes,
	OptionalComponents extends keyof ComponentTypes = keyof ComponentTypes,
> = {
	with: ReadonlyArray<WithComponents>;
	without?: ReadonlyArray<WithoutComponents>;
	changed?: ReadonlyArray<WithComponents>;
	optional?: ReadonlyArray<OptionalComponents>;
	parentHas?: ReadonlyArray<keyof ComponentTypes>;
};

/**
 * Helper function to create a query definition with proper type inference.
 * This enables better TypeScript inference when creating reusable queries.
 *
 * @example
 * ```typescript
 * const movingEntitiesQuery = createQueryDefinition({
 *   with: ['position', 'velocity'],
 *   without: ['dead']
 * });
 *
 * type MovingEntity = QueryResultEntity<Components, typeof movingEntitiesQuery>;
 *
 * function updatePosition(entity: MovingEntity) {
 *   entity.components.position.x += entity.components.velocity.x;
 *   entity.components.position.y += entity.components.velocity.y;
 * }
 *
 * world.addSystem('movement')
 *   .addQuery('entities', movingEntitiesQuery)
 *   .setProcess((queries) => {
 *     for (const entity of queries.entities) {
 *       updatePosition(entity);
 *     }
 *   });
 * ```
 */
export function createQueryDefinition<
	ComponentTypes extends Record<string, any>,
	const QueryDef extends {
		with: ReadonlyArray<keyof ComponentTypes>;
		without?: ReadonlyArray<keyof ComponentTypes>;
		changed?: ReadonlyArray<keyof ComponentTypes>;
		optional?: ReadonlyArray<keyof ComponentTypes>;
		parentHas?: ReadonlyArray<keyof ComponentTypes>;
	}
>(queryDef: QueryDef): QueryDef {
	return queryDef;
}

export
interface System<
	ComponentTypes extends Record<string, any> = {},
	WithComponents extends keyof ComponentTypes = never,
	WithoutComponents extends keyof ComponentTypes = never,
	EventTypes extends Record<string, any> = {},
	ResourceTypes extends Record<string, any> = {},
	AssetTypes extends Record<string, unknown> = {},
	ScreenStates extends Record<string, any> = {},
> {
	label: string;
	/**
	 * System priority - higher values execute first (default: 0)
	 * When systems have the same priority, they execute in registration order
	 */
	priority?: number;
	/**
	 * Execution phase for this system (default: 'update')
	 * Systems are grouped by phase and executed in order:
	 * preUpdate -> fixedUpdate -> update -> postUpdate -> render
	 */
	phase?: SystemPhase;
	/**
	 * Groups this system belongs to. If any group is disabled, the system will be skipped.
	 */
	groups?: string[];
	/**
	 * Screens where this system should run. If specified, system only runs
	 * when current screen is in this list.
	 */
	inScreens?: string[];
	/**
	 * Screens where this system should NOT run. If specified, system skips
	 * when current screen is in this list.
	 */
	excludeScreens?: string[];
	/**
	 * Assets that must be loaded for this system to run.
	 * System will be skipped if any required asset is not loaded.
	 */
	requiredAssets?: string[];
	entityQueries?: {
		[queryName: string]: QueryConfig<ComponentTypes, WithComponents, WithoutComponents>;
	};
	/**
	 * Process method that runs during each update cycle
	 * @param queries The entity queries results based on system's entityQueries definition
	 * @param deltaTime Time elapsed since the last update in seconds
	 * @param ecs The ECSpresso instance providing access to all ECS functionality
	 */
	process?(
		queries: {
			[queryName: string]: Array<FilteredEntity<ComponentTypes, WithComponents, WithoutComponents>>;
		} | Array<FilteredEntity<ComponentTypes, WithComponents, WithoutComponents>>,
		deltaTime: number,
		ecs: ECSpresso<
			ComponentTypes,
			EventTypes,
			ResourceTypes,
			AssetTypes,
			ScreenStates
		>
	): void;

	/**
	 * Lifecycle hook called when the system is initialized
	 * This is called when ECSpresso.initialize() is invoked, after resources are initialized
	 * Use this for one-time initialization that depends on resources
	 * @param ecs The ECSpresso instance providing access to all ECS functionality
	 */
	onInitialize?(
		ecs: ECSpresso<
			ComponentTypes,
			EventTypes,
			ResourceTypes,
			AssetTypes,
			ScreenStates
		>
	): void | Promise<void>;

	/**
	 * Lifecycle hook called when the system is detached from the ECS
	 * @param ecs The ECSpresso instance providing access to all ECS functionality
	 */
	onDetach?(
		ecs: import("./ecspresso").default<
			ComponentTypes,
			EventTypes,
			ResourceTypes,
			AssetTypes,
			ScreenStates
		>
	): void;

	/**
	 * Event handlers for specific event types
	 */
	eventHandlers?: {
		[EventName in keyof EventTypes]?: {
			/**
			 * Event handler function
			 * @param data The event data specific to this event type
			 * @param ecs The ECSpresso instance providing access to all ECS functionality
			 */
			handler(
				data: EventTypes[EventName],
				ecs: ECSpresso<
					ComponentTypes,
					EventTypes,
					ResourceTypes,
					AssetTypes,
					ScreenStates
				>
			): void;
		};
	};
}

// Re-export utility types from type-utils to maintain backward compatibility
export type { Merge, MergeAll, TypesAreCompatible, ComponentsOf, EventsOf, ResourcesOf } from './type-utils';
