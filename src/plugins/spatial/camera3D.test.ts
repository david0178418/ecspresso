import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import type { WorldConfigFrom } from '../../type-utils';
import {
	createCamera3DPlugin,
	sphericalToCartesian,
	type Camera3DResourceTypes,
	type Camera3DPluginOptions,
	type Camera3DState,
	type PerspectiveCamera3DState,
	type OrthographicCamera3DState,
} from './camera3D';
import {
	createTransform3DPlugin,
	createTransform3D,
	type Transform3DComponentTypes,
} from './transform3D';
import type { Renderer3DResourceTypes } from '../rendering/renderer3D';

// ==================== Mock Three.js Objects ====================

function createMockCamera() {
	return {
		isPerspectiveCamera: true as const,
		position: { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } },
		lookAt(_x: number, _y: number, _z: number) {},
		fov: 75,
		aspect: 1,
		updateProjectionMatrix() {},
	};
}

function createMockOrthoCamera() {
	return {
		isOrthographicCamera: true as const,
		position: { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } },
		lookAt(_x: number, _y: number, _z: number) {},
		zoom: 1,
		left: -5,
		right: 5,
		top: 5,
		bottom: -5,
		updateProjectionMatrix() {},
	};
}

function assertPerspective(state: Camera3DState): asserts state is PerspectiveCamera3DState {
	if (state.projection !== 'perspective') throw new Error(`expected perspective state, got ${state.projection}`);
}

function assertOrthographic(state: Camera3DState): asserts state is OrthographicCamera3DState {
	if (state.projection !== 'orthographic') throw new Error(`expected orthographic state, got ${state.projection}`);
}

function createMockRenderer() {
	return {
		domElement: createMockCanvas(),
		render() {},
		setSize() {},
	};
}

function createMockCanvas(): HTMLCanvasElement {
	// Minimal mock — only needs addEventListener/removeEventListener
	const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
	return {
		addEventListener(type: string, listener: EventListenerOrEventListenerObject, _options?: AddEventListenerOptions | boolean) {
			const set = listeners.get(type) ?? new Set();
			set.add(listener);
			listeners.set(type, set);
		},
		removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
			listeners.get(type)?.delete(listener);
		},
		setPointerCapture() {},
		releasePointerCapture() {},
	} as unknown as HTMLCanvasElement;
}

// ==================== Test Type Setup ====================

interface TestComponents extends Transform3DComponentTypes {}
interface TestResources extends Camera3DResourceTypes, Renderer3DResourceTypes {}

type TestConfig = WorldConfigFrom<TestComponents, {}, TestResources>;

function buildEcsWith(
	cameraFactory: () => object,
	options?: Camera3DPluginOptions,
) {
	return ECSpresso
		.create<TestConfig>()
		.withResource('threeRenderer', createMockRenderer() as unknown as TestResources['threeRenderer'])
		.withResource('scene', {} as TestResources['scene'])
		.withResource('camera', cameraFactory() as unknown as TestResources['camera'])
		.withPlugin(createTransform3DPlugin())
		.withPlugin(createCamera3DPlugin(options))
		.build();
}

const buildEcs = (options?: Camera3DPluginOptions) => buildEcsWith(createMockCamera, options);
const buildOrthoEcs = (options?: Camera3DPluginOptions) => buildEcsWith(createMockOrthoCamera, options);

// ==================== sphericalToCartesian ====================

