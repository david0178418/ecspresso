import EntityManager from "./entity-manager";
import EventBus from "./event-bus";
import ResourceManager, { type ResourceFactoryWithDeps } from "./resource-manager";
import AssetManager from "./asset-manager";
import ScreenManager from "./screen-manager";
import ReactiveQueryManager, { type ReactiveQueryDefinition } from "./reactive-query-manager";
import CommandBuffer from "./command-buffer";
import type { System, SystemPhase, FilteredEntity, Entity, RemoveEntityOptions, HierarchyEntry, HierarchyIteratorOptions } from "./types";
import type { Plugin } from "./plugin";
import { createEcspressoSystemBuilder } from "./system-builder";
import { checkRequiredCycle } from "./utils/check-required-cycle";
import { version } from "../package.json";
import type { AssetDefinition, AssetHandle, AssetEvents } from "./asset-types";
import type { ScreenDefinition, ScreenEvents } from "./screen-types";
import { ECSpressoBuilder } from "./ecspresso-builder";

/**
	* Interface declaration for ECSpresso constructor to ensure type augmentation works properly.
	* This merges with the class declaration below.
*/
export default interface ECSpresso<
	ComponentTypes extends Record<string, any> = {},
	EventTypes extends Record<string, any> = {},
	ResourceTypes extends Record<string, any> = {},
	AssetTypes extends Record<string, unknown> = {},
	ScreenStates extends Record<string, ScreenDefinition<any, any>> = {},
	Labels extends string = string,
	Groups extends string = string,
	AssetGroupNames extends string = string,
	ReactiveQueryNames extends string = string,
> {
	/**
		* Default constructor
	*/
	new(): ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates, Labels, Groups, AssetGroupNames, ReactiveQueryNames>;
}

const PHASE_ORDER: readonly SystemPhase[] = [
	'preUpdate', 'fixedUpdate', 'update', 'postUpdate', 'render',
];

const EmptyQueryResults = {};

/**
	* ECSpresso is the central ECS framework class that connects all features.
	* It handles creation and management of entities, components, and systems, and provides lifecycle hooks.
*/
export default class ECSpresso<
	ComponentTypes extends Record<string, any> = {},
	EventTypes extends Record<string, any> = {},
	ResourceTypes extends Record<string, any> = {},
	AssetTypes extends Record<string, unknown> = {},
	ScreenStates extends Record<string, ScreenDefinition<any, any>> = {},
	Labels extends string = string,
	Groups extends string = string,
	AssetGroupNames extends string = string,
	ReactiveQueryNames extends string = string,
