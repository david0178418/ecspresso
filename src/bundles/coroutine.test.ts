import { describe, test, expect } from 'bun:test';
import ECSpresso from '../ecspresso';
import {
	createCoroutineBundle,
	createCoroutine,
	createCoroutineKit,
	cancelCoroutine,
	waitSeconds,
	waitFrames,
	waitUntil,
	waitForEvent,
	parallel,
	race,
	type CoroutineGenerator,
	type CoroutineEventData,
} from './coroutine';

// ==================== Test Type Definitions ====================

interface TestComponents {
	position: { x: number; y: number };
	tag: string;
}

interface TestEvents {
	coroutineDone: CoroutineEventData;
	otherDone: CoroutineEventData;
	testSignal: { entityId: number; value: number };
	badEvent: { message: string };
}

interface TestResources {}

function createTestEcs() {
	return ECSpresso
		.create<TestComponents, TestEvents, TestResources>()
		.withBundle(createCoroutineBundle())
		.build();
}

function createTestEcsWithEvents() {
	return ECSpresso
		.create<TestComponents, TestEvents, TestResources>()
		.withBundle(createCoroutineBundle<TestEvents>())
		.build();
}

// ==================== Basic Generator Processing ====================

describe('Basic Generator Processing', () => {
	test('ticks generator once per frame', () => {
		const ecs = createTestEcs();
		const steps: number[] = [];

		function* testGen(): CoroutineGenerator {
			steps.push(1);
			yield;
			steps.push(2);
			yield;
			steps.push(3);
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016); // init + first tick: pushes 1, then yields, resumes and pushes 2
		expect(steps).toEqual([1, 2]);

		ecs.update(0.016); // pushes 3
		expect(steps).toEqual([1, 2, 3]);
	});

	test('passes deltaTime via yield expression', () => {
		const ecs = createTestEcs();
		const receivedDts: number[] = [];

		function* testGen(): CoroutineGenerator {
			const dt1: number = yield;
			receivedDts.push(dt1);
			const dt2: number = yield;
			receivedDts.push(dt2);
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		expect(receivedDts).toEqual([0.016]);

		ecs.update(0.033);
		expect(receivedDts).toEqual([0.016, 0.033]);
	});

	test('completes when generator returns', () => {
		const ecs = createTestEcs();
		let completed = false;

		function* testGen(): CoroutineGenerator {
			yield;
			completed = true;
		}

		const entity = ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016); // init + first .next(dt) resumes, completes
		expect(completed).toBe(true);

		// After command playback, coroutine component should be removed
		ecs.update(0.016);
		expect(ecs.hasComponent(entity.id, 'coroutine')).toBe(false);
	});

	test('does not tick already-completed generators', () => {
		const ecs = createTestEcs();
		let tickCount = 0;

		function* testGen(): CoroutineGenerator {
			tickCount++;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016); // init runs to completion immediately
		expect(tickCount).toBe(1);

		ecs.update(0.016); // finished guard + removal
		ecs.update(0.016); // should not tick — component removed
		expect(tickCount).toBe(1);
	});
});

// ==================== Component Removal on Completion ====================

describe('Component Removal on Completion', () => {
	test('removes coroutine component after completion + command playback', () => {
		const ecs = createTestEcs();

		function* testGen(): CoroutineGenerator {
			yield;
		}

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createCoroutine(testGen()),
		});

		ecs.update(0.016); // completes, queues removal
		ecs.update(0.016); // finished guard frame
		ecs.update(0.016); // removal executed

		expect(ecs.hasComponent(entity.id, 'coroutine')).toBe(false);
	});

	test('does NOT remove the entity itself', () => {
		const ecs = createTestEcs();

		function* testGen(): CoroutineGenerator {
			yield;
		}

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createCoroutine(testGen()),
		});

		ecs.update(0.016);
		ecs.update(0.016);
		ecs.update(0.016);

		// Entity still exists
		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		expect(pos).toBeDefined();
	});
});

// ==================== onComplete Event ====================

