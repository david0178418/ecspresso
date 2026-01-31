import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import {
	createCameraBundle,
	createCamera,
	createCameraFollow,
	createCameraShake,
	createCameraBounds,
	addTrauma,
	worldToScreen,
	screenToWorld,
	DEFAULT_CAMERA,
	DEFAULT_CAMERA_STATE,
	type CameraComponentTypes,
	type CameraResourceTypes,
	type CameraState,
} from './camera';
import {
	createTransformBundle,
	createTransform,
	type TransformComponentTypes,
} from './transform';

// ==================== Test Type Setup ====================

interface TestComponents extends CameraComponentTypes, TransformComponentTypes {
	tag: string;
}

interface TestEvents {}

interface TestResources extends CameraResourceTypes {}

function buildEcs(options?: { viewportWidth?: number; viewportHeight?: number; randomFn?: () => number }) {
	return ECSpresso
		.create<TestComponents, TestEvents, TestResources>()
		.withBundle(createTransformBundle())
		.withBundle(createCameraBundle(options))
		.build();
}

// ==================== Step 1: Helper Functions ====================

describe('Camera helpers', () => {
	test('createCamera returns default values', () => {
		const result = createCamera();
		expect(result.camera).toEqual({ x: 0, y: 0, zoom: 1, rotation: 0 });
	});

	test('createCamera accepts custom values', () => {
		const result = createCamera(100, 200, 2, Math.PI);
		expect(result.camera).toEqual({ x: 100, y: 200, zoom: 2, rotation: Math.PI });
	});

	test('createCameraFollow returns defaults with target', () => {
		const result = createCameraFollow(42);
		expect(result.cameraFollow.target).toBe(42);
		expect(result.cameraFollow.smoothing).toBe(5);
		expect(result.cameraFollow.deadzoneX).toBe(0);
		expect(result.cameraFollow.deadzoneY).toBe(0);
		expect(result.cameraFollow.offsetX).toBe(0);
		expect(result.cameraFollow.offsetY).toBe(0);
	});

	test('createCameraFollow accepts custom options', () => {
		const result = createCameraFollow(10, {
			smoothing: 3,
			deadzoneX: 50,
			deadzoneY: 30,
			offsetX: 10,
			offsetY: -20,
		});
		expect(result.cameraFollow).toEqual({
			target: 10,
			smoothing: 3,
			deadzoneX: 50,
			deadzoneY: 30,
			offsetX: 10,
			offsetY: -20,
		});
	});

	test('createCameraShake returns defaults', () => {
		const result = createCameraShake();
		expect(result.cameraShake.trauma).toBe(0);
		expect(result.cameraShake.traumaDecay).toBe(1);
		expect(result.cameraShake.maxOffsetX).toBe(10);
		expect(result.cameraShake.maxOffsetY).toBe(10);
		expect(result.cameraShake.maxRotation).toBe(0.05);
	});

	test('createCameraShake accepts custom options', () => {
		const result = createCameraShake({
			trauma: 0.5,
			traumaDecay: 2,
			maxOffsetX: 20,
			maxOffsetY: 15,
			maxRotation: 0.1,
		});
		expect(result.cameraShake).toEqual({
			trauma: 0.5,
			traumaDecay: 2,
			maxOffsetX: 20,
			maxOffsetY: 15,
			maxRotation: 0.1,
		});
	});

	test('createCameraBounds returns the given bounds', () => {
		const result = createCameraBounds(-500, -300, 500, 300);
		expect(result.cameraBounds).toEqual({
			minX: -500,
			minY: -300,
			maxX: 500,
			maxY: 300,
		});
	});

	test('DEFAULT_CAMERA has expected defaults', () => {
		expect(DEFAULT_CAMERA).toEqual({ x: 0, y: 0, zoom: 1, rotation: 0 });
	});

	test('DEFAULT_CAMERA_STATE has expected defaults', () => {
		expect(DEFAULT_CAMERA_STATE.viewportWidth).toBe(800);
		expect(DEFAULT_CAMERA_STATE.viewportHeight).toBe(600);
		expect(DEFAULT_CAMERA_STATE.zoom).toBe(1);
		expect(DEFAULT_CAMERA_STATE.shakeOffsetX).toBe(0);
	});
});

// ==================== Step 2: Coordinate Conversion ====================

