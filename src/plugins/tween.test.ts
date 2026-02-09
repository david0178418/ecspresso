import { describe, test, expect } from 'bun:test';
import ECSpresso from '../ecspresso';
import {
	linear,
	easeInQuad,
	easeOutQuad,
	easeInOutQuad,
	easeInCubic,
	easeOutCubic,
	easeInOutCubic,
	easeInQuart,
	easeOutQuart,
	easeInOutQuart,
	easeInQuint,
	easeOutQuint,
	easeInOutQuint,
	easeInSine,
	easeOutSine,
	easeInOutSine,
	easeInExpo,
	easeOutExpo,
	easeInOutExpo,
	easeInCirc,
	easeOutCirc,
	easeInOutCirc,
	easeInBack,
	easeOutBack,
	easeInOutBack,
	easeInElastic,
	easeOutElastic,
	easeInOutElastic,
	easeInBounce,
	easeOutBounce,
	easeInOutBounce,
	easings,
} from '../utils/easing';
import {
	createTweenPlugin,
	createTween,
	createTweenSequence,
	createTweenHelpers,
	type TweenEventData,
	type NumericPaths,
	type TypedTweenTargetInput,
} from './tween';

// ==================== Test Type Definitions ====================

interface TestComponents {
	position: { x: number; y: number };
	opacity: { value: number };
	transform: { position: { x: number; y: number }; scale: { x: number; y: number } };
	health: { current: number; max: number };
	tag: string;
}

interface TestEvents {
	fadeComplete: TweenEventData;
}

interface TestResources {}

function createTestEcs() {
	return ECSpresso
		.create<TestComponents, TestEvents, TestResources>()
		.withPlugin(createTweenPlugin())
		.build();
}


// ==================== Easing Math ====================

describe('Easing Functions', () => {
	const allEasings = [
		{ name: 'linear', fn: linear },
		{ name: 'easeInQuad', fn: easeInQuad },
		{ name: 'easeOutQuad', fn: easeOutQuad },
		{ name: 'easeInOutQuad', fn: easeInOutQuad },
		{ name: 'easeInCubic', fn: easeInCubic },
		{ name: 'easeOutCubic', fn: easeOutCubic },
		{ name: 'easeInOutCubic', fn: easeInOutCubic },
		{ name: 'easeInQuart', fn: easeInQuart },
		{ name: 'easeOutQuart', fn: easeOutQuart },
		{ name: 'easeInOutQuart', fn: easeInOutQuart },
		{ name: 'easeInQuint', fn: easeInQuint },
		{ name: 'easeOutQuint', fn: easeOutQuint },
		{ name: 'easeInOutQuint', fn: easeInOutQuint },
		{ name: 'easeInSine', fn: easeInSine },
		{ name: 'easeOutSine', fn: easeOutSine },
		{ name: 'easeInOutSine', fn: easeInOutSine },
		{ name: 'easeInExpo', fn: easeInExpo },
		{ name: 'easeOutExpo', fn: easeOutExpo },
		{ name: 'easeInOutExpo', fn: easeInOutExpo },
		{ name: 'easeInCirc', fn: easeInCirc },
		{ name: 'easeOutCirc', fn: easeOutCirc },
		{ name: 'easeInOutCirc', fn: easeInOutCirc },
		{ name: 'easeInBack', fn: easeInBack },
		{ name: 'easeOutBack', fn: easeOutBack },
		{ name: 'easeInOutBack', fn: easeInOutBack },
		{ name: 'easeInElastic', fn: easeInElastic },
		{ name: 'easeOutElastic', fn: easeOutElastic },
		{ name: 'easeInOutElastic', fn: easeInOutElastic },
		{ name: 'easeInBounce', fn: easeInBounce },
		{ name: 'easeOutBounce', fn: easeOutBounce },
		{ name: 'easeInOutBounce', fn: easeInOutBounce },
	] as const;

	test('all 31 easing functions are exported', () => {
		expect(allEasings.length).toBe(31);
	});

	for (const { name, fn } of allEasings) {
		test(`${name}: f(0) === 0`, () => {
			expect(fn(0)).toBeCloseTo(0, 10);
		});

		test(`${name}: f(1) === 1`, () => {
			expect(fn(1)).toBeCloseTo(1, 10);
		});
	}

	test('easeInQuad is non-linear (midpoint is not 0.5)', () => {
		expect(easeInQuad(0.5)).not.toBeCloseTo(0.5, 5);
	});

	test('easeOutQuad is non-linear (midpoint is not 0.5)', () => {
		expect(easeOutQuad(0.5)).not.toBeCloseTo(0.5, 5);
	});

	test('easeInOutQuad is symmetric around 0.5', () => {
		// easeInOut(0.5) should equal 0.5 for symmetric easings
		expect(easeInOutQuad(0.5)).toBeCloseTo(0.5, 10);
	});

	test('easings record contains all 31 functions by name', () => {
		expect(Object.keys(easings).length).toBe(31);
		expect(easings.linear).toBe(linear);
		expect(easings.easeInQuad).toBe(easeInQuad);
		expect(easings.easeOutBounce).toBe(easeOutBounce);
	});
});

