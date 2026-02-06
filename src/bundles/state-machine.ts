/**
 * State Machine Bundle for ECSpresso
 *
 * Provides ECS-native finite state machines with guard-based transitions,
 * event-driven transitions, and lifecycle hooks (onEnter, onExit, onUpdate).
 *
 * Each entity gets a `stateMachine` component referencing a shared definition.
 * One system processes all state machine entities each tick.
 */

import { Bundle } from 'ecspresso';
import type { SystemPhase } from 'ecspresso';

// ==================== World Interface ====================

/**
 * Structural interface for ECS methods available inside state machine hooks.
 * Uses method syntax for bivariant parameter checking under strictFunctionTypes,
 * allowing users to annotate hooks with their concrete ECSpresso type.
 */
export interface StateMachineWorld {
	entityManager: {
		getComponent(entityId: number, componentName: string): unknown | null;
	};
	eventBus: {
		publish(eventType: string, data: unknown): void;
	};
	spawn(components: Record<string, unknown>): { id: number };
	removeEntity(entityOrId: number): boolean;
	hasComponent(entityId: number, componentName: string): boolean;
	getResource(key: string): unknown;
	hasResource(key: string): boolean;
	markChanged(entityId: number, componentName: string): void;
	commands: {
		spawn(components: Record<string, unknown>): void;
		removeEntity(entityId: number): void;
	};
}

// ==================== State Config ====================

/**
 * Configuration for a single state in a state machine definition.
 *
 * @template S - Union of state name strings
 * @template W - World interface type for hooks/guards (default: StateMachineWorld)
 */
export interface StateConfig<S extends string, W extends StateMachineWorld = StateMachineWorld> {
	/** Called when entering this state */
	onEnter?(ecs: W, entityId: number): void;
	/** Called when exiting this state */
	onExit?(ecs: W, entityId: number): void;
	/** Called each tick while in this state */
	onUpdate?(ecs: W, entityId: number, deltaTime: number): void;
	/** Guard-based transitions evaluated each tick. First passing guard wins. */
	transitions?: ReadonlyArray<{
		target: S;
		guard(ecs: W, entityId: number): boolean;
	}>;
	/** Event-based transition map: eventName → target state or guarded transition */
	on?: Record<string, S | { target: S; guard(ecs: W, entityId: number): boolean }>;
}

// ==================== State Machine Definition ====================

/**
 * Immutable definition of a state machine. Shared across entities.
 *
 * @template S - Union of state name strings
 */
export interface StateMachineDefinition<S extends string> {
	readonly id: string;
	readonly initial: S;
	readonly states: { readonly [K in S]: StateConfig<S> };
}

// ==================== Component ====================

/**
 * Runtime state machine component stored on each entity.
 *
 * @template S - Union of state name strings (default: string)
 */
export interface StateMachine<S extends string = string> {
	readonly definition: StateMachineDefinition<string>;
	current: S;
	previous: S | null;
	stateTime: number;
}

/**
 * Component types provided by the state machine bundle.
 *
 * @template S - Union of state name strings (default: string)
 */
export interface StateMachineComponentTypes<S extends string = string> {
	stateMachine: StateMachine<S>;
}

// ==================== Event Types ====================

/**
 * Event published on every state transition.
 *
 * @template S - Union of state name strings (default: string)
 */
export interface StateTransitionEvent<S extends string = string> {
	entityId: number;
	from: S;
	to: S;
	definitionId: string;
}

/**
 * Event types provided by the state machine bundle.
 *
 * @template S - Union of state name strings (default: string)
 */
export interface StateMachineEventTypes<S extends string = string> {
	stateTransition: StateTransitionEvent<S>;
}

/**
 * Extract the state name union from a StateMachineDefinition.
 *
 * @example
 * ```typescript
 * const enemyFSM = defineStateMachine('enemy', { initial: 'idle', states: { idle: {}, chase: {} } });
 * type EnemyStates = StatesOf<typeof enemyFSM>; // 'idle' | 'chase'
 * type AllStates = StatesOf<typeof enemyFSM> | StatesOf<typeof playerFSM>;
 * ```
 */
