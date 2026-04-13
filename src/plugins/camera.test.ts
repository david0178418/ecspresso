import { describe, test, expect } from 'bun:test';
import ECSpresso from '../ecspresso';
import type { WorldConfigFrom } from '../type-utils';
import {
	createCameraPlugin,
	worldToScreen,
	screenToWorld,
	type CameraComponentTypes,
	type CameraResourceTypes,
	type CameraState,
} from './camera';
import {
	createTransformPlugin,
	createTransform,
	type TransformComponentTypes,
} from './transform';

// ==================== Test Type Setup ====================

interface TestComponents extends CameraComponentTypes, TransformComponentTypes {
	tag: string;
}

interface TestEvents {}

interface TestResources extends CameraResourceTypes {}

function buildEcs(options?: Parameters<typeof createCameraPlugin>[0]) {
	return ECSpresso
		.create<WorldConfigFrom<TestComponents, TestEvents, TestResources>>()
		.withPlugin(createTransformPlugin())
		.withPlugin(createCameraPlugin(options))
		.build();
}

function first<T>(arr: T[]): T {
	const item = arr[0];
	if (item === undefined) throw new Error('Expected at least one element');
	return item;
}

// ==================== Declarative Config ====================

describe('Declarative config', () => {
	test('plugin spawns camera entity on startup with defaults', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const cameras = ecs.getEntitiesWithQuery(['camera']);
		expect(cameras).toHaveLength(1);

		const { camera } = first(cameras).components;
		expect(camera.x).toBe(0);
		expect(camera.y).toBe(0);
		expect(camera.zoom).toBe(1);
		expect(camera.rotation).toBe(0);
	});

	test('initial values applied to camera component', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			initial: { x: 100, y: 200, zoom: 2, rotation: 0.5 },
		});
		await ecs.initialize();

		const cameras = ecs.getEntitiesWithQuery(['camera']);
		const { camera } = first(cameras).components;
		expect(camera.x).toBe(100);
		expect(camera.y).toBe(200);
		expect(camera.zoom).toBe(2);
		expect(camera.rotation).toBe(0.5);
	});

	test('partial initial values merged with defaults', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			initial: { x: 50 },
		});
		await ecs.initialize();

		const cameras = ecs.getEntitiesWithQuery(['camera']);
		const { camera } = first(cameras).components;
		expect(camera.x).toBe(50);
		expect(camera.y).toBe(0);
		expect(camera.zoom).toBe(1);
		expect(camera.rotation).toBe(0);
	});

	test('shake: true attaches cameraShake with defaults', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			shake: true,
		});
		await ecs.initialize();

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraShake']);
		expect(cameras).toHaveLength(1);

		const { cameraShake } = first(cameras).components;
		expect(cameraShake.trauma).toBe(0);
		expect(cameraShake.traumaDecay).toBe(1);
		expect(cameraShake.maxOffsetX).toBe(10);
		expect(cameraShake.maxOffsetY).toBe(10);
		expect(cameraShake.maxRotation).toBe(0.05);
	});

	test('shake: { ... } attaches cameraShake with overrides', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			shake: { traumaDecay: 2, maxOffsetX: 20 },
		});
		await ecs.initialize();

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraShake']);
		expect(cameras).toHaveLength(1);

		const { cameraShake } = first(cameras).components;
		expect(cameraShake.traumaDecay).toBe(2);
		expect(cameraShake.maxOffsetX).toBe(20);
		// Defaults for unspecified
		expect(cameraShake.maxOffsetY).toBe(10);
		expect(cameraShake.maxRotation).toBe(0.05);
	});

	test('bounds as object attaches cameraBounds', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 800 },
		});
		await ecs.initialize();

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraBounds']);
		expect(cameras).toHaveLength(1);

		const { cameraBounds } = first(cameras).components;
		expect(cameraBounds.minX).toBe(0);
		expect(cameraBounds.minY).toBe(0);
		expect(cameraBounds.maxX).toBe(1000);
		expect(cameraBounds.maxY).toBe(800);
	});

	test('bounds as tuple attaches cameraBounds', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			bounds: [-100, -200, 500, 400],
		});
		await ecs.initialize();

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraBounds']);
		expect(cameras).toHaveLength(1);

		const { cameraBounds } = first(cameras).components;
		expect(cameraBounds.minX).toBe(-100);
		expect(cameraBounds.minY).toBe(-200);
		expect(cameraBounds.maxX).toBe(500);
		expect(cameraBounds.maxY).toBe(400);
	});

	test('omitted optional fields do not attach components', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const withShake = ecs.getEntitiesWithQuery(['camera', 'cameraShake']);
		const withBounds = ecs.getEntitiesWithQuery(['camera', 'cameraBounds']);
		const withFollow = ecs.getEntitiesWithQuery(['camera', 'cameraFollow']);

		expect(withShake).toHaveLength(0);
		expect(withBounds).toHaveLength(0);
		expect(withFollow).toHaveLength(0);
	});

	test('entityId stored in cameraState', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		const cameras = ecs.getEntitiesWithQuery(['camera']);
		expect(state.entityId).toBe(first(cameras).id);
	});

	test('cameraState viewport dimensions match plugin options', async () => {
		const ecs = buildEcs({ viewportWidth: 1920, viewportHeight: 1080 });
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		expect(state.viewportWidth).toBe(1920);
		expect(state.viewportHeight).toBe(1080);
	});

	test('follow config attaches cameraFollow with target -1', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			follow: { smoothing: 3, deadzoneX: 20 },
		});
		await ecs.initialize();

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraFollow']);
		expect(cameras).toHaveLength(1);

		const { cameraFollow } = first(cameras).components;
		expect(cameraFollow.target).toBe(-1);
		expect(cameraFollow.smoothing).toBe(3);
		expect(cameraFollow.deadzoneX).toBe(20);
	});
});