describe('onComplete Event', () => {
	test('fires with correct entityId', () => {
		const ecs = createTestEcsWithEvents();
		const received: CoroutineEventData[] = [];

		ecs.eventBus.subscribe('coroutineDone', (data) => {
			received.push(data);
		});

		function* testGen(): CoroutineGenerator {
			yield;
		}

		const entity = ecs.spawn({
			...createCoroutine<TestEvents>(testGen(), { onComplete: 'coroutineDone' }),
		});

		ecs.update(0.016);

		expect(received.length).toBe(1);
		expect(received[0]?.entityId).toBe(entity.id);
	});

	test('fires only once', () => {
		const ecs = createTestEcsWithEvents();
		let fireCount = 0;

		ecs.eventBus.subscribe('coroutineDone', () => {
			fireCount++;
		});

		function* testGen(): CoroutineGenerator {
			yield;
		}

		ecs.spawn({
			...createCoroutine<TestEvents>(testGen(), { onComplete: 'coroutineDone' }),
		});

		ecs.update(0.016);
		ecs.update(0.016);
		ecs.update(0.016);

		expect(fireCount).toBe(1);
	});

	test('works without onComplete (no error)', () => {
		const ecs = createTestEcs();

		function* testGen(): CoroutineGenerator {
			yield;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		// Should not throw
		ecs.update(0.016);
		ecs.update(0.016);
	});
});

// ==================== Error Handling ====================

describe('Error Handling', () => {
	test('generator that throws: no crash, component removed', () => {
		const ecs = createTestEcs();

		function* badGen(): CoroutineGenerator {
			yield;
			throw new Error('test error');
		}

		const entity = ecs.spawn({ ...createCoroutine(badGen()) });

		// Should not throw
		ecs.update(0.016);

		// After command playback, component removed
		ecs.update(0.016);
		ecs.update(0.016);
		expect(ecs.hasComponent(entity.id, 'coroutine')).toBe(false);
	});

	test('continues processing other entities after one errors', () => {
		const ecs = createTestEcs();
		let goodTicked = false;

		function* badGen(): CoroutineGenerator {
			yield;
			throw new Error('test error');
		}

		function* goodGen(): CoroutineGenerator {
			yield;
			goodTicked = true;
			yield;
		}

		ecs.spawn({ ...createCoroutine(badGen()) });
		ecs.spawn({ ...createCoroutine(goodGen()) });

		ecs.update(0.016);

		expect(goodTicked).toBe(true);
	});
});

// ==================== Entity Destruction Mid-Coroutine ====================

describe('Entity Destruction Mid-Coroutine', () => {
	test('triggers generator finally block when entity removed', () => {
		const ecs = createTestEcs();
		let cleanedUp = false;

		function* testGen(): CoroutineGenerator {
			try {
				while (true) {
					yield;
				}
			} finally {
				cleanedUp = true;
			}
		}

		const entity = ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016); // init
		expect(cleanedUp).toBe(false);

		ecs.removeEntity(entity.id);
		expect(cleanedUp).toBe(true);
	});

	test('no crash on subsequent updates after entity removal', () => {
		const ecs = createTestEcs();

		function* testGen(): CoroutineGenerator {
			while (true) {
				yield;
			}
		}

		const entity = ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		ecs.removeEntity(entity.id);

		// Should not throw
		ecs.update(0.016);
		ecs.update(0.016);
	});
});

// ==================== waitSeconds ====================

describe('waitSeconds', () => {
	test('waits for specified duration', () => {
		const ecs = createTestEcs();
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* waitSeconds(1.0);
			done = true;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.5);
		expect(done).toBe(false);

		ecs.update(0.5);
		expect(done).toBe(true);
	});

	test('waitSeconds(0) completes immediately', () => {
		const ecs = createTestEcs();
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* waitSeconds(0);
			done = true;
			yield;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		expect(done).toBe(true);
	});

	test('waitSeconds(negative) completes immediately', () => {
		const ecs = createTestEcs();
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* waitSeconds(-5);
			done = true;
			yield;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		expect(done).toBe(true);
	});

	test('accumulates dt correctly across frames', () => {
		const ecs = createTestEcs();
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* waitSeconds(1.0);
			done = true;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.3);
		expect(done).toBe(false);
		ecs.update(0.3);
		expect(done).toBe(false);
		ecs.update(0.3);
		expect(done).toBe(false);
		ecs.update(0.3); // total 1.2 > 1.0
		expect(done).toBe(true);
	});
});