describe('sphericalToCartesian', () => {
	const out = { x: 0, y: 0, z: 0 };

	test('zero azimuth and elevation places camera on +Z axis', () => {
		sphericalToCartesian(0, 0, 10, out);
		expect(out.x).toBeCloseTo(0);
		expect(out.y).toBeCloseTo(0);
		expect(out.z).toBeCloseTo(10);
	});

	test('90-degree azimuth places camera on +X axis', () => {
		sphericalToCartesian(Math.PI / 2, 0, 10, out);
		expect(out.x).toBeCloseTo(10);
		expect(out.y).toBeCloseTo(0);
		expect(out.z).toBeCloseTo(0);
	});

	test('90-degree elevation places camera directly above', () => {
		sphericalToCartesian(0, Math.PI / 2, 10, out);
		expect(out.x).toBeCloseTo(0);
		expect(out.y).toBeCloseTo(10);
		expect(out.z).toBeCloseTo(0);
	});

	test('negative elevation places camera below', () => {
		sphericalToCartesian(0, -Math.PI / 4, 10, out);
		expect(out.y).toBeLessThan(0);
		expect(out.z).toBeGreaterThan(0);
	});

	test('distance scales output proportionally', () => {
		sphericalToCartesian(0.5, 0.3, 5, out);
		const x5 = out.x, y5 = out.y, z5 = out.z;

		sphericalToCartesian(0.5, 0.3, 10, out);
		expect(out.x).toBeCloseTo(x5 * 2);
		expect(out.y).toBeCloseTo(y5 * 2);
		expect(out.z).toBeCloseTo(z5 * 2);
	});

	test('zero distance produces zero output', () => {
		sphericalToCartesian(1, 1, 0, out);
		expect(out.x).toBeCloseTo(0);
		expect(out.y).toBeCloseTo(0);
		expect(out.z).toBeCloseTo(0);
	});
});

// ==================== Plugin Options / Defaults ====================

describe('Plugin options and defaults', () => {
	test('default state values applied', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		expect(state.azimuth).toBe(0);
		expect(state.elevation).toBeCloseTo(0.5);
		expect(state.distance).toBe(10);
		expect(state.targetX).toBe(0);
		expect(state.targetY).toBe(0);
		expect(state.targetZ).toBe(0);
		expect(state.followTarget).toBe(-1);
		expect(state.trauma).toBe(0);
	});

	test('initial values override defaults', async () => {
		const ecs = buildEcs({
			azimuth: 1,
			elevation: 0.3,
			distance: 20,
			target: { x: 5, y: 10, z: 15 },
		});
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		expect(state.azimuth).toBe(1);
		expect(state.elevation).toBeCloseTo(0.3);
		expect(state.distance).toBe(20);
		expect(state.targetX).toBe(5);
		expect(state.targetY).toBe(10);
		expect(state.targetZ).toBe(15);
	});

	test('initial elevation clamped to range', async () => {
		const ecs = buildEcs({
			elevation: 5,
			maxElevation: 1,
		});
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		expect(state.elevation).toBe(1);
	});

	test('initial distance clamped to range', async () => {
		const ecs = buildEcs({
			distance: 500,
			maxDistance: 50,
		});
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		expect(state.distance).toBe(50);
	});

	test('follow config applied from options', async () => {
		const ecs = buildEcs({
			follow: { smoothing: 10, offsetX: 1, offsetY: 2, offsetZ: 3 },
		});
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		expect(state.followSmoothing).toBe(10);
		expect(state.followOffsetX).toBe(1);
		expect(state.followOffsetY).toBe(2);
		expect(state.followOffsetZ).toBe(3);
	});
});

// ==================== Resource Mutation Methods ====================

describe('Resource mutation methods', () => {
	test('follow(entityId) sets target and default smoothing', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.follow(42);

		expect(state.followTarget).toBe(42);
		expect(state.followSmoothing).toBe(5);
	});

	test('follow({ id }) extracts entity ID', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.follow({ id: 99 });

		expect(state.followTarget).toBe(99);
	});

	test('follow(id, opts) applies custom options', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.follow(1, { smoothing: 20, offsetX: 5, offsetY: 10, offsetZ: 15 });

		expect(state.followSmoothing).toBe(20);
		expect(state.followOffsetX).toBe(5);
		expect(state.followOffsetY).toBe(10);
		expect(state.followOffsetZ).toBe(15);
	});

	test('unfollow() resets followTarget to -1', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.follow(42);
		state.unfollow();

		expect(state.followTarget).toBe(-1);
	});

	test('setTarget updates target position', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.setTarget(10, 20, 30);

		expect(state.targetX).toBe(10);
		expect(state.targetY).toBe(20);
		expect(state.targetZ).toBe(30);
	});

	test('setOrbit updates orbit params with clamping', async () => {
		const ecs = buildEcs({ minElevation: -1, maxElevation: 1, minDistance: 2, maxDistance: 50 });
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.setOrbit(2, 5, 100);

		expect(state.azimuth).toBe(2);
		expect(state.elevation).toBe(1); // clamped
		expect(state.distance).toBe(50); // clamped
	});

	test('setDistance clamps to range', async () => {
		const ecs = buildEcs({ minDistance: 5, maxDistance: 50 });
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.setDistance(1);
		expect(state.distance).toBe(5);

		state.setDistance(100);
		expect(state.distance).toBe(50);
	});

	test('setFov updates fov', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		assertPerspective(state);
		state.setFov(90);

		expect(state.fov).toBe(90);
	});

	test('addTrauma accumulates and clamps to [0, 1]', async () => {
		const ecs = buildEcs({ shake: true });
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.addTrauma(0.3);
		expect(state.trauma).toBeCloseTo(0.3);

		state.addTrauma(0.5);
		expect(state.trauma).toBeCloseTo(0.8);

		state.addTrauma(0.5);
		expect(state.trauma).toBe(1); // clamped

		state.addTrauma(-2);
		expect(state.trauma).toBe(0); // clamped
	});
});

