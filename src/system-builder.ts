import Bundle from "./bundle";
import ECSpresso from "./ecspresso";
import type { FilteredEntity, System, SystemPhase } from "./types";

/**
 * Builder class for creating type-safe ECS Systems with proper query inference
 */
export class SystemBuilder<
	ComponentTypes extends Record<string, any> = Record<string, any>,
	EventTypes extends Record<string, any> = Record<string, any>,
	ResourceTypes extends Record<string, any> = Record<string, any>,
	AssetTypes extends Record<string, unknown> = Record<string, unknown>,
	ScreenStates extends Record<string, any> = Record<string, any>,
	Queries extends Record<string, QueryDefinition<ComponentTypes>> = {},
> {
	private queries: Queries = {} as Queries;
	private processFunction?: ProcessFunction<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Queries>;
	private detachFunction?: LifecycleFunction<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>;
	private initializeFunction?: LifecycleFunction<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>;
	private eventHandlers?: {
		[EventName in keyof EventTypes]?: {
			handler(
				data: EventTypes[EventName],
				ecs: ECSpresso<
					ComponentTypes,
					EventTypes,
					ResourceTypes,
					AssetTypes,
					ScreenStates
				>,
			): void;
		};
	};
	private _priority = 0; // Default priority is 0
	private _phase: SystemPhase = 'update'; // Default phase is 'update'
	private _isRegistered = false; // Track if system has been auto-registered
	private _groups: string[] = [];
	private _inScreens?: ReadonlyArray<keyof ScreenStates & string>;
	private _excludeScreens?: ReadonlyArray<keyof ScreenStates & string>;
	private _requiredAssets?: ReadonlyArray<keyof AssetTypes & string>;

	constructor(
		private _label: string,
		private _ecspresso: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates> | null = null,
		private _bundle: Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates> | null = null,
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
	 * Auto-register this system with its ECSpresso instance if not already registered
	 * @private
	 */
	private _autoRegister(): void {
		if (this._isRegistered || !this._ecspresso) return;
		
		const system = this._buildSystemObject();
		registerSystemWithEcspresso(system, this._ecspresso);
		this._isRegistered = true;
	}

	/**
	 * Create the system object without registering it
	 * @private
	 */
	private _buildSystemObject(): System<ComponentTypes, any, any, EventTypes, ResourceTypes, AssetTypes, ScreenStates> {
		return this._createSystemObject();
	}

	/**
	 * Create a system object with all configured properties
	 * @private
	 */
	private _createSystemObject(): System<ComponentTypes, any, any, EventTypes, ResourceTypes, AssetTypes, ScreenStates> {
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

		return system;
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
	inGroup(groupName: string): this {
		if (!this._groups.includes(groupName)) {
			this._groups.push(groupName);
		}
		return this;
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
	): this extends SystemBuilderWithEcspresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Queries>
		? SystemBuilderWithEcspresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, NewQueries>
		: this extends SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Queries>
			? SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, NewQueries>
			: SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, NewQueries> {
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
	 * Register this system with its ECSpresso instance and return the ECSpresso for chaining
	 * This enables seamless method chaining: .registerAndContinue().addSystem(...)
	 * @returns ECSpresso instance if attached to one, otherwise throws an error
	 */
	registerAndContinue(): ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates> {
		if (!this._ecspresso) {
			throw new Error(`Cannot register system '${this._label}': SystemBuilder is not attached to an ECSpresso instance. Use Bundle.addSystem() or ECSpresso.addSystem() instead.`);
		}
		
		this._autoRegister();
		return this._ecspresso;
	}

	/**
	 * Complete this system and return the parent container for seamless chaining
	 * - For ECSpresso-attached builders: registers the system and returns ECSpresso
	 * - For Bundle-attached builders: returns the Bundle
	 * This method is typed via the specialized interfaces (SystemBuilderWithEcspresso, SystemBuilderWithBundle)
	 */
	and(): ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates> | Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates> {
		if (this._ecspresso) {
			this._autoRegister();
			return this._ecspresso;
		}

		if (this._bundle) {
			return this._bundle;
		}

		throw new Error(`Cannot use and() on system '${this._label}': not attached to ECSpresso or Bundle.`);
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
			[EventName in keyof EventTypes]?: {
				handler(
					data: EventTypes[EventName],
					ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>
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
	build(ecspresso?: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>) {
		const system = this._createSystemObject();

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
	ResourceTypes extends Record<string, any>,
	AssetTypes extends Record<string, unknown>,
	ScreenStates extends Record<string, any>
>(
	system: System<ComponentTypes, any, any, EventTypes, ResourceTypes, AssetTypes, ScreenStates>,
	ecspresso: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>
) {
	// Use the new internal registration method instead of direct property access
	ecspresso._registerSystem(system);
}

// Helper type definitions
type QueryDefinition<
	ComponentTypes,
	WithComponents extends keyof ComponentTypes = any,
	WithoutComponents extends keyof ComponentTypes = any,
	OptionalComponents extends keyof ComponentTypes = any,
> = {
	with: ReadonlyArray<WithComponents>;
	without?: ReadonlyArray<WithoutComponents>;
	changed?: ReadonlyArray<WithComponents>;
	optional?: ReadonlyArray<OptionalComponents>;
	parentHas?: ReadonlyArray<keyof ComponentTypes>;
};

type QueryResults<
	ComponentTypes,
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

/**
 * Create a SystemBuilder attached to an ECSpresso instance
 * Helper function used by ECSpresso.addSystem
 */
export function createEcspressoSystemBuilder<
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
	AssetTypes extends Record<string, unknown>,
	ScreenStates extends Record<string, any>
>(
	label: string,
	ecspresso: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>
): SystemBuilderWithEcspresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates> {
	return new SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>(
		label,
		ecspresso
	) as SystemBuilderWithEcspresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>;
}

/**
 * Create a SystemBuilder attached to a Bundle
 * Helper function used by Bundle.addSystem
 */
export function createBundleSystemBuilder<
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
	AssetTypes extends Record<string, unknown>,
	ScreenStates extends Record<string, any>
>(
	label: string,
	bundle: Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>
): SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates> {
	return new SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>(
		label,
		null,
		bundle
	) as SystemBuilderWithBundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>;
}

// Type interfaces for specialized SystemBuilders

/**
 * SystemBuilder with a guaranteed non-null reference to an ECSpresso instance
 */
export interface SystemBuilderWithEcspresso<
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
	AssetTypes extends Record<string, unknown>,
	ScreenStates extends Record<string, any>,
	Queries extends Record<string, QueryDefinition<ComponentTypes>> = {}
> extends SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Queries> {
	readonly ecspresso: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>;

	/**
	 * Complete this system and return ECSpresso for seamless chaining
	 * Automatically registers the system when called
	 */
	and(): ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>;
}

/**
 * SystemBuilder with a guaranteed non-null reference to a Bundle
 */
export interface SystemBuilderWithBundle<
	ComponentTypes extends Record<string, any>,
	EventTypes extends Record<string, any>,
	ResourceTypes extends Record<string, any>,
	AssetTypes extends Record<string, unknown>,
	ScreenStates extends Record<string, any>,
	Queries extends Record<string, QueryDefinition<ComponentTypes>> = {}
> extends SystemBuilder<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Queries> {
	readonly bundle: Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>;

	/**
	 * Complete this system and return the Bundle for chaining
	 * Enables fluent API: bundle.addSystem(...).and().addSystem(...)
	 */
	and(): Bundle<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>;
}