> {
	// Phantom type properties for structural type extraction (no runtime cost).
	// Only the 5 externally-extracted type params get phantom properties.
	// Labels, Groups, AssetGroupNames, ReactiveQueryNames are internal to
	// the builder and continue using positional inference in type-utils.ts.
	declare readonly _componentTypes: ComponentTypes;
	declare readonly _eventTypes: EventTypes;
	declare readonly _resourceTypes: ResourceTypes;
	declare readonly _assetTypes: AssetTypes;
	declare readonly _screenStates: ScreenStates;

	/** Library version*/
	public static readonly VERSION = version;

	/** Access/modify stored components and entities*/
	private _entityManager: EntityManager<ComponentTypes>;
	/** Publish/subscribe to events*/
	private _eventBus: EventBus<EventTypes>;
	/** Access/modify registered resources*/
	private _resourceManager: ResourceManager<ResourceTypes, ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>>;
	/** Command buffer for deferred structural changes */
	private _commandBuffer: CommandBuffer<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>;

	/** Registered systems that will be updated in order*/
	private _systems: Array<System<ComponentTypes, any, any, EventTypes, ResourceTypes, AssetTypes, ScreenStates>> = [];
	/** Systems grouped by execution phase, each sorted by priority */
	private _phaseSystems: Record<SystemPhase, Array<System<ComponentTypes, any, any, EventTypes, ResourceTypes, AssetTypes, ScreenStates>>> = {
		preUpdate: [], fixedUpdate: [], update: [], postUpdate: [], render: [],
	};
	/** Track installed plugins to prevent duplicates*/
	private _installedPlugins: Set<string> = new Set();
	/** Disabled system groups */
	private _disabledGroups: Set<string> = new Set();
	/** Asset manager for loading and accessing assets */
	private _assetManager: AssetManager<AssetTypes> | null = null;
	/** Screen manager for state/screen transitions */
	private _screenManager: ScreenManager<ScreenStates> | null = null;
	/** Reactive query manager for enter/exit callbacks */
	private _reactiveQueryManager: ReactiveQueryManager<ComponentTypes>;
	/** Post-update hooks to be called after all systems in update() */
	private _postUpdateHooks: Array<(ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>, deltaTime: number) => void> = [];
	/** Global tick counter, incremented at the end of each update() */
	private _currentTick: number = 0;
	/** Per-system last-seen change sequence for change detection */
	private _systemLastSeqs: Map<object, number> = new Map();
	/** Change threshold used for public getEntitiesWithQuery and between-system resolution */
	private _changeThreshold: number = 0;
	/** Fixed timestep interval in seconds (default: 1/60) */
	private _fixedDt: number = 1 / 60;
	/** Accumulated time for fixed update steps */
	private _fixedAccumulator: number = 0;
	/** Interpolation alpha between fixed steps (accumulator / fixedDt) */
	private _interpolationAlpha: number = 0;
	/** Maximum fixed update steps per frame (spiral-of-death protection) */
	private _maxFixedSteps: number = 8;
	/** Registry of required component relationships: trigger -> [{component, factory}] */
	private _requiredComponents: Map<keyof ComponentTypes, Array<{ component: keyof ComponentTypes; factory: (triggerValue: any) => any }>> = new Map();
	/** Pending plugin assets awaiting manager creation at build time */
	private _pendingPluginAssets: Array<[string, AssetDefinition<unknown>]> = [];
	/** Pending plugin screens awaiting manager creation at build time */
	private _pendingPluginScreens: Array<[string, ScreenDefinition<any, any>]> = [];
	/** Whether diagnostics timing collection is enabled */
	private _diagnosticsEnabled: boolean = false;
	/** Per-system timing in ms, populated when diagnostics enabled */
	private _systemTimings: Map<string, number> = new Map();
	/** Per-phase timing in ms, populated when diagnostics enabled */
	private _phaseTimings: Record<SystemPhase, number> = {
		preUpdate: 0, fixedUpdate: 0, update: 0, postUpdate: 0, render: 0,
	};
	/** Per-system per-query seen entity IDs for onEntityEnter tracking */
	private _entityEnterTracking: Map<object, Map<string, Set<number>>> = new Map();
	/** Shared reusable set for per-tick entity enter comparison (avoids allocation) */
	private _entityEnterFrameSet: Set<number> = new Set();

	/**
		* Creates a new ECSpresso instance.
	*/
	constructor() {
		this._entityManager = new EntityManager<ComponentTypes>();
		this._eventBus = new EventBus<EventTypes>();
		this._resourceManager = new ResourceManager<ResourceTypes, ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>>();
		this._reactiveQueryManager = new ReactiveQueryManager<ComponentTypes>(this._entityManager);
		this._commandBuffer = new CommandBuffer<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>();

		// Wire up lifecycle hooks for change detection, required components, and reactive queries
		this._subscribeLifecycleHooks();
	}

	/**
	 * Subscribes to EntityManager lifecycle hooks for change detection,
	 * required component auto-addition, and reactive query tracking.
	 * @private
	 */
	private _subscribeLifecycleHooks(): void {
		// afterComponentAdded → mark changed + auto-add required components
		this._entityManager.onAfterComponentAdded((entityId, componentName) => {
			this._entityManager.markChanged(entityId, componentName);

			// Auto-add required components (recursive via addComponent → this hook)
			const reqs = this._requiredComponents.get(componentName);
			if (reqs) {
				const entity = this._entityManager.getEntity(entityId);
				if (entity) {
					const triggerValue = entity.components[componentName];
					for (const { component, factory } of reqs) {
						if (this._entityManager._pendingBatchKeys?.has(component)) continue;
						if (!(component in entity.components)) {
							this._entityManager.addComponent(entityId, component, factory(triggerValue));
						}
					}
				}
			}
		});

		// afterEntityMutated → recheck reactive queries (entity itself + children for parentHas)
		this._entityManager.onAfterEntityMutated((entityId) => {
			const entity = this._entityManager.getEntity(entityId);
			if (entity) {
				this._reactiveQueryManager.recheckEntityAndChildren(entity);
			}
		});

		// afterComponentRemoved → notify reactive query manager
		this._entityManager.onAfterComponentRemoved((entityId, componentName) => {
			const entity = this._entityManager.getEntity(entityId);
			if (entity) {
				this._reactiveQueryManager.onComponentRemoved(entity, componentName);
			}
		});

		// beforeEntityRemoved → notify reactive query manager
		this._entityManager.onBeforeEntityRemoved((entityId) => {
			this._reactiveQueryManager.onEntityRemoved(entityId);
		});

		// afterParentChanged → recheck child entity for parentHas queries
		this._entityManager.onAfterParentChanged((childId) => {
			if (this._reactiveQueryManager.hasParentHasQueries) {
				const childEntity = this._entityManager.getEntity(childId);
				if (childEntity) {
					this._reactiveQueryManager.recheckEntity(childEntity);
				}
			}
		});
	}

	/**
		* Creates a new ECSpresso builder for type-safe plugin installation.
		* This is the preferred way to create an ECSpresso instance with plugins.
		* Types are inferred from the builder chain — use `.withPlugin()`,
		* `.withComponentTypes<T>()`, `.withEventTypes<T>()`, and `.withResource()`
		* to accumulate types without manual aggregate interfaces.
	 *
		* @returns A builder instance for fluent method chaining
	 *
		* @example
		* ```typescript
		* const ecs = ECSpresso.create()
	 *	 .withPlugin(createRenderer2DPlugin({ ... }))
	 *	 .withPlugin(createPhysics2DPlugin())
	 *	 .withComponentTypes<{ player: true; enemy: { type: string } }>()
	 *	 .withEventTypes<{ gameStart: true }>()
	 *	 .withResource('score', { value: 0 })
	 *	 .build();
	 *
	 * type ECS = typeof ecs;
		* ```
	*/
	static create<
		C extends Record<string, any> = {},
		E extends Record<string, any> = {},
		R extends Record<string, any> = {},
		A extends Record<string, unknown> = {},
		S extends Record<string, ScreenDefinition<any, any>> = {},
	>(): ECSpressoBuilder<C, E, R, A, S, never, never, never, never> {
		return new ECSpressoBuilder<C, E, R, A, S, never, never, never, never>();
	}

	/**
		* Adds a system directly to this ECSpresso instance
		* @param label Unique name to identify the system
		* @returns A SystemBuilder instance for method chaining
	*/
	addSystem(label: string) {
		return createEcspressoSystemBuilder<
			ComponentTypes,
			EventTypes,
			ResourceTypes,
			AssetTypes,
			ScreenStates
		>(label, this);
	}

	/**
	 * Update all systems across execution phases.
	 * Phases run in order: preUpdate -> fixedUpdate -> update -> postUpdate -> render.
	 * The fixedUpdate phase uses a time accumulator for deterministic fixed-timestep simulation.
	 * @param deltaTime Time elapsed since the last update (in seconds)
	 */
	update(deltaTime: number) {
		const currentScreen = (this._screenManager?.getCurrentScreen() ?? null) as (keyof ScreenStates & string) | null;
		const timing = this._diagnosticsEnabled;

		// 1. preUpdate phase
		this._runPhase('preUpdate', deltaTime, currentScreen, timing);

		// 2. fixedUpdate phase — accumulate time and step N times
		const fixedT0 = timing ? performance.now() : 0;
		this._fixedAccumulator += deltaTime;
		let steps = 0;
		while (this._fixedAccumulator >= this._fixedDt && steps < this._maxFixedSteps) {
			this._executePhase(this._phaseSystems.fixedUpdate, this._fixedDt, currentScreen);
			this._commandBuffer.playback(this);
			this._fixedAccumulator -= this._fixedDt;
			steps++;
		}
		// Clamp accumulator if we hit the spiral-of-death cap
		if (this._fixedAccumulator >= this._fixedDt) {
			this._fixedAccumulator = 0;
		}
		if (timing) {
			this._phaseTimings.fixedUpdate = performance.now() - fixedT0;
		}
		// Compute interpolation alpha for render-phase smoothing
		this._interpolationAlpha = this._fixedAccumulator / this._fixedDt;

		// 3. update phase
		this._runPhase('update', deltaTime, currentScreen, timing);

		// 4. postUpdate phase
		this._runPhase('postUpdate', deltaTime, currentScreen, timing);

		// 5. Post-update hooks (between postUpdate and render, preserving existing behavior)
		for (const hook of this._postUpdateHooks) {
			hook(this, deltaTime);
		}

		// 6. render phase
		this._runPhase('render', deltaTime, currentScreen, timing);

		// Set change threshold to current sequence so that public
		// getEntitiesWithQuery (called between updates) sees command
		// buffer marks but not stale ones.
		this._changeThreshold = this._entityManager.changeSeq;

		// Increment tick counter (frame counter only)
		this._currentTick++;
	}

	/**
	 * Execute all systems in a single phase.
	 * @private
	 */
	private _executePhase(
		systems: ReadonlyArray<System<ComponentTypes, any, any, EventTypes, ResourceTypes, AssetTypes, ScreenStates>>,
		deltaTime: number,
		currentScreen: (keyof ScreenStates & string) | null
	): void {
		for (const system of systems) {
			if (!system.process && !system.onEntityEnter) continue;

			// Group filtering - skip if any of the system's groups is disabled
			if (system.groups?.length) {
				let anyDisabled = false;
				for (const group of system.groups) {
					if (this._disabledGroups.has(group)) {
						anyDisabled = true;
						break;
					}
				}
				if (anyDisabled) continue;
			}

			// Screen filtering - skip if system is restricted to specific screens
			if (system.inScreens?.length) {
				if (currentScreen === null || !system.inScreens.includes(currentScreen)) {
					continue;
				}
			}

			// Screen exclusion - skip if system excludes current screen
			if (system.excludeScreens?.length) {
				if (currentScreen !== null && system.excludeScreens.includes(currentScreen)) {
					continue;
				}
			}

			// Asset requirements - skip if required assets not loaded
			if (system.requiredAssets?.length && this._assetManager) {
				let assetsReady = true;
				for (const assetKey of system.requiredAssets) {
					if (!this._assetManager.isLoaded(assetKey)) {
						assetsReady = false;
						break;
					}
				}
				if (!assetsReady) continue;
			}

			// Set per-system change threshold from its last-seen sequence
			const systemThreshold = this._systemLastSeqs.get(system) ?? 0;
			this._changeThreshold = systemThreshold;

			// Prepare query results for each defined query in the system
			const queryResults: Record<string, any> = {};
			let hasResults = false;
			let hasQueries = false;

			if (system.entityQueries) {
				for (const queryName in system.entityQueries) {
					hasQueries = true;

					const query = system.entityQueries[queryName];

					if (query) {
						queryResults[queryName] = this._entityManager.getEntitiesWithQuery(
							query.with,
							query.without || [],
							query.changed,
							query.changed ? this._changeThreshold : undefined,
							query.parentHas,
						);

						if(queryResults[queryName].length) {
							hasResults = true; // At least one query has results
						}
					}
				}
			}

			// Fire onEntityEnter callbacks before process
			const enterTracking = this._entityEnterTracking.get(system);
			if (enterTracking && system.onEntityEnter) {
				for (const queryName in system.onEntityEnter) {
					const results = queryResults[queryName];
					const seenEntities = enterTracking.get(queryName);
					if (!results || !seenEntities) continue;

					const callback = system.onEntityEnter[queryName]!;

					// Build set of current entity IDs for pruning
					const frameSet = this._entityEnterFrameSet;
					frameSet.clear();

					for (const entity of results) {
						frameSet.add(entity.id);
						if (!seenEntities.has(entity.id)) {
							seenEntities.add(entity.id);
							callback(entity, this);
						}
					}

					// Prune stale entries (entities no longer in query results)
					for (const id of seenEntities) {
						if (!frameSet.has(id)) {
							seenEntities.delete(id);
						}
					}
				}
			}

			// Call the system's process function only if there are results or there is no query.
			if (system.process) {
				if (this._diagnosticsEnabled) {
					const t0 = performance.now();
					if (hasResults || system.runWhenEmpty) {
						system.process(queryResults, deltaTime, this);
					} else if (!hasQueries) {
						system.process(EmptyQueryResults, deltaTime, this);
					}
					this._systemTimings.set(system.label, performance.now() - t0);
				} else if (hasResults || system.runWhenEmpty) {
					system.process(queryResults, deltaTime, this);
				} else if (!hasQueries) {
					system.process(EmptyQueryResults, deltaTime, this);
				}
			}

			// Record this system's last-seen sequence so it won't re-process these marks
			this._systemLastSeqs.set(system, this._entityManager.changeSeq);
		}
	}

	/**
	 * Execute a non-fixed phase with optional timing, then play back the command buffer.
	 * @private
	 */
	private _runPhase(
		phase: SystemPhase,
		deltaTime: number,
		currentScreen: (keyof ScreenStates & string) | null,
		timing: boolean
	): void {
		if (timing) {
			const t0 = performance.now();
			this._executePhase(this._phaseSystems[phase], deltaTime, currentScreen);
			this._phaseTimings[phase] = performance.now() - t0;
		} else {
			this._executePhase(this._phaseSystems[phase], deltaTime, currentScreen);
		}
		this._commandBuffer.playback(this);
	}

	/**
	 * Initialize all resources and systems
	 * This method:
	 * 1. Initializes all resources that were added as factory functions
	 * 2. Sets up asset manager and loads eager assets
	 * 3. Sets up screen manager
	 * 4. Calls the onInitialize lifecycle hook on all systems
	 *
	 * This is useful for game startup to ensure all resources are ready
	 * and systems are properly initialized before the game loop begins.
	 *
	 * @param resourceKeys Optional array of specific resource keys to initialize
	 * @returns Promise that resolves when everything is initialized
	 */
	async initialize(): Promise<void> {
		await this.initializeResources();

		// Set up asset manager if present
		// Key/value casts are needed because the class generic doesn't constrain ResourceTypes
		// to contain $assets/$screen — the builder merges them into R at the type level.
		if (this._assetManager) {
			this._assetManager.setEventBus(this._eventBus as unknown as EventBus<AssetEvents<keyof AssetTypes & string>>);
			await this._assetManager.loadEagerAssets();
			this._resourceManager.add('$assets' as keyof ResourceTypes, this._assetManager.createResource() as unknown as ResourceTypes[keyof ResourceTypes]);
		}

		// Set up screen manager if present
		if (this._screenManager) {
			this._screenManager.setDependencies(
				this._eventBus as unknown as EventBus<ScreenEvents<keyof ScreenStates & string>>,
				this._assetManager,
				this as unknown as ECSpresso<any, any, any, any, any>
			);
			this._resourceManager.add('$screen' as keyof ResourceTypes, this._screenManager.createResource() as unknown as ResourceTypes[keyof ResourceTypes]);
		}

		for (const system of this._systems) {
			await system.onInitialize?.(this);
		}
	}

	/**
	 * Initialize specific resources or all resources that were added as factory functions but haven't been initialized yet.
	 * This is useful when you need to ensure resources are ready before proceeding.
	 * @param keys Optional array of resource keys to initialize. If not provided, all pending resources will be initialized.
	 * @returns Promise that resolves when the specified resources are initialized
	 */
	async initializeResources<K extends keyof ResourceTypes>(...keys: K[]): Promise<void> {
		await this._resourceManager.initializeResources(this, ...keys);
	}

	/**
	 * Rebuild per-phase system arrays from the flat _systems list.
	 * Each phase array is sorted by priority (higher first), with
	 * registration order as tiebreaker.
	 * @private
	 */
	private _rebuildPhaseSystems(): void {
		for (const phase of PHASE_ORDER) {
			this._phaseSystems[phase] = [];
		}
		for (const system of this._systems) {
			const phase = system.phase ?? 'update';
			this._phaseSystems[phase].push(system);
		}
		for (const phase of PHASE_ORDER) {
			this._phaseSystems[phase].sort((a, b) => {
				const priorityA = a.priority ?? 0;
				const priorityB = b.priority ?? 0;
				return priorityB - priorityA; // Higher priority executes first
			});
		}
	}

	/**
		* Update the priority of a system
		* @param label The unique label of the system to update
		* @param priority The new priority value (higher values execute first)
		* @returns true if the system was found and updated, false otherwise
	*/
	updateSystemPriority(label: Labels, priority: number): boolean {
		const system = this._systems.find(system => system.label === label);
		if (!system) return false;

		// Set the new priority
		system.priority = priority;

		// Re-sort the systems array
		this._rebuildPhaseSystems();

		return true;
	}

	/**
	 * Move a system to a different execution phase at runtime.
	 * @param label The unique label of the system to move
	 * @param phase The target phase
	 * @returns true if the system was found and updated, false otherwise
	 */
	updateSystemPhase(label: Labels, phase: SystemPhase): boolean {
		const system = this._systems.find(system => system.label === label);
		if (!system) return false;

		system.phase = phase;
		this._rebuildPhaseSystems();

		return true;
	}

	/**
	 * The interpolation alpha between fixed update steps.
	 * Ranges from 0 to <1, representing how far into the next
	 * fixed step the current frame is. Use in the render phase
	 * for smooth visual interpolation.
	 */
	get interpolationAlpha(): number {
		return this._interpolationAlpha;
	}

	/**
	 * The configured fixed timestep interval in seconds.
	 */
	get fixedDt(): number {
		return this._fixedDt;
	}

	// ==================== System Group Control ====================

	/**
	 * Disable a system group. Systems in this group will be skipped during update().
	 * @param groupName The name of the group to disable
	 */
	disableSystemGroup(groupName: Groups): void {
		this._disabledGroups.add(groupName);
	}

	/**
	 * Enable a system group. Systems in this group will run during update().
	 * @param groupName The name of the group to enable
	 */
	enableSystemGroup(groupName: Groups): void {
		this._disabledGroups.delete(groupName);
	}

	/**
	 * Check if a system group is enabled.
	 * @param groupName The name of the group to check
	 * @returns true if the group is enabled (or doesn't exist), false if disabled
	 */
	isSystemGroupEnabled(groupName: Groups): boolean {
		return !this._disabledGroups.has(groupName);
	}

	/**
	 * Get all system labels that belong to a specific group.
	 * @param groupName The name of the group
	 * @returns Array of system labels in the group
	 */
	getSystemsInGroup(groupName: Groups): string[] {
		return this._systems
			.filter(system => system.groups?.includes(groupName))
			.map(system => system.label);
	}

	/**
		* Remove a system by its label
		* Calls the system's onDetach method with this ECSpresso instance if defined
		* @param label The unique label of the system to remove
		* @returns true if the system was found and removed, false otherwise
	*/
	removeSystem(label: Labels): boolean {
		const index = this._systems.findIndex(system => system.label === label);
		if (index === -1) return false;

		const system = this._systems[index];
		// This should never happen since we just found the system by index
		if (!system) return false;

		// Call the onDetach lifecycle hook if defined
		if (system.onDetach) {
			system.onDetach(this);
		}

		// Remove system and clean up per-system tracking
		this._systems.splice(index, 1);
		this._systemLastSeqs.delete(system);
		this._entityEnterTracking.delete(system);

		// Re-sort systems
		this._rebuildPhaseSystems();

		return true;
	}

	/**
		* Internal method to register a system with this ECSpresso instance
		* @internal Used by SystemBuilder - replaces direct private property access
	*/
	_registerSystem(system: System<ComponentTypes, any, any, EventTypes, ResourceTypes, AssetTypes, ScreenStates>): void {
		this._systems.push(system);
		// Initialize the system's last-seen sequence to the current change threshold.
		// Before any update this is 0, so newly added systems see spawn marks.
		// After updates, the threshold is advanced past consumed marks, so
		// systems added later don't see stale marks.
		this._systemLastSeqs.set(system, this._changeThreshold);
		this._rebuildPhaseSystems();

		// Set up entity enter tracking if the system has onEntityEnter handlers
		if (system.onEntityEnter) {
			const queryMap = new Map<string, Set<number>>();
			for (const queryName in system.onEntityEnter) {
				queryMap.set(queryName, new Set());
			}
			this._entityEnterTracking.set(system, queryMap);
		}

		// Set up event handlers if they exist
		if (!system.eventHandlers) return;

		for (const eventName in system.eventHandlers) {
			const handler = system.eventHandlers[eventName];
			if (handler) {
				this._eventBus.subscribe(eventName, (data) => {
					handler(data, this);
				});
			}
		}
	}

	/**
		* Check if a resource exists
	*/
	hasResource<K extends keyof ResourceTypes>(key: K): boolean {
		return this._resourceManager.has(key);
	}

	/**
	 * Get a resource by key. Throws if the resource is not found.
	 * @param key The resource key
	 * @returns The resource value
	 * @throws Error if resource not found
	 * @see tryGetResource — the non-throwing alternative that returns undefined
	 */
	getResource<K extends keyof ResourceTypes>(key: K): ResourceTypes[K] {
		if (!this._resourceManager.has(key)) {
			throw new Error(`Resource '${String(key)}' not found. Available resources: [${this.getResourceKeys().map(k => String(k)).join(', ')}]`);
		}

		return this._resourceManager.get(key, this);
	}

	/**
	 * Try to get a resource by key. Returns undefined if the resource is not found.
	 * Inspired by Bevy's `World::get_resource::<T>()` which returns `Option<&T>`.
	 *
	 * Two overloads:
	 * 1. Known key — full type safety from `ResourceTypes`
	 * 2. String key with explicit type param — for cross-plugin optional dependencies
	 *
	 * @example
	 * ```typescript
	 * // Known key (type inferred from ResourceTypes)
	 * const score = ecs.tryGetResource('score'); // ScoreResource | undefined
	 *
	 * // Cross-plugin optional dependency (caller specifies expected type)
	 * const si = ecs.tryGetResource<SpatialIndex>('spatialIndex') ?? null;
	 * ```
	 */
	tryGetResource<K extends keyof ResourceTypes>(key: K): ResourceTypes[K] | undefined;
	tryGetResource<T>(key: unknown extends T ? never : string): T | undefined;
	tryGetResource(key: string): unknown {
		const k = key as keyof ResourceTypes;
		if (!this._resourceManager.has(k)) return undefined;
		return this._resourceManager.get(k, this);
	}

	/**
		* Add a resource to the ECS instance
	*/
	addResource<K extends keyof ResourceTypes>(
		key: K,
		resource:
			| ResourceTypes[K]
			| ((ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>) => ResourceTypes[K] | Promise<ResourceTypes[K]>)
			| ResourceFactoryWithDeps<ResourceTypes[K], ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>, keyof ResourceTypes & string>
	): this {
		this._resourceManager.add(key, resource);
		return this;
	}

	/**
		* Remove a resource from the ECS instance (without calling onDispose)
		* @param key The resource key to remove
		* @returns True if the resource was removed, false if it didn't exist
	*/
	removeResource<K extends keyof ResourceTypes>(key: K): boolean {
		return this._resourceManager.remove(key);
	}

	/**
	 * Dispose a single resource, calling its onDispose callback if defined
	 * @param key The resource key to dispose
	 * @returns True if the resource existed and was disposed, false if it didn't exist
	 */
	async disposeResource<K extends keyof ResourceTypes>(key: K): Promise<boolean> {
		return this._resourceManager.disposeResource(key, this);
	}

	/**
	 * Dispose all initialized resources in reverse dependency order.
	 * Resources that depend on others are disposed first.
	 * Calls each resource's onDispose callback if defined.
	 */
	async disposeResources(): Promise<void> {
		return this._resourceManager.disposeResources(this);
	}

	/**
		* Update an existing resource using an updater function
		* @param key The resource key to update
		* @param updater Function that receives the current resource value and returns the new value
		* @returns This ECSpresso instance for chaining
		* @throws Error if the resource doesn't exist
	*/
	updateResource<K extends keyof ResourceTypes>(
		key: K,
		updater: (current: ResourceTypes[K]) => ResourceTypes[K]
	): this {
		const currentResource = this.getResource(key);
		const updatedResource = updater(currentResource);
		this._resourceManager.add(key, updatedResource);
		return this;
	}

	/**
		* Get all resource keys that are currently registered
		* @returns Array of resource keys
	*/
	getResourceKeys(): Array<keyof ResourceTypes> {
		return this._resourceManager.getKeys() as Array<keyof ResourceTypes>;
	}

	/**
		* Check if a resource needs initialization (was added as a factory function)
		* @param key The resource key to check
		* @returns True if the resource needs initialization
	*/
	resourceNeedsInitialization<K extends keyof ResourceTypes>(key: K): boolean {
		return this._resourceManager.needsInitialization(key);
	}

	/**
		* Check if an entity has a component
	*/
	hasComponent<K extends keyof ComponentTypes>(
		entityId: number,
		componentName: K
	): boolean {
		const component = this._entityManager.getComponent(entityId, componentName);
		return component !== undefined;
	}

	/**
		* Create an entity and add components to it in one call
		* @param components Object with component names as keys and component data as values
		* @returns The created entity with all components added
		*/
	spawn<T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }>(
		components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
	): FilteredEntity<ComponentTypes, keyof T & keyof ComponentTypes> {
		const entity = this._entityManager.createEntity();
		this._entityManager.addComponents(entity, components);
		return entity as FilteredEntity<ComponentTypes, keyof T & keyof ComponentTypes>;
	}

	/**
		* Get all entities with specific components
	*/
	getEntitiesWithQuery<
		WithComponents extends keyof ComponentTypes,
		WithoutComponents extends keyof ComponentTypes = never
	>(
		withComponents: ReadonlyArray<WithComponents>,
		withoutComponents: ReadonlyArray<WithoutComponents> = [],
		changedComponents?: ReadonlyArray<keyof ComponentTypes>,
		parentHas?: ReadonlyArray<keyof ComponentTypes>,
	): Array<FilteredEntity<ComponentTypes, WithComponents, WithoutComponents>> {
		return this._entityManager.getEntitiesWithQuery(
			withComponents,
			withoutComponents,
			changedComponents,
			changedComponents ? this._changeThreshold : undefined,
			parentHas,
		);
	}

	/**
	 * Get the single entity matching a query. Throws if zero or more than one match.
	 * @param withComponents Components the entity must have
	 * @param withoutComponents Components the entity must not have
	 * @returns The single matching entity
	 * @throws If zero or more than one entity matches
	 */
	getSingleton<
		WithComponents extends keyof ComponentTypes,
		WithoutComponents extends keyof ComponentTypes = never
	>(
		withComponents: ReadonlyArray<WithComponents>,
		withoutComponents: ReadonlyArray<WithoutComponents> = [] as unknown as ReadonlyArray<WithoutComponents>,
	): FilteredEntity<ComponentTypes, WithComponents, WithoutComponents> {
		const results = this._entityManager.getEntitiesWithQuery(withComponents, withoutComponents);
		if (results.length === 0) {
			throw new Error(`getSingleton: no entity matches query with=[${String(withComponents)}] without=[${String(withoutComponents)}]`);
		}
		if (results.length > 1) {
			throw new Error(`getSingleton: expected 1 entity but found ${results.length} matching query with=[${String(withComponents)}] without=[${String(withoutComponents)}]`);
		}
		return results[0]!;
	}

	/**
	 * Get the single entity matching a query, or undefined if none match.
	 * Throws if more than one entity matches.
	 * @param withComponents Components the entity must have
	 * @param withoutComponents Components the entity must not have
	 * @returns The single matching entity, or undefined if none match
	 * @throws If more than one entity matches
	 */
	tryGetSingleton<
		WithComponents extends keyof ComponentTypes,
		WithoutComponents extends keyof ComponentTypes = never
	>(
		withComponents: ReadonlyArray<WithComponents>,
		withoutComponents: ReadonlyArray<WithoutComponents> = [] as unknown as ReadonlyArray<WithoutComponents>,
	): FilteredEntity<ComponentTypes, WithComponents, WithoutComponents> | undefined {
		const results = this._entityManager.getEntitiesWithQuery(withComponents, withoutComponents);
		if (results.length === 0) return undefined;
		if (results.length > 1) {
			throw new Error(`tryGetSingleton: expected 0 or 1 entity but found ${results.length} matching query with=[${String(withComponents)}] without=[${String(withoutComponents)}]`);
		}
		return results[0]!;
	}

	/**
	 * Remove an entity (and optionally its descendants)
	 * @param entityOrId Entity or entity ID to remove
	 * @param options Options for removal (cascade: true by default)
	 * @returns true if entity was removed
	 */
	removeEntity(entityOrId: number | Entity<ComponentTypes>, options?: RemoveEntityOptions): boolean {
		return this._entityManager.removeEntity(entityOrId, options);
	}

	// ==================== Hierarchy Methods ====================

	/**
	 * Create an entity as a child of another entity with initial components
	 * @param parentOrId The parent entity or entity ID
	 * @param components Initial components to add
	 * @returns The created child entity
	 */
	spawnChild<T extends { [K in keyof ComponentTypes]?: ComponentTypes[K] }>(
		parentOrId: number | Entity<ComponentTypes>,
		components: T & Record<Exclude<keyof T, keyof ComponentTypes>, never>
	): FilteredEntity<ComponentTypes, keyof T & keyof ComponentTypes> {
		const entity = this._entityManager.spawnChild(parentOrId, components);
		const parentId = typeof parentOrId === 'number' ? parentOrId : parentOrId.id;
		this._emitHierarchyChanged(entity.id, null, parentId);
		return entity;
	}

	/**
	 * Set the parent of an entity
	 * @param childOrId The entity or entity ID to set as a child
	 * @param parentOrId The entity or entity ID to set as the parent
	 */
	setParent(childOrId: number | Entity<ComponentTypes>, parentOrId: number | Entity<ComponentTypes>): this {
		const childId = typeof childOrId === 'number' ? childOrId : childOrId.id;
		const parentId = typeof parentOrId === 'number' ? parentOrId : parentOrId.id;
		const oldParent = this._entityManager.getParent(childId);
		this._entityManager.setParent(childId, parentId);
		this._emitHierarchyChanged(childId, oldParent, parentId);
		return this;
	}

	/**
	 * Remove the parent relationship for an entity (orphan it)
	 * @param childOrId The entity or entity ID to orphan
	 * @returns true if a parent was removed, false if entity had no parent
	 */
	removeParent(childOrId: number | Entity<ComponentTypes>): boolean {
		const childId = typeof childOrId === 'number' ? childOrId : childOrId.id;
		const oldParent = this._entityManager.getParent(childId);
		const result = this._entityManager.removeParent(childId);
		if (result) {
			this._emitHierarchyChanged(childId, oldParent, null);
		}
		return result;
	}

	/**
	 * Get the parent of an entity
	 * @param entityOrId The entity or entity ID to get the parent of
	 * @returns The parent entity ID, or null if no parent
	 */
	getParent(entityOrId: number | Entity<ComponentTypes>): number | null {
		return this._entityManager.getParent(entityOrId);
	}

	/**
	 * Get all children of an entity in insertion order
	 * @param parentOrId The parent entity or entity ID
	 * @returns Readonly array of child entity IDs
	 */
	getChildren(parentOrId: number | Entity<ComponentTypes>): readonly number[] {
		return this._entityManager.getChildren(parentOrId);
	}

	/**
	 * Get a child at a specific index
	 * @param parentOrId The parent entity or entity ID
	 * @param index The index of the child
	 * @returns The child entity ID, or null if index is out of bounds
	 */
	getChildAt(parentOrId: number | Entity<ComponentTypes>, index: number): number | null {
		return this._entityManager.getChildAt(parentOrId, index);
	}

	/**
	 * Get the index of a child within its parent's children list
	 * @param parentOrId The parent entity or entity ID
	 * @param childOrId The child entity or entity ID to find
	 * @returns The index of the child, or -1 if not found
	 */
	getChildIndex(parentOrId: number | Entity<ComponentTypes>, childOrId: number | Entity<ComponentTypes>): number {
		return this._entityManager.getChildIndex(parentOrId, childOrId);
	}

	/**
	 * Get all ancestors of an entity in order [parent, grandparent, ...]
	 * @param entityOrId The entity or entity ID to get ancestors of
	 * @returns Readonly array of ancestor entity IDs
	 */
	getAncestors(entityOrId: number | Entity<ComponentTypes>): readonly number[] {
		return this._entityManager.getAncestors(entityOrId);
	}

	/**
	 * Get all descendants of an entity in depth-first order
	 * @param entityOrId The entity or entity ID to get descendants of
	 * @returns Readonly array of descendant entity IDs
	 */
	getDescendants(entityOrId: number | Entity<ComponentTypes>): readonly number[] {
		return this._entityManager.getDescendants(entityOrId);
	}

	/**
	 * Get the root ancestor of an entity (topmost parent), or self if no parent
	 * @param entityOrId The entity or entity ID to get the root of
	 * @returns The root entity ID
	 */
	getRoot(entityOrId: number | Entity<ComponentTypes>): number {
		return this._entityManager.getRoot(entityOrId);
	}

	/**
	 * Get siblings of an entity (other children of the same parent)
	 * @param entityOrId The entity or entity ID to get siblings of
	 * @returns Readonly array of sibling entity IDs
	 */
	getSiblings(entityOrId: number | Entity<ComponentTypes>): readonly number[] {
		return this._entityManager.getSiblings(entityOrId);
	}

	/**
	 * Check if an entity is a descendant of another entity
	 * @param entityOrId The potential descendant (entity or ID)
	 * @param ancestorOrId The potential ancestor (entity or ID)
	 * @returns true if entityOrId is a descendant of ancestorOrId
	 */
	isDescendantOf(entityOrId: number | Entity<ComponentTypes>, ancestorOrId: number | Entity<ComponentTypes>): boolean {
		return this._entityManager.isDescendantOf(entityOrId, ancestorOrId);
	}

	/**
	 * Check if an entity is an ancestor of another entity
	 * @param entityOrId The potential ancestor (entity or ID)
	 * @param descendantOrId The potential descendant (entity or ID)
	 * @returns true if entityOrId is an ancestor of descendantOrId
	 */
	isAncestorOf(entityOrId: number | Entity<ComponentTypes>, descendantOrId: number | Entity<ComponentTypes>): boolean {
		return this._entityManager.isAncestorOf(entityOrId, descendantOrId);
	}

	/**
	 * Get all root entities (entities that have children but no parent)
	 * @returns Readonly array of root entity IDs
	 */
	getRootEntities(): readonly number[] {
		return this._entityManager.getRootEntities();
	}

	/**
	 * Traverse the hierarchy in parent-first (breadth-first) order.
	 * Parents are guaranteed to be visited before their children.
	 * @param callback Function called for each entity with (entityId, parentId, depth)
	 * @param options Optional traversal options (roots to filter to specific subtrees)
	 */
	forEachInHierarchy(
		callback: (entityId: number, parentId: number | null, depth: number) => void,
		options?: HierarchyIteratorOptions
	): void {
		this._entityManager.forEachInHierarchy(callback, options);
	}

	/**
	 * Generator-based hierarchy traversal in parent-first (breadth-first) order.
	 * Supports early termination via break.
	 * @param options Optional traversal options (roots to filter to specific subtrees)
	 * @yields HierarchyEntry for each entity in parent-first order
	 */
	hierarchyIterator(options?: HierarchyIteratorOptions): Generator<HierarchyEntry, void, unknown> {
		return this._entityManager.hierarchyIterator(options);
	}

	/**
	 * Emit a hierarchy changed event
	 * @internal
	 */
	private _emitHierarchyChanged(entityId: number, oldParent: number | null, newParent: number | null): void {
		// Publish the event - if the user has declared hierarchyChanged in their EventTypes, it will be handled
		type HierarchyEventBus = EventBus<{ hierarchyChanged: { entityId: number; oldParent: number | null; newParent: number | null } }>;
		(this._eventBus as unknown as HierarchyEventBus).publish('hierarchyChanged', { entityId, oldParent, newParent });
	}

	/**
		* Get all installed plugin IDs
	*/
	get installedPlugins(): string[] {
		return Array.from(this._installedPlugins);
	}

	// Getters for the internal managers
	get entityManager() {
		return this._entityManager;
	}

	get eventBus() {
		return this._eventBus;
	}

	/**
	 * Command buffer for queuing deferred structural changes.
	 * Commands are executed automatically at the end of each update() cycle.
	 *
	 * @example
	 * ```typescript
	 * // In a system or event handler
	 * ecs.commands.removeEntity(entityId);
	 * ecs.commands.spawn({ position: { x: 0, y: 0 } });
	 * ```
	 */
	get commands() {
		return this._commandBuffer;
	}

	/**
	 * The current tick number, incremented at the end of each update()
	 */
	get currentTick(): number {
		return this._currentTick;
	}

	/**
	 * The current change detection threshold.
	 * During system execution, this is the system's last-seen sequence.
	 * Between updates, this is the global sequence after command buffer playback.
	 * Manual change detection should compare: getChangeSeq(...) > changeThreshold
	 */
	get changeThreshold(): number {
		return this._changeThreshold;
	}

	// ==================== Diagnostics ====================

	/**
	 * Toggle diagnostics timing collection. When enabled, system and phase
	 * timings are recorded each frame. When disabled, timing maps are cleared
	 * and no overhead is incurred.
	 */
	enableDiagnostics(enabled: boolean): void {
		this._diagnosticsEnabled = enabled;
		if (!enabled) {
			this._systemTimings.clear();
			this._phaseTimings = {
				preUpdate: 0, fixedUpdate: 0, update: 0, postUpdate: 0, render: 0,
			};
		}
	}

	get diagnosticsEnabled(): boolean {
		return this._diagnosticsEnabled;
	}

	get systemTimings(): ReadonlyMap<string, number> {
		return this._systemTimings;
	}

	get phaseTimings(): Readonly<Record<SystemPhase, number>> {
		return this._phaseTimings;
	}

	get entityCount(): number {
		return this._entityManager.entityCount;
	}

	/**
	 * Mark a component as changed on an entity.
	 * Each call increments a global monotonic sequence; systems with changed
	 * queries will see the mark exactly once (on their next execution).
	 * @param entityOrId The entity or entity ID
	 * @param componentName The component that was changed
	 */
	markChanged<K extends keyof ComponentTypes>(entityOrId: number | Entity<ComponentTypes>, componentName: K): void {
		this._entityManager.markChanged(entityOrId, componentName);
	}

	// ==================== Component Dispose ====================

	/**
	 * Register a dispose callback for a component type.
	 * Called when a component is removed (explicit removal, entity destruction, or replacement).
	 * Later registrations replace earlier ones for the same component type.
	 * @param componentName The component type to register disposal for
	 * @param callback Function receiving the component value being disposed and the entity ID
	 */
	registerDispose<K extends keyof ComponentTypes>(
		componentName: K,
		callback: (value: ComponentTypes[K], entityId: number) => void
	): void {
		this._entityManager.registerDispose(componentName, callback);
	}

	// ==================== Required Components ====================

	/**
	 * Register a required component relationship.
	 * When an entity gains `trigger`, the `required` component is auto-added
	 * (using `factory` for the default value) if not already present.
	 * Enforced at insertion time (spawn/addComponent) only — removal is unrestricted.
	 * @param trigger The component whose presence triggers auto-addition
	 * @param required The component to auto-add
	 * @param factory Function that creates the default value for the required component
	 */
	registerRequired<
		Trigger extends keyof ComponentTypes,
		Required extends keyof ComponentTypes,
	>(
		trigger: Trigger,
		required: Required,
		factory: (triggerValue: ComponentTypes[Trigger]) => ComponentTypes[Required]
	): void {
		if (String(trigger) === String(required)) {
			throw new Error(`Cannot require a component to depend on itself: '${String(trigger)}'`);
		}

		const existing = this._requiredComponents.get(trigger) ?? [];

		if (existing.some(r => r.component === required)) {
			throw new Error(
				`Required component '${String(required)}' already registered for trigger '${String(trigger)}'`
			);
		}

		this._checkRequiredCycle(trigger, required);

		existing.push({ component: required, factory });
		this._requiredComponents.set(trigger, existing);
	}

	/**
	 * Check for circular dependencies in the required components graph.
	 * @throws Error if adding trigger→newRequired would create a cycle
	 */
	private _checkRequiredCycle(
		trigger: keyof ComponentTypes,
		newRequired: keyof ComponentTypes
	): void {
		checkRequiredCycle(
			trigger,
			newRequired,
			(component) => this._requiredComponents.get(component),
		);
	}

	// ==================== Component Lifecycle Hooks ====================

	/**
	 * Register a callback when a specific component is added to any entity
	 * @param componentName The component key
	 * @param handler Function receiving the new component value and the entity
	 * @returns Unsubscribe function to remove the callback
	 */
	onComponentAdded<K extends keyof ComponentTypes>(
		componentName: K,
		handler: (value: ComponentTypes[K], entity: Entity<ComponentTypes>) => void
	): () => void {
		return this._entityManager.onComponentAdded(componentName, handler);
	}

	/**
	 * Register a callback when a specific component is removed from any entity
	 * @param componentName The component key
	 * @param handler Function receiving the old component value and the entity
	 * @returns Unsubscribe function to remove the callback
	 */
	onComponentRemoved<K extends keyof ComponentTypes>(
		componentName: K,
		handler: (oldValue: ComponentTypes[K], entity: Entity<ComponentTypes>) => void
	): () => void {
		return this._entityManager.onComponentRemoved(componentName, handler);
	}

	// ==================== Reactive Queries ====================

	/**
	 * Add a reactive query that triggers callbacks when entities enter/exit the query match.
	 * @param name Unique name for the query
	 * @param definition Query definition with with/without arrays and onEnter/onExit callbacks
	 */
	addReactiveQuery<
		WithComponents extends keyof ComponentTypes,
		WithoutComponents extends keyof ComponentTypes = never,
		OptionalComponents extends keyof ComponentTypes = never,
	>(
		name: ReactiveQueryNames,
		definition: ReactiveQueryDefinition<ComponentTypes, WithComponents, WithoutComponents, OptionalComponents>
	): void {
		this._reactiveQueryManager.addQuery(name, definition);
	}

	/**
	 * Remove a reactive query by name.
	 * @param name Name of the query to remove
	 * @returns true if the query existed and was removed, false otherwise
	 */
	removeReactiveQuery(name: ReactiveQueryNames): boolean {
		return this._reactiveQueryManager.removeQuery(name);
	}

	// ==================== Event Convenience Methods ====================

	/**
	 * Subscribe to an event (convenience wrapper for eventBus.subscribe)
	 * @param eventType The event type to subscribe to
	 * @param callback The callback to invoke when the event is published
	 * @returns An unsubscribe function
	 */
	on<E extends keyof EventTypes>(
		eventType: E,
		callback: (data: EventTypes[E]) => void
	): () => void {
		return this._eventBus.subscribe(eventType, callback);
	}

	/**
	 * Unsubscribe from an event by callback reference (convenience wrapper for eventBus.unsubscribe)
	 * @param eventType The event type to unsubscribe from
	 * @param callback The callback to remove
	 * @returns true if the callback was found and removed, false otherwise
	 */
	off<E extends keyof EventTypes>(
		eventType: E,
		callback: (data: EventTypes[E]) => void
	): boolean {
		return this._eventBus.unsubscribe(eventType, callback);
	}

	/**
	 * Register a hook that runs after all systems in update()
	 * @param callback The hook to call after all systems have processed
	 * @returns An unsubscribe function to remove the hook
	 */
	onPostUpdate(
		callback: (ecs: ECSpresso<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>, deltaTime: number) => void
	): () => void {
		this._postUpdateHooks.push(callback);
		return () => {
			const index = this._postUpdateHooks.indexOf(callback);
			if (index !== -1) {
				this._postUpdateHooks.splice(index, 1);
			}
		};
	}

	// ==================== Asset Management ====================

	private requireAssetManager(): AssetManager<AssetTypes> {
		if (!this._assetManager) {
			throw new Error('Asset manager not configured. Use withAssets() in builder.');
		}
		return this._assetManager;
	}

	/**
	 * Get a loaded asset by key. Throws if not loaded.
	 */
	getAsset<K extends keyof AssetTypes>(key: K): AssetTypes[K] {
		return this.requireAssetManager().get(key);
	}

	/**
	 * Get a loaded asset or undefined if not loaded
	 */
	getAssetOrUndefined<K extends keyof AssetTypes>(key: K): AssetTypes[K] | undefined {
		return this._assetManager?.getOrUndefined(key);
	}

	/**
	 * Get a handle to an asset with status information
	 */
	getAssetHandle<K extends keyof AssetTypes>(key: K): AssetHandle<AssetTypes[K]> {
		return this.requireAssetManager().getHandle(key);
	}

	/**
	 * Check if an asset is loaded
	 */
	isAssetLoaded<K extends keyof AssetTypes>(key: K): boolean {
		return this._assetManager?.isLoaded(key) ?? false;
	}

	/**
	 * Load a single asset
	 */
	async loadAsset<K extends keyof AssetTypes>(key: K): Promise<AssetTypes[K]> {
		return this.requireAssetManager().loadAsset(key);
	}

	/**
	 * Load all assets in a group
	 */
	async loadAssetGroup(groupName: AssetGroupNames): Promise<void> {
		return this.requireAssetManager().loadAssetGroup(groupName);
	}

	/**
	 * Check if all assets in a group are loaded
	 */
	isAssetGroupLoaded(groupName: AssetGroupNames): boolean {
		return this._assetManager?.isGroupLoaded(groupName) ?? false;
	}

	/**
	 * Get the loading progress of a group (0-1)
	 */
	getAssetGroupProgress(groupName: AssetGroupNames): number {
		return this._assetManager?.getGroupProgress(groupName) ?? 0;
	}

	// ==================== Screen Management ====================

	private requireScreenManager(): ScreenManager<ScreenStates> {
		if (!this._screenManager) {
			throw new Error('Screen manager not configured. Use withScreens() in builder.');
		}
		return this._screenManager;
	}

	/**
	 * Transition to a new screen, clearing the stack
	 */
	async setScreen<K extends keyof ScreenStates>(
		name: K,
		config: ScreenStates[K] extends ScreenDefinition<infer C, any> ? C : never
	): Promise<void> {
		return this.requireScreenManager().setScreen(name, config);
	}

	/**
	 * Push a screen onto the stack (overlay)
	 */
	async pushScreen<K extends keyof ScreenStates>(
		name: K,
		config: ScreenStates[K] extends ScreenDefinition<infer C, any> ? C : never
	): Promise<void> {
		return this.requireScreenManager().pushScreen(name, config);
	}

	/**
	 * Pop the current screen and return to the previous one
	 */
	async popScreen(): Promise<void> {
		return this.requireScreenManager().popScreen();
	}

	/**
	 * Get the current screen name
	 */
	getCurrentScreen(): keyof ScreenStates | null {
		return this._screenManager?.getCurrentScreen() ?? null;
	}

	/**
	 * Get the current screen config (immutable)
	 */
	getScreenConfig<K extends keyof ScreenStates>(): ScreenStates[K] extends ScreenDefinition<infer C, any> ? Readonly<C> : never {
		return this.requireScreenManager().getConfig();
	}

	/**
	 * Get the current screen config or null
	 */
	getScreenConfigOrNull<K extends keyof ScreenStates>(): (ScreenStates[K] extends ScreenDefinition<infer C, any> ? Readonly<C> : never) | null {
		return this._screenManager?.getConfigOrNull() ?? null;
	}

	/**
	 * Get the current screen state (mutable)
	 */
	getScreenState<K extends keyof ScreenStates>(): ScreenStates[K] extends ScreenDefinition<any, infer S> ? S : never {
		return this.requireScreenManager().getState();
	}

	/**
	 * Get the current screen state or null
	 */
	getScreenStateOrNull<K extends keyof ScreenStates>(): (ScreenStates[K] extends ScreenDefinition<any, infer S> ? S : never) | null {
		return this._screenManager?.getStateOrNull() ?? null;
	}

	/**
	 * Update the current screen state
	 */
	updateScreenState<K extends keyof ScreenStates>(
		update: Partial<ScreenStates[K] extends ScreenDefinition<any, infer S> ? S : never> |
			((current: ScreenStates[K] extends ScreenDefinition<any, infer S> ? S : never) => Partial<ScreenStates[K] extends ScreenDefinition<any, infer S> ? S : never>)
	): void {
		this.requireScreenManager().updateState(update as any);
	}

	/**
	 * Check if a screen is the current screen
	 */
	isCurrentScreen(screenName: keyof ScreenStates): boolean {
		return this._screenManager?.isCurrent(screenName) ?? false;
	}

	/**
	 * Check if a screen is active (current or in stack)
	 */
	isScreenActive(screenName: keyof ScreenStates): boolean {
		return this._screenManager?.isActive(screenName) ?? false;
	}

	/**
	 * Get the screen stack depth
	 */
	getScreenStackDepth(): number {
		return this._screenManager?.getStackDepth() ?? 0;
	}

	// ==================== Internal Methods ====================

	/**
	 * Internal method to set the asset manager and drain pending plugin assets
	 * @internal Used by ECSpressoBuilder
	 */
	_setAssetManager(manager: AssetManager<AssetTypes>): void {
		this._assetManager = manager;
		for (const [key, definition] of this._pendingPluginAssets) {
			this._assetManager.register(key, definition as any);
		}
		this._pendingPluginAssets = [];
	}

	/**
	 * Internal method to set the screen manager and drain pending plugin screens
	 * @internal Used by ECSpressoBuilder
	 */
	_setScreenManager(manager: ScreenManager<ScreenStates>): void {
		this._screenManager = manager;
		for (const [name, definition] of this._pendingPluginScreens) {
			this._screenManager.register(name, definition as any);
		}
		this._pendingPluginScreens = [];
	}

	/** @internal */
	_hasPendingPluginAssets(): boolean {
		return this._pendingPluginAssets.length > 0;
	}

	/** @internal */
	_hasPendingPluginScreens(): boolean {
		return this._pendingPluginScreens.length > 0;
	}

	/**
	 * Internal method to set the fixed timestep interval
	 * @internal Used by ECSpressoBuilder
	 */
	_setFixedDt(dt: number): void {
		this._fixedDt = dt;
	}

	/**
	 * Register an asset definition for deferred registration.
	 * @internal Used by plugins that need to register assets
	 */
	_registerAsset(key: string, definition: AssetDefinition<unknown>): void {
		this._pendingPluginAssets.push([key, definition]);
	}

	/**
	 * Register a screen definition for deferred registration.
	 * @internal Used by plugins that need to register screens
	 */
	_registerScreen(name: string, definition: ScreenDefinition<any, any>): void {
		this._pendingPluginScreens.push([name, definition]);
	}

	/**
	 * Install a plugin into this ECSpresso instance.
	 * Deduplicates by plugin ID. Composite plugins call this in their install function.
	 */
	installPlugin(plugin: Plugin<any, any, any, any, any, any, any, any, any>): this {
		// Prevent duplicate installation of the same plugin
		if (this._installedPlugins.has(plugin.id)) {
			return this;
		}

		// Mark this plugin as installed
		this._installedPlugins.add(plugin.id);

		// Call the plugin's install function with this world
		plugin.install(this as any);

		return this;
	}

	/**
	 * Call a helper factory with this world instance, inferring the full world type.
	 * Eliminates the need for a separate `type ECS = typeof ecs` ceremony.
	 *
	 * @example
	 * ```typescript
	 * const helpers = ecs.getHelpers(createStateMachineHelpers);
	 * ```
	 */
	getHelpers<H>(factory: (world: this) => H): H {
		return factory(this);
	}
}