// ==================== Resource Mutation ====================

describe('Resource mutation', () => {
	test('cameraState.follow(entityId) attaches cameraFollow', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform(200, 100) });
		const state = ecs.getResource('cameraState');
		state.follow(target.id, { smoothing: 4, deadzoneX: 30 });

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraFollow']);
		expect(cameras).toHaveLength(1);

		const { cameraFollow } = first(cameras).components;
		expect(cameraFollow.target).toBe(target.id);
		expect(cameraFollow.smoothing).toBe(4);
		expect(cameraFollow.deadzoneX).toBe(30);
	});

	test('cameraState.follow(entityHandle) extracts ID', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform(200, 100) });
		const state = ecs.getResource('cameraState');
		state.follow(target);

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraFollow']);
		const { cameraFollow } = first(cameras).components;
		expect(cameraFollow.target).toBe(target.id);
	});

	test('cameraState.follow() updates existing cameraFollow', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			follow: { smoothing: 2 },
		});
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform(100, 100) });
		const state = ecs.getResource('cameraState');
		state.follow(target.id, { smoothing: 8 });

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraFollow']);
		const { cameraFollow } = first(cameras).components;
		expect(cameraFollow.target).toBe(target.id);
		expect(cameraFollow.smoothing).toBe(8);
	});

	test('cameraState.unfollow() removes cameraFollow', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			follow: { smoothing: 2 },
		});
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		state.unfollow();

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraFollow']);
		expect(cameras).toHaveLength(0);
	});

	test('cameraState.setPosition(x, y) updates camera component', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		state.setPosition(300, 400);

		ecs.update(0.016);

		expect(state.x).toBe(300);
		expect(state.y).toBe(400);
	});

	test('cameraState.setZoom(zoom) updates camera component', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		state.setZoom(2.5);

		ecs.update(0.016);

		expect(state.zoom).toBe(2.5);
	});

	test('cameraState.setRotation(rotation) updates camera component', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		state.setRotation(Math.PI / 4);

		ecs.update(0.016);

		expect(state.rotation).toBeCloseTo(Math.PI / 4);
	});

	test('cameraState.setBounds() adds cameraBounds', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		state.setBounds(0, 0, 1000, 800);

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraBounds']);
		expect(cameras).toHaveLength(1);

		const { cameraBounds } = first(cameras).components;
		expect(cameraBounds.minX).toBe(0);
		expect(cameraBounds.maxX).toBe(1000);
	});

	test('cameraState.clearBounds() removes cameraBounds', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 800 },
		});
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		state.clearBounds();

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraBounds']);
		expect(cameras).toHaveLength(0);
	});

	test('cameraState.addTrauma() accumulates and clamps', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			shake: true,
		});
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		state.addTrauma(0.3);

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraShake']);
		expect(first(cameras).components.cameraShake.trauma).toBeCloseTo(0.3);

		state.addTrauma(0.5);
		expect(first(cameras).components.cameraShake.trauma).toBeCloseTo(0.8);

		state.addTrauma(0.5);
		expect(first(cameras).components.cameraShake.trauma).toBe(1);
	});

	test('cameraState.addTrauma() adds cameraShake with defaults if not present', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		state.addTrauma(0.5);

		const cameras = ecs.getEntitiesWithQuery(['camera', 'cameraShake']);
		expect(cameras).toHaveLength(1);
		expect(first(cameras).components.cameraShake.trauma).toBeCloseTo(0.5);
		expect(first(cameras).components.cameraShake.traumaDecay).toBe(1);
	});
});