// ==================== Follow System ====================

describe('camera3d-follow system', () => {
	test('lerps toward target worldTransform3D over time', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform3D(100, 50, 200) });
		const state = ecs.getResource('camera3DState');
		state.follow(target.id, { smoothing: 5 });

		ecs.update(0.1);

		expect(state.targetX).toBeGreaterThan(0);
		expect(state.targetX).toBeLessThan(100);
		expect(state.targetY).toBeGreaterThan(0);
		expect(state.targetY).toBeLessThan(50);
		expect(state.targetZ).toBeGreaterThan(0);
		expect(state.targetZ).toBeLessThan(200);
	});

	test('smoothing=0 produces no movement', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform3D(100, 50, 200) });
		const state = ecs.getResource('camera3DState');
		state.follow(target.id, { smoothing: 0 });

		ecs.update(0.1);

		expect(state.targetX).toBe(0);
		expect(state.targetY).toBe(0);
		expect(state.targetZ).toBe(0);
	});

	test('high smoothing converges quickly', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform3D(100, 0, 0) });
		const state = ecs.getResource('camera3DState');
		state.follow(target.id, { smoothing: 100 });

		for (let i = 0; i < 10; i++) {
			ecs.update(0.1);
		}

		expect(state.targetX).toBeCloseTo(100, 0);
	});

	test('respects follow offsets', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform3D(100, 100, 100) });
		const state = ecs.getResource('camera3DState');
		state.follow(target.id, { smoothing: 100, offsetX: 50, offsetY: -30, offsetZ: 10 });

		for (let i = 0; i < 20; i++) {
			ecs.update(0.1);
		}

		expect(state.targetX).toBeCloseTo(150, 0);
		expect(state.targetY).toBeCloseTo(70, 0);
		expect(state.targetZ).toBeCloseTo(110, 0);
	});

	test('missing target entity auto-unfollows', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.follow(99999);

		ecs.update(0.1);

		expect(state.targetX).toBe(0);
		expect(state.targetY).toBe(0);
		expect(state.targetZ).toBe(0);
		expect(state.followTarget).toBe(-1);
	});

	test('follows worldTransform3D not localTransform3D', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		// Parent at (100, 0, 0), child at local (50, 0, 0) → world (150, 0, 0)
		const parent = ecs.spawn({ ...createTransform3D(100, 0, 0) });
		const child = ecs.spawn({ ...createTransform3D(50, 0, 0) });
		ecs.setParent(child.id, parent.id);

		// Run one update to propagate transforms
		ecs.update(0.016);

		const state = ecs.getResource('camera3DState');
		state.follow(child.id, { smoothing: 100 });

		for (let i = 0; i < 20; i++) {
			ecs.update(0.1);
		}

		// Should converge to world position (150), not local (50)
		expect(state.targetX).toBeCloseTo(150, 0);
	});

	test('no follow target skips follow system', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.setTarget(10, 20, 30);

		ecs.update(0.1);

		// Target unchanged since followTarget = -1
		expect(state.targetX).toBe(10);
		expect(state.targetY).toBe(20);
		expect(state.targetZ).toBe(30);
	});
});

// ==================== Shake System ====================

