import type ECSpresso from "./ecspresso";
import type { FilteredEntity, QueryDefinition, System, SystemPhase } from "./types";

/**
 * Builder class for creating type-safe ECS Systems with proper query inference.
 * Systems are automatically registered with their ECSpresso instance when
 * finalized (at the start of initialize() or update()).
 */
export class SystemBuilder<
	ComponentTypes extends Record<string, any> = Record<string, any>,
	EventTypes extends Record<string, any> = Record<string, any>,
	ResourceTypes extends Record<string, any> = Record<string, any>,
	AssetTypes extends Record<string, unknown> = Record<string, unknown>,
	ScreenStates extends Record<string, any> = Record<string, any>,
	Queries extends Record<string, QueryDefinition<ComponentTypes>> = {},
	Label extends string = string,
	SysGroups extends string = never,
> {
	private queries: Queries = {} as Queries;
	private processFunction?: ProcessFunction<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Queries>;
	private detachFunction?: LifecycleFunction<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>;
	private initializeFunction?: LifecycleFunction<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>;
	private eventHandlers?: {
		[EventName in keyof EventTypes]?: (
			data: EventTypes[EventName],
			ecs: ECSpresso<
				ComponentTypes,
				EventTypes,
				ResourceTypes,
				AssetTypes,
				ScreenStates
			>,
		) => void;
	};
	private _priority = 0;
	private _phase: SystemPhase = 'update';
	private _groups: string[] = [];
	private _inScreens?: ReadonlyArray<keyof ScreenStates & string>;
	private _excludeScreens?: ReadonlyArray<keyof ScreenStates & string>;
	private _requiredAssets?: ReadonlyArray<keyof AssetTypes & string>;
	private _runWhenEmpty = false;
	private _entityEnterHandlers: Record<string, (entity: any, ecs: any) => void> = {};

	constructor(private _label: string) {}

	get label() {
		return this._label;
	}

	/**
	 * Create a system object with all configured properties.
	 * @internal Used by ECSpresso to finalize and register the system
	 */
	_createSystemObject(): System<ComponentTypes, any, any, EventTypes, ResourceTypes, AssetTypes, ScreenStates> {
		const system: System<ComponentTypes, any, any, EventTypes, ResourceTypes, AssetTypes, ScreenStates> = {
			label: this._label,
			entityQueries: this.queries,
			priority: this._priority,
			phase: this._phase,
		};

		if (this.processFunction) {
			system.process = this.processFunction;
		}

		if (this.detachFunction) {
			system.onDetach = this.detachFunction;
		}

		if (this.initializeFunction) {
			system.onInitialize = this.initializeFunction;
		}

		if (this.eventHandlers) {
			system.eventHandlers = this.eventHandlers;
		}

		if (this._groups.length > 0) {
			system.groups = [...this._groups];
		}

		if (this._inScreens) {
			system.inScreens = this._inScreens;
		}

		if (this._excludeScreens) {
			system.excludeScreens = this._excludeScreens;
		}

		if (this._requiredAssets) {
			system.requiredAssets = this._requiredAssets;
		}

		if (this._runWhenEmpty) {
			system.runWhenEmpty = true;
		}

		if (Object.keys(this._entityEnterHandlers).length > 0) {
			system.onEntityEnter = { ...this._entityEnterHandlers };
		}

		return system;
	}

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
	 * Set the execution phase for this system.
	 * Systems are grouped by phase and executed in order:
	 * preUpdate -> fixedUpdate -> update -> postUpdate -> render
	 * @param phase The phase to assign this system to (default: 'update')
	 * @returns This SystemBuilder instance for method chaining
	 */
	inPhase(phase: SystemPhase): this {
		this._phase = phase;
		return this;
	}

	/**
	 * Add this system to a group. Systems can belong to multiple groups.
	 * When any group a system belongs to is disabled, the system will be skipped.
	 * @param groupName The name of the group to add the system to
	 * @returns This SystemBuilder instance for method chaining
	 */
	inGroup<G extends string>(groupName: G): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Queries, Label, SysGroups | G> {
		if (!this._groups.includes(groupName)) {
			this._groups.push(groupName);
		}
		return this as any;
	}

	/**
	 * Restrict this system to only run in specified screens.
	 * System will be skipped during update() when the current screen
	 * is not in this list.
	 * @param screens Array of screen names where this system should run
	 * @returns This SystemBuilder instance for method chaining
	 */
	inScreens(screens: ReadonlyArray<keyof ScreenStates & string>): this {
		this._inScreens = [...screens];
		return this;
	}

	/**
	 * Exclude this system from running in specified screens.
	 * System will be skipped during update() when the current screen
	 * is in this list.
	 * @param screens Array of screen names where this system should NOT run
	 * @returns This SystemBuilder instance for method chaining
	 */
	excludeScreens(screens: ReadonlyArray<keyof ScreenStates & string>): this {
		this._excludeScreens = [...screens];
		return this;
	}

	/**
	 * Require specific assets to be loaded for this system to run.
	 * System will be skipped during update() if any required asset
	 * is not loaded.
	 * @param assets Array of asset keys that must be loaded
	 * @returns This SystemBuilder instance for method chaining
	 */
	requiresAssets(assets: ReadonlyArray<keyof AssetTypes & string>): this {
		this._requiredAssets = [...assets];
		return this;
	}

	/**
	 * Allow this system to run even when all queries return zero entities.
	 * By default, systems with queries are skipped when no entities match.
	 */
	runWhenEmpty(): this {
		this._runWhenEmpty = true;
		return this;
	}

	/**
	 * Add a query definition to the system
	 */
	addQuery<
		QueryName extends string,
		WithComponents extends keyof ComponentTypes,
		WithoutComponents extends keyof ComponentTypes = never,
		OptionalComponents extends keyof ComponentTypes = never,
		NewQueries extends Queries & Record<QueryName, QueryDefinition<ComponentTypes, WithComponents, WithoutComponents, OptionalComponents>> =
			Queries & Record<QueryName, QueryDefinition<ComponentTypes, WithComponents, WithoutComponents, OptionalComponents>>
	>(
		name: QueryName,
		definition: {
			with: ReadonlyArray<WithComponents>;
			without?: ReadonlyArray<WithoutComponents>;
			changed?: ReadonlyArray<WithComponents>;
			optional?: ReadonlyArray<OptionalComponents>;
			parentHas?: ReadonlyArray<keyof ComponentTypes>;
		}
	): SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, NewQueries, Label, SysGroups> {
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
		process: ProcessFunction<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Queries>
	): this {
		this.processFunction = process;
		return this;
	}

	/**
	 * Register a callback that fires once per entity the first time it appears
	 * in a query's results. Fires before process. Automatic cleanup when entity
	 * leaves the query so re-entry fires the callback again.
	 * @param queryName Name of a query previously added via addQuery
	 * @param callback Function called with the entity and ecs instance
	 * @returns This SystemBuilder instance for method chaining
	 */
	setOnEntityEnter<QN extends keyof Queries & string>(
		queryName: QN,
		callback: (
			entity: FilteredEntity<
				ComponentTypes,
				Queries[QN] extends QueryDefinition<ComponentTypes, infer W> ? W : never,
				Queries[QN] extends QueryDefinition<ComponentTypes, any, infer WO> ? WO : never,
				Queries[QN] extends QueryDefinition<ComponentTypes, any, any, infer O> ? O : never
			>,
			ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>
		) => void,
	): this {
		this._entityEnterHandlers[queryName] = callback;
		return this;
	}

	/**
	 * Set the onDetach lifecycle hook
	 * Called when the system is removed from the ECS
	 * @param onDetach Function to run when this system is detached from the ECS
	 * @returns This SystemBuilder instance for method chaining
	 */
	setOnDetach(
		onDetach: LifecycleFunction<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>
	): this {
		this.detachFunction = onDetach;
		return this;
	}

	/**
	 * Set the onInitialize lifecycle hook
	 * Called when the system is initialized via ECSpresso.initialize() method
	 * @param onInitialize Function to run when this system is initialized
	 * @returns This SystemBuilder instance for method chaining
	 */
	setOnInitialize(
		onInitialize: LifecycleFunction<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>
	): this {
		this.initializeFunction = onInitialize;
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
			[EventName in keyof EventTypes]?: (
				data: EventTypes[EventName],
				ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>
			) => void;
		}
	): this {
		this.eventHandlers = handlers;
		return this;
	}
}