describe('Coordinate conversion', () => {
	const identityState: CameraState = {
		x: 0, y: 0, zoom: 1, rotation: 0,
		shakeOffsetX: 0, shakeOffsetY: 0, shakeRotation: 0,
		viewportWidth: 800, viewportHeight: 600,
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
		// Object at camera position should be at screen center
		expect(screen.x).toBeCloseTo(400);
		expect(screen.y).toBeCloseTo(300);
	});

	test('zoom scales coordinates', () => {
		const state: CameraState = { ...identityState, zoom: 2 };
		const screen = worldToScreen(50, 0, state);
		// 50 pixels in world = 100 pixels on screen from center
		expect(screen.x).toBeCloseTo(500); // 400 + 50*2
		expect(screen.y).toBeCloseTo(300);
	});

	test('rotation rotates coordinates', () => {
		const state: CameraState = { ...identityState, rotation: Math.PI / 2 };
		const screen = worldToScreen(100, 0, state);
		// 100,0 rotated -90deg = 0,-100 => scaled + center = 400, 200
		expect(screen.x).toBeCloseTo(400);
		expect(screen.y).toBeCloseTo(200);
	});

	test('round-trip: screenToWorld(worldToScreen(p)) returns p', () => {
		const state: CameraState = {
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
		// Object at shake-offset position should appear at center
		expect(screen.x).toBeCloseTo(400);
		expect(screen.y).toBeCloseTo(300);
	});

	test('screen top-left maps to expected world position', () => {
		const world = screenToWorld(0, 0, identityState);
		expect(world.x).toBeCloseTo(-400);
		expect(world.y).toBeCloseTo(-300);
	});
});

// ==================== Step 3: Camera State Sync ====================

describe('camera-state-sync system', () => {
	test('cameraState reflects camera component values after update', () => {
		const ecs = buildEcs();
		ecs.spawn({ ...createCamera(100, 200, 2, 0.5) });

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		expect(state.x).toBe(100);
		expect(state.y).toBe(200);
		expect(state.zoom).toBe(2);
		expect(state.rotation).toBe(0.5);
	});

	test('cameraState viewport dimensions match bundle options', () => {
		const ecs = buildEcs({ viewportWidth: 1920, viewportHeight: 1080 });
		ecs.spawn({ ...createCamera() });

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		expect(state.viewportWidth).toBe(1920);
		expect(state.viewportHeight).toBe(1080);
	});

	test('no camera entity resets cameraState to defaults', () => {
		const ecs = buildEcs();

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		expect(state.x).toBe(0);
		expect(state.y).toBe(0);
		expect(state.zoom).toBe(1);
		expect(state.rotation).toBe(0);
		expect(state.shakeOffsetX).toBe(0);
		expect(state.shakeOffsetY).toBe(0);
		expect(state.shakeRotation).toBe(0);
	});

	test('cameraState includes shake offsets when cameraShake present', () => {
		// Use a deterministic randomFn that returns 1 (maps to offset = max * intensity * 1)
		const ecs = buildEcs({ randomFn: () => 1 });
		ecs.spawn({
			...createCamera(),
			...createCameraShake({ trauma: 1, maxOffsetX: 20, maxOffsetY: 15, maxRotation: 0.1 }),
		});

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		// randomFn returns 1, so (1 * 2 - 1) = 1, intensity = 1^2 = 1
		// Note: shake decay happens before state-sync, but with traumaDecay=1 and dt=0.016,
		// trauma = max(0, 1 - 1*0.016) = 0.984
		const expectedIntensity = 0.984 * 0.984;
		expect(state.shakeOffsetX).toBeCloseTo(20 * expectedIntensity);
		expect(state.shakeOffsetY).toBeCloseTo(15 * expectedIntensity);
		expect(state.shakeRotation).toBeCloseTo(0.1 * expectedIntensity);
	});

	test('zero trauma produces zero shake offsets', () => {
		const ecs = buildEcs();
		ecs.spawn({
			...createCamera(),
			...createCameraShake({ trauma: 0 }),
		});

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		expect(state.shakeOffsetX).toBe(0);
		expect(state.shakeOffsetY).toBe(0);
		expect(state.shakeRotation).toBe(0);
	});
});

// ==================== Step 4: Camera Follow ====================

