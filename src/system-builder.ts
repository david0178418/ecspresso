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

	/**
	 * Add a query definition to the system
	 */
	addQuery<
		QueryName extends string,
		WithComponents extends keyof ComponentTypes,
		WithoutComponents extends keyof ComponentTypes = never,
	>(
		name: QueryName,
		definition: {
			with: ReadonlyArray<WithComponents>;
			without?: ReadonlyArray<WithoutComponents>;
		}
	): SystemBuilder<
		ComponentTypes,
		EventTypes,
		ResourceTypes,
		Queries & Record<QueryName, QueryDefinition<ComponentTypes, WithComponents, WithoutComponents>>
	> {
		// Cast is needed because TypeScript can't preserve the type information
		// when modifying an object property
		const newBuilder = this as any;
		newBuilder.queries = {
			...this.queries,
			[name]: definition,
		};
		return newBuilder;
	}

	/**
	 * Set the system's process function that runs each update
	 * @param process Function to process entities matching the system's queries each update
	 * @returns This SystemBuilder instance for method chaining
	 */
	setProcess(
		process: ProcessFunction<ComponentTypes, EventTypes, ResourceTypes, Queries>
	): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, Queries> {
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
	): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, Queries> {
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
	): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, Queries> {
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
					ecs: ECSpresso<
						ComponentTypes & Record<string, any>,
						EventTypes,
						ResourceTypes
					>
				): void;
			};
		}
	): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, Queries> {
		this.eventHandlers = handlers;
		return this;
	}

	/**
	 * Build the final system object
	 */
	build() {
		const system: System<ComponentTypes, any, any, EventTypes, ResourceTypes> = {
			label: this._label,
			entityQueries: this.queries as any,
		};

		if (this.processFunction) {
			system.process = this.processFunction as any;
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

		// If this system is being built directly from an ECSpresso instance (not via a bundle),
		// then register it with the ECSpresso instance
		if (this._ecspresso && !this._bundle) {
			const typedSystem = system as System<ComponentTypes, any, any, EventTypes, ResourceTypes>;
			this._ecspresso["_systems"].push(typedSystem);

			// Call onAttach lifecycle hook if defined
			if (typedSystem.onAttach) {
				typedSystem.onAttach(this._ecspresso);
			}

			// Auto-subscribe to events if eventHandlers are defined
			if (typedSystem.eventHandlers) {
				for (const eventName in typedSystem.eventHandlers) {
					const handler = typedSystem.eventHandlers[eventName];
					if (handler?.handler) {
						// Create a wrapper that passes the additional parameters to the handler
						const wrappedHandler = (data: any) => {
							handler.handler(data, this._ecspresso!);
						};

						this._ecspresso.eventBus.subscribe(eventName, wrappedHandler);
					}
				}
			}
		}

		return system;
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
): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes> {
	return new SystemBuilder<ComponentTypes, EventTypes, ResourceTypes>(
		label,
		ecspresso
	);
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
): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes> {
	return new SystemBuilder<ComponentTypes, EventTypes, ResourceTypes>(
		label,
		null,
		bundle
	);
}