// ==================== waitFrames ====================

describe('waitFrames', () => {
	test('waits for specified frame count', () => {
		const ecs = createTestEcs();
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* waitFrames(3);
			done = true;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016); // frame 1 (init + first yield)
		expect(done).toBe(false);

		ecs.update(0.016); // frame 2
		expect(done).toBe(false);

		ecs.update(0.016); // frame 3
		expect(done).toBe(true);
	});

	test('waitFrames(0) completes immediately', () => {
		const ecs = createTestEcs();
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* waitFrames(0);
			done = true;
			yield;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		expect(done).toBe(true);
	});

	test('waitFrames(1) completes after one yield', () => {
		const ecs = createTestEcs();
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* waitFrames(1);
			done = true;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016); // init yields into waitFrames, waitFrames yields once, done
		expect(done).toBe(true);
	});
});

// ==================== waitUntil ====================

describe('waitUntil', () => {
	test('waits until predicate returns true', () => {
		const ecs = createTestEcs();
		let condition = false;
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* waitUntil(() => condition);
			done = true;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		expect(done).toBe(false);

		ecs.update(0.016);
		expect(done).toBe(false);

		condition = true;
		ecs.update(0.016);
		expect(done).toBe(true);
	});

	test('completes on exact frame predicate becomes true', () => {
		const ecs = createTestEcs();
		let counter = 0;
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* waitUntil(() => counter >= 3);
			done = true;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016); counter++; // counter=1 after update
		expect(done).toBe(false);

		ecs.update(0.016); counter++; // counter=2 after update
		expect(done).toBe(false);

		counter++; // counter=3 before update
		ecs.update(0.016);
		expect(done).toBe(true);
	});
});

// ==================== parallel ====================

describe('parallel', () => {
	test('waits for all coroutines to complete', () => {
		const ecs = createTestEcs();
		let done = false;

		function* short(): CoroutineGenerator {
			yield;
		}

		function* long(): CoroutineGenerator {
			yield;
			yield;
			yield;
		}

		function* testGen(): CoroutineGenerator {
			yield* parallel(short(), long());
			done = true;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016); // init parallel, tick both — short finishes
		expect(done).toBe(false);

		ecs.update(0.016); // tick long
		expect(done).toBe(false);

		ecs.update(0.016); // long finishes
		expect(done).toBe(true);
	});

	test('zero coroutines = immediate completion', () => {
		const ecs = createTestEcs();
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* parallel();
			done = true;
			yield;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		expect(done).toBe(true);
	});

	test('ticks all sub-coroutines each frame', () => {
		const ecs = createTestEcs();
		const ticks = { a: 0, b: 0 };

		function* genA(): CoroutineGenerator {
			ticks.a++;
			yield;
			ticks.a++;
		}

		function* genB(): CoroutineGenerator {
			ticks.b++;
			yield;
			ticks.b++;
		}

		function* testGen(): CoroutineGenerator {
			yield* parallel(genA(), genB());
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016); // init parallel → init both (push 1 each) → tick both (push 2 each)
		expect(ticks.a).toBe(2);
		expect(ticks.b).toBe(2);
	});
});

// ==================== race ====================