describe('camera-follow system', () => {
	test('moves toward target with smoothing over time', () => {
		const ecs = buildEcs();
		const target = ecs.spawn({ ...createTransform(200, 100) });
		ecs.spawn({
			...createCamera(0, 0),
			...createCameraFollow(target.id, { smoothing: 5 }),
		});

		ecs.update(0.1);

		const state = ecs.getResource('cameraState');
		// Camera should have moved toward target
		expect(state.x).toBeGreaterThan(0);
		expect(state.y).toBeGreaterThan(0);
		// But not reached it yet (smoothing)
		expect(state.x).toBeLessThan(200);
		expect(state.y).toBeLessThan(100);
	});

	test('smoothing=0 produces no movement', () => {
		const ecs = buildEcs();
		const target = ecs.spawn({ ...createTransform(200, 100) });
		ecs.spawn({
			...createCamera(0, 0),
			...createCameraFollow(target.id, { smoothing: 0 }),
		});

		ecs.update(0.1);

		const state = ecs.getResource('cameraState');
		expect(state.x).toBe(0);
		expect(state.y).toBe(0);
	});

	test('high smoothing converges quickly', () => {
		const ecs = buildEcs();
		const target = ecs.spawn({ ...createTransform(100, 0) });
		ecs.spawn({
			...createCamera(0, 0),
			...createCameraFollow(target.id, { smoothing: 100 }),
		});

		// Multiple updates to approach target
		for (let i = 0; i < 10; i++) {
			ecs.update(0.1);
		}

		const state = ecs.getResource('cameraState');
		expect(state.x).toBeCloseTo(100, 0);
	});

	test('respects offset from target', () => {
		const ecs = buildEcs();
		const target = ecs.spawn({ ...createTransform(100, 100) });
		ecs.spawn({
			...createCamera(0, 0),
			...createCameraFollow(target.id, { smoothing: 100, offsetX: 50, offsetY: -30 }),
		});

		for (let i = 0; i < 20; i++) {
			ecs.update(0.1);
		}

		const state = ecs.getResource('cameraState');
		// Should converge to target + offset
		expect(state.x).toBeCloseTo(150, 0);
		expect(state.y).toBeCloseTo(70, 0);
	});

	test('no movement when target within deadzone', () => {
		const ecs = buildEcs();
		const target = ecs.spawn({ ...createTransform(30, 20) });
		ecs.spawn({
			...createCamera(0, 0),
			...createCameraFollow(target.id, { smoothing: 10, deadzoneX: 50, deadzoneY: 50 }),
		});

		ecs.update(0.1);

		const state = ecs.getResource('cameraState');
		expect(state.x).toBe(0);
		expect(state.y).toBe(0);
	});

	test('follows when target beyond deadzone edge', () => {
		const ecs = buildEcs();
		const target = ecs.spawn({ ...createTransform(100, 0) });
		ecs.spawn({
			...createCamera(0, 0),
			...createCameraFollow(target.id, { smoothing: 10, deadzoneX: 30, deadzoneY: 30 }),
		});

		ecs.update(0.1);

		const state = ecs.getResource('cameraState');
		// Should move, but only by the overshoot beyond deadzone
		expect(state.x).toBeGreaterThan(0);
		// Movement per frame = (100 - 30) * 10 * 0.1 = 70
		expect(state.x).toBeCloseTo(70, 0);
	});

	test('missing target entity produces no movement', () => {
		const ecs = buildEcs();
		ecs.spawn({
			...createCamera(50, 50),
			...createCameraFollow(99999, { smoothing: 10 }),
		});

		ecs.update(0.1);

		const state = ecs.getResource('cameraState');
		expect(state.x).toBe(50);
		expect(state.y).toBe(50);
	});

	test('follows target worldTransform (not localTransform)', () => {
		const ecs = buildEcs();
		const parent = ecs.spawn({ ...createTransform(100, 0) });
		const child = ecs.spawnChild(parent.id, { ...createTransform(50, 0) });

		ecs.spawn({
			...createCamera(0, 0),
			...createCameraFollow(child.id, { smoothing: 100 }),
		});

		// First update propagates transforms, then camera follows
		for (let i = 0; i < 20; i++) {
			ecs.update(0.1);
		}

		const state = ecs.getResource('cameraState');
		// Child worldTransform.x = 100 + 50 = 150
		expect(state.x).toBeCloseTo(150, 0);
	});
});

// ==================== Step 5: Camera Shake ====================

