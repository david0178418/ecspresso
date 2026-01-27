/**
 * Timer Bundle for ECSpresso
 *
 * Provides ECS-native timers following the "data, not callbacks" philosophy.
 * Timers are components processed each frame, automatically cleaned up when entities are removed.
 */

import Bundle from '../../bundle';

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
}

/**
 * Component types provided by the timer bundle.
 * Extend your component types with this interface.
 *
 * @example
 * ```typescript
 * interface GameComponents extends TimerComponentTypes {
 *   velocity: { x: number; y: number };
 *   player: true;
 * }
 * ```
 */
export interface TimerComponentTypes {
	timer: Timer;
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
}

// ==================== Helper Functions ====================

/**
 * Create a one-shot timer that fires once after the specified duration.
 *
 * @param duration Duration in seconds until the timer completes
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * // Timer that triggers after 2 seconds
 * ecs.spawn({
 *   ...createTimer(2),
 *   explosion: true,
 * });
 * ```
 */
export function createTimer(duration: number): Pick<TimerComponentTypes, 'timer'> {
	return {
		timer: {
			elapsed: 0,
			duration,
			repeat: false,
			active: true,
			justFinished: false,
		},
	};
}

/**
 * Create a repeating timer that fires every `duration` seconds.
 *
 * @param duration Duration in seconds between each timer completion
 * @returns Component object suitable for spreading into spawn()
 *
 * @example
 * ```typescript
 * // Timer that triggers every 5 seconds
 * ecs.spawn({
 *   ...createRepeatingTimer(5),
 *   spawner: true,
 * });
 * ```
 */
export function createRepeatingTimer(duration: number): Pick<TimerComponentTypes, 'timer'> {
	return {
		timer: {
			elapsed: 0,
			duration,
			repeat: true,
			active: true,
			justFinished: false,
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
export function createTimerBundle(
	options?: TimerBundleOptions
): Bundle<TimerComponentTypes, {}, {}> {
	const {
		systemGroup = 'timers',
		priority = 0,
	} = options ?? {};

	const bundle = new Bundle<TimerComponentTypes, {}, {}>('timers');

	bundle
		.addSystem('timer-update')
		.setPriority(priority)
		.inGroup(systemGroup)
		.addQuery('timers', {
			with: ['timer'] as const,
		})
		.setProcess((queries, deltaTime) => {
			for (const entity of queries.timers) {
				const { timer } = entity.components;

				// Reset justFinished flag from previous frame
				timer.justFinished = false;

				// Skip inactive timers
				if (!timer.active) continue;

				// Accumulate time
				timer.elapsed += deltaTime;

				// Check for completion
				if (timer.elapsed >= timer.duration) {
					timer.justFinished = true;

					if (timer.repeat) {
						// Preserve overflow for consistent timing
						timer.elapsed -= timer.duration;
					} else {
						timer.active = false;
					}
				}
			}
		})
		.and();

	return bundle;
}