export type StatesOf<D> = D extends StateMachineDefinition<infer S> ? S : never;

// ==================== Bundle Options ====================

/**
 * Configuration options for the state machine bundle.
 */
export interface StateMachineBundleOptions<G extends string = 'stateMachine'> {
	/** System group name (default: 'stateMachine') */
	systemGroup?: G;
	/** Priority for state machine system (default: 0) */
	priority?: number;
	/** Execution phase (default: 'update') */
	phase?: SystemPhase;
}

// ==================== Helper Functions ====================

/**
 * Define a state machine with type-safe state names.
 *
 * @template S - Union of state name strings, inferred from `states` keys
 * @param id - Unique identifier for this definition
 * @param config - Initial state and state configurations
 * @returns A frozen StateMachineDefinition
 *
 * @example
 * ```typescript
 * const enemyFSM = defineStateMachine('enemy', {
 *   initial: 'idle',
 *   states: {
 *     idle: {
 *       onEnter: (ecs, id) => { ... },
 *       transitions: [{ target: 'chase', guard: (ecs, id) => playerNearby(ecs, id) }],
 *     },
 *     chase: {
 *       onUpdate: (ecs, id, dt) => { ... },
 *       on: { playerLost: 'idle' },
 *     },
 *   },
 * });
 * ```
 */
export function defineStateMachine<S extends string>(
	id: string,
	config: { initial: NoInfer<S>; states: Record<S, StateConfig<NoInfer<S>>> },
): StateMachineDefinition<S> {
	return Object.freeze({
		id,
		initial: config.initial,
		states: Object.freeze(config.states),
	}) as StateMachineDefinition<S>;
}

/**
 * Create a stateMachine component from a definition.
 *
 * @param definition - The state machine definition to use
 * @param options - Optional overrides (e.g., initial state)
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * ecs.spawn({
 *   ...createStateMachine(enemyFSM),
 *   position: { x: 100, y: 200 },
 * });
 * ```
 */
export function createStateMachine<S extends string>(
	definition: StateMachineDefinition<S>,
	options?: { initial?: S },
): Pick<StateMachineComponentTypes<S>, 'stateMachine'> {
	const initial = options?.initial ?? definition.initial;
	return {
		stateMachine: {
			definition,
			current: initial,
			previous: null,
			stateTime: 0,
		},
	};
}

// ==================== Internal: Shared Transition Logic ====================

/**
 * Perform a state transition: onExit → update fields → onEnter → markChanged → publish event.
 * Returns true if the target state exists, false otherwise.
 */
function performTransition(
	ecs: StateMachineWorld,
	entityId: number,
	sm: StateMachine,
	targetState: string,
): boolean {
	const states = sm.definition.states as Record<string, StateConfig<string>>;
	const currentConfig = states[sm.current];
	const targetConfig = states[targetState];

	if (!targetConfig) return false;

	currentConfig?.onExit?.(ecs, entityId);

	sm.previous = sm.current;
	sm.current = targetState;
	sm.stateTime = 0;

	targetConfig.onEnter?.(ecs, entityId);

	ecs.markChanged(entityId, 'stateMachine');
	ecs.eventBus.publish('stateTransition', {
		entityId,
		from: sm.previous,
		to: sm.current,
		definitionId: sm.definition.id,
	} satisfies StateTransitionEvent);

	return true;
}

// ==================== Utility Functions ====================

/**
 * Directly transition an entity's state machine to a target state.
 * Fires onExit, onEnter hooks and publishes stateTransition event.
 *
 * @param ecs - ECS instance (structural typing)
 * @param entityId - Entity to transition
 * @param targetState - State to transition to
 * @returns true if transition succeeded, false if entity has no stateMachine or target state doesn't exist
 */
