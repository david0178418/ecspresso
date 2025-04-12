import Bundle from "./bundle";
import ECSpresso from "./ecspresso";
import type { FilteredEntity, System } from "./types";

/**
 * Builder class for creating type-safe ECS Systems with proper query inference
 */
export class SystemBuilder<
	ComponentTypes extends Record<string, any> = Record<string, any>,
	EventTypes extends Record<string, any> = Record<string, any>,
	ResourceTypes extends Record<string, any> = Record<string, any>,
	Queries extends Record<string, QueryDefinition<ComponentTypes>> = {},
> {
	private queries: Queries = {} as Queries;
	private processFunction?: ProcessFunction<ComponentTypes, EventTypes, ResourceTypes, Queries>;
	private attachFunction?: LifecycleFunction<ComponentTypes, EventTypes, ResourceTypes>;
	private detachFunction?: LifecycleFunction<ComponentTypes, EventTypes, ResourceTypes>;
	private eventHandlers?: {
		[EventName in keyof EventTypes]?: {
			handler(
				data: EventTypes[EventName],
				ecs: ECSpresso<
					ComponentTypes & Record<string, any>,
					EventTypes,
					ResourceTypes
				>,
			): void;
		};
	};
	private _priority = 0; // Default priority is 0

	constructor(
		private _label: string,
		private _ecspresso: ECSpresso<ComponentTypes, EventTypes, ResourceTypes> | null = null,
		private _bundle: Bundle<ComponentTypes, EventTypes, ResourceTypes> | null = null,
	) {}

	get label() {
		return this._label;
	}

	/**
	 * Returns the associated bundle if one was provided in the constructor
	 */
	get bundle() {
		return this._bundle;
	}

	/**
	 * Returns the associated ECSpresso instance if one was provided in the constructor
	 */
	get ecspresso() {
		return this._ecspresso;
	}

	// TODO: Should this be a setter?
	/**
	 * Set the priority of this system. Systems with higher priority values
	 * execute before those with lower values. Systems with the same priority
	 * execute in the order they were registered.
	 * @param priority The priority value (default: 0)
	 * @returns This SystemBuilder instance for method chaining
	 */
	setPriority(priority: number): this {
		this._priority = priority;
		return this;
	}

	/**
	 * Add a query definition to the system
	 */
	addQuery<
		QueryName extends string,
		WithComponents extends keyof ComponentTypes,
		WithoutComponents extends keyof ComponentTypes = never,
		NewQueries extends Queries & Record<QueryName, QueryDefinition<ComponentTypes, WithComponents, WithoutComponents>> =
			Queries & Record<QueryName, QueryDefinition<ComponentTypes, WithComponents, WithoutComponents>>
	>(
		name: QueryName,
		definition: {
			with: ReadonlyArray<WithComponents>;
			without?: ReadonlyArray<WithoutComponents>;
		}
	): this extends SystemBuilderWithEcspresso<ComponentTypes, EventTypes, ResourceTypes, Queries>
		? SystemBuilderWithEcspresso<ComponentTypes, EventTypes, ResourceTypes, NewQueries>
		: this extends SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, Queries>
			? SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, NewQueries>
			: SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, NewQueries> {
		// Cast is needed because TypeScript can't preserve the type information
		// when modifying an object property
		this.queries = {
			...this.queries,
			[name]: definition,
		} as unknown as NewQueries;

		// Using unknown as an intermediate step is safer than using 'any'
		return this as unknown as (
			this extends SystemBuilderWithEcspresso<ComponentTypes, EventTypes, ResourceTypes, Queries>
				? SystemBuilderWithEcspresso<ComponentTypes, EventTypes, ResourceTypes, NewQueries>
				: this extends SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, Queries>
					? SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, NewQueries>
					: SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, NewQueries>
		);
	}

	/**
	 * Set the system's process function that runs each update
	 * @param process Function to process entities matching the system's queries each update
	 * @returns This SystemBuilder instance for method chaining
	 */
	setProcess(
		process: ProcessFunction<ComponentTypes, EventTypes, ResourceTypes, Queries>
	): this {
		this.processFunction = process;
		return this;
	}

	/**
	 * Set the onAttach lifecycle hook
	 * Called when the system is attached to the ECS
	 * @param onAttach Function to run when this system is attached to the ECS
	 * @returns This SystemBuilder instance for method chaining
	 */
	setOnAttach(
		onAttach: LifecycleFunction<ComponentTypes, EventTypes, ResourceTypes>
	): this {
		this.attachFunction = onAttach;
		return this;
	}

	/**
	 * Set the onDetach lifecycle hook
	 * Called when the system is removed from the ECS
	 * @param onDetach Function to run when this system is detached from the ECS
	 * @returns This SystemBuilder instance for method chaining
	 */
	setOnDetach(
		onDetach: LifecycleFunction<ComponentTypes, EventTypes, ResourceTypes>
	): this {
		this.detachFunction = onDetach;
		return this;
	}

	/**
	 * Set event handlers for the system
	 * These handlers will be automatically subscribed when the system is attached
	 * @param handlers Object mapping event names to handler functions
	 * @returns This SystemBuilder instance for method chaining
	 */
	setEventHandlers(
		handlers: {
			[EventName in keyof EventTypes]?: {
				handler(
					data: EventTypes[EventName],
					ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>
				): void;
			};
		}
	): this {
		this.eventHandlers = handlers;
		return this;
	}

	/**
	 * Build the final system object
	 */
	build(ecspresso?: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>) {
		const system: System<ComponentTypes, any, any, EventTypes, ResourceTypes> = {
			label: this._label,
			entityQueries: this.queries,
			priority: this._priority,
		};

		if (this.processFunction) {
			system.process = this.processFunction;
		}

		if (this.attachFunction) {
			system.onAttach = this.attachFunction;
		}

		if (this.detachFunction) {
			system.onDetach = this.detachFunction;
		}

		if (this.eventHandlers) {
			system.eventHandlers = this.eventHandlers;
		}

		if (this._ecspresso) {
			registerSystemWithEcspresso(system, this._ecspresso);
		}

		if(ecspresso) {
			registerSystemWithEcspresso(system, ecspresso);
		}

		return this;
	}
}