// ==================== Basic Interpolation ====================

describe('Basic Interpolation', () => {
	test('should interpolate a single field from 0 to 100 over 1 second', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1),
		});

		ecs.update(0.5);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		expect(pos.x).toBeCloseTo(50, 1);
	});

	test('should reach exact target value at completion', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1),
		});

		ecs.update(1.0);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		expect(pos.x).toBe(100);
	});

	test('should not modify other fields', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 42 },
			...createTween('position', 'x', 100, 1),
		});

		ecs.update(0.5);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		expect(pos.y).toBe(42);
	});
});

// ==================== Explicit From ====================

describe('Explicit From', () => {
	test('should start interpolation from explicit from value', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1, { from: 50 }),
		});

		// After first tick, position should start from 50
		ecs.update(0);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		expect(pos.x).toBe(50);
	});

	test('should interpolate between explicit from and to', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1, { from: 50 }),
		});

		ecs.update(0.5);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		expect(pos.x).toBeCloseTo(75, 1);
	});
});

// ==================== Implicit From (null) ====================

describe('Implicit From', () => {
	test('should capture current value as from on first tick', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 25, y: 0 },
			...createTween('position', 'x', 100, 1),
		});

		ecs.update(0.5);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		// from=25, to=100, halfway should be ~62.5
		expect(pos.x).toBeCloseTo(62.5, 1);
	});
});

// ==================== Nested Paths ====================

describe('Nested Paths', () => {
	test('should tween nested fields via dot-separated path', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } },
			...createTween('transform', 'position.x', 100, 1),
		});

		ecs.update(0.5);

		const t = ecs.entityManager.getComponent(entity.id, 'transform');
		if (!t) throw new Error('Expected transform');
		expect(t.position.x).toBeCloseTo(50, 1);
		// Other nested fields untouched
		expect(t.position.y).toBe(0);
		expect(t.scale.x).toBe(1);
	});

	test('should tween deeply nested paths', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } },
			...createTween('transform', 'scale.y', 2, 1),
		});

		ecs.update(1.0);

		const t = ecs.entityManager.getComponent(entity.id, 'transform');
		if (!t) throw new Error('Expected transform');
		expect(t.scale.y).toBe(2);
	});
});

// ==================== Easing Applied ====================

describe('Easing Applied', () => {
	test('should apply non-linear easing', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1, { easing: easeInQuad }),
		});

		ecs.update(0.5);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		// easeInQuad(0.5) = 0.25, so value should be 25
		expect(pos.x).toBeCloseTo(25, 1);
	});

	test('should reach exact target value regardless of easing', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1, { easing: easeInOutCubic }),
		});

		ecs.update(1.0);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		expect(pos.x).toBe(100);
	});
});

// ==================== Step Completion ====================

describe('Step Completion', () => {
	test('should remove tween component after completion', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1),
		});

		ecs.update(1.0);
		// Command buffer plays back between phases, need another update
		ecs.update(0);

		const tween = ecs.entityManager.getComponent(entity.id, 'tween');
		expect(tween).toBeUndefined();
	});

	test('should NOT remove entity after tween completes', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1),
		});

		ecs.update(1.0);
		ecs.update(0);

		const e = ecs.entityManager.getEntity(entity.id);
		expect(e).toBeDefined();
	});
});

