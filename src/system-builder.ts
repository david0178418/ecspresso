import Bundle from "./bundle";
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
				ecs: import("./ecspresso").default<
					ComponentTypes & Record<string, any>,
					EventTypes,
					ResourceTypes
				>
			): void;
		};
	};

	constructor(
		private _label: string,
		private _bundle = new Bundle<ComponentTypes, EventTypes, ResourceTypes>()
	) {}

	get label() {
		return this._label;
	}

	get bundle() {
		return this._bundle;
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
	 */
	setProcess(
		process: ProcessFunction<ComponentTypes, EventTypes, ResourceTypes, Queries>
	): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, Queries> {
		this.processFunction = process;
		return this;
	}

	/**
	 * Set the onAttach lifecycle hook
	 */
	setOnAttach(
		onAttach: LifecycleFunction<ComponentTypes, EventTypes, ResourceTypes>
	): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, Queries> {
		this.attachFunction = onAttach;
		return this;
	}

	/**
	 * Set the onDetach lifecycle hook
	 */
	setOnDetach(
		onDetach: LifecycleFunction<ComponentTypes, EventTypes, ResourceTypes>
	): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, Queries> {
		this.detachFunction = onDetach;
		return this;
	}

	/**
	 * Set event handlers for the system
	 */
	setEventHandlers(
		handlers: {
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
		}
	): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, Queries> {
		this.eventHandlers = handlers;
		return this;
	}

	/**
	 * Build the final system object
	 */
	build(): System<ComponentTypes, any, any, EventTypes, ResourceTypes> {
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

type ProcessFunction<
	ComponentTypes,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
	Queries extends Record<string, QueryDefinition<ComponentTypes>>,
> = (
	queries: QueryResults<ComponentTypes, Queries>,
	deltaTime: number,
	ecs: import("./ecspresso").default<
		ComponentTypes & Record<string, any>,
		EventTypes,
		ResourceTypes
	>
) => void;

type LifecycleFunction<
	ComponentTypes,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
> = (
	ecs: import("./ecspresso").default<
		ComponentTypes & Record<string, any>,
		EventTypes,
		ResourceTypes
	>
) => void;

// // Factory function for easier creation
// function createSystem<
// 	ComponentTypes,
// 	EventTypes = any,
// 	ResourceTypes = any
// >(
// 	label: string
// ): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes> {
// 	return new SystemBuilder<ComponentTypes, EventTypes, ResourceTypes>(label);
// }
