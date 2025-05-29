import ECSpresso from "./ecspresso";

export
interface Entity<ComponentTypes> {
	id: number;
	components: Partial<ComponentTypes>;
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
> {
	id: number;
	// components: Pick<ComponentTypes, WithComponents> & Omit<Partial<ComponentTypes>, WithComponents | WithoutComponents>;
	components: Omit<Partial<ComponentTypes>, WithoutComponents> & {
		[ComponentName in WithComponents]: ComponentTypes[ComponentName]
	};

}

export
interface QueryConfig<
	ComponentTypes,
	WithComponents extends keyof ComponentTypes,
	WithoutComponents extends keyof ComponentTypes,
> {
	with: ReadonlyArray<WithComponents>;
	without?: ReadonlyArray<WithoutComponents>;
}

/**
 * Utility type to derive the entity type that would result from a query definition.
 * This is useful for creating helper functions that operate on query results.
 * 
 * @example
 * ```typescript
 * const queryDef = {
 *   with: ['position', 'sprite'] as const,
 *   without: ['dead'] as const
 * } as const;
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
	}
> = FilteredEntity<
	ComponentTypes,
	QueryDef['with'][number],
	QueryDef['without'] extends ReadonlyArray<any> ? QueryDef['without'][number] : never
>;

/**
 * Utility type to create a query definition with proper type inference.
 * This enables you to create reusable query definitions and extract their result types.
 * 
 * @example
 * ```typescript
 * const movingEntitiesQuery = createQueryDefinition({
 *   with: ['position', 'velocity'] as const,
 *   without: ['dead'] as const
 * } as const);
 * 
 * type MovingEntity = QueryResultEntity<Components, typeof movingEntitiesQuery>;
 * ```
 */
export type QueryDefinition<
	ComponentTypes extends Record<string, any>,
	WithComponents extends keyof ComponentTypes = any,
	WithoutComponents extends keyof ComponentTypes = any,
> = {
	with: ReadonlyArray<WithComponents>;
	without?: ReadonlyArray<WithoutComponents>;
};

/**
 * Helper function to create a query definition with proper type inference.
 * This enables better TypeScript inference when creating reusable queries.
 * 
 * @example
 * ```typescript
 * const movingEntitiesQuery = createQueryDefinition({
 *   with: ['position', 'velocity'] as const,
 *   without: ['dead'] as const
 * } as const);
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
> {
	label: string;
	/**
	 * System priority - higher values execute first (default: 0)
	 * When systems have the same priority, they execute in registration order
	 */
	priority?: number;
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
			ResourceTypes
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
			ResourceTypes
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
			ResourceTypes
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
					ResourceTypes
				>
			): void;
		};
	};
}

/**
 * Utility type for merging two types
 */
// This sets props with the same name but different type to "never". Maybe we want this?
export type Merge<T1, T2> = T1 & T2;
// This makes the later prop types override the earlier ones. Maybe we want this instead?
// export type Merge<T1, T2> = Omit<T1, keyof T2> & T2;
// Or maybe this, which sets props with the same name to a union of the two types
// export type Merge<T1, T2> = {
// 	[K in keyof T1 | keyof T2]: K extends keyof T1 & keyof T2
// 		? T1[K] | T2[K]
// 		: K extends keyof T1
// 			? T1[K]
// 			: K extends keyof T2
// 				? T2[K]
// 				: never;
// };

export type MergeAll<T extends any[]> = T extends [infer First, ...infer Rest] ?
	Rest extends [] ?
		First: Merge<First, MergeAll<Rest>>:
	{};