// ==================== Coordinate Conversion ====================

describe('Coordinate conversion', () => {
	const identityState: CameraState = {
		x: 0, y: 0, zoom: 1, rotation: 0,
		shakeOffsetX: 0, shakeOffsetY: 0, shakeRotation: 0,
		viewportWidth: 800, viewportHeight: 600,
		entityId: -1,
		follow: () => {},
		unfollow: () => {},
		setPosition: () => {},
		setZoom: () => {},
		setRotation: () => {},
		setBounds: () => {},
		clearBounds: () => {},
		addTrauma: () => {},
	};

	test('identity: world origin maps to screen center', () => {
		const screen = worldToScreen(0, 0, identityState);
		expect(screen.x).toBeCloseTo(400);
		expect(screen.y).toBeCloseTo(300);
	});

	test('identity: screen center maps to world origin', () => {
		const world = screenToWorld(400, 300, identityState);
		expect(world.x).toBeCloseTo(0);
		expect(world.y).toBeCloseTo(0);
	});

	test('camera offset shifts screen coordinates', () => {
		const state: CameraState = { ...identityState, x: 100, y: 50 };
		const screen = worldToScreen(100, 50, state);
		expect(screen.x).toBeCloseTo(400);
		expect(screen.y).toBeCloseTo(300);
	});

	test('zoom scales coordinates', () => {
		const state: CameraState = { ...identityState, zoom: 2 };
		const screen = worldToScreen(50, 0, state);
		expect(screen.x).toBeCloseTo(500);
		expect(screen.y).toBeCloseTo(300);
	});

	test('rotation rotates coordinates', () => {
		const state: CameraState = { ...identityState, rotation: Math.PI / 2 };
		const screen = worldToScreen(100, 0, state);
		expect(screen.x).toBeCloseTo(400);
		expect(screen.y).toBeCloseTo(200);
	});

	test('round-trip: screenToWorld(worldToScreen(p)) returns p', () => {
		const state: CameraState = {
			...identityState,
			x: 150, y: -80, zoom: 1.5, rotation: 0.3,
			shakeOffsetX: 5, shakeOffsetY: -3, shakeRotation: 0.02,
			viewportWidth: 1024, viewportHeight: 768,
		};
		const original = { x: 237, y: -142 };
		const screen = worldToScreen(original.x, original.y, state);
		const back = screenToWorld(screen.x, screen.y, state);
		expect(back.x).toBeCloseTo(original.x, 5);
		expect(back.y).toBeCloseTo(original.y, 5);
	});

	test('shake offsets are included in conversion', () => {
		const state: CameraState = { ...identityState, shakeOffsetX: 10, shakeOffsetY: 5 };
		const screen = worldToScreen(10, 5, state);
		expect(screen.x).toBeCloseTo(400);
		expect(screen.y).toBeCloseTo(300);
	});
});

// ==================== Follow System ====================

