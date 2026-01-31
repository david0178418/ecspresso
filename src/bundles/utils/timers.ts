/**
 * Timer Bundle for ECSpresso
 *
 * Provides ECS-native timers following the "data, not callbacks" philosophy.
 * Timers are components processed each frame, automatically cleaned up when entities are removed.
 */

import { Bundle } from 'ecspresso';
import type { SystemPhase } from 'ecspresso';

// ==================== Event Types ====================

/**
 * Data structure published when a timer completes.
 * Use this type when defining timer completion events in your EventTypes interface.
 *
 * @example
 * ```typescript
 * interface Events {
 *   hideMessage: TimerEventData;
 *   spawnWave: TimerEventData;
 * }
 * ```
 */
export interface TimerEventData {
	/** The entity ID that the timer belongs to */
	entityId: number;
	/** The timer's configured duration in seconds */
	duration: number;
	/** The actual elapsed time (may exceed duration slightly) */
	elapsed: number;
}

// ==================== Component Types ====================

/**
 * Extracts event names from EventTypes that have TimerEventData as their payload.
 * This ensures only compatible events can be used with timer.onComplete.
 */
export type TimerEventName<EventTypes extends Record<string, any>> = {
	[K in keyof EventTypes]: EventTypes[K] extends TimerEventData ? K : never
}[keyof EventTypes];

/**
 * Timer component data structure.
 * Use `justFinished` to detect timer completion in your systems.
 *
 * @template EventTypes The event types from your ECS
 */
export interface Timer<EventTypes extends Record<string, any>> {
	/** Time accumulated so far (seconds) */
	elapsed: number;
	/** Target duration (seconds) */
	duration: number;
	/** Whether timer repeats after completion */
	repeat: boolean;
	/** Whether timer is currently running */
	active: boolean;
	/** True for one frame after timer completes */
	justFinished: boolean;
	/** Optional event name to publish when timer completes. Must be an event with TimerEventData payload. */
	onComplete?: TimerEventName<EventTypes>;
}

/**
 * Component types provided by the timer bundle.
 * Extend your component types with this interface.
 *
 * @template EventTypes The event types from your ECS
 *
 * @example
 * ```typescript
 * interface GameComponents extends TimerComponentTypes<GameEvents> {
 *   velocity: { x: number; y: number };
 *   player: true;
 * }
 * ```
 */
export interface TimerComponentTypes<EventTypes extends Record<string, any>> {
	timer: Timer<EventTypes>;
}

// ==================== Bundle Options ====================

/**
 * Configuration options for the timer bundle.
 */
export interface TimerBundleOptions {
	/** System group name (default: 'timers') */
	systemGroup?: string;
	/** Priority for timer update system (default: 0) */
	priority?: number;
	/** Execution phase (default: 'preUpdate') */
	phase?: SystemPhase;
}

// ==================== Helper Functions ====================

/**
 * Options for timer creation
 *
 * @template EventTypes The event types from your ECS
 */
export interface TimerOptions<EventTypes extends Record<string, any>> {
	/** Event name to publish when timer completes. Must be an event with TimerEventData payload. */
	onComplete?: TimerEventName<EventTypes>;
}

/**
 * Create a one-shot timer that fires once after the specified duration.
 *
 * @template EventTypes The event types from your ECS (must be explicitly provided)
 * @param duration Duration in seconds until the timer completes
 * @param options Optional configuration including event name
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * // Timer without event
 * ecs.spawn({
 *   ...createTimer<GameEvents>(2),
 *   explosion: true,
 * });
 *
 * // Timer that publishes an event on completion
 * ecs.spawn({
 *   ...createTimer<GameEvents>(1.5, { onComplete: 'hideMessage' }),
 * });
 * ```
 */
export function createTimer<EventTypes extends Record<string, any>>(
	duration: number,
	options?: TimerOptions<EventTypes>
): Pick<TimerComponentTypes<EventTypes>, 'timer'> {
	return {
		timer: {
			elapsed: 0,
			duration,
			repeat: false,
			active: true,
			justFinished: false,
			onComplete: options?.onComplete,
		},
	};
}

