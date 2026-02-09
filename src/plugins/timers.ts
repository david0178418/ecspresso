/**
 * Timer Plugin for ECSpresso
 *
 * Provides ECS-native timers following the "data, not callbacks" philosophy.
 * Timers are components processed each frame, automatically cleaned up when entities are removed.
 */

import { definePlugin, type Plugin } from 'ecspresso';
import type { SystemPhase } from 'ecspresso';

// ==================== Event Types ====================

/**
 * Data structure passed to onComplete callbacks when a timer completes.
 *
 * @example
 * ```typescript
 * createTimer(1.5, {
 *   onComplete: (data) => {
 *     console.log(`Timer on entity ${data.entityId} finished after ${data.elapsed}s`);
 *   }
 * });
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
 * Timer component data structure.
 * Use `justFinished` to detect timer completion in your systems.
 */
export interface Timer {
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
	/** Optional callback invoked when timer completes */
	onComplete?: (data: TimerEventData) => void;
}

/**
 * Component types provided by the timer plugin.
 * Included automatically via `.withPlugin(createTimerPlugin())`.
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso.create()
 *   .withPlugin(createTimerPlugin())
 *   .withComponentTypes<{ velocity: { x: number; y: number }; player: true }>()
 *   .build();
 * ```
 */
export interface TimerComponentTypes {
	timer: Timer;
}

// ==================== Plugin Options ====================

/**
 * Configuration options for the timer plugin.
 */
export interface TimerPluginOptions<G extends string = 'timers'> {
	/** System group name (default: 'timers') */
	systemGroup?: G;
	/** Priority for timer update system (default: 0) */
	priority?: number;
	/** Execution phase (default: 'preUpdate') */
	phase?: SystemPhase;
}

// ==================== Helper Functions ====================

/**
 * Options for timer creation
 */
export interface TimerOptions {
	/** Callback invoked when timer completes */
	onComplete?: (data: TimerEventData) => void;
}

/**
 * Create a one-shot timer that fires once after the specified duration.
 *
 * @param duration Duration in seconds until the timer completes
 * @param options Optional configuration including onComplete callback
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * // Timer without callback
 * ecs.spawn({
 *   ...createTimer(2),
 *   explosion: true,
 * });
 *
 * // Timer with onComplete callback
 * ecs.spawn({
 *   ...createTimer(1.5, { onComplete: (data) => console.log('done', data.entityId) }),
 * });
 * ```
 */
export function createTimer(
	duration: number,
	options?: TimerOptions
): Pick<TimerComponentTypes, 'timer'> {
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
 * @param duration Duration in seconds between each timer completion
 * @param options Optional configuration including onComplete callback
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * // Timer without callback
 * ecs.spawn({
 *   ...createRepeatingTimer(5),
 *   spawner: true,
 * });
 *
 * // Repeating timer with onComplete callback
 * ecs.spawn({
 *   ...createRepeatingTimer(3, { onComplete: (data) => console.log('cycle', data.elapsed) }),
 * });
 * ```
 */
export function createRepeatingTimer(
	duration: number,
	options?: TimerOptions
): Pick<TimerComponentTypes, 'timer'> {
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

// ==================== Plugin Factory ====================

/**
 * Create a timer plugin for ECSpresso.
 *
 * This plugin provides:
 * - Timer update system that processes all timer components each frame
 * - `justFinished` flag pattern for one-frame completion detection
 * - Automatic cleanup when entities are removed
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso
 *   .create<Components, Events, Resources>()
 *   .withPlugin(createTimerPlugin())
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
export function createTimerPlugin<G extends string = 'timers'>(
	options?: TimerPluginOptions<G>
): Plugin<TimerComponentTypes, {}, {}, {}, {}, 'timer-update', G> {
	const {
		systemGroup = 'timers',
		priority = 0,
		phase = 'preUpdate',
	} = options ?? {};

	return definePlugin<TimerComponentTypes, {}, {}, {}, {}, 'timer-update', G>({
		id: 'timers',
		install(world) {
			world
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
								timer.onComplete?.({ entityId: entity.id, duration: timer.duration, elapsed: timer.elapsed });
								timer.elapsed -= timer.duration;
							}
						} else {
							// One-shot timer
							timer.justFinished = true;
							timer.onComplete?.({ entityId: entity.id, duration: timer.duration, elapsed: timer.elapsed });
							timer.active = false;
							// Auto-remove one-shot timer entities after completion.
							// If configurability is needed in the future, add an autoRemove option to TimerOptions.
							ecs.commands.removeEntity(entity.id);
						}
					}
				});
		},
	});
}