describe('camera-follow system', () => {
	test('moves toward target with smoothing over time', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform(200, 100) });
		const state = ecs.getResource('cameraState');
		state.follow(target.id, { smoothing: 5 });

		ecs.update(0.1);

		expect(state.x).toBeGreaterThan(0);
		expect(state.y).toBeGreaterThan(0);
		expect(state.x).toBeLessThan(200);
		expect(state.y).toBeLessThan(100);
	});

	test('smoothing=0 produces no movement', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform(200, 100) });
		const state = ecs.getResource('cameraState');
		state.follow(target.id, { smoothing: 0 });

		ecs.update(0.1);

		expect(state.x).toBe(0);
		expect(state.y).toBe(0);
	});

	test('high smoothing converges quickly', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform(100, 0) });
		const state = ecs.getResource('cameraState');
		state.follow(target.id, { smoothing: 100 });

		for (let i = 0; i < 10; i++) {
			ecs.update(0.1);
		}

		expect(state.x).toBeCloseTo(100, 0);
	});

	test('respects offset from target', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform(100, 100) });
		const state = ecs.getResource('cameraState');
		state.follow(target.id, { smoothing: 100, offsetX: 50, offsetY: -30 });

		for (let i = 0; i < 20; i++) {
			ecs.update(0.1);
		}

		expect(state.x).toBeCloseTo(150, 0);
		expect(state.y).toBeCloseTo(70, 0);
	});

	test('no movement when target within deadzone', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform(30, 20) });
		const state = ecs.getResource('cameraState');
		state.follow(target.id, { smoothing: 10, deadzoneX: 50, deadzoneY: 50 });

		ecs.update(0.1);

		expect(state.x).toBe(0);
		expect(state.y).toBe(0);
	});

	test('follows when target beyond deadzone edge', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform(100, 0) });
		const state = ecs.getResource('cameraState');
		state.follow(target.id, { smoothing: 10, deadzoneX: 30, deadzoneY: 30 });

		ecs.update(0.1);

		expect(state.x).toBeGreaterThan(0);
		expect(state.x).toBeCloseTo(70, 0);
	});

	test('missing target entity produces no movement', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			initial: { x: 50, y: 50 },
		});
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		state.follow(99999, { smoothing: 10 });

		ecs.update(0.1);

		expect(state.x).toBe(50);
		expect(state.y).toBe(50);
	});

	test('follows target worldTransform (not localTransform)', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const parent = ecs.spawn({ ...createTransform(100, 0) });
		const child = ecs.spawnChild(parent.id, { ...createTransform(50, 0) });

		const state = ecs.getResource('cameraState');
		state.follow(child.id, { smoothing: 100 });

		for (let i = 0; i < 20; i++) {
			ecs.update(0.1);
		}

		// Child worldTransform.x = 100 + 50 = 150
		expect(state.x).toBeCloseTo(150, 0);
	});
});

// ==================== Shake System ====================

describe('camera-shake system', () => {
	test('trauma decays over time', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			shake: { traumaDecay: 2 },
		});
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		state.addTrauma(1);

		ecs.update(0.1);

		const cam = ecs.getEntitiesWithQuery(['camera', 'cameraShake'])[0];
		if (!cam) throw new Error('Expected camera entity');
		// trauma = max(0, 1 - 2 * 0.1) = 0.8
		expect(cam.components.cameraShake.trauma).toBeCloseTo(0.8);
	});

	test('trauma does not go below 0', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			shake: { traumaDecay: 10 },
		});
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		state.addTrauma(0.1);

		ecs.update(0.1);

		const cam = ecs.getEntitiesWithQuery(['camera', 'cameraShake'])[0];
		if (!cam) throw new Error('Expected camera entity');
		expect(cam.components.cameraShake.trauma).toBe(0);
	});

	test('shake offsets scale with trauma squared', async () => {
		// randomFn always returns 1 => (1*2-1) = 1
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			shake: { traumaDecay: 0, maxOffsetX: 100, maxOffsetY: 100, maxRotation: 1 },
			randomFn: () => 1,
		});
		await ecs.initialize();

		const state = ecs.getResource('cameraState');
		state.addTrauma(0.5);

		ecs.update(0.016);

		// intensity = 0.5^2 = 0.25, offset = 100 * 0.25 * 1 = 25
		expect(state.shakeOffsetX).toBeCloseTo(25);
		expect(state.shakeOffsetY).toBeCloseTo(25);
		expect(state.shakeRotation).toBeCloseTo(0.25);
	});

	test('zero trauma produces zero shake offsets', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			shake: true,
		});
		await ecs.initialize();

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		expect(state.shakeOffsetX).toBe(0);
		expect(state.shakeOffsetY).toBe(0);
		expect(state.shakeRotation).toBe(0);
	});
});

