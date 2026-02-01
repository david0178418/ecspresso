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
		publish(eventType: string, data?: unknown): void;
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
 */
export interface StateConfig<S extends string> {
	/** Called when entering this state */
	onEnter?(ecs: StateMachineWorld, entityId: number): void;
	/** Called when exiting this state */
	onExit?(ecs: StateMachineWorld, entityId: number): void;
	/** Called each tick while in this state */
	onUpdate?(ecs: StateMachineWorld, entityId: number, deltaTime: number): void;
	/** Guard-based transitions evaluated each tick. First passing guard wins. */
	transitions?: ReadonlyArray<{
		target: S;
		guard(ecs: StateMachineWorld, entityId: number): boolean;
	}>;
	/** Event-based transition map: eventName → target state or guarded transition */
	on?: Record<string, S | { target: S; guard(ecs: StateMachineWorld, entityId: number): boolean }>;
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
 */
export interface StateMachine {
	readonly definition: StateMachineDefinition<string>;
	current: string;
	previous: string | null;
	stateTime: number;
}

/**
 * Component types provided by the state machine bundle.
 */
export interface StateMachineComponentTypes {
	stateMachine: StateMachine;
}

// ==================== Event Types ====================

/**
 * Event published on every state transition.
 */
export interface StateTransitionEvent {
	entityId: number;
	from: string;
	to: string;
	definitionId: string;
}

/**
 * Event types provided by the state machine bundle.
 */
export interface StateMachineEventTypes {
	stateTransition: StateTransitionEvent;
}

// ==================== Bundle Options ====================

/**
 * Configuration options for the state machine bundle.
 */
export interface StateMachineBundleOptions {
	/** System group name (default: 'stateMachine') */
	systemGroup?: string;
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
): Pick<StateMachineComponentTypes, 'stateMachine'> {
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
	ecs: StateMachineWorld & { eventBus: { publish(eventType: string, data?: unknown): void } },
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
	ecs: {
		entityManager: { getComponent(entityId: number, componentName: 'stateMachine'): StateMachine | null };
		eventBus: { publish(eventType: string, data?: unknown): void };
		markChanged(entityId: number, componentName: string): void;
		spawn(components: Record<string, unknown>): { id: number };
		removeEntity(entityOrId: number): boolean;
		hasComponent(entityId: number, componentName: string): boolean;
		getResource(key: string): unknown;
		hasResource(key: string): boolean;
		commands: {
			spawn(components: Record<string, unknown>): void;
			removeEntity(entityId: number): void;
		};
	},
	entityId: number,
	targetState: string,
): boolean {
	const sm = ecs.entityManager.getComponent(entityId, 'stateMachine');
	if (!sm) return false;
	return performTransition(ecs as StateMachineWorld & { eventBus: { publish(eventType: string, data?: unknown): void } }, entityId, sm, targetState);
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
	ecs: {
		entityManager: { getComponent(entityId: number, componentName: 'stateMachine'): StateMachine | null };
		eventBus: { publish(eventType: string, data?: unknown): void };
		markChanged(entityId: number, componentName: string): void;
		spawn(components: Record<string, unknown>): { id: number };
		removeEntity(entityOrId: number): boolean;
		hasComponent(entityId: number, componentName: string): boolean;
		getResource(key: string): unknown;
		hasResource(key: string): boolean;
		commands: {
			spawn(components: Record<string, unknown>): void;
			removeEntity(entityId: number): void;
		};
	},
	entityId: number,
	eventName: string,
): boolean {
	const sm = ecs.entityManager.getComponent(entityId, 'stateMachine');
	if (!sm) return false;

	const states = sm.definition.states as Record<string, StateConfig<string>>;
	const currentConfig = states[sm.current];
	if (!currentConfig?.on) return false;

	const handler = currentConfig.on[eventName];
	if (handler === undefined) return false;

	if (typeof handler === 'string') {
		return performTransition(ecs as StateMachineWorld & { eventBus: { publish(eventType: string, data?: unknown): void } }, entityId, sm, handler);
	}

	if (!handler.guard(ecs as StateMachineWorld, entityId)) return false;
	return performTransition(ecs as StateMachineWorld & { eventBus: { publish(eventType: string, data?: unknown): void } }, entityId, sm, handler.target);
}

/**
 * Get the current state of an entity's state machine.
 *
 * @param ecs - ECS instance (structural typing)
 * @param entityId - Entity to query
 * @returns The current state string, or null if entity has no stateMachine
 */
export function getStateMachineState(
	ecs: { entityManager: { getComponent(entityId: number, componentName: 'stateMachine'): StateMachine | null } },
	entityId: number,
): string | null {
	const sm = ecs.entityManager.getComponent(entityId, 'stateMachine');
	return sm?.current ?? null;
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
 * const ecs = ECSpresso
 *   .create<Components, Events, Resources>()
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
export function createStateMachineBundle(
	options?: StateMachineBundleOptions,
): Bundle<StateMachineComponentTypes, StateMachineEventTypes> {
	const {
		systemGroup = 'stateMachine',
		priority = 0,
		phase = 'update',
	} = options ?? {};

	const bundle = new Bundle<StateMachineComponentTypes, StateMachineEventTypes, {}>('stateMachine');

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
				const ecsWorld = ecs as unknown as StateMachineWorld & { eventBus: { publish(eventType: string, data?: unknown): void } };

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

	return bundle;
}