export function transitionTo(
	ecs: StateMachineWorld,
	entityId: number,
	targetState: string,
): boolean {
	const sm = ecs.entityManager.getComponent(entityId, 'stateMachine') as StateMachine | null;
	if (!sm) return false;
	return performTransition(ecs, entityId, sm, targetState);
}

/**
 * Send a named event to an entity's state machine.
 * Checks the current state's `on` handlers for a matching event.
 *
 * @param ecs - ECS instance (structural typing)
 * @param entityId - Entity to send event to
 * @param eventName - Event name to match against `on` handlers
 * @returns true if a transition occurred, false otherwise
 */
export function sendEvent(
	ecs: StateMachineWorld,
	entityId: number,
	eventName: string,
): boolean {
	const sm = ecs.entityManager.getComponent(entityId, 'stateMachine') as StateMachine | null;
	if (!sm) return false;

	const states = sm.definition.states as Record<string, StateConfig<string>>;
	const currentConfig = states[sm.current];
	if (!currentConfig?.on) return false;

	const handler = currentConfig.on[eventName];
	if (handler === undefined) return false;

	if (typeof handler === 'string') {
		return performTransition(ecs, entityId, sm, handler);
	}

	if (!handler.guard(ecs, entityId)) return false;
	return performTransition(ecs, entityId, sm, handler.target);
}

/**
 * Get the current state of an entity's state machine.
 *
 * @param ecs - ECS instance (structural typing)
 * @param entityId - Entity to query
 * @returns The current state string, or null if entity has no stateMachine
 */
export function getStateMachineState(
	ecs: StateMachineWorld,
	entityId: number,
): string | null {
	const sm = ecs.entityManager.getComponent(entityId, 'stateMachine') as StateMachine | null;
	return sm?.current ?? null;
}

// ==================== State Machine Kit ====================

/**
 * A typed kit that captures the world type W once, providing helpers
 * where hooks/guards contextually receive W instead of StateMachineWorld.
 *
 * @template W - Concrete ECS world type
 */
export interface StateMachineKit<W extends StateMachineWorld, S extends string = string> {
	bundle: Bundle<StateMachineComponentTypes<S>, StateMachineEventTypes<S>, {}, {}, {}, 'state-machine-update', 'stateMachine'>;
	defineStateMachine: <DS extends S>(
		id: string,
		config: { initial: NoInfer<DS>; states: Record<DS, StateConfig<NoInfer<DS>, W>> },
	) => StateMachineDefinition<DS>;
	createStateMachine: <DS extends S>(
		definition: StateMachineDefinition<DS>,
		options?: { initial?: DS },
	) => Pick<StateMachineComponentTypes<S>, 'stateMachine'>;
}

/**
 * Create a typed state machine kit that captures the world type W.
 *
 * Hooks and guards in definitions created via the kit's `defineStateMachine`
 * contextually receive W as their `ecs` parameter — no manual annotations needed.
 *
 * @template W - Concrete ECS world type
 * @param options - Optional bundle configuration (same as createStateMachineBundle)
 * @returns A kit object with bundle, defineStateMachine, createStateMachine, transitionTo, sendEvent, getStateMachineState
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso.create()
 *   .withBundle(createStateMachineBundle())
 *   .withComponentTypes<{ enemy: true }>()
 *   .build();
 *
 * type ECS = typeof ecs;
 * const { bundle, defineStateMachine, createStateMachine } =
 *     createStateMachineKit<ECS>();
 *
 * const enemyFSM = defineStateMachine('enemy', {
 *     initial: 'patrol',
 *     states: {
 *         patrol: {
 *             onEnter(ecs, entityId) {
 *                 ecs.getResource('bounds'); // fully typed
 *             },
 *             transitions: [{
 *                 target: 'chase',
 *                 guard: (ecs, entityId) => distanceToPlayer(ecs, entityId) < 180,
 *             }],
 *         },
 *         chase: {},
 *     },
 * });
 * ```
 */
