import { describe, test, expect } from 'bun:test';
import ECSpresso from '../ecspresso';
import { createTimer, createRepeatingTimer, createTimerPlugin, type TimerEventData } from './timers';

interface TestComponents {
	position: { x: number; y: number };
}

interface TestEvents {
	timerComplete: TimerEventData;
	oneShotComplete: TimerEventData;
	repeatingTimer: TimerEventData;
}

interface TestResources {
	counter: number;
}

describe('Timer Events', () => {
	describe('One-Shot Timers with Events', () => {
		test('should fire callback when timer completes', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			let callbackData: TimerEventData = { entityId: -1, duration: -1, elapsed: -1 };
			let callbackFired = false;

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 1.0,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: (data) => {
						callbackFired = true;
						callbackData = data;
					}
				}
			});

			// Callback should not have fired yet
			expect(callbackFired).toBe(false);

			// Update past timer duration
			ecs.update(1.1);

			// Callback should have fired
			expect(callbackFired).toBe(true);
			expect(callbackData.entityId).toBe(timer.id);
			expect(callbackData.duration).toBe(1.0);
		});

		test('should fire callback only once for one-shot timer', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			let fireCount = 0;

			ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: () => {
						fireCount++;
					}
				}
			});

			// Update multiple times
			ecs.update(0.6); // Should fire
			ecs.update(0.1); // Should not fire again
			ecs.update(0.1); // Should not fire again

			expect(fireCount).toBe(1);
		});

		test('should include timer metadata in callback data', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			let receivedData: TimerEventData = { entityId: -1, duration: -1, elapsed: -1 };

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 2.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: (data) => {
						receivedData = data;
					}
				}
			});

			ecs.update(3.0);

			expect(receivedData.entityId).toBe(timer.id);
			expect(receivedData.duration).toBe(2.5);
			expect(receivedData.elapsed).toBeGreaterThanOrEqual(2.5);
		});
	});

	describe('Repeating Timers with Events', () => {
		test('should fire callback on each cycle for repeating timers', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			let fireCount = 0;

			ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: true,
					active: true,
					justFinished: false,
					onComplete: () => {
						fireCount++;
					}
				}
			});

			// Update through multiple cycles
			ecs.update(0.6); // Cycle 1
			expect(fireCount).toBe(1);

			ecs.update(0.5); // Cycle 2
			expect(fireCount).toBe(2);

			ecs.update(0.5); // Cycle 3
			expect(fireCount).toBe(3);
		});

		test('should preserve overflow time when firing repeating timer callbacks', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			const fireTimestamps: number[] = [];

			ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 1.0,
					repeat: true,
					active: true,
					justFinished: false,
					onComplete: (data) => {
						fireTimestamps.push(data.elapsed);
					}
				}
			});

			// Update with 1.3 seconds (should complete + overflow 0.3)
			ecs.update(1.3);

			expect(fireTimestamps.length).toBe(1);
			// Elapsed should be 1.3, timer should have 0.3 after reset
		});
	});

	describe('Multiple Timers with Callbacks', () => {
		test('should allow multiple timers with independent callbacks', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			const completedTimers: number[] = [];

			const timer1 = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: (data) => {
						completedTimers.push(data.entityId);
					}
				}
			});

			const timer2 = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 1.0,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: (data) => {
						completedTimers.push(data.entityId);
					}
				}
			});

			const timer3 = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 1.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: (data) => {
						completedTimers.push(data.entityId);
					}
				}
			});

			// Update to complete first timer
			ecs.update(0.6);
			expect(completedTimers).toEqual([timer1.id]);

			// Update to complete second timer
			ecs.update(0.5);
			expect(completedTimers).toEqual([timer1.id, timer2.id]);

			// Update to complete third timer
			ecs.update(0.5);
			expect(completedTimers).toEqual([timer1.id, timer2.id, timer3.id]);
		});
	});

	describe('Timers Without Events', () => {
		test('should work normally when onComplete is not specified', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 1.0,
					repeat: false,
					active: true,
					justFinished: false
					// No onComplete field
				}
			});

			// Should not throw
			expect(() => { ecs.update(1.5); }).not.toThrow();

			// One-shot timer entity should be auto-removed after completion
			expect(ecs.entityManager.getEntity(timer.id)).toBeUndefined();
		});

		test('should work with createTimer helper without callback', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			const timer = ecs.spawn({
				...createTimer(1.0)
			});

			ecs.update(1.5);

			// One-shot timer entity should be auto-removed after completion
			expect(ecs.entityManager.getEntity(timer.id)).toBeUndefined();
		});
	});

	describe('Timer Helper Functions with Callbacks', () => {
		test('createTimer should accept onComplete callback', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			let callbackFired = false;

			ecs.spawn({
				...createTimer(0.5, { onComplete: () => { callbackFired = true; } })
			});

			ecs.update(0.6);

			expect(callbackFired).toBe(true);
		});

		test('createRepeatingTimer should accept onComplete callback', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			let fireCount = 0;

			ecs.spawn({
				...createRepeatingTimer(0.3, { onComplete: () => { fireCount++; } })
			});

			ecs.update(1.0); // Should fire 3 times (0.3, 0.6, 0.9)

			expect(fireCount).toBe(3);
		});

		test('timer options should be optional', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			// Should not throw without options
			expect(() => {
				ecs.spawn({ ...createTimer(1.0) });
				ecs.spawn({ ...createRepeatingTimer(1.0) });
			}).not.toThrow();
		});
	});

	describe('Auto-Remove Behavior', () => {
		test('should auto-remove one-shot timer entity after completion', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: () => {}
				}
			});

			// Entity should exist before completion
			expect(ecs.entityManager.getEntity(timer.id)).toBeDefined();

			// Update past timer duration
			ecs.update(0.6);

			// Entity should be removed after completion
			expect(ecs.entityManager.getEntity(timer.id)).toBeUndefined();
		});

		test('should NOT auto-remove repeating timer entities', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: true,
					active: true,
					justFinished: false,
					onComplete: () => {}
				}
			});

			// Entity should exist before any cycles
			expect(ecs.entityManager.getEntity(timer.id)).toBeDefined();

			// Update through multiple cycles
			ecs.update(0.6);
			expect(ecs.entityManager.getEntity(timer.id)).toBeDefined();

			ecs.update(0.6);
			expect(ecs.entityManager.getEntity(timer.id)).toBeDefined();

			ecs.update(0.6);
			expect(ecs.entityManager.getEntity(timer.id)).toBeDefined();
		});

		test('should auto-remove one-shot timer even without onComplete callback', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: false,
					active: true,
					justFinished: false
					// No onComplete
				}
			});

			expect(ecs.entityManager.getEntity(timer.id)).toBeDefined();

			ecs.update(0.6);

			expect(ecs.entityManager.getEntity(timer.id)).toBeUndefined();
		});

		test('should fire callback before entity is removed', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			let receivedEntityId = -1;
			let entityExistedDuringCallback = false;

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: (data) => {
						receivedEntityId = data.entityId;
						// Check if entity still exists when callback fires
						entityExistedDuringCallback = ecs.entityManager.getEntity(data.entityId) !== undefined;
					}
				}
			});

			ecs.update(0.6);

			expect(receivedEntityId).toBe(timer.id);
			expect(entityExistedDuringCallback).toBe(true);
			// But entity should be gone after update completes
			expect(ecs.entityManager.getEntity(timer.id)).toBeUndefined();
		});
	});

	describe('Edge Cases', () => {
		test('should handle timer removal before completion', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			let callbackFired = false;

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 1.0,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: () => {
						callbackFired = true;
					}
				}
			});

			// Update partially
			ecs.update(0.5);

			// Remove timer before completion
			ecs.removeEntity(timer.id);

			// Update past what would have been completion
			ecs.update(1.0);

			// Callback should not have fired
			expect(callbackFired).toBe(false);
		});

		test('should handle onComplete callback that throws', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: () => {
						throw new Error('callback error');
					}
				}
			});

			// Should propagate the error from the callback
			expect(() => { ecs.update(1.0); }).toThrow('callback error');
		});
	});

	describe('onComplete callback typing', () => {
		test('data parameter infers as TimerEventData', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createTimerPlugin())
				.build();

			ecs.spawn({
				...createTimer(1.0, {
					onComplete: (data) => {
						// These should all be number and compile without error
						expect(typeof data.entityId).toBe('number');
						expect(typeof data.duration).toBe('number');
						expect(typeof data.elapsed).toBe('number');
					}
				})
			});
		});

		test('onComplete is optional with no args', () => {
			// Should compile without error
			createTimer(1.0);
			createRepeatingTimer(1.0);
		});

		test('onComplete is optional with empty options', () => {
			// Should compile without error
			createTimer(1.0, {});
			createRepeatingTimer(1.0, {});
		});
	});
});