/**
 * Helper function to register a system with an ECSpresso instance
 * This handles attaching the system and setting up event handlers
 * @internal Used by SystemBuilder and Bundle
 */
export function registerSystemWithEcspresso<
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>
>(
	system: System<ComponentTypes, any, any, EventTypes, ResourceTypes>,
	ecspresso: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>
) {
	// TODO: Remove the index notation workaround hack for private property access
	// Add system to ECSpresso's system list
	ecspresso["_systems"].push(system);

	// Trigger sorting of systems by priority
	ecspresso["_sortSystems"]();

	system.onAttach?.(ecspresso);

	if(!system.eventHandlers) return;

	for (const eventName in system.eventHandlers) {
		const handler = system.eventHandlers[eventName]?.handler;

		handler && ecspresso.eventBus.subscribe(eventName, (data) => {
			handler(data, ecspresso);
		});
	}
}

// Helper type definitions
type QueryDefinition<
	ComponentTypes,
	WithComponents extends keyof ComponentTypes = any,
	WithoutComponents extends keyof ComponentTypes = any,
> = {
	with: ReadonlyArray<WithComponents>;
	without?: ReadonlyArray<WithoutComponents>;
};

type QueryResults<
	ComponentTypes,
	Queries extends Record<string, QueryDefinition<ComponentTypes>>,
> = {
	[QueryName in keyof Queries]: QueryName extends string
		? FilteredEntity<
			ComponentTypes,
			Queries[QueryName] extends QueryDefinition<ComponentTypes, infer W, any> ? W : never,
			Queries[QueryName] extends QueryDefinition<ComponentTypes, any, infer WO> ? WO : never
		>[]
		: never;
};

/**
 * Function signature for system process methods
 * @param queries Results of entity queries defined by the system
 * @param deltaTime Time elapsed since last update in seconds
 * @param ecs The ECSpresso instance providing access to all ECS functionality
 */
type ProcessFunction<
	ComponentTypes,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
	Queries extends Record<string, QueryDefinition<ComponentTypes>>,
> = (
	queries: QueryResults<ComponentTypes, Queries>,
	deltaTime: number,
	ecs: ECSpresso<
		ComponentTypes & Record<string, any>,
		EventTypes,
		ResourceTypes
	>
) => void;

/**
 * Function signature for system lifecycle hooks (onAttach and onDetach)
 * @param ecs The ECSpresso instance providing access to all ECS functionality
 */
type LifecycleFunction<
	ComponentTypes,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
> = (
	ecs: ECSpresso<
		ComponentTypes & Record<string, any>,
		EventTypes,
		ResourceTypes
	>,
) => void;

/**
 * Create a SystemBuilder attached to an ECSpresso instance
 * Helper function used by ECSpresso.addSystem
 */
export function createEcspressoSystemBuilder<
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>
>(
	label: string,
	ecspresso: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>
): SystemBuilderWithEcspresso<ComponentTypes, EventTypes, ResourceTypes> {
	return new SystemBuilder<ComponentTypes, EventTypes, ResourceTypes>(
		label,
		ecspresso
	) as SystemBuilderWithEcspresso<ComponentTypes, EventTypes, ResourceTypes>;
}

/**
 * Create a SystemBuilder attached to a Bundle
 * Helper function used by Bundle.addSystem
 */
export function createBundleSystemBuilder<
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>
>(
	label: string,
	bundle: Bundle<ComponentTypes, EventTypes, ResourceTypes>
): SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes> {
	return new SystemBuilder<ComponentTypes, EventTypes, ResourceTypes>(
		label,
		null,
		bundle
	) as SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes>;
}

// Type interfaces for specialized SystemBuilders

/**
 * SystemBuilder with a guaranteed non-null reference to an ECSpresso instance
 */
export interface SystemBuilderWithEcspresso<
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
	Queries extends Record<string, QueryDefinition<ComponentTypes>> = {}
> extends SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, Queries> {
	readonly ecspresso: ECSpresso<ComponentTypes, EventTypes, ResourceTypes>;
}

/**
 * SystemBuilder with a guaranteed non-null reference to a Bundle
 */
export interface SystemBuilderWithBundle<
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
	Queries extends Record<string, QueryDefinition<ComponentTypes>> = {}
> extends SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, Queries> {
	readonly bundle: Bundle<ComponentTypes, EventTypes, ResourceTypes>;
}