export function createStateMachineKit<W extends StateMachineWorld = StateMachineWorld, S extends string = string>(
	options?: StateMachineBundleOptions,
): StateMachineKit<W, S> {
	return {
		bundle: createStateMachineBundle<S>(options),
		defineStateMachine: defineStateMachine as StateMachineKit<W, S>['defineStateMachine'],
		createStateMachine: createStateMachine as StateMachineKit<W, S>['createStateMachine'],
	};
}

// ==================== Bundle Factory ====================

/**
 * Create a state machine bundle for ECSpresso.
 *
 * Provides:
 * - Lifecycle hooks (onEnter, onExit, onUpdate) per state
 * - Guard-based automatic transitions evaluated each tick
 * - Event-based transitions via `sendEvent()`
 * - Direct transitions via `transitionTo()`
 * - stateTransition events published on every transition
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso.create()
 *   .withBundle(createStateMachineBundle())
 *   .build();
 *
 * const fsm = defineStateMachine('enemy', {
 *   initial: 'idle',
 *   states: {
 *     idle: {
 *       transitions: [{ target: 'chase', guard: (ecs, id) => playerNearby(ecs, id) }],
 *     },
 *     chase: {
 *       onUpdate: (ecs, id, dt) => moveTowardPlayer(ecs, id, dt),
 *       on: { playerLost: 'idle' },
 *     },
 *   },
 * });
 *
 * ecs.spawn({
 *   ...createStateMachine(fsm),
 *   position: { x: 0, y: 0 },
 * });
 * ```
 */
export function createStateMachineBundle<S extends string = string, G extends string = 'stateMachine'>(
	options?: StateMachineBundleOptions<G>,
): Bundle<StateMachineComponentTypes<S>, StateMachineEventTypes<S>, {}, {}, {}, 'state-machine-update', G> {
	const {
		systemGroup = 'stateMachine',
		priority = 0,
		phase = 'update',
	} = options ?? {};

	const bundle = new Bundle<StateMachineComponentTypes<S>, StateMachineEventTypes<S>, {}>('stateMachine');

	const initialized = new Set<number>();
	let cleanupRegistered = false;

	bundle
		.addSystem('state-machine-update')
		.setPriority(priority)
		.inPhase(phase)
		.inGroup(systemGroup)
		.addQuery('machines', {
			with: ['stateMachine'],
		})
		.setProcess((queries, deltaTime, ecs) => {
			// Lazy-register cleanup listener on first tick
			if (!cleanupRegistered) {
				ecs.onComponentRemoved('stateMachine', (_value, entity) => {
					initialized.delete(entity.id);
				});
				cleanupRegistered = true;
			}

			for (const entity of queries.machines) {
				const sm = entity.components.stateMachine;
				const states = sm.definition.states as Record<string, StateConfig<string>>;
				const ecsWorld = ecs as unknown as StateMachineWorld;

				// Initialize: fire onEnter for initial state on first tick
				if (!initialized.has(entity.id)) {
					initialized.add(entity.id);
					states[sm.current]?.onEnter?.(ecsWorld, entity.id);
				}

				// Accumulate state time
				sm.stateTime += deltaTime;

				// onUpdate hook
				states[sm.current]?.onUpdate?.(ecsWorld, entity.id, deltaTime);

				// Evaluate guard transitions (first passing guard wins)
				const currentConfig = states[sm.current];
				if (currentConfig?.transitions) {
					for (const transition of currentConfig.transitions) {
						if (transition.guard(ecsWorld, entity.id)) {
							performTransition(ecsWorld, entity.id, sm, transition.target);
							break;
						}
					}
				}
			}
		})
		.and();

	return bundle as Bundle<StateMachineComponentTypes<S>, StateMachineEventTypes<S>, {}, {}, {}, 'state-machine-update', G>;
}
