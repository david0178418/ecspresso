import { describe, test, expect } from 'bun:test';
import ECSpresso from '../ecspresso';
import {
	defineSpriteAnimation,
	defineSpriteAnimations,
	createSpriteAnimation,
	createSpriteAnimationPlugin,
	createSpriteAnimationHelpers,
	playAnimation,
	stopAnimation,
	resumeAnimation,
	type SpriteAnimation,
	type SpriteAnimationComponentTypes,
	type SpriteAnimationEventData,
	type AnimationLoopMode,
} from './sprite-animation';

// ==================== Test Helpers ====================

/** Fake texture objects — just need to be distinct references */
function makeFrames(count: number): object[] {
	return Array.from({ length: count }, (_, i) => ({ _frame: i }));
}

interface TestComponents extends SpriteAnimationComponentTypes {
	position: { x: number; y: number };
	sprite: { texture: unknown };
}

interface TestEvents {
	animDone: SpriteAnimationEventData;
	walkComplete: SpriteAnimationEventData;
}

function createTestEcs() {
	return ECSpresso
		.create<TestComponents, TestEvents, {}>()
		.withPlugin(createSpriteAnimationPlugin())
		.build();
}

// ==================== Tests ====================

describe('Sprite Animation Plugin', () => {

	// ==================== defineSpriteAnimation ====================

	describe('defineSpriteAnimation', () => {
		test('creates set with single default clip', () => {
			const frames = makeFrames(4);
			const set = defineSpriteAnimation('coin', {
				frames,
				frameDuration: 0.1,
			});

			expect(set.id).toBe('coin');
			expect(set.defaultClip).toBe('default');
			expect(Object.keys(set.clips)).toEqual(['default']);
			expect(set.clips.default.frames.length).toBe(4);
			expect(set.clips.default.frameDuration).toBe(0.1);
			expect(set.clips.default.frameDurations).toBeNull();
			expect(set.clips.default.loop).toBe('loop');
		});

		test('respects loop mode override', () => {
			const set = defineSpriteAnimation('explosion', {
				frames: makeFrames(3),
				frameDuration: 0.05,
				loop: 'once',
			});

			expect(set.clips.default.loop).toBe('once');
		});

		test('respects per-frame durations', () => {
			const durations = [0.1, 0.2, 0.3];
			const set = defineSpriteAnimation('varied', {
				frames: makeFrames(3),
				frameDurations: durations,
			});

			expect(set.clips.default.frameDurations).toEqual(durations);
		});

		test('defaults frameDuration to 1/10', () => {
			const set = defineSpriteAnimation('default-timing', {
				frames: makeFrames(2),
			});

			expect(set.clips.default.frameDuration).toBe(1 / 10);
		});

		test('returns a frozen object', () => {
			const set = defineSpriteAnimation('frozen', {
				frames: makeFrames(2),
				frameDuration: 0.1,
			});

			expect(Object.isFrozen(set)).toBe(true);
			expect(Object.isFrozen(set.clips)).toBe(true);
			expect(Object.isFrozen(set.clips.default)).toBe(true);
			expect(Object.isFrozen(set.clips.default.frames)).toBe(true);
		});
	});

	// ==================== defineSpriteAnimations ====================

	describe('defineSpriteAnimations', () => {
		test('creates set with named clips and infers names', () => {
			const set = defineSpriteAnimations('player', {
				idle: { frames: makeFrames(4), frameDuration: 0.15 },
				walk: { frames: makeFrames(6), frameDuration: 0.1 },
				attack: { frames: makeFrames(3), frameDuration: 0.05, loop: 'once' },
			});

			expect(set.id).toBe('player');
			expect(Object.keys(set.clips).sort()).toEqual(['attack', 'idle', 'walk']);
			expect(set.clips.idle.frames.length).toBe(4);
			expect(set.clips.walk.frameDuration).toBe(0.1);
			expect(set.clips.attack.loop).toBe('once');
		});

		test('defaults to first clip', () => {
			const set = defineSpriteAnimations('enemy', {
				patrol: { frames: makeFrames(2), frameDuration: 0.1 },
				chase: { frames: makeFrames(3), frameDuration: 0.08 },
			});

			expect(set.defaultClip).toBe('patrol');
		});

		test('respects explicit defaultClip', () => {
			const set = defineSpriteAnimations('enemy', {
				patrol: { frames: makeFrames(2), frameDuration: 0.1 },
				chase: { frames: makeFrames(3), frameDuration: 0.08 },
			}, { defaultClip: 'chase' });

			expect(set.defaultClip).toBe('chase');
		});

		test('returns a frozen object', () => {
			const set = defineSpriteAnimations('frozen', {
				a: { frames: makeFrames(2), frameDuration: 0.1 },
				b: { frames: makeFrames(2), frameDuration: 0.1 },
			});

			expect(Object.isFrozen(set)).toBe(true);
			expect(Object.isFrozen(set.clips)).toBe(true);
			expect(Object.isFrozen(set.clips.a)).toBe(true);
			expect(Object.isFrozen(set.clips.b)).toBe(true);
		});

		test('throws on empty clips object', () => {
			expect(() => {
				defineSpriteAnimations('empty', {} as Record<never, never>);
			}).toThrow();
		});
	});

	// ==================== createSpriteAnimation ====================

	describe('createSpriteAnimation', () => {
		const set = defineSpriteAnimations('hero', {
			idle: { frames: makeFrames(4), frameDuration: 0.15 },
			run: { frames: makeFrames(6), frameDuration: 0.1, loop: 'loop' },
		});

		test('produces valid component with defaults', () => {
			const result = createSpriteAnimation(set);

			expect(result.spriteAnimation.set).toBe(set);
			expect(result.spriteAnimation.current).toBe('idle');
			expect(result.spriteAnimation.currentFrame).toBe(0);
			expect(result.spriteAnimation.elapsed).toBe(0);
			expect(result.spriteAnimation.playing).toBe(true);
			expect(result.spriteAnimation.speed).toBe(1);
			expect(result.spriteAnimation.direction).toBe(1);
			expect(result.spriteAnimation.totalLoops).toBe(-1);
			expect(result.spriteAnimation.completedLoops).toBe(0);
			expect(result.spriteAnimation.justFinished).toBe(false);
			expect(result.spriteAnimation.onComplete).toBeUndefined();
		});

		test('respects initial clip option', () => {
			const result = createSpriteAnimation(set, { initial: 'run' });

			expect(result.spriteAnimation.current).toBe('run');
		});

		test('respects speed option', () => {
			const result = createSpriteAnimation(set, { speed: 2 });

			expect(result.spriteAnimation.speed).toBe(2);
		});

		test('respects totalLoops option', () => {
			const result = createSpriteAnimation(set, { totalLoops: 3 });

			expect(result.spriteAnimation.totalLoops).toBe(3);
		});

		test('respects onComplete option', () => {
			const result = createSpriteAnimation(set, {
				onComplete: 'animDone',
			});

			expect(result.spriteAnimation.onComplete).toBe('animDone');
		});
	});

	// ==================== Type Assertions ====================

	describe('type assertions', () => {
		test('AnimationLoopMode is the correct union', () => {
			const modes: AnimationLoopMode[] = ['once', 'loop', 'pingPong'];
			expect(modes).toHaveLength(3);
		});

		test('SpriteAnimationEventData has expected shape', () => {
			const data: SpriteAnimationEventData = { entityId: 1, animation: 'idle' };
			expect(data.entityId).toBe(1);
			expect(data.animation).toBe('idle');
		});

		test('SpriteAnimationComponentTypes narrows current to A', () => {
			const set = defineSpriteAnimations('typed', {
				walk: { frames: makeFrames(2), frameDuration: 0.1 },
				run: { frames: makeFrames(2), frameDuration: 0.1 },
			});
			const comp = createSpriteAnimation(set);
			// TypeScript narrows current to 'walk' | 'run'
			const _current: 'walk' | 'run' = comp.spriteAnimation.current;
			expect(['walk', 'run']).toContain(_current);
		});
	});

	// ==================== Frame Advancement ====================

	describe('frame advancement', () => {
		test('uniform timing: frame advances after frameDuration elapsed', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(4);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			// Not enough time to advance
			ecs.update(0.05);
			expect(getAnim().currentFrame).toBe(0);

			// Enough time to advance one frame
			ecs.update(0.05);
			expect(getAnim().currentFrame).toBe(1);

			// Advance another frame
			ecs.update(0.1);
			expect(getAnim().currentFrame).toBe(2);
		});

		test('per-frame timing: respects individual frame durations', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(3);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDurations: [0.1, 0.2, 0.3],
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			// Frame 0 has duration 0.1
			ecs.update(0.1);
			expect(getAnim().currentFrame).toBe(1);

			// Frame 1 has duration 0.2
			ecs.update(0.1);
			expect(getAnim().currentFrame).toBe(1);
			ecs.update(0.1);
			expect(getAnim().currentFrame).toBe(2);
		});

		test('speed multiplier: 2x speed advances twice as fast', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(4);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set, { speed: 2 }),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			// 0.05s * 2x speed = 0.1s effective, should advance one frame
			ecs.update(0.05);
			expect(getAnim().currentFrame).toBe(1);
		});

		test('paused animation does not advance', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(4);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			stopAnimation(ecs, entity.id);

			ecs.update(0.5);
			expect(getAnim().currentFrame).toBe(0);
		});

		test('frame overflow: large deltaTime processes multiple frames', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(4);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			// 0.25s should advance through frames 0→1→2 with 0.05s overflow
			ecs.update(0.25);
			expect(getAnim().currentFrame).toBe(2);
		});

		test('single frame clip does not advance', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(1);
			const set = defineSpriteAnimation('single', {
				frames,
				frameDuration: 0.1,
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			ecs.update(1.0);
			expect(getAnim().currentFrame).toBe(0);
		});
	});

	// ==================== Loop Modes ====================

	describe('loop modes', () => {
		test('once: plays through, sets justFinished, removes component', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(3);
			const set = defineSpriteAnimation('explosion', {
				frames,
				frameDuration: 0.1,
				loop: 'once',
			});

			// Observe justFinished via lower-priority system (command buffer
			// removes component after the phase, so direct inspection after
			// ecs.update() sees undefined)
			let sawJustFinished = false;
			ecs.addSystem('observe-finished')
				.inPhase('update')
				.setPriority(-1)
				.addQuery('anims', { with: ['spriteAnimation'] })
				.setProcess((queries) => {
					for (const e of queries.anims) {
						if ((e.components.spriteAnimation as SpriteAnimation).justFinished) {
							sawJustFinished = true;
						}
					}
				})
				.and();

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation | undefined;

			// Play through all frames: 0.1 (→frame1) + 0.1 (→frame2) + 0.1 (→boundary)
			ecs.update(0.3);
			expect(sawJustFinished).toBe(true);

			// Component removed after command buffer playback
			expect(getAnim()).toBeUndefined();
		});

		test('loop: wraps to frame 0 after last frame', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(3);
			const set = defineSpriteAnimation('walk', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			// 3 frames * 0.1s = 0.3s to complete one loop, should wrap
			ecs.update(0.3);
			expect(getAnim().currentFrame).toBe(0);
			expect(getAnim().completedLoops).toBe(1);
		});

		test('loop with totalLoops: stops after N loops', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(2);
			const set = defineSpriteAnimation('flash', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			let sawJustFinished = false;
			ecs.addSystem('observe-finished')
				.inPhase('update')
				.setPriority(-1)
				.addQuery('anims', { with: ['spriteAnimation'] })
				.setProcess((queries) => {
					for (const e of queries.anims) {
						if ((e.components.spriteAnimation as SpriteAnimation).justFinished) {
							sawJustFinished = true;
						}
					}
				})
				.and();

			const entity = ecs.spawn({
				...createSpriteAnimation(set, { totalLoops: 2 }),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation | undefined;

			// First loop: 2 frames * 0.1s = 0.2s
			ecs.update(0.2);
			expect(getAnim()?.completedLoops).toBe(1);
			expect(getAnim()?.playing).toBe(true);

			// Second loop completes → should finish (component removed by command buffer)
			ecs.update(0.2);
			expect(sawJustFinished).toBe(true);
			expect(getAnim()).toBeUndefined();
		});

		test('loop with totalLoops=-1: never stops', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(2);
			const set = defineSpriteAnimation('forever', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set, { totalLoops: -1 }),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			// Run through many loops
			for (let i = 0; i < 10; i++) {
				ecs.update(0.2);
			}
			expect(getAnim().playing).toBe(true);
			expect(getAnim().completedLoops).toBe(10);
		});

		test('pingPong: reverses at boundaries', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(3);
			const set = defineSpriteAnimation('bounce', {
				frames,
				frameDuration: 0.1,
				loop: 'pingPong',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			// Forward: 0→1→2
			ecs.update(0.1);
			expect(getAnim().currentFrame).toBe(1);
			ecs.update(0.1);
			expect(getAnim().currentFrame).toBe(2);

			// Hit boundary, reverse: should go to 1
			ecs.update(0.1);
			expect(getAnim().currentFrame).toBe(1);
			expect(getAnim().direction).toBe(-1);

			// Continue reverse: 1→0
			ecs.update(0.1);
			expect(getAnim().currentFrame).toBe(0);

			// Hit boundary again, forward: should go to 1
			ecs.update(0.1);
			expect(getAnim().currentFrame).toBe(1);
			expect(getAnim().direction).toBe(1);
		});

		test('pingPong respects totalLoops', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(3);
			const set = defineSpriteAnimation('pp-limited', {
				frames,
				frameDuration: 0.1,
				loop: 'pingPong',
			});

			let sawJustFinished = false;
			ecs.addSystem('observe-finished')
				.inPhase('update')
				.setPriority(-1)
				.addQuery('anims', { with: ['spriteAnimation'] })
				.setProcess((queries) => {
					for (const e of queries.anims) {
						if ((e.components.spriteAnimation as SpriteAnimation).justFinished) {
							sawJustFinished = true;
						}
					}
				})
				.and();

			const entity = ecs.spawn({
				...createSpriteAnimation(set, { totalLoops: 2 }),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation | undefined;

			// 3 frames: 0→1→2 (boundary at frame 3, loop 1) = 0.3s
			ecs.update(0.3);
			expect(getAnim()?.completedLoops).toBe(1);
			expect(getAnim()?.direction).toBe(-1);

			// Reverse: 2→1→0 (boundary at frame -1, loop 2 → completes) = 0.3s
			ecs.update(0.3);
			expect(sawJustFinished).toBe(true);
		});
	});

	// ==================== Completion Events ====================

	describe('completion events', () => {
		test('onComplete event fires with correct data', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(2);
			const set = defineSpriteAnimation('oneshot', {
				frames,
				frameDuration: 0.1,
				loop: 'once',
			});

			const received: SpriteAnimationEventData[] = [];
			ecs.on('animDone', (data) => { received.push(data); });

			const entity = ecs.spawn({
				...createSpriteAnimation(set, { onComplete: 'animDone' }),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			ecs.update(0.2);

			expect(received).toHaveLength(1);
			expect(received[0]!.entityId).toBe(entity.id);
			expect(received[0]!.animation).toBe('default');
		});

		test('event fires only once', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(2);
			const set = defineSpriteAnimation('oneshot', {
				frames,
				frameDuration: 0.1,
				loop: 'once',
			});

			const received: SpriteAnimationEventData[] = [];
			ecs.on('animDone', (data) => { received.push(data); });

			ecs.spawn({
				...createSpriteAnimation(set, { onComplete: 'animDone' }),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			ecs.update(0.2);
			ecs.update(0.1);
			ecs.update(0.1);

			expect(received).toHaveLength(1);
		});

		test('no event when animation loops without exhausting loop count', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(2);
			const set = defineSpriteAnimation('looping', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const received: SpriteAnimationEventData[] = [];
			ecs.on('animDone', (data) => { received.push(data); });

			ecs.spawn({
				...createSpriteAnimation(set, {
					onComplete: 'animDone',
					totalLoops: -1,
				}),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			// Run through several loops
			for (let i = 0; i < 5; i++) {
				ecs.update(0.2);
			}

			expect(received).toHaveLength(0);
		});

		test('event fires when loop count exhausted', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(2);
			const set = defineSpriteAnimation('finite-loop', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const received: SpriteAnimationEventData[] = [];
			ecs.on('animDone', (data) => { received.push(data); });

			ecs.spawn({
				...createSpriteAnimation(set, {
					onComplete: 'animDone',
					totalLoops: 2,
				}),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			// Loop 1
			ecs.update(0.2);
			expect(received).toHaveLength(0);

			// Loop 2 → exhausted
			ecs.update(0.2);
			expect(received).toHaveLength(1);
		});
	});

	// ==================== justFinished Flag ====================

	describe('justFinished flag', () => {
		test('true for one frame after completion (observable by same-phase system)', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(2);
			const set = defineSpriteAnimation('oneshot', {
				frames,
				frameDuration: 0.1,
				loop: 'once',
			});

			let sawJustFinished = false;
			ecs.addSystem('observe-finished')
				.inPhase('update')
				.setPriority(-1)
				.addQuery('anims', { with: ['spriteAnimation'] })
				.setProcess((queries) => {
					for (const e of queries.anims) {
						if ((e.components.spriteAnimation as SpriteAnimation).justFinished) {
							sawJustFinished = true;
						}
					}
				})
				.and();

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation | undefined;

			// Complete the animation
			ecs.update(0.2);
			expect(sawJustFinished).toBe(true);

			// Component removed after command buffer playback
			expect(getAnim()).toBeUndefined();
		});

		test('false before completion', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(4);
			const set = defineSpriteAnimation('long', {
				frames,
				frameDuration: 0.1,
				loop: 'once',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			ecs.update(0.1);
			expect(getAnim().justFinished).toBe(false);

			ecs.update(0.1);
			expect(getAnim().justFinished).toBe(false);
		});
	});

	// ==================== Animation Switching ====================

	describe('playAnimation', () => {
		test('switches to named animation, resets state', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(4);
			const set = defineSpriteAnimations('hero', {
				idle: { frames, frameDuration: 0.15 },
				run: { frames: makeFrames(6), frameDuration: 0.1 },
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			// Advance a bit
			ecs.update(0.15);
			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;
			expect(getAnim().currentFrame).toBe(1);

			// Switch to run
			const result = playAnimation(ecs, entity.id, 'run');
			expect(result).toBe(true);
			expect(getAnim().current).toBe('run');
			expect(getAnim().currentFrame).toBe(0);
			expect(getAnim().elapsed).toBe(0);
		});

		test('returns false for nonexistent animation name', () => {
			const ecs = createTestEcs();
			const set = defineSpriteAnimation('test', {
				frames: makeFrames(2),
				frameDuration: 0.1,
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: null },
			});

			const result = playAnimation(ecs, entity.id, 'nonexistent');
			expect(result).toBe(false);
		});

		test('returns false for entity without spriteAnimation', () => {
			const ecs = createTestEcs();
			const entity = ecs.spawn({
				position: { x: 0, y: 0 },
				sprite: { texture: null },
			});

			const result = playAnimation(ecs, entity.id, 'idle');
			expect(result).toBe(false);
		});

		test('does not restart if same animation and restart=false', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(4);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			ecs.update(0.2);
			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;
			expect(getAnim().currentFrame).toBe(2);

			// Play same animation without restart
			playAnimation(ecs, entity.id, 'default', { restart: false });
			expect(getAnim().currentFrame).toBe(2);
		});

		test('restarts same animation when restart=true', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(4);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			ecs.update(0.2);
			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;
			expect(getAnim().currentFrame).toBe(2);

			playAnimation(ecs, entity.id, 'default', { restart: true });
			expect(getAnim().currentFrame).toBe(0);
			expect(getAnim().elapsed).toBe(0);
		});

		test('respects speed option', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(4);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			playAnimation(ecs, entity.id, 'default', { speed: 3 });
			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;
			expect(getAnim().speed).toBe(3);
		});
	});

	// ==================== Stop / Resume ====================

	describe('stopAnimation / resumeAnimation', () => {
		test('stops and resumes correctly', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(4);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			ecs.update(0.1);
			expect(getAnim().currentFrame).toBe(1);

			stopAnimation(ecs, entity.id);
			expect(getAnim().playing).toBe(false);

			ecs.update(0.5);
			expect(getAnim().currentFrame).toBe(1);

			resumeAnimation(ecs, entity.id);
			expect(getAnim().playing).toBe(true);

			ecs.update(0.1);
			expect(getAnim().currentFrame).toBe(2);
		});

		test('returns false for entity without spriteAnimation', () => {
			const ecs = createTestEcs();
			const entity = ecs.spawn({ position: { x: 0, y: 0 }, sprite: { texture: null } });

			expect(stopAnimation(ecs, entity.id)).toBe(false);
			expect(resumeAnimation(ecs, entity.id)).toBe(false);
		});
	});

	// ==================== Sprite Texture Sync ====================

	describe('sprite texture sync', () => {
		test('sprite texture updated to current frame texture', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(3);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			const getSprite = () =>
				ecs.entityManager.getComponent(entity.id, 'sprite') as { texture: unknown };

			// Initial frame
			ecs.update(0.001);
			expect(getSprite().texture).toBe(frames[0]);

			// Advance to frame 1
			ecs.update(0.1);
			expect(getSprite().texture).toBe(frames[1]);

			// Advance to frame 2
			ecs.update(0.1);
			expect(getSprite().texture).toBe(frames[2]);
		});

		test('animation advances without sprite component (no crash)', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(3);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
			});

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			// Should not crash when no sprite component exists
			ecs.update(0.3);
			expect(getAnim().currentFrame).toBe(3 % 3);
		});
	});

	// ==================== Change Detection ====================

	describe('change detection', () => {
		test('markChanged called when frame advances', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(4);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			// Add a system that queries for changed spriteAnimation
			const changedIds: number[] = [];
			ecs.addSystem('change-detector')
				.setPriority(-1)
				.addQuery('changed', {
					with: ['spriteAnimation'],
					changed: ['spriteAnimation'],
				})
				.setProcess((queries) => {
					for (const e of queries.changed) {
						changedIds.push(e.id);
					}
				})
				.and();

			// Frame doesn't advance — not enough time
			ecs.update(0.05);
			// Note: first update includes spawn change detection, clear it
			changedIds.length = 0;

			// Frame advances
			ecs.update(0.06);
			expect(changedIds).toContain(entity.id);
		});
	});

	// ==================== Entity Lifecycle ====================

	describe('entity lifecycle', () => {
		test('entity removal mid-animation: no crash', () => {
			const ecs = createTestEcs();
			const frames = makeFrames(4);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			ecs.update(0.1);
			ecs.removeEntity(entity.id);

			// Should not crash
			ecs.update(0.1);
			ecs.update(0.1);
		});

		test('component replacement: new animation takes over', () => {
			const ecs = createTestEcs();
			const frames1 = makeFrames(4);
			const frames2 = makeFrames(6);
			const set1 = defineSpriteAnimation('old', {
				frames: frames1,
				frameDuration: 0.1,
				loop: 'loop',
			});
			const set2 = defineSpriteAnimation('new', {
				frames: frames2,
				frameDuration: 0.05,
				loop: 'loop',
			});

			const entity = ecs.spawn({
				...createSpriteAnimation(set1),
				position: { x: 0, y: 0 },
				sprite: { texture: frames1[0] },
			});

			ecs.update(0.2);

			// Replace the animation component
			ecs.entityManager.addComponent(entity.id, 'spriteAnimation', createSpriteAnimation(set2).spriteAnimation);

			const getAnim = () =>
				ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;

			expect(getAnim().set.id).toBe('new');
			expect(getAnim().currentFrame).toBe(0);

			ecs.update(0.05);
			expect(getAnim().currentFrame).toBe(1);
		});
	});

	// ==================== Helpers Pattern ====================

	describe('createSpriteAnimationHelpers', () => {
		test('helpers createSpriteAnimation works with ECSpresso builder', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, {}>()
				.withPlugin(createSpriteAnimationPlugin())
				.build();
			const helpers = createSpriteAnimationHelpers<typeof ecs>();

			const frames = makeFrames(3);
			const set = defineSpriteAnimation('test', {
				frames,
				frameDuration: 0.1,
			});

			const entity = ecs.spawn({
				...helpers.createSpriteAnimation(set),
				position: { x: 0, y: 0 },
				sprite: { texture: frames[0] },
			});

			ecs.update(0.1);

			const anim = ecs.entityManager.getComponent(entity.id, 'spriteAnimation') as SpriteAnimation;
			expect(anim.currentFrame).toBe(1);
		});
	});
});