// ==================== Completion Event ====================

describe('Completion Event', () => {
	test('should fire onComplete callback with TweenEventData', () => {
		const ecs = createTestEcs();

		const events: TweenEventData[] = [];

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1, {
				onComplete: (data) => { events.push(data); },
			}),
		});

		ecs.update(1.0);

		expect(events.length).toBe(1);
		const eventData = events[0];
		if (!eventData) throw new Error('Expected event data');
		expect(eventData.entityId).toBe(entity.id);
		expect(eventData.stepCount).toBe(1);
	});

	test('should fire onComplete only once', () => {
		const ecs = createTestEcs();

		let fireCount = 0;

		ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1, {
				onComplete: () => { fireCount++; },
			}),
		});

		ecs.update(1.0);
		ecs.update(0.1);
		ecs.update(0.1);

		expect(fireCount).toBe(1);
	});
});

// ==================== justFinished Flag ====================

describe('justFinished Flag', () => {
	test('should be true for one frame after completion (observable by same-phase system)', () => {
		const ecs = ECSpresso
			.create<TestComponents, TestEvents, TestResources>()
			.withPlugin(createTweenPlugin())
			.build();

		let sawJustFinished = false;

		// Lower priority system in same phase runs after tween-update
		ecs.addSystem('observe-finished')
			.inPhase('update')
			.setPriority(-1)
			.addQuery('tweens', { with: ['tween'] })
			.setProcess((queries) => {
				for (const entity of queries.tweens) {
					if (entity.components.tween.justFinished) {
						sawJustFinished = true;
					}
				}
			})
			.and();

		ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 0.5),
		});

		ecs.update(0.5);

		expect(sawJustFinished).toBe(true);
	});

	test('should be false before completion', () => {
		const ecs = ECSpresso
			.create<TestComponents, TestEvents, TestResources>()
			.withPlugin(createTweenPlugin())
			.build();

		let sawJustFinished = false;

		ecs.addSystem('observe-finished')
			.inPhase('update')
			.setPriority(-1)
			.addQuery('tweens', { with: ['tween'] })
			.setProcess((queries) => {
				for (const entity of queries.tweens) {
					if (entity.components.tween.justFinished) {
						sawJustFinished = true;
					}
				}
			})
			.and();

		ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1),
		});

		ecs.update(0.5);

		expect(sawJustFinished).toBe(false);
	});
});

// ==================== Loop Once ====================

describe('Loop Once', () => {
	test('default loop mode is once, tween removed after completion', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1),
		});

		ecs.update(1.0);
		ecs.update(0);

		const tween = ecs.entityManager.getComponent(entity.id, 'tween');
		expect(tween).toBeUndefined();
	});
});

// ==================== Loop Repeat ====================

describe('Loop Repeat', () => {
	test('should restart from beginning after completion', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1, { loop: 'loop', loops: 2 }),
		});

		// Complete first loop
		ecs.update(1.0);

		const pos1 = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos1) throw new Error('Expected position');
		expect(pos1.x).toBe(100);

		// Should restart - halfway through second loop
		ecs.update(0.5);

		const pos2 = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos2) throw new Error('Expected position');
		expect(pos2.x).toBeCloseTo(50, 1);
	});

	test('should decrement loop count and stop when exhausted', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1, { loop: 'loop', loops: 2 }),
		});

		// Complete first loop
		ecs.update(1.0);
		// Complete second loop
		ecs.update(1.0);
		// Tween should be complete now, removed on next tick
		ecs.update(0);

		const tween = ecs.entityManager.getComponent(entity.id, 'tween');
		expect(tween).toBeUndefined();
	});
});

// ==================== Loop Yoyo ====================

describe('Loop Yoyo', () => {
	test('should reverse direction after completing forward', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1, { loop: 'yoyo', loops: 2 }),
		});

		// Complete forward pass
		ecs.update(1.0);

		const pos1 = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos1) throw new Error('Expected position');
		expect(pos1.x).toBe(100);

		// Halfway through reverse pass
		ecs.update(0.5);

		const pos2 = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos2) throw new Error('Expected position');
		expect(pos2.x).toBeCloseTo(50, 1);
	});

	test('should return to original value after yoyo reverse', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1, { loop: 'yoyo', loops: 2 }),
		});

		// Complete forward
		ecs.update(1.0);
		// Complete reverse
		ecs.update(1.0);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		expect(pos.x).toBeCloseTo(0, 1);
	});
});