describe('camera-shake system', () => {
	test('trauma decays over time', () => {
		const ecs = buildEcs();
		ecs.spawn({
			...createCamera(),
			...createCameraShake({ trauma: 1, traumaDecay: 2 }),
		});

		ecs.update(0.1);

		const cam = ecs.getEntitiesWithQuery(['camera', 'cameraShake'])[0];
		if (!cam) throw new Error('Expected camera entity');
		// trauma = max(0, 1 - 2 * 0.1) = 0.8
		expect(cam.components.cameraShake.trauma).toBeCloseTo(0.8);
	});

	test('trauma does not go below 0', () => {
		const ecs = buildEcs();
		ecs.spawn({
			...createCamera(),
			...createCameraShake({ trauma: 0.1, traumaDecay: 10 }),
		});

		ecs.update(0.1);

		const cam = ecs.getEntitiesWithQuery(['camera', 'cameraShake'])[0];
		if (!cam) throw new Error('Expected camera entity');
		// trauma = max(0, 0.1 - 10 * 0.1) = max(0, -0.9) = 0
		expect(cam.components.cameraShake.trauma).toBe(0);
	});

	test('addTrauma is additive and clamps at 1', () => {
		const ecs = buildEcs();
		const cam = ecs.spawn({
			...createCamera(),
			...createCameraShake({ trauma: 0.3 }),
		});

		addTrauma(ecs, cam.id, 0.5);
		const shake1 = ecs.entityManager.getComponent(cam.id, 'cameraShake');
		expect(shake1?.trauma).toBeCloseTo(0.8);

		addTrauma(ecs, cam.id, 0.5);
		const shake2 = ecs.entityManager.getComponent(cam.id, 'cameraShake');
		expect(shake2?.trauma).toBe(1);
	});

	test('addTrauma on entity without cameraShake is a no-op', () => {
		const ecs = buildEcs();
		const cam = ecs.spawn({ ...createCamera() });
		// Should not throw
		addTrauma(ecs, cam.id, 0.5);
	});

	test('shake offsets scale with trauma squared', () => {
		// randomFn always returns 1 => (1*2-1) = 1
		const ecs = buildEcs({ randomFn: () => 1 });

		// Use traumaDecay=0 so trauma doesn't change during update
		ecs.spawn({
			...createCamera(),
			...createCameraShake({ trauma: 0.5, traumaDecay: 0, maxOffsetX: 100, maxOffsetY: 100, maxRotation: 1 }),
		});

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		// intensity = 0.5^2 = 0.25, offset = 100 * 0.25 * 1 = 25
		expect(state.shakeOffsetX).toBeCloseTo(25);
		expect(state.shakeOffsetY).toBeCloseTo(25);
		expect(state.shakeRotation).toBeCloseTo(0.25);
	});
});

// ==================== Step 6: Camera Bounds ====================

describe('camera-bounds system', () => {
	test('clamps camera within bounds', () => {
		const ecs = buildEcs({ viewportWidth: 100, viewportHeight: 100 });
		ecs.spawn({
			...createCamera(1000, 1000),
			...createCameraBounds(0, 0, 500, 500),
		});

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		// halfW = 100/(2*1) = 50, effectiveMax = 500-50 = 450
		expect(state.x).toBe(450);
		expect(state.y).toBe(450);
	});

	test('accounts for viewport/zoom when clamping', () => {
		const ecs = buildEcs({ viewportWidth: 200, viewportHeight: 200 });
		ecs.spawn({
			...createCamera(1000, 1000, 2),
			...createCameraBounds(0, 0, 500, 500),
		});

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		// halfW = 200/(2*2) = 50, effectiveMax = 500-50 = 450
		expect(state.x).toBe(450);
		expect(state.y).toBe(450);
	});

	test('zoom affects visible area calculation', () => {
		const ecs = buildEcs({ viewportWidth: 400, viewportHeight: 400 });

		// zoom=1: halfW=200, effectiveMax=300
		ecs.spawn({
			...createCamera(1000, 1000, 1),
			...createCameraBounds(0, 0, 500, 500),
		});

		ecs.update(0.016);
		const state1x = ecs.getResource('cameraState').x;
		expect(state1x).toBe(300); // 500 - 200

		// Reset: zoom=2: halfW=100, effectiveMax=400
		const ecs2 = buildEcs({ viewportWidth: 400, viewportHeight: 400 });
		ecs2.spawn({
			...createCamera(1000, 1000, 2),
			...createCameraBounds(0, 0, 500, 500),
		});
		ecs2.update(0.016);
		const state2x = ecs2.getResource('cameraState').x;
		expect(state2x).toBe(400); // 500 - 100
	});

	test('large bounds allow free camera movement', () => {
		const ecs = buildEcs({ viewportWidth: 100, viewportHeight: 100 });
		ecs.spawn({
			...createCamera(250, 250),
			...createCameraBounds(-10000, -10000, 10000, 10000),
		});

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		expect(state.x).toBe(250);
		expect(state.y).toBe(250);
	});

	test('bounds smaller than viewport centers camera', () => {
		const ecs = buildEcs({ viewportWidth: 800, viewportHeight: 600 });
		// Bounds are 200x200 but viewport is 800x600
		ecs.spawn({
			...createCamera(999, 999),
			...createCameraBounds(0, 0, 200, 200),
		});

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		// halfW = 800/(2*1) = 400, effectiveMin = 0+400 = 400, effectiveMax = 200-400 = -200
		// effectiveMin > effectiveMax => center = (0+200)/2 = 100
		expect(state.x).toBe(100);
		expect(state.y).toBe(100);
	});

	test('negative position clamping', () => {
		const ecs = buildEcs({ viewportWidth: 100, viewportHeight: 100 });
		ecs.spawn({
			...createCamera(-1000, -1000),
			...createCameraBounds(0, 0, 500, 500),
		});

		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		// halfW = 50, effectiveMin = 0+50 = 50
		expect(state.x).toBe(50);
		expect(state.y).toBe(50);
	});
});