describe('camera3d-shake system', () => {
	test('trauma decays linearly over time', async () => {
		const ecs = buildEcs({ shake: { traumaDecay: 2 } });
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.addTrauma(1);

		ecs.update(0.1);

		// trauma = max(0, 1 - 2 * 0.1) = 0.8
		expect(state.trauma).toBeCloseTo(0.8);
	});

	test('trauma does not go below 0', async () => {
		const ecs = buildEcs({ shake: { traumaDecay: 100 } });
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.addTrauma(0.1);

		ecs.update(0.1);

		expect(state.trauma).toBe(0);
	});

	test('shake offsets scale with trauma squared', async () => {
		// randomFn always returns 1 → (1*2-1) = 1
		const ecs = buildEcs({
			shake: { traumaDecay: 0, maxOffsetX: 100, maxOffsetY: 100, maxOffsetZ: 100 },
			randomFn: () => 1,
		});
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.addTrauma(0.5);

		ecs.update(0.016);

		// intensity = 0.5^2 = 0.25, offset = 100 * 0.25 * 1 = 25
		expect(state.shakeOffsetX).toBeCloseTo(25);
		expect(state.shakeOffsetY).toBeCloseTo(25);
		expect(state.shakeOffsetZ).toBeCloseTo(25);
	});

	test('zero trauma produces zero shake offsets', async () => {
		const ecs = buildEcs({ shake: true });
		await ecs.initialize();

		ecs.update(0.016);

		const state = ecs.getResource('camera3DState');
		expect(state.shakeOffsetX).toBe(0);
		expect(state.shakeOffsetY).toBe(0);
		expect(state.shakeOffsetZ).toBe(0);
	});

	test('injectable randomFn makes shake deterministic', async () => {
		let callCount = 0;
		const ecs = buildEcs({
			shake: { traumaDecay: 0, maxOffsetX: 1, maxOffsetY: 1, maxOffsetZ: 1 },
			randomFn: () => { callCount++; return 0.5; },
		});
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		state.addTrauma(1);

		ecs.update(0.016);

		// (0.5 * 2 - 1) = 0, so offsets should be 0
		expect(state.shakeOffsetX).toBeCloseTo(0);
		expect(state.shakeOffsetY).toBeCloseTo(0);
		expect(state.shakeOffsetZ).toBeCloseTo(0);
		// randomFn called 3 times (once per axis)
		expect(callCount).toBe(3);
	});
});

// ==================== Sync System ====================

describe('camera3d-sync system', () => {
	test('camera position computed from spherical coords + target', async () => {
		const mockCamera = createMockCamera();
		const ecs = ECSpresso
			.create<TestConfig>()
			.withResource('threeRenderer', createMockRenderer() as unknown as TestResources['threeRenderer'])
			.withResource('scene', {} as TestResources['scene'])
			.withResource('camera', mockCamera as unknown as TestResources['camera'])
			.withPlugin(createTransform3DPlugin())
			.withPlugin(createCamera3DPlugin({
				azimuth: 0,
				elevation: 0,
				distance: 10,
				target: { x: 5, y: 0, z: 0 },
			}))
			.build();
		await ecs.initialize();

		ecs.update(0.016);

		// With azimuth=0, elevation=0, distance=10: camera at (0, 0, 10) relative to target
		// Target at (5, 0, 0) → camera at (5, 0, 10)
		expect(mockCamera.position.x).toBeCloseTo(5);
		expect(mockCamera.position.y).toBeCloseTo(0);
		expect(mockCamera.position.z).toBeCloseTo(10);
	});

	test('FOV change triggers updateProjectionMatrix', async () => {
		let projectionUpdated = false;
		const mockCamera = createMockCamera();
		mockCamera.updateProjectionMatrix = () => { projectionUpdated = true; };

		const ecs = ECSpresso
			.create<TestConfig>()
			.withResource('threeRenderer', createMockRenderer() as unknown as TestResources['threeRenderer'])
			.withResource('scene', {} as TestResources['scene'])
			.withResource('camera', mockCamera as unknown as TestResources['camera'])
			.withPlugin(createTransform3DPlugin())
			.withPlugin(createCamera3DPlugin())
			.build();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		assertPerspective(state);
		state.setFov(90);

		ecs.update(0.016);

		expect(projectionUpdated).toBe(true);
		expect(mockCamera.fov).toBe(90);
	});
});

// ==================== Integration ====================