describe('race', () => {
	test('completes when first finishes', () => {
		const ecs = createTestEcs();
		let done = false;

		function* fast(): CoroutineGenerator {
			yield;
		}

		function* slow(): CoroutineGenerator {
			yield;
			yield;
			yield;
		}

		function* testGen(): CoroutineGenerator {
			yield* race(fast(), slow());
			done = true;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016); // init race → init both → tick both → fast finishes
		expect(done).toBe(true);
	});

	test('calls .return() on remaining (verify via finally tracking)', () => {
		const ecs = createTestEcs();
		let slowCleaned = false;

		function* fast(): CoroutineGenerator {
			yield;
		}

		function* slow(): CoroutineGenerator {
			try {
				yield;
				yield;
				yield;
			} finally {
				slowCleaned = true;
			}
		}

		function* testGen(): CoroutineGenerator {
			yield* race(fast(), slow());
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		expect(slowCleaned).toBe(true);
	});

	test('zero coroutines = immediate completion', () => {
		const ecs = createTestEcs();
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* race();
			done = true;
			yield;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		expect(done).toBe(true);
	});
});

// ==================== waitForEvent ====================

describe('waitForEvent', () => {
	test('waits until matching event fires', () => {
		const ecs = createTestEcs();
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* waitForEvent<TestEvents, 'coroutineDone'>(ecs.eventBus, 'coroutineDone');
			done = true;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		expect(done).toBe(false);

		ecs.eventBus.publish('coroutineDone', { entityId: 999 });
		ecs.update(0.016);
		expect(done).toBe(true);
	});

	test('unsubscribes on completion', () => {
		const ecs = createTestEcs();
		let eventCount = 0;

		function* testGen(): CoroutineGenerator {
			yield* waitForEvent<TestEvents, 'coroutineDone'>(ecs.eventBus, 'coroutineDone');
			eventCount++;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		ecs.eventBus.publish('coroutineDone', { entityId: 1 });
		ecs.update(0.016);

		expect(eventCount).toBe(1);

		// Further events should not affect anything
		ecs.eventBus.publish('coroutineDone', { entityId: 2 });
		ecs.update(0.016);
		expect(eventCount).toBe(1);
	});

	test('unsubscribes on cancellation (finally)', () => {
		const ecs = createTestEcs();

		// We can verify unsubscription by checking the event has no effect after cancellation
		function* testGen(): CoroutineGenerator {
			yield* waitForEvent<TestEvents, 'coroutineDone'>(ecs.eventBus, 'coroutineDone');
		}

		const entity = ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016); // init, waiting for event

		// Cancel the coroutine (triggers finally in waitForEvent)
		cancelCoroutine(ecs, entity.id);

		// Publish event — should not cause issues since unsubscribed
		ecs.eventBus.publish('coroutineDone', { entityId: 1 });
		ecs.update(0.016);
		ecs.update(0.016);
	});

	test('supports filter predicate', () => {
		const ecs = createTestEcs();
		let done = false;

		function* testGen(): CoroutineGenerator {
			yield* waitForEvent<TestEvents, 'testSignal'>(
				ecs.eventBus,
				'testSignal',
				(data) => data.value > 10,
			);
			done = true;
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		ecs.eventBus.publish('testSignal', { entityId: 1, value: 5 });
		ecs.update(0.016);
		expect(done).toBe(false);

		ecs.eventBus.publish('testSignal', { entityId: 1, value: 15 });
		ecs.update(0.016);
		expect(done).toBe(true);
	});
});

// ==================== Nested yield* Delegation ====================

describe('Nested yield* Delegation', () => {
	test('composed sequences via yield*', () => {
		const ecs = createTestEcs();
		const steps: string[] = [];

		function* step1(): CoroutineGenerator {
			steps.push('step1-start');
			yield;
			steps.push('step1-end');
		}

		function* step2(): CoroutineGenerator {
			steps.push('step2-start');
			yield;
			steps.push('step2-end');
		}

		function* testGen(): CoroutineGenerator {
			yield* step1();
			yield* step2();
		}

		ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016); // init → step1-start, yield, resume → step1-end, step2-start
		expect(steps).toContain('step1-start');
		expect(steps).toContain('step1-end');
		expect(steps).toContain('step2-start');

		ecs.update(0.016); // step2-end
		expect(steps).toContain('step2-end');
	});

	test('deeply nested delegation', () => {
		const ecs = createTestEcs();
		let done = false;

		function* innermost(): CoroutineGenerator {
			yield;
		}

		function* middle(): CoroutineGenerator {
			yield* innermost();
		}

		function* outer(): CoroutineGenerator {
			yield* middle();
			done = true;
		}

		ecs.spawn({ ...createCoroutine(outer()) });

		ecs.update(0.016);
		expect(done).toBe(true);
	});
});

// ==================== Multiple Entities ====================

describe('Multiple Entities', () => {
	test('independent processing of multiple coroutine entities', () => {
		const ecs = createTestEcs();
		const results = { a: 0, b: 0 };

		function* genA(): CoroutineGenerator {
			results.a++;
			yield;
			results.a++;
			yield;
			results.a++;
		}

		function* genB(): CoroutineGenerator {
			results.b++;
			yield;
			results.b++;
		}

		ecs.spawn({ ...createCoroutine(genA()) });
		ecs.spawn({ ...createCoroutine(genB()) });

		ecs.update(0.016); // init + tick: a=2, b=2
		expect(results.a).toBe(2);
		expect(results.b).toBe(2);

		ecs.update(0.016); // a=3 (done), b already done
		expect(results.a).toBe(3);
		expect(results.b).toBe(2);
	});
});

// ==================== Cancellation ====================

describe('Cancellation', () => {
	test('cancelCoroutine triggers finally + removes component', () => {
		const ecs = createTestEcs();
		let cleanedUp = false;

		function* testGen(): CoroutineGenerator {
			try {
				while (true) {
					yield;
				}
			} finally {
				cleanedUp = true;
			}
		}

		const entity = ecs.spawn({ ...createCoroutine(testGen()) });

		ecs.update(0.016);
		expect(cleanedUp).toBe(false);

		const result = cancelCoroutine(ecs, entity.id);
		expect(result).toBe(true);
		expect(cleanedUp).toBe(true);

		// After command playback
		ecs.update(0.016);
		ecs.update(0.016);
		expect(ecs.hasComponent(entity.id, 'coroutine')).toBe(false);
	});

	test('returns false when entity has no coroutine', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({ position: { x: 0, y: 0 } });

		const result = cancelCoroutine(ecs, entity.id);
		expect(result).toBe(false);
	});
});