// ==================== Step 7: Integration Tests ====================

describe('Camera integration', () => {
	test('follow + bounds: follows target but stays clamped', () => {
		const ecs = buildEcs({ viewportWidth: 100, viewportHeight: 100 });
		// Target is at 600,600 which is outside bounds
		const target = ecs.spawn({ ...createTransform(600, 600) });
		ecs.spawn({
			...createCamera(0, 0),
			...createCameraFollow(target.id, { smoothing: 100 }),
			...createCameraBounds(0, 0, 500, 500),
		});

		for (let i = 0; i < 30; i++) {
			ecs.update(0.1);
		}

		const state = ecs.getResource('cameraState');
		// Camera should converge toward target but be clamped
		// effectiveMax = 500 - 50 = 450
		expect(state.x).toBe(450);
		expect(state.y).toBe(450);
	});

	test('follow + shake + bounds: full pipeline', () => {
		let callCount = 0;
		const ecs = buildEcs({
			viewportWidth: 200,
			viewportHeight: 200,
			randomFn: () => { callCount++; return 0.5; },
		});
		const target = ecs.spawn({ ...createTransform(100, 100) });
		ecs.spawn({
			...createCamera(0, 0),
			...createCameraFollow(target.id, { smoothing: 50 }),
			...createCameraShake({ trauma: 0.8, traumaDecay: 0.5, maxOffsetX: 10, maxOffsetY: 10, maxRotation: 0.05 }),
			...createCameraBounds(-1000, -1000, 1000, 1000),
		});

		ecs.update(0.1);

		const state = ecs.getResource('cameraState');
		// Camera should have moved toward target
		expect(state.x).toBeGreaterThan(0);
		expect(state.y).toBeGreaterThan(0);
		// Shake offsets should be computed (randomFn returns 0.5 => factor = 0)
		// (0.5 * 2 - 1) = 0, so offsets are 0 with this randomFn
		expect(state.shakeOffsetX).toBe(0);
		expect(state.shakeOffsetY).toBe(0);
		// randomFn was called (3 times for x, y, rotation)
		expect(callCount).toBe(3);
	});

	test('camera reads target propagated worldTransform in same frame', () => {
		const ecs = buildEcs();
		const parent = ecs.spawn({ ...createTransform(200, 0) });
		const child = ecs.spawnChild(parent.id, { ...createTransform(100, 0) });

		ecs.spawn({
			...createCamera(0, 0),
			...createCameraFollow(child.id, { smoothing: 1000 }),
		});

		// Single update: transforms propagate at priority 500 (postUpdate),
		// camera-follow runs at priority 400 (postUpdate) - lower priority runs after
		ecs.update(0.1);

		const state = ecs.getResource('cameraState');
		// Child world x = 200 + 100 = 300
		// With very high smoothing, should be close to 300
		expect(state.x).toBeGreaterThan(0);
	});

	test('custom viewport dimensions flow through correctly', () => {
		const ecs = buildEcs({ viewportWidth: 1920, viewportHeight: 1080 });
		ecs.spawn({ ...createCamera() });
		ecs.update(0.016);

		const state = ecs.getResource('cameraState');
		expect(state.viewportWidth).toBe(1920);
		expect(state.viewportHeight).toBe(1080);

		// Coordinate conversion uses these dimensions
		const screen = worldToScreen(0, 0, state);
		expect(screen.x).toBeCloseTo(960);
		expect(screen.y).toBeCloseTo(540);
	});

	test('system group can be disabled', () => {
		const ecs = buildEcs();
		const target = ecs.spawn({ ...createTransform(200, 200) });
		ecs.spawn({
			...createCamera(0, 0),
			...createCameraFollow(target.id, { smoothing: 10 }),
		});

		ecs.disableSystemGroup('camera');
		ecs.update(0.1);

		const state = ecs.getResource('cameraState');
		// Camera should not have moved since group is disabled
		expect(state.x).toBe(0);
		expect(state.y).toBe(0);
	});
});
