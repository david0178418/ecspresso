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

	// Optional lifecycle hooks for event handling
	onAttach?(
		ecs: import("./ecspresso").default<
			ComponentTypes & Record<string, any>,
			EventTypes,
			ResourceTypes
		>
	): void;
	onDetach?(
		ecs: import("./ecspresso").default<
			ComponentTypes & Record<string, any>,
			EventTypes,
			ResourceTypes
		>
	): void;

	// Structured container for event handlers
	eventHandlers?: {
		[EventName in keyof EventTypes]?: {
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