// ==================== Kit Type Safety ====================

describe('Kit Type Safety', () => {
	test('rejects invalid onComplete event name', () => {
		const kit = createCoroutineKit<ReturnType<typeof createTestEcsWithEvents>>();

		function* testGen(): CoroutineGenerator {
			yield;
		}

		// @ts-expect-error - 'badEvent' payload does not extend CoroutineEventData
		kit.createCoroutine(testGen(), { onComplete: 'badEvent' });
	});

	test('accepts valid onComplete event name', () => {
		const kit = createCoroutineKit<ReturnType<typeof createTestEcsWithEvents>>();

		function* testGen(): CoroutineGenerator {
			yield;
		}

		// Should compile without error
		kit.createCoroutine(testGen(), { onComplete: 'coroutineDone' });
	});

	test('rejects invalid waitForEvent event type', () => {
		const kit = createCoroutineKit<ReturnType<typeof createTestEcsWithEvents>>();
		const ecs = createTestEcsWithEvents();

		// @ts-expect-error - 'nonExistent' is not a valid event type
		kit.waitForEvent(ecs.eventBus, 'nonExistent');
	});

	test('accepts valid event type in waitForEvent', () => {
		const kit = createCoroutineKit<ReturnType<typeof createTestEcsWithEvents>>();
		const ecs = createTestEcsWithEvents();

		// Should compile without error
		kit.waitForEvent(ecs.eventBus, 'coroutineDone');
	});

	test('bundle installs and processes coroutines (runtime)', () => {
		const kit = createCoroutineKit<ReturnType<typeof createTestEcsWithEvents>>();
		let done = false;

		const ecs = ECSpresso
			.create<TestComponents, TestEvents, TestResources>()
			.withBundle(kit.bundle)
			.build();

		function* testGen(): CoroutineGenerator {
			yield;
			done = true;
		}

		ecs.spawn({ ...kit.createCoroutine(testGen(), { onComplete: 'coroutineDone' }) });

		ecs.update(0.016);
		expect(done).toBe(true);
	});
});
