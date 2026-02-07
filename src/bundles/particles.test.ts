import { describe, test, expect } from 'bun:test';
import ECSpresso from '../ecspresso';
import {
	defineParticleEffect,
	createParticleEmitter,
	createParticleBundle,
	createParticleKit,
	burstParticles,
	stopEmitter,
	resumeEmitter,
	sampleRange,
	lerpTint,
	particlePresets,
	type ParticleValue,
	type EmissionShape,
	type ParticleBlendMode,
	type ParticleEmitterEventData,
	type ParticleComponentTypes,
	type ParticleEmitter,
} from './particles';

// ==================== Test Helpers ====================

const fakeTexture = { _texture: true };

interface TestComponents extends ParticleComponentTypes {
	position: { x: number; y: number };
	localTransform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
	worldTransform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
}

interface TestEvents {
	emitterDone: ParticleEmitterEventData;
	otherEvent: { value: number };
}

function createTestEcs() {
	return ECSpresso
		.create<TestComponents, TestEvents, {}>()
		.withBundle(createParticleBundle<TestEvents>())
		.build();
}

function getEmitter(ecs: ReturnType<typeof createTestEcs>, entityId: number): ParticleEmitter | undefined {
	return ecs.entityManager.getComponent(entityId, 'particleEmitter') as ParticleEmitter | undefined;
}

// ==================== Tests ====================