// Helper type definitions

type QueryResults<
	ComponentTypes extends Record<string, any>,
	Queries extends Record<string, QueryDefinition<ComponentTypes>>,
> = {
	[QueryName in keyof Queries]: QueryName extends string
		? FilteredEntity<
			ComponentTypes,
			Queries[QueryName] extends QueryDefinition<ComponentTypes, infer W> ? W : never,
			Queries[QueryName] extends QueryDefinition<ComponentTypes, any, infer WO> ? WO : never,
			Queries[QueryName] extends QueryDefinition<ComponentTypes, any, any, infer O> ? O : never
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
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
	AssetTypes extends Record<string, unknown>,
	ScreenStates extends Record<string, any>,
	Queries extends Record<string, QueryDefinition<ComponentTypes>>,
> = (
	queries: QueryResults<ComponentTypes, Queries>,
	deltaTime: number,
	ecs: ECSpresso<
		ComponentTypes,
		EventTypes,
		ResourceTypes,
		AssetTypes,
		ScreenStates
	>
) => void;

/**
 * Type for system initialization functions
 * These can be asynchronous
 */
type LifecycleFunction<
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
	AssetTypes extends Record<string, unknown>,
	ScreenStates extends Record<string, any>,
> = (
	ecs: ECSpresso<
		ComponentTypes,
		EventTypes,
		ResourceTypes,
		AssetTypes,
		ScreenStates
	>,
) => void | Promise<void>;