describe('Camera 3D integration', () => {
	test('follow + shake full pipeline', async () => {
		const ecs = buildEcs({
			shake: { traumaDecay: 0, maxOffsetX: 1, maxOffsetY: 1, maxOffsetZ: 1 },
			randomFn: () => 1, // offsets = intensity * 1
		});
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform3D(100, 0, 0) });
		const state = ecs.getResource('camera3DState');
		state.follow(target.id, { smoothing: 100 });
		state.addTrauma(0.5);

		for (let i = 0; i < 20; i++) {
			ecs.update(0.1);
		}

		// Target should converge near (100, 0, 0)
		expect(state.targetX).toBeCloseTo(100, 0);
		// Shake offsets present (trauma doesn't decay)
		const intensity = state.trauma * state.trauma;
		expect(state.shakeOffsetX).toBeCloseTo(intensity);
	});

	test('system group can be disabled', async () => {
		type GroupConfig = WorldConfigFrom<TestComponents, {}, TestResources>;
		const ecs = ECSpresso
			.create<GroupConfig>()
			.withResource('threeRenderer', createMockRenderer() as unknown as TestResources['threeRenderer'])
			.withResource('scene', {} as TestResources['scene'])
			.withResource('camera', createMockCamera() as unknown as TestResources['camera'])
			.withPlugin(createTransform3DPlugin())
			.withPlugin(createCamera3DPlugin({ systemGroup: 'myCamera' }))
			.build();
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform3D(100, 0, 0) });
		const state = ecs.getResource('camera3DState');
		state.follow(target.id, { smoothing: 100 });

		ecs.disableSystemGroup('myCamera');
		ecs.update(0.1);

		// Follow should not have moved
		expect(state.targetX).toBe(0);
	});

	test('follow reads propagated worldTransform3D in same frame', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		// Parent moves → child worldTransform updates → follow reads updated world pos
		const parent = ecs.spawn({ ...createTransform3D(0, 0, 0) });
		const child = ecs.spawn({ ...createTransform3D(10, 0, 0) });
		ecs.setParent(child.id, parent.id);

		const state = ecs.getResource('camera3DState');
		state.follow(child.id, { smoothing: 100 });

		// Move parent
		const parentLocal = ecs.getComponent(parent.id, 'localTransform3D');
		if (!parentLocal) throw new Error('Expected localTransform3D');
		parentLocal.x = 50;
		ecs.markChanged(parent.id, 'localTransform3D');

		// Single frame: transform propagation (priority 500) → follow (priority 400)
		for (let i = 0; i < 20; i++) {
			ecs.update(0.1);
		}

		// child world = parent(50,0,0) + local(10,0,0) = (60,0,0)
		expect(state.targetX).toBeCloseTo(60, 0);
	});
});

// ==================== Orthographic Projection ====================