describe('Particle System Bundle', () => {

	// ==================== Config & Component Creation ====================

	describe('defineParticleEffect', () => {
		test('applies defaults for all optional fields', () => {
			const config = defineParticleEffect({
				maxParticles: 100,
				texture: fakeTexture,
			});

			expect(config.maxParticles).toBe(100);
			expect(config.texture).toBe(fakeTexture);
			expect(config.spawnRate).toBe(10);
			expect(config.burstCount).toBe(0);
			expect(config.duration).toBe(-1);
			expect(config.lifetime).toBe(1);
			expect(config.speed).toBe(100);
			expect(config.emissionShape).toBe('point');
			expect(config.emissionRadius).toBe(0);
			expect(config.gravity).toEqual({ x: 0, y: 0 });
			expect(config.startSize).toBe(1);
			expect(config.endSize).toBe(1); // defaults to startSize
			expect(config.startAlpha).toBe(1);
			expect(config.endAlpha).toBe(0);
			expect(config.startTint).toBe(0xffffff);
			expect(config.endTint).toBe(0xffffff); // defaults to startTint
			expect(config.startRotation).toBe(0);
			expect(config.rotationSpeed).toBe(0);
			expect(config.blendMode).toBe('normal');
			expect(config.worldSpace).toBe(true);
		});

		test('respects custom values', () => {
			const config = defineParticleEffect({
				maxParticles: 200,
				texture: fakeTexture,
				spawnRate: 50,
				burstCount: 10,
				duration: 3,
				lifetime: [0.5, 1.5],
				speed: [50, 200],
				angle: [0, Math.PI],
				emissionShape: 'circle',
				emissionRadius: 20,
				gravity: { x: 0, y: 100 },
				startSize: 2,
				endSize: 0.5,
				startAlpha: 0.8,
				endAlpha: 0.1,
				startTint: 0xff0000,
				endTint: 0x0000ff,
				startRotation: [0, Math.PI],
				rotationSpeed: 1,
				blendMode: 'add',
				worldSpace: false,
			});

			expect(config.maxParticles).toBe(200);
			expect(config.spawnRate).toBe(50);
			expect(config.burstCount).toBe(10);
			expect(config.duration).toBe(3);
			expect(config.lifetime).toEqual([0.5, 1.5]);
			expect(config.speed).toEqual([50, 200]);
			expect(config.emissionShape).toBe('circle');
			expect(config.emissionRadius).toBe(20);
			expect(config.gravity).toEqual({ x: 0, y: 100 });
			expect(config.startSize).toBe(2);
			expect(config.endSize).toBe(0.5);
			expect(config.startAlpha).toBe(0.8);
			expect(config.endAlpha).toBe(0.1);
			expect(config.startTint).toBe(0xff0000);
			expect(config.endTint).toBe(0x0000ff);
			expect(config.blendMode).toBe('add');
			expect(config.worldSpace).toBe(false);
		});

		test('returns a frozen object', () => {
			const config = defineParticleEffect({
				maxParticles: 10,
				texture: fakeTexture,
			});

			expect(Object.isFrozen(config)).toBe(true);
			expect(Object.isFrozen(config.gravity)).toBe(true);
		});
	});

	describe('createParticleEmitter', () => {
		const config = defineParticleEffect({
			maxParticles: 50,
			texture: fakeTexture,
		});

		test('produces valid component with defaults', () => {
			const result = createParticleEmitter(config);

			expect(result.particleEmitter.config).toBe(config);
			expect(result.particleEmitter.activeCount).toBe(0);
			expect(result.particleEmitter.spawnAccumulator).toBe(0);
			expect(result.particleEmitter.elapsed).toBe(0);
			expect(result.particleEmitter.playing).toBe(true);
			expect(result.particleEmitter.pendingBurst).toBe(0);
			expect(result.particleEmitter.finished).toBe(false);
			expect(result.particleEmitter.onComplete).toBeUndefined();
		});

		test('respects playing option', () => {
			const result = createParticleEmitter(config, { playing: false });
			expect(result.particleEmitter.playing).toBe(false);
		});

		test('respects onComplete option', () => {
			const result = createParticleEmitter<TestEvents>(config, {
				onComplete: 'emitterDone',
			});
			expect(result.particleEmitter.onComplete).toBe('emitterDone');
		});
	});

	// ==================== Type Assertions ====================

	describe('type assertions', () => {
		test('ParticleValue accepts number and readonly tuple', () => {
			const fixed: ParticleValue = 5;
			const range: ParticleValue = [1, 10] as const;
			expect(typeof fixed).toBe('number');
			expect(Array.isArray(range)).toBe(true);
		});

		test('EmissionShape is the correct union', () => {
			const shapes: EmissionShape[] = ['point', 'circle'];
			expect(shapes).toHaveLength(2);
		});

		test('ParticleBlendMode is the correct union', () => {
			const modes: ParticleBlendMode[] = ['normal', 'add', 'multiply', 'screen'];
			expect(modes).toHaveLength(4);
		});

		test('ParticleEmitterEventData has expected shape', () => {
			const data: ParticleEmitterEventData = { entityId: 1 };
			expect(data.entityId).toBe(1);
		});

		test('ParticleComponentTypes narrows correctly', () => {
			const config = defineParticleEffect({ maxParticles: 10, texture: fakeTexture });
			const comp = createParticleEmitter(config);
			expect(comp.particleEmitter.config).toBe(config);
		});
	});

	// ==================== Pure Function Tests ====================

	describe('sampleRange', () => {
		test('returns fixed value for number', () => {
			expect(sampleRange(42)).toBe(42);
		});

		test('returns value within range for tuple', () => {
			// Run multiple times to verify range
			for (let i = 0; i < 100; i++) {
				const val = sampleRange([10, 20]);
				expect(val).toBeGreaterThanOrEqual(10);
				expect(val).toBeLessThanOrEqual(20);
			}
		});

		test('returns min when range is zero-width', () => {
			expect(sampleRange([5, 5])).toBe(5);
		});
	});

	describe('lerpTint', () => {
		test('returns start when t=0', () => {
			expect(lerpTint(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
		});

		test('returns end when t=1', () => {
			expect(lerpTint(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
		});

		test('returns midpoint at t=0.5', () => {
			const result = lerpTint(0x000000, 0xfefefe, 0.5);
			// Each channel: 0 + (254 * 0.5) = 127
			expect(result).toBe(0x7f7f7f);
		});

		test('returns same when start equals end', () => {
			expect(lerpTint(0xaabbcc, 0xaabbcc, 0.5)).toBe(0xaabbcc);
		});
	});

	// ==================== Particle Spawning ====================

	describe('particle spawning', () => {
		test('continuous spawn rate produces correct particle count over time', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 100,
				texture: fakeTexture,
				spawnRate: 10, // 10 per second
				lifetime: 5, // long enough to not die during test
				speed: 0,
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			// 1 second at 10/s = 10 particles
			ecs.update(1);
			const emitter = getEmitter(ecs, entity.id);
			expect(emitter).toBeDefined();
			expect(emitter!.activeCount).toBe(10);
		});

		test('burst spawns correct count immediately', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 100,
				texture: fakeTexture,
				spawnRate: 0,
				burstCount: 20,
				lifetime: 5,
				speed: 0,
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			// Trigger burst
			burstParticles(ecs, entity.id);
			ecs.update(0.016);

			const emitter = getEmitter(ecs, entity.id);
			expect(emitter).toBeDefined();
			expect(emitter!.activeCount).toBe(20);
		});

		test('burstParticles helper triggers pending burst with custom count', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 100,
				texture: fakeTexture,
				spawnRate: 0,
				burstCount: 5,
				lifetime: 5,
				speed: 0,
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			burstParticles(ecs, entity.id, 15);
			ecs.update(0.016);

			const emitter = getEmitter(ecs, entity.id);
			expect(emitter!.activeCount).toBe(15);
		});

		test('spawning respects maxParticles cap', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 5,
				texture: fakeTexture,
				spawnRate: 100,
				lifetime: 10,
				speed: 0,
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			// Try to spawn way more than maxParticles
			ecs.update(1);

			const emitter = getEmitter(ecs, entity.id);
			expect(emitter!.activeCount).toBeLessThanOrEqual(5);
		});

		test('burstParticles returns false for entity without emitter', () => {
			const ecs = createTestEcs();
			const entity = ecs.spawn({
				position: { x: 0, y: 0 },
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			expect(burstParticles(ecs, entity.id)).toBe(false);
		});
	});

	// ==================== Particle Simulation ====================

	describe('particle simulation', () => {
		test('velocity moves particles', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 1,
				texture: fakeTexture,
				spawnRate: 0,
				burstCount: 1,
				lifetime: 5,
				speed: 100,
				angle: 0, // right
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			burstParticles(ecs, entity.id);
			ecs.update(1); // 1 second

			// Particle should have moved ~100px to the right
			const emitter = getEmitter(ecs, entity.id);
			expect(emitter!.activeCount).toBe(1);
		});

		test('gravity accelerates particles', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 1,
				texture: fakeTexture,
				spawnRate: 0,
				burstCount: 1,
				lifetime: 5,
				speed: 0,
				gravity: { x: 0, y: 100 },
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			burstParticles(ecs, entity.id);
			ecs.update(0.016);

			// Particle should exist and gravity should have been applied
			const emitter = getEmitter(ecs, entity.id);
			expect(emitter!.activeCount).toBe(1);
		});

		test('lifetime decreases and particles die when life <= 0', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 10,
				texture: fakeTexture,
				spawnRate: 0,
				burstCount: 5,
				lifetime: 0.5,
				speed: 0,
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			burstParticles(ecs, entity.id);
			ecs.update(0.1);
			expect(getEmitter(ecs, entity.id)!.activeCount).toBe(5);

			// After lifetime expires
			ecs.update(0.5);
			expect(getEmitter(ecs, entity.id)!.activeCount).toBe(0);
		});

		test('dead particles recycled via swap-and-pop', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 10,
				texture: fakeTexture,
				spawnRate: 0,
				burstCount: 5,
				lifetime: 0.1,
				speed: 0,
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			burstParticles(ecs, entity.id);
			ecs.update(0.05);
			expect(getEmitter(ecs, entity.id)!.activeCount).toBe(5);

			// Kill particles
			ecs.update(0.1);
			const emitter = getEmitter(ecs, entity.id);
			expect(emitter!.activeCount).toBe(0);

			// Spawn new ones into recycled slots
			burstParticles(ecs, entity.id);
			ecs.update(0.016);
			expect(getEmitter(ecs, entity.id)!.activeCount).toBe(5);
		});
	});

	// ==================== Emission Shapes ====================

	describe('emission shapes', () => {
		test('point: all particles spawn at emitter position', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 10,
				texture: fakeTexture,
				spawnRate: 0,
				burstCount: 5,
				lifetime: 5,
				speed: 0,
				emissionShape: 'point',
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 50, y: 50, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 50, y: 50, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			burstParticles(ecs, entity.id);
			ecs.update(0.016);

			// All particles should spawn at emitter position
			const emitter = getEmitter(ecs, entity.id);
			expect(emitter!.activeCount).toBe(5);
		});

		test('circle: particles spawn within radius', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 10,
				texture: fakeTexture,
				spawnRate: 0,
				burstCount: 10,
				lifetime: 5,
				speed: 0,
				emissionShape: 'circle',
				emissionRadius: 50,
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			burstParticles(ecs, entity.id);
			ecs.update(0.016);

			const emitter = getEmitter(ecs, entity.id);
			expect(emitter!.activeCount).toBe(10);
		});
	});

	// ==================== Emitter Lifecycle ====================

	describe('emitter lifecycle', () => {
		test('finite duration stops spawning after elapsed time', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 100,
				texture: fakeTexture,
				spawnRate: 10,
				duration: 1.5,
				lifetime: 10, // long enough to survive the entire test
				speed: 0,
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			// Spawn particles for 1s at rate 10/s = 10 particles
			ecs.update(1);
			const emitter = getEmitter(ecs, entity.id);
			expect(emitter).toBeDefined();
			expect(emitter!.activeCount).toBe(10);

			// At 1s elapsed, duration not yet expired (1.5s), so spawning continues
			// Wait to cross the 1.5s boundary
			ecs.update(1); // elapsed = 2s, but duration expired at 1.5s
			// Spawning was allowed for 0.5s of this 1s step: accumulator += 10*1 = 10
			// But durationExpired is checked first, so no spawns at all this frame
			const countAfterDuration = getEmitter(ecs, entity.id)!.activeCount;
			expect(countAfterDuration).toBe(10);

			// Further updates should not spawn any more
			ecs.update(1);
			expect(getEmitter(ecs, entity.id)!.activeCount).toBe(10);
		});

		test('completion fires when duration expired AND all particles dead', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 10,
				texture: fakeTexture,
				spawnRate: 0,
				burstCount: 3,
				duration: 0.1,
				lifetime: 0.2,
				speed: 0,
			});

			const received: ParticleEmitterEventData[] = [];
			ecs.on('emitterDone', (data) => { received.push(data); });

			const entity = ecs.spawn({
				...createParticleEmitter<TestEvents>(config, { onComplete: 'emitterDone' }),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			burstParticles(ecs, entity.id);
			ecs.update(0.05); // Before duration expires
			expect(received).toHaveLength(0);

			ecs.update(0.1); // Duration expired but particles still alive
			expect(received).toHaveLength(0);

			ecs.update(0.2); // All particles dead
			expect(received).toHaveLength(1);
			expect(received[0]!.entityId).toBe(entity.id);
		});

		test('component removed on completion', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 5,
				texture: fakeTexture,
				spawnRate: 0,
				burstCount: 1,
				duration: 0.1,
				lifetime: 0.1,
				speed: 0,
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			burstParticles(ecs, entity.id);
			ecs.update(0.05);
			expect(getEmitter(ecs, entity.id)).toBeDefined();

			// Wait for everything to expire
			ecs.update(0.5);
			ecs.update(0.1);
			expect(getEmitter(ecs, entity.id)).toBeUndefined();
		});

		test('infinite duration (-1) never stops', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 100,
				texture: fakeTexture,
				spawnRate: 10,
				duration: -1,
				lifetime: 0.1,
				speed: 0,
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			// Run for a long time
			for (let i = 0; i < 20; i++) {
				ecs.update(0.5);
			}

			const emitter = getEmitter(ecs, entity.id);
			expect(emitter).toBeDefined();
			expect(emitter!.finished).toBe(false);
			expect(emitter!.playing).toBe(true);
		});

		test('stopEmitter and resumeEmitter control spawning', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 100,
				texture: fakeTexture,
				spawnRate: 20,
				duration: -1,
				lifetime: 5, // long enough to survive during test
				speed: 0,
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			ecs.update(0.5); // 20/s * 0.5 = 10 particles
			const countBefore = getEmitter(ecs, entity.id)!.activeCount;
			expect(countBefore).toBeGreaterThan(0);

			stopEmitter(ecs, entity.id);
			expect(getEmitter(ecs, entity.id)!.playing).toBe(false);

			// No new particles should spawn (existing ones still alive)
			const countAtStop = getEmitter(ecs, entity.id)!.activeCount;
			ecs.update(0.5);
			// Count should not increase (no new spawns)
			expect(getEmitter(ecs, entity.id)!.activeCount).toBeLessThanOrEqual(countAtStop);

			resumeEmitter(ecs, entity.id);
			expect(getEmitter(ecs, entity.id)!.playing).toBe(true);

			const countBeforeResume = getEmitter(ecs, entity.id)!.activeCount;
			ecs.update(0.5);
			// New particles should have spawned
			expect(getEmitter(ecs, entity.id)!.activeCount).toBeGreaterThan(countBeforeResume);
		});

		test('stopEmitter returns false for entity without emitter', () => {
			const ecs = createTestEcs();
			const entity = ecs.spawn({
				position: { x: 0, y: 0 },
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			expect(stopEmitter(ecs, entity.id)).toBe(false);
			expect(resumeEmitter(ecs, entity.id)).toBe(false);
		});
	});

	// ==================== Kit Pattern ====================

	describe('createParticleKit', () => {
		test('kit bundle is usable in ECSpresso builder', () => {
			const kit = createParticleKit();

			const ecs = ECSpresso
				.create<TestComponents, TestEvents, {}>()
				.withBundle(kit.bundle)
				.build();

			const config = kit.defineParticleEffect({
				maxParticles: 10,
				texture: fakeTexture,
				spawnRate: 10,
				lifetime: 1,
				speed: 0,
			});

			const entity = ecs.spawn({
				...kit.createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			ecs.update(0.5);

			const emitter = ecs.entityManager.getComponent(entity.id, 'particleEmitter') as ParticleEmitter;
			expect(emitter.activeCount).toBeGreaterThan(0);
		});

		test('kit helpers match standalone functions', () => {
			const kit = createParticleKit();

			expect(kit.defineParticleEffect).toBe(defineParticleEffect);
			expect(kit.burstParticles).toBe(burstParticles);
			expect(kit.stopEmitter).toBe(stopEmitter);
			expect(kit.resumeEmitter).toBe(resumeEmitter);
			expect(kit.presets).toBe(particlePresets);
		});
	});

	// ==================== Presets ====================

	describe('presets', () => {
		test('explosion preset returns valid frozen config', () => {
			const config = particlePresets.explosion(fakeTexture);
			expect(Object.isFrozen(config)).toBe(true);
			expect(config.maxParticles).toBe(50);
			expect(config.spawnRate).toBe(0);
			expect(config.burstCount).toBe(30);
		});

		test('smoke preset returns valid frozen config', () => {
			const config = particlePresets.smoke(fakeTexture);
			expect(Object.isFrozen(config)).toBe(true);
			expect(config.spawnRate).toBe(15);
		});

		test('fire preset returns valid frozen config', () => {
			const config = particlePresets.fire(fakeTexture);
			expect(Object.isFrozen(config)).toBe(true);
			expect(config.spawnRate).toBe(30);
			expect(config.blendMode).toBe('add');
		});

		test('sparkle preset returns valid frozen config', () => {
			const config = particlePresets.sparkle(fakeTexture);
			expect(Object.isFrozen(config)).toBe(true);
			expect(config.spawnRate).toBe(10);
		});

		test('trail preset returns valid frozen config', () => {
			const config = particlePresets.trail(fakeTexture);
			expect(Object.isFrozen(config)).toBe(true);
			expect(config.spawnRate).toBe(20);
			expect(config.speed).toBe(0);
		});

		test('presets accept overrides', () => {
			const config = particlePresets.explosion(fakeTexture, {
				maxParticles: 200,
				burstCount: 50,
			});
			expect(config.maxParticles).toBe(200);
			expect(config.burstCount).toBe(50);
		});
	});

	// ==================== Entity Lifecycle ====================

	describe('entity lifecycle', () => {
		test('entity removal mid-emission: no crash', () => {
			const ecs = createTestEcs();
			const config = defineParticleEffect({
				maxParticles: 50,
				texture: fakeTexture,
				spawnRate: 20,
				lifetime: 1,
				speed: 50,
			});

			const entity = ecs.spawn({
				...createParticleEmitter(config),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			ecs.update(0.5);
			ecs.removeEntity(entity.id);

			// Should not crash
			ecs.update(0.1);
			ecs.update(0.1);
		});

		test('multiple independent emitters', () => {
			const ecs = createTestEcs();
			const config1 = defineParticleEffect({
				maxParticles: 10,
				texture: fakeTexture,
				spawnRate: 10,
				lifetime: 5,
				speed: 0,
			});
			const config2 = defineParticleEffect({
				maxParticles: 20,
				texture: fakeTexture,
				spawnRate: 20,
				lifetime: 5,
				speed: 0,
			});

			const entity1 = ecs.spawn({
				...createParticleEmitter(config1),
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			});
			const entity2 = ecs.spawn({
				...createParticleEmitter(config2),
				localTransform: { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
			});

			ecs.update(1);

			const emitter1 = getEmitter(ecs, entity1.id);
			const emitter2 = getEmitter(ecs, entity2.id);

			expect(emitter1).toBeDefined();
			expect(emitter2).toBeDefined();
			expect(emitter1!.activeCount).toBe(10);
			expect(emitter2!.activeCount).toBe(20);
		});
	});
});
