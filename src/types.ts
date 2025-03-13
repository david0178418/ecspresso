import type ResourceManager from "./resource-manager";
import type EventBus from "./event-bus";
import type EntityManager from "./entity-manager";

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
		entityManager: EntityManager<ComponentTypes>,
		resourceManager: ResourceManager<ResourceTypes>,
		eventBus: EventBus<EventTypes>,
	): void;
	
	// Optional lifecycle hooks for event handling
	onAttach?(
		entityManager: EntityManager<ComponentTypes>,
		resourceManager: ResourceManager<ResourceTypes>,
		eventBus: EventBus<EventTypes>,
	): void;
	onDetach?(
		entityManager: EntityManager<ComponentTypes>,
		resourceManager: ResourceManager<ResourceTypes>,
		eventBus: EventBus<EventTypes>,
	): void;
	
	// Structured container for event handlers
	eventHandlers?: {
		[EventName in keyof EventTypes]?: {
			handler(
				data: EventTypes[EventName],
				entityManager: EntityManager<ComponentTypes>,
				resourceManager: ResourceManager<ResourceTypes>,
				eventBus: EventBus<EventTypes>,
			): void;
		};
	};
}