// ==================== Infinite Loop ====================

describe('Infinite Loop', () => {
	test('should never complete with loops: -1', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1, { loop: 'loop', loops: -1 }),
		});

		// Run through many loops
		for (let i = 0; i < 10; i++) {
			ecs.update(1.0);
		}

		const tween = ecs.entityManager.getComponent(entity.id, 'tween');
		expect(tween).toBeDefined();
	});
});

// ==================== Sequences ====================

describe('Sequences', () => {
	test('should execute steps in order', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTweenSequence([
				{ targets: [{ component: 'position', field: 'x', to: 100 }], duration: 1 },
				{ targets: [{ component: 'position', field: 'y', to: 200 }], duration: 1 },
			]),
		});

		// Complete first step
		ecs.update(1.0);

		const pos1 = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos1) throw new Error('Expected position');
		expect(pos1.x).toBe(100);
		expect(pos1.y).toBe(0);

		// Complete second step
		ecs.update(1.0);

		const pos2 = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos2) throw new Error('Expected position');
		expect(pos2.x).toBe(100);
		expect(pos2.y).toBe(200);
	});

	test('should carry overflow time to next step', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTweenSequence([
				{ targets: [{ component: 'position', field: 'x', to: 100 }], duration: 0.5 },
				{ targets: [{ component: 'position', field: 'y', to: 200 }], duration: 1 },
			]),
		});

		// 0.7s: first step completes at 0.5, 0.2s overflows into second step
		ecs.update(0.7);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		expect(pos.x).toBe(100);
		// 0.2/1.0 = 0.2 progress on second step: 0 + (200 - 0) * 0.2 = 40
		expect(pos.y).toBeCloseTo(40, 1);
	});
});

// ==================== Parallel Targets ====================

describe('Parallel Targets', () => {
	test('should animate multiple targets in same step simultaneously', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			opacity: { value: 1 },
			...createTweenSequence([
				{
					targets: [
						{ component: 'position', field: 'x', to: 100 },
						{ component: 'opacity', field: 'value', to: 0 },
					],
					duration: 1,
				},
			]),
		});

		ecs.update(0.5);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		const opacity = ecs.entityManager.getComponent(entity.id, 'opacity');
		if (!pos || !opacity) throw new Error('Expected components');
		expect(pos.x).toBeCloseTo(50, 1);
		expect(opacity.value).toBeCloseTo(0.5, 1);
	});
});

// ==================== Zero Duration ====================

describe('Zero Duration', () => {
	test('should apply target value immediately', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 0),
		});

		ecs.update(0);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		expect(pos.x).toBe(100);
	});
});

// ==================== Missing Target Component ====================

describe('Missing Target Component', () => {
	test('should skip silently when target component is missing', () => {
		const ecs = createTestEcs();

		// Entity has no position component
		const entity = ecs.spawn({
			tag: 'test',
			...createTween('position', 'x', 100, 1),
		});

		// Should not throw
		expect(() => { ecs.update(0.5); }).not.toThrow();

		// Entity should still exist
		expect(ecs.entityManager.getEntity(entity.id)).toBeDefined();
	});
});

// ==================== Change Detection ====================

describe('Change Detection', () => {
	test('should markChanged for modified components', () => {
		const ecs = createTestEcs();

		let changedEntitySeen = false;

		ecs.addSystem('detect-changes')
			.inPhase('postUpdate')
			.addQuery('changed', {
				with: ['position'],
				changed: ['position'],
			})
			.setProcess((queries) => {
				for (const _entity of queries.changed) {
					changedEntitySeen = true;
				}
			})
			.and();

		ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1),
		});

		ecs.update(0.5);

		expect(changedEntitySeen).toBe(true);
	});
});

// ==================== Tween Replacement ====================