describe('Orthographic camera variant', () => {
	test('projection defaults to perspective when option omitted', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		expect(state.projection).toBe('perspective');
	});

	test('state.projection === "orthographic" when option set', async () => {
		const ecs = buildOrthoEcs({ projection: 'orthographic' });
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		expect(state.projection).toBe('orthographic');
	});

	test('default zoom is 1', async () => {
		const ecs = buildOrthoEcs({ projection: 'orthographic' });
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		assertOrthographic(state);
		expect(state.zoom).toBe(1);
	});

	test('init reads zoom from the Three.js camera', async () => {
		const mockCamera = createMockOrthoCamera();
		mockCamera.zoom = 2.5;
		const ecs = ECSpresso
			.create<TestConfig>()
			.withResource('threeRenderer', createMockRenderer() as unknown as TestResources['threeRenderer'])
			.withResource('scene', {} as TestResources['scene'])
			.withResource('camera', mockCamera as unknown as TestResources['camera'])
			.withPlugin(createTransform3DPlugin())
			.withPlugin(createCamera3DPlugin({ projection: 'orthographic' }))
			.build();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		assertOrthographic(state);
		expect(state.zoom).toBe(2.5);
	});

	test('setZoom updates zoom', async () => {
		const ecs = buildOrthoEcs({ projection: 'orthographic' });
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		assertOrthographic(state);
		state.setZoom(4);

		expect(state.zoom).toBe(4);
	});

	test('orthographic state has no setFov method', async () => {
		const ecs = buildOrthoEcs({ projection: 'orthographic' });
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		assertOrthographic(state);
		expect((state as unknown as { setFov?: unknown }).setFov).toBeUndefined();
	});

	test('perspective state has no setZoom method', async () => {
		const ecs = buildEcs();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		assertPerspective(state);
		expect((state as unknown as { setZoom?: unknown }).setZoom).toBeUndefined();
	});

	test('zoom change triggers updateProjectionMatrix on camera', async () => {
		let projectionUpdated = false;
		const mockCamera = createMockOrthoCamera();
		mockCamera.updateProjectionMatrix = () => { projectionUpdated = true; };

		const ecs = ECSpresso
			.create<TestConfig>()
			.withResource('threeRenderer', createMockRenderer() as unknown as TestResources['threeRenderer'])
			.withResource('scene', {} as TestResources['scene'])
			.withResource('camera', mockCamera as unknown as TestResources['camera'])
			.withPlugin(createTransform3DPlugin())
			.withPlugin(createCamera3DPlugin({ projection: 'orthographic' }))
			.build();
		await ecs.initialize();

		const state = ecs.getResource('camera3DState');
		assertOrthographic(state);
		state.setZoom(3);

		ecs.update(0.016);

		expect(projectionUpdated).toBe(true);
		expect(mockCamera.zoom).toBe(3);
	});

	test('position computed from spherical coords identically to perspective', async () => {
		const mockCamera = createMockOrthoCamera();
		const ecs = ECSpresso
			.create<TestConfig>()
			.withResource('threeRenderer', createMockRenderer() as unknown as TestResources['threeRenderer'])
			.withResource('scene', {} as TestResources['scene'])
			.withResource('camera', mockCamera as unknown as TestResources['camera'])
			.withPlugin(createTransform3DPlugin())
			.withPlugin(createCamera3DPlugin({
				projection: 'orthographic',
				azimuth: 0,
				elevation: 0,
				distance: 10,
				target: { x: 5, y: 0, z: 0 },
			}))
			.build();
		await ecs.initialize();

		ecs.update(0.016);

		expect(mockCamera.position.x).toBeCloseTo(5);
		expect(mockCamera.position.y).toBeCloseTo(0);
		expect(mockCamera.position.z).toBeCloseTo(10);
	});

	test('init throws when plugin is orthographic but camera is perspective', async () => {
		const ecs = ECSpresso
			.create<TestConfig>()
			.withResource('threeRenderer', createMockRenderer() as unknown as TestResources['threeRenderer'])
			.withResource('scene', {} as TestResources['scene'])
			.withResource('camera', createMockCamera() as unknown as TestResources['camera'])
			.withPlugin(createTransform3DPlugin())
			.withPlugin(createCamera3DPlugin({ projection: 'orthographic' }))
			.build();

		await expect(ecs.initialize()).rejects.toThrow(/orthographic/);
	});

	test('init throws when plugin is perspective but camera is orthographic', async () => {
		const ecs = ECSpresso
			.create<TestConfig>()
			.withResource('threeRenderer', createMockRenderer() as unknown as TestResources['threeRenderer'])
			.withResource('scene', {} as TestResources['scene'])
			.withResource('camera', createMockOrthoCamera() as unknown as TestResources['camera'])
			.withPlugin(createTransform3DPlugin())
			.withPlugin(createCamera3DPlugin())
			.build();

		await expect(ecs.initialize()).rejects.toThrow(/perspective/);
	});

	test('follow + shake pipeline works for orthographic state', async () => {
		const ecs = buildOrthoEcs({
			projection: 'orthographic',
			shake: { traumaDecay: 0, maxOffsetX: 1, maxOffsetY: 1, maxOffsetZ: 1 },
			randomFn: () => 1,
		});
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform3D(100, 0, 0) });
		const state = ecs.getResource('camera3DState');
		assertOrthographic(state);
		state.follow(target.id, { smoothing: 100 });
		state.addTrauma(0.5);

		for (let i = 0; i < 20; i++) {
			ecs.update(0.1);
		}

		expect(state.targetX).toBeCloseTo(100, 0);
		const intensity = state.trauma * state.trauma;
		expect(state.shakeOffsetX).toBeCloseTo(intensity);
	});
});