// ==================== Bounds System ====================

describe('camera-bounds system', () => {
	test('clamps camera within bounds', async () => {
		const ecs = buildEcs({
			viewportWidth: 100,
			viewportHeight: 100,
			initial: { x: 1000, y: 1000 },
			bounds: { minX: 0, minY: 0, maxX: 500, maxY: 500 },
		});
		await ecs.initialize();

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		// halfW = 100/(2*1) = 50, effectiveMax = 500-50 = 450
		expect(state.x).toBe(450);
		expect(state.y).toBe(450);
	});

	test('accounts for viewport/zoom when clamping', async () => {
		const ecs = buildEcs({
			viewportWidth: 200,
			viewportHeight: 200,
			initial: { x: 1000, y: 1000, zoom: 2 },
			bounds: { minX: 0, minY: 0, maxX: 500, maxY: 500 },
		});
		await ecs.initialize();

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		// halfW = 200/(2*2) = 50, effectiveMax = 500-50 = 450
		expect(state.x).toBe(450);
		expect(state.y).toBe(450);
	});

	test('large bounds allow free camera movement', async () => {
		const ecs = buildEcs({
			viewportWidth: 100,
			viewportHeight: 100,
			initial: { x: 250, y: 250 },
			bounds: { minX: -10000, minY: -10000, maxX: 10000, maxY: 10000 },
		});
		await ecs.initialize();

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		expect(state.x).toBe(250);
		expect(state.y).toBe(250);
	});

	test('bounds smaller than viewport centers camera', async () => {
		const ecs = buildEcs({
			viewportWidth: 800,
			viewportHeight: 600,
			initial: { x: 999, y: 999 },
			bounds: { minX: 0, minY: 0, maxX: 200, maxY: 200 },
		});
		await ecs.initialize();

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		// halfW = 800/(2*1) = 400, effectiveMin = 400, effectiveMax = -200
		// effectiveMin > effectiveMax => center = (0+200)/2 = 100
		expect(state.x).toBe(100);
		expect(state.y).toBe(100);
	});

	test('setBounds at runtime applies on next update', async () => {
		const ecs = buildEcs({
			viewportWidth: 100,
			viewportHeight: 100,
			initial: { x: 1000, y: 1000 },
		});
		await ecs.initialize();

		ecs.update(0.016);
		const state = ecs.getResource('cameraState');
		// No bounds, camera stays at 1000
		expect(state.x).toBe(1000);

		state.setBounds(0, 0, 500, 500);
		ecs.update(0.016);

		expect(state.x).toBe(450);
		expect(state.y).toBe(450);
	});

	test('clearBounds removes clamping', async () => {
		const ecs = buildEcs({
			viewportWidth: 100,
			viewportHeight: 100,
			initial: { x: 1000, y: 1000 },
			bounds: { minX: 0, minY: 0, maxX: 500, maxY: 500 },
		});
		await ecs.initialize();

		ecs.update(0.016);
		const state = ecs.getResource('cameraState');
		expect(state.x).toBe(450);

		state.clearBounds();
		state.setPosition(1000, 1000);
		ecs.update(0.016);

		expect(state.x).toBe(1000);
		expect(state.y).toBe(1000);
	});
});

// ==================== Zoom ====================