describe('Tween Replacement', () => {
	test('should replace old tween when new tween component is added', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 2),
		});

		// Advance halfway
		ecs.update(1.0);

		// Replace tween with new one targeting y
		ecs.entityManager.addComponent(entity.id, 'tween', createTween('position', 'y', 200, 1).tween);

		ecs.update(1.0);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		// y should have completed, x should have stayed where it was when replaced
		expect(pos.y).toBe(200);
	});
});

// ==================== Large DeltaTime ====================

describe('Large DeltaTime', () => {
	test('should process through all steps in one frame', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTweenSequence([
				{ targets: [{ component: 'position', field: 'x', to: 100 }], duration: 0.5 },
				{ targets: [{ component: 'position', field: 'y', to: 200 }], duration: 0.5 },
			]),
		});

		// 10s delta should blow through both steps
		ecs.update(10);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		expect(pos.x).toBe(100);
		expect(pos.y).toBe(200);
	});
});

// ==================== Helper API ====================

describe('Helper API', () => {
	test('createTween should produce valid tween component', () => {
		const result = createTween('position', 'x', 100, 1);
		expect(result.tween).toBeDefined();
		expect(result.tween.steps.length).toBe(1);
		const step = result.tween.steps[0];
		if (!step) throw new Error('Expected step');
		expect(step.targets.length).toBe(1);
		const target = step.targets[0];
		if (!target) throw new Error('Expected target');
		expect(target.component).toBe('position');
		expect(target.path).toEqual(['x']);
		expect(target.to).toBe(100);
		expect(target.from).toBeNull();
		expect(step.duration).toBe(1);
	});

	test('createTween should accept options', () => {
		const result = createTween('position', 'x', 100, 1, {
			from: 50,
			easing: easeInQuad,
			loop: 'yoyo',
			loops: 3,
			onComplete: () => {},
		});
		expect(result.tween.loop).toBe('yoyo');
		expect(result.tween.totalLoops).toBe(3);
		expect(typeof result.tween.onComplete).toBe('function');
		const step = result.tween.steps[0];
		if (!step) throw new Error('Expected step');
		expect(step.easing).toBe(easeInQuad);
		const target = step.targets[0];
		if (!target) throw new Error('Expected target');
		expect(target.from).toBe(50);
	});

	test('createTween should split dot-separated paths', () => {
		const result = createTween('transform', 'position.x', 100, 1);
		const target = result.tween.steps[0]?.targets[0];
		if (!target) throw new Error('Expected target');
		expect(target.path).toEqual(['position', 'x']);
	});

	test('createTweenSequence should produce valid multi-step tween', () => {
		const result = createTweenSequence([
			{ targets: [{ component: 'position', field: 'x', to: 100 }], duration: 0.5 },
			{
				targets: [
					{ component: 'position', field: 'y', to: 200 },
					{ component: 'opacity', field: 'value', to: 0 },
				],
				duration: 0.5,
				easing: easeOutQuad,
			},
		]);
		expect(result.tween.steps.length).toBe(2);
		const step1 = result.tween.steps[0];
		const step2 = result.tween.steps[1];
		if (!step1 || !step2) throw new Error('Expected steps');
		expect(step1.targets.length).toBe(1);
		expect(step2.targets.length).toBe(2);
		expect(step2.easing).toBe(easeOutQuad);
	});

	test('createTweenSequence should accept options', () => {
		const result = createTweenSequence(
			[{ targets: [{ component: 'position', field: 'x', to: 100 }], duration: 1 }],
			{ onComplete: () => {}, loop: 'loop', loops: 5 },
		);
		expect(typeof result.tween.onComplete).toBe('function');
		expect(result.tween.loop).toBe('loop');
		expect(result.tween.totalLoops).toBe(5);
	});
});

// ==================== Sequence with Per-Step Easing ====================

