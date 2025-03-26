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

export
interface System<
	ComponentTypes,
	WithComponents extends keyof ComponentTypes = never,
	WithoutComponents extends keyof ComponentTypes = never,
	EventTypes extends Record<string, any> = Record<string, any>,
	ResourceTypes extends Record<string, any> = Record<string, any>,
> {
	label: string;
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
		ecs: import("./ecspresso").default<
			ComponentTypes & Record<string, any>,
			EventTypes,
			ResourceTypes
		>
	): void;

	/**
	 * Lifecycle hook called when the system is attached to the ECS
	 * @param ecs The ECSpresso instance providing access to all ECS functionality
	 */
	onAttach?(
		ecs: import("./ecspresso").default<
			ComponentTypes & Record<string, any>,
			EventTypes,
			ResourceTypes
		>
	): void;

	/**
	 * Lifecycle hook called when the system is detached from the ECS
	 * @param ecs The ECSpresso instance providing access to all ECS functionality
	 */
	onDetach?(
		ecs: import("./ecspresso").default<
			ComponentTypes & Record<string, any>,
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
				ecs: import("./ecspresso").default<
					ComponentTypes & Record<string, any>,
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