describe('Zoom config', () => {
	test('no zoom system registered when zoom option omitted', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		// The camera-zoom system should not exist
		// We can verify by checking that no system with that label is registered
		// Indirectly: if zoom were registered, it would fail init without input/pixiApp
		// Since we got here without errors, zoom system was not registered
		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		expect(state.zoom).toBe(1);
	});

	test('zoom with missing input plugin logs error and does not throw', async () => {
		// zoom option provided but no input plugin registered — should no-op
		const originalError = console.error;
		const errors: string[] = [];
		console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };

		try {
			const ecs = buildEcs({
				viewportWidth: 800,
				viewportHeight: 600,
				zoom: { minZoom: 0.5, maxZoom: 3 },
			});
			await ecs.initialize();
			ecs.update(0.016);

			// Should have logged an error about missing dependencies
			expect(errors.some(e => e.includes('zoom requires'))).toBe(true);

			// Should still function normally otherwise
			const state = ecs.getResource('cameraState');
			expect(state.zoom).toBe(1);
		} finally {
			console.error = originalError;
		}
	});
});

// ==================== Integration ====================

describe('Camera integration', () => {
	test('follow + bounds: follows target but stays clamped', async () => {
		const ecs = buildEcs({
			viewportWidth: 100,
			viewportHeight: 100,
			bounds: { minX: 0, minY: 0, maxX: 500, maxY: 500 },
		});
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform(600, 600) });
		const state = ecs.getResource('cameraState');
		state.follow(target.id, { smoothing: 100 });

		for (let i = 0; i < 30; i++) {
			ecs.update(0.1);
		}

		// effectiveMax = 500 - 50 = 450
		expect(state.x).toBe(450);
		expect(state.y).toBe(450);
	});

	test('follow + shake + bounds: full pipeline', async () => {
		let callCount = 0;
		const ecs = buildEcs({
			viewportWidth: 200,
			viewportHeight: 200,
			shake: { traumaDecay: 0.5, maxOffsetX: 10, maxOffsetY: 10, maxRotation: 0.05 },
			bounds: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
			randomFn: () => { callCount++; return 0.5; },
		});
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform(100, 100) });
		const state = ecs.getResource('cameraState');
		state.follow(target.id, { smoothing: 50 });
		state.addTrauma(0.8);

		ecs.update(0.1);

		// Camera should have moved toward target
		expect(state.x).toBeGreaterThan(0);
		expect(state.y).toBeGreaterThan(0);
		// Shake offsets should be computed (randomFn returns 0.5 => factor = 0)
		expect(state.shakeOffsetX).toBe(0);
		expect(state.shakeOffsetY).toBe(0);
		// randomFn was called (3 times for x, y, rotation)
		expect(callCount).toBe(3);
	});

	test('system group can be disabled', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const target = ecs.spawn({ ...createTransform(200, 200) });
		const state = ecs.getResource('cameraState');
		state.follow(target.id, { smoothing: 10 });

		ecs.disableSystemGroup('camera');
		ecs.update(0.1);

		// Camera should not have moved since group is disabled
		expect(state.x).toBe(0);
		expect(state.y).toBe(0);
	});

	test('camera reads target propagated worldTransform in same frame', async () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		await ecs.initialize();

		const parent = ecs.spawn({ ...createTransform(200, 0) });
		const child = ecs.spawnChild(parent.id, { ...createTransform(100, 0) });

		const state = ecs.getResource('cameraState');
		state.follow(child.id, { smoothing: 1000 });

		// Single update: transforms propagate at priority 500 (postUpdate),
		// camera-follow runs at priority 400 (postUpdate) - lower priority runs after
		ecs.update(0.1);

		// Child world x = 200 + 100 = 300
		expect(state.x).toBeGreaterThan(0);
	});

	test('custom viewport dimensions flow through correctly', async () => {
		const ecs = buildEcs({ viewportWidth: 1920, viewportHeight: 1080 });
		await ecs.initialize();

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		expect(state.viewportWidth).toBe(1920);
		expect(state.viewportHeight).toBe(1080);

		const screen = worldToScreen(0, 0, state);
		expect(screen.x).toBeCloseTo(960);
		expect(screen.y).toBeCloseTo(540);
	});
});