describe('Sequence with Per-Step Easing', () => {
	test('each step should use its own easing function', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTweenSequence([
				{
					targets: [{ component: 'position', field: 'x', to: 100 }],
					duration: 1,
					easing: easeInQuad,
				},
				{
					targets: [{ component: 'position', field: 'y', to: 100 }],
					duration: 1,
					// defaults to linear
				},
			]),
		});

		// Halfway through step 1 (easeInQuad)
		ecs.update(0.5);
		const pos1 = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos1) throw new Error('Expected position');
		// easeInQuad(0.5) = 0.25
		expect(pos1.x).toBeCloseTo(25, 1);

		// Complete step 1, halfway through step 2 (linear)
		ecs.update(1.0);
		const pos2 = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos2) throw new Error('Expected position');
		expect(pos2.x).toBe(100);
		// linear(0.5) = 0.5
		expect(pos2.y).toBeCloseTo(50, 1);
	});
});

// ==================== Entity Removal Mid-Tween ====================

describe('Entity Removal Mid-Tween', () => {
	test('should not crash when entity is removed during tween', () => {
		const ecs = createTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 2),
		});

		ecs.update(0.5);
		ecs.removeEntity(entity.id);

		// Should not throw
		expect(() => { ecs.update(0.5); }).not.toThrow();
	});
});

// ==================== Plugin Options ====================

describe('Plugin Options', () => {
	test('should respect custom phase', () => {
		const ecs = ECSpresso
			.create<TestComponents, TestEvents, TestResources>()
			.withPlugin(createTweenPlugin({ phase: 'postUpdate' }))
			.build();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...createTween('position', 'x', 100, 1),
		});

		ecs.update(0.5);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		// Should still work in postUpdate phase
		expect(pos.x).toBeCloseTo(50, 1);
	});
});

// ==================== createTweenHelpers ====================

function createHelpersTestEcs() {
	const ecs = ECSpresso
		.create<TestComponents, TestEvents, TestResources>()
		.withPlugin(createTweenPlugin())
		.build();
	const helpers = createTweenHelpers<typeof ecs>();
	return { ecs, helpers };
}