/**
 * Create a repeating timer that fires every `duration` seconds.
 *
 * @template EventTypes The event types from your ECS (must be explicitly provided)
 * @param duration Duration in seconds between each timer completion
 * @param options Optional configuration including event name
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * // Timer without event
 * ecs.spawn({
 *   ...createRepeatingTimer<GameEvents>(5),
 *   spawner: true,
 * });
 *
 * // Repeating timer that publishes an event each cycle
 * ecs.spawn({
 *   ...createRepeatingTimer<GameEvents>(3, { onComplete: 'spawnWave' }),
 * });
 * ```
 */
export function createRepeatingTimer<EventTypes extends Record<string, any>>(
	duration: number,
	options?: TimerOptions<EventTypes>
): Pick<TimerComponentTypes<EventTypes>, 'timer'> {
	return {
		timer: {
			elapsed: 0,
			duration,
			repeat: true,
			active: true,
			justFinished: false,
			onComplete: options?.onComplete,
		},
	};
}

// ==================== Bundle Factory ====================

/**
 * Create a timer bundle for ECSpresso.
 *
 * This bundle provides:
 * - Timer update system that processes all timer components each frame
 * - `justFinished` flag pattern for one-frame completion detection
 * - Automatic cleanup when entities are removed
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso
 *   .create<Components, Events, Resources>()
 *   .withBundle(createTimerBundle())
 *   .build();
 *
 * // Spawn entity with timer
 * ecs.spawn({
 *   ...createRepeatingTimer(5),
 *   spawner: true,
 * });
 *
 * // React to timer completion in a system
 * ecs.addSystem('spawn-on-timer')
 *   .addQuery('spawners', { with: ['timer', 'spawner'] })
 *   .setProcess((queries, _dt, ecs) => {
 *     for (const { components } of queries.spawners) {
 *       if (components.timer.justFinished) {
 *         ecs.spawn({ enemy: true });
 *       }
 *     }
 *   });
 * ```
 */
export function createTimerBundle<EventTypes extends Record<string, any>>(
	options?: TimerBundleOptions
): Bundle<TimerComponentTypes<EventTypes>, EventTypes, {}> {
	const {
		systemGroup = 'timers',
		priority = 0,
		phase = 'preUpdate',
	} = options ?? {};

	const bundle = new Bundle<TimerComponentTypes<EventTypes>, EventTypes, {}>('timers');

	bundle
		.addSystem('timer-update')
		.setPriority(priority)
		.inPhase(phase)
		.inGroup(systemGroup)
		.addQuery('timers', {
			with: ['timer'],
		})
		.setProcess((queries, deltaTime, ecs) => {
			for (const entity of queries.timers) {
				const { timer } = entity.components;

				// Reset justFinished flag from previous frame
				timer.justFinished = false;

				// Skip inactive timers
				if (!timer.active) continue;

				// Accumulate time
				timer.elapsed += deltaTime;

				// Check if timer completed
				if (timer.elapsed < timer.duration) continue;

				// Timer completed - handle based on repeat mode
				if (timer.repeat) {
					// Handle multiple cycles in one frame
					while (timer.elapsed >= timer.duration) {
						timer.justFinished = true;
						publishTimerEvent(ecs, entity.id, timer);
						timer.elapsed -= timer.duration;
					}
				} else {
					// One-shot timer
					timer.justFinished = true;
					publishTimerEvent(ecs, entity.id, timer);
					timer.active = false;
					// Auto-remove one-shot timer entities after completion.
					// If configurability is needed in the future, add an autoRemove option to TimerOptions.
					ecs.commands.removeEntity(entity.id);
				}
			}
		})
		.and();

	/**
	 * Publishes timer completion event if onComplete is specified.
	 * Type assertion needed: TypeScript can't infer that TimerEventName<EventTypes>
	 * maps to events with TimerEventData payloads, even though that's what the type enforces.
	 */
	function publishTimerEvent(
		ecs: { eventBus: { publish: (event: any, data: any) => void } },
		entityId: number,
		timer: Timer<EventTypes>
	): void {
		if (!timer.onComplete) return;
		const eventData: TimerEventData = {
			entityId,
			duration: timer.duration,
			elapsed: timer.elapsed,
		};
		ecs.eventBus.publish(timer.onComplete, eventData);
	}

	return bundle;
}
