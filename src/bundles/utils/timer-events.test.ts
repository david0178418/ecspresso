import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import { createTimer, createRepeatingTimer, createTimerBundle, type TimerEventData } from './timers';

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
		test('should fire event when timer completes', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle())
				.build();

			let eventFired = false;
			let eventData: any = null;

			ecs.eventBus.subscribe('timerComplete', (data) => {
				eventFired = true;
				eventData = data;
			});

			// Create timer with event
			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 1.0,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: 'timerComplete'
				}
			});

			// Event should not have fired yet
			expect(eventFired).toBe(false);

			// Update past timer duration
			ecs.update(1.1);

			// Event should have fired
			expect(eventFired).toBe(true);
			expect(eventData).toBeDefined();
			expect(eventData.entityId).toBe(timer.id);
			expect(eventData.duration).toBe(1.0);
		});

		test('should fire event only once for one-shot timer', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle())
				.build();

			let fireCount = 0;

			ecs.eventBus.subscribe('oneShotComplete', () => {
				fireCount++;
			});

			ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: 'oneShotComplete'
				}
			});

			// Update multiple times
			ecs.update(0.6); // Should fire
			ecs.update(0.1); // Should not fire again
			ecs.update(0.1); // Should not fire again

			expect(fireCount).toBe(1);
		});

		test('should include timer metadata in event', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle())
				.build();

			let receivedData: any = null;

			ecs.eventBus.subscribe('timerComplete', (data) => {
				receivedData = data;
			});

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 2.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: 'timerComplete'
				}
			});

			ecs.update(3.0);

			expect(receivedData).not.toBeNull();
			expect(receivedData.entityId).toBe(timer.id);
			expect(receivedData.duration).toBe(2.5);
			expect(receivedData.elapsed).toBeGreaterThanOrEqual(2.5);
		});
	});

	describe('Repeating Timers with Events', () => {
		test('should fire event on each cycle for repeating timers', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle())
				.build();

			let fireCount = 0;

			ecs.eventBus.subscribe('repeatingTimer', () => {
				fireCount++;
			});

			ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: true,
					active: true,
					justFinished: false,
					onComplete: 'repeatingTimer'
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

		test('should preserve overflow time when firing repeating timer events', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle())
				.build();

			const fireTimestamps: number[] = [];

			ecs.eventBus.subscribe('repeatingTimer', (data) => {
				fireTimestamps.push(data.elapsed);
			});

			ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 1.0,
					repeat: true,
					active: true,
					justFinished: false,
					onComplete: 'repeatingTimer'
				}
			});

			// Update with 1.3 seconds (should complete + overflow 0.3)
			ecs.update(1.3);

			expect(fireTimestamps.length).toBe(1);
			// Elapsed should be 1.3, timer should have 0.3 after reset
		});
	});

	describe('Multiple Timers, Same Event', () => {
		test('should allow multiple timers to share the same event name', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle())
				.build();

			const completedTimers: number[] = [];

			ecs.eventBus.subscribe('timerComplete', (data) => {
				completedTimers.push(data.entityId);
			});

			const timer1 = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: 'timerComplete'
				}
			});

			const timer2 = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 1.0,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: 'timerComplete'
				}
			});

			const timer3 = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 1.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: 'timerComplete'
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
				.withBundle(createTimerBundle())
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

		test('should work with createTimer helper without event', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle())
				.build();

			const timer = ecs.spawn({
				...createTimer(1.0)
			});

			ecs.update(1.5);

			// One-shot timer entity should be auto-removed after completion
			expect(ecs.entityManager.getEntity(timer.id)).toBeUndefined();
		});
	});

	describe('Timer Helper Functions with Events', () => {
		test('createTimer should accept onComplete option', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle<TestEvents>())
				.build();

			let eventFired = false;

			ecs.eventBus.subscribe('oneShotComplete', () => {
				eventFired = true;
			});

			ecs.spawn({
				...createTimer<TestEvents>(0.5, { onComplete: 'oneShotComplete' })
			});

			ecs.update(0.6);

			expect(eventFired).toBe(true);
		});

		test('createRepeatingTimer should accept onComplete option', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle<TestEvents>())
				.build();

			let fireCount = 0;

			ecs.eventBus.subscribe('repeatingTimer', () => {
				fireCount++;
			});

			ecs.spawn({
				...createRepeatingTimer<TestEvents>(0.3, { onComplete: 'repeatingTimer' })
			});

			ecs.update(1.0); // Should fire 3 times (0.3, 0.6, 0.9)

			expect(fireCount).toBe(3);
		});

		test('timer options should be optional', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle())
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
				.withBundle(createTimerBundle())
				.build();

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: 'timerComplete'
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
				.withBundle(createTimerBundle())
				.build();

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: true,
					active: true,
					justFinished: false,
					onComplete: 'repeatingTimer'
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

		test('should auto-remove one-shot timer even without onComplete event', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle())
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

		test('should fire event before entity is removed', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle())
				.build();

			let receivedEntityId = -1;
			let entityExistedDuringEvent = false;

			ecs.eventBus.subscribe('timerComplete', (data) => {
				receivedEntityId = data.entityId;
				// Check if entity still exists when event fires
				entityExistedDuringEvent = ecs.entityManager.getEntity(data.entityId) !== undefined;
			});

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: 'timerComplete'
				}
			});

			ecs.update(0.6);

			expect(receivedEntityId).toBe(timer.id);
			expect(entityExistedDuringEvent).toBe(true);
			// But entity should be gone after update completes
			expect(ecs.entityManager.getEntity(timer.id)).toBeUndefined();
		});
	});

	describe('Edge Cases', () => {
		test('should handle timer removal before completion', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle())
				.build();

			let eventFired = false;

			ecs.eventBus.subscribe('timerComplete', () => {
				eventFired = true;
			});

			const timer = ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 1.0,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: 'timerComplete'
				}
			});

			// Update partially
			ecs.update(0.5);

			// Remove timer before completion
			ecs.removeEntity(timer.id);

			// Update past what would have been completion
			ecs.update(1.0);

			// Event should not have fired
			expect(eventFired).toBe(false);
		});

		test('should handle invalid event names gracefully', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTimerBundle())
				.build();

			ecs.spawn({
				timer: {
					elapsed: 0,
					duration: 0.5,
					repeat: false,
					active: true,
					justFinished: false,
					onComplete: 'nonExistentEvent' as any
				}
			});

			// Should not throw even though no one is listening
			expect(() => { ecs.update(1.0); }).not.toThrow();
		});
	});
});