describe('createTweenHelpers', () => {
	// Helper to assert type assignability without triggering noUnusedLocals
	function assertType<T>(_value: T): void {}

	// ---- Type assertion tests ----

	test('NumericPaths produces flat numeric field names', () => {
		type Result = NumericPaths<{ x: number; y: number }>;
		assertType<Result>('x');
		assertType<Result>('y');
		// @ts-expect-error - 'z' is not a key
		assertType<Result>('z');
	});

	test('NumericPaths produces dot-paths for nested objects', () => {
		type Result = NumericPaths<{ position: { x: number; y: number } }>;
		assertType<Result>('position.x');
		assertType<Result>('position.y');
		// @ts-expect-error - 'position' alone is not a numeric path
		assertType<Result>('position');
	});

	test('NumericPaths excludes non-numeric fields', () => {
		type Result = NumericPaths<{ x: number; name: string; active: boolean }>;
		assertType<Result>('x');
		// @ts-expect-error - string field is not numeric
		assertType<Result>('name');
		// @ts-expect-error - boolean field is not numeric
		assertType<Result>('active');
	});

	test('NumericPaths returns never for non-object types', () => {
		type Result = NumericPaths<string>;
		// @ts-expect-error - string has no numeric paths
		assertType<Result>('length');
	});

	test('TypedTweenTargetInput constrains field per component', () => {
		type Input = TypedTweenTargetInput<{ position: { x: number; y: number }; health: { current: number; max: number } }>;
		assertType<Input>({ component: 'position', field: 'x', to: 10 });
		assertType<Input>({ component: 'health', field: 'current', to: 50 });
		// @ts-expect-error - 'current' is not a field of position
		assertType<Input>({ component: 'position', field: 'current', to: 10 });
	});

	test('Helpers createTween rejects invalid component name', () => {
		const { helpers } = createHelpersTestEcs();
		// @ts-expect-error - 'nonexistent' is not a component
		helpers.createTween('nonexistent', 'x', 100, 1);
	});

	test('Helpers createTween rejects invalid field path', () => {
		const { helpers } = createHelpersTestEcs();
		// @ts-expect-error - 'z' is not a field of position
		helpers.createTween('position', 'z', 100, 1);
	});

	test('Helpers createTween rejects fields on non-tweeable component', () => {
		const { helpers } = createHelpersTestEcs();
		// @ts-expect-error - tag is a string, has no numeric paths
		helpers.createTween('tag', 'length', 100, 1);
	});

	test('Helpers createTween accepts valid component and field', () => {
		const { helpers } = createHelpersTestEcs();
		// Flat field
		helpers.createTween('position', 'x', 100, 1);
		// Nested dot-path
		helpers.createTween('transform', 'position.x', 100, 1);
		helpers.createTween('transform', 'scale.y', 2, 0.5);
	});

	test('Helpers createTweenSequence rejects invalid component/field in targets', () => {
		const { helpers } = createHelpersTestEcs();
		helpers.createTweenSequence([
			{
				targets: [
					// @ts-expect-error - 'z' is not a field of position
					{ component: 'position', field: 'z', to: 100 },
				],
				duration: 1,
			},
		]);
	});

	test('Helpers createTweenSequence accepts valid mixed-component targets', () => {
		const { helpers } = createHelpersTestEcs();
		helpers.createTweenSequence([
			{
				targets: [
					{ component: 'position', field: 'x', to: 100 },
					{ component: 'opacity', field: 'value', to: 0 },
				],
				duration: 1,
			},
			{
				targets: [
					{ component: 'transform', field: 'scale.x', to: 2 },
				],
				duration: 0.5,
			},
		]);
	});

	// ---- Runtime behavior tests ----

	test('Helpers plugin installs and processes tweens (interpolation at 0.5s)', () => {
		const { ecs, helpers } = createHelpersTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...helpers.createTween('position', 'x', 100, 1),
		});

		ecs.update(0.5);

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		expect(pos.x).toBeCloseTo(50, 1);
	});

	test('Helpers tween completes and removes component', () => {
		const { ecs, helpers } = createHelpersTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...helpers.createTween('position', 'x', 100, 1),
		});

		ecs.update(1.0);
		ecs.update(0);

		const tween = ecs.entityManager.getComponent(entity.id, 'tween');
		expect(tween).toBeUndefined();

		const pos = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos) throw new Error('Expected position');
		expect(pos.x).toBe(100);
	});

	test('Helpers sequence executes steps in order', () => {
		const { ecs, helpers } = createHelpersTestEcs();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...helpers.createTweenSequence([
				{ targets: [{ component: 'position', field: 'x', to: 100 }], duration: 1 },
				{ targets: [{ component: 'position', field: 'y', to: 200 }], duration: 1 },
			]),
		});

		ecs.update(1.0);
		const pos1 = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos1) throw new Error('Expected position');
		expect(pos1.x).toBe(100);
		expect(pos1.y).toBe(0);

		ecs.update(1.0);
		const pos2 = ecs.entityManager.getComponent(entity.id, 'position');
		if (!pos2) throw new Error('Expected position');
		expect(pos2.x).toBe(100);
		expect(pos2.y).toBe(200);
	});

	test('Helpers onComplete callback fires with correct data', () => {
		const { ecs, helpers } = createHelpersTestEcs();

		const events: TweenEventData[] = [];

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			...helpers.createTween('position', 'x', 100, 1, {
				onComplete: (data) => { events.push(data); },
			}),
		});

		ecs.update(1.0);

		expect(events.length).toBe(1);
		const eventData = events[0];
		if (!eventData) throw new Error('Expected event data');
		expect(eventData.entityId).toBe(entity.id);
		expect(eventData.stepCount).toBe(1);
	});

	test('onComplete callback receives TweenEventData', () => {
		createTween('position', 'x', 100, 1, {
			onComplete: (data) => {
				// Type assertions - these would fail to compile if types are wrong
				assertType<number>(data.entityId);
				assertType<number>(data.stepCount);
			}
		});
	});

	test('Helpers tween with nested dot-path works at runtime', () => {
		const { ecs, helpers } = createHelpersTestEcs();

		const entity = ecs.spawn({
			transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 } },
			...helpers.createTween('transform', 'position.x', 100, 1),
		});

		ecs.update(0.5);

		const t = ecs.entityManager.getComponent(entity.id, 'transform');
		if (!t) throw new Error('Expected transform');
		expect(t.position.x).toBeCloseTo(50, 1);
		expect(t.position.y).toBe(0);
		expect(t.scale.x).toBe(1);
	});
});
