/**
 * Camera 3D Plugin for ECSpresso
 *
 * Orbit/follow/shake camera controls for a Three.js PerspectiveCamera managed by renderer3D.
 * Purely resource-based (no camera entity). The renderer3D `camera` resource is the single
 * camera target. Orbit via pointer drag + scroll wheel, follow via entity tracking, shake via
 * trauma-based offsets.
 *
 * Import from 'ecspresso/plugins/spatial/camera3D'
 */

import { definePlugin } from 'ecspresso';
import type { SystemPhase } from 'ecspresso';
import type { WorldConfigFrom } from '../../type-utils';
import type { Transform3DComponentTypes } from './transform3D';
import type { Renderer3DResourceTypes } from '../rendering/renderer3D';
import type { PerspectiveCamera } from 'three';

// ==================== Dependency Types ====================

type Camera3DRequiredConfig = WorldConfigFrom<
	Transform3DComponentTypes,
	{},
	Renderer3DResourceTypes
>;

// ==================== Resource Types ====================

export interface Camera3DFollowOptions {
	smoothing?: number;
	offsetX?: number;
	offsetY?: number;
	offsetZ?: number;
}

export interface Camera3DShakeOptions {
	traumaDecay?: number;
	maxOffsetX?: number;
	maxOffsetY?: number;
	maxOffsetZ?: number;
}

export interface Camera3DState {
	// Orbit / spherical state
	targetX: number;
	targetY: number;
	targetZ: number;
	azimuth: number;
	elevation: number;
	distance: number;
	fov: number;

	// Follow
	followTarget: number;
	followSmoothing: number;
	followOffsetX: number;
	followOffsetY: number;
	followOffsetZ: number;

	// Shake (read by sync, written by shake system)
	trauma: number;
	shakeOffsetX: number;
	shakeOffsetY: number;
	shakeOffsetZ: number;

	// Mutation methods
	follow(target: number | { id: number }, options?: Camera3DFollowOptions): void;
	unfollow(): void;
	setTarget(x: number, y: number, z: number): void;
	setOrbit(azimuth: number, elevation: number, distance: number): void;
	setDistance(distance: number): void;
	setFov(fov: number): void;
	addTrauma(amount: number): void;
}

export interface Camera3DResourceTypes {
	camera3DState: Camera3DState;
}

export type Camera3DWorldConfig = WorldConfigFrom<{}, {}, Camera3DResourceTypes>;

// ==================== Plugin Options ====================

export interface Camera3DPluginOptions<G extends string = 'camera3d'> {
	systemGroup?: G;
	phase?: SystemPhase;

	// Initial orbit state
	azimuth?: number;
	elevation?: number;
	distance?: number;
	target?: { x: number; y: number; z: number };
	fov?: number;

	// Orbit constraints
	minDistance?: number;
	maxDistance?: number;
	minElevation?: number;
	maxElevation?: number;

	// Sensitivity
	orbitSensitivity?: number;
	dollySensitivity?: number;

	// Follow
	follow?: Camera3DFollowOptions;

	// Shake
	shake?: boolean | Partial<Camera3DShakeOptions>;

	// Injectable RNG for deterministic shake
	randomFn?: () => number;
}

// ==================== Labels ====================

export type Camera3DLabels =
	| 'camera3d-init'
	| 'camera3d-follow'
	| 'camera3d-shake'
	| 'camera3d-sync';

// ==================== Constants ====================

const DEFAULT_FOLLOW: Readonly<Required<Camera3DFollowOptions>> = {
	smoothing: 5,
	offsetX: 0,
	offsetY: 0,
	offsetZ: 0,
};

const DEFAULT_SHAKE: Readonly<Required<Camera3DShakeOptions>> = {
	traumaDecay: 1,
	maxOffsetX: 0.3,
	maxOffsetY: 0.3,
	maxOffsetZ: 0.3,
};

const HALF_PI = Math.PI / 2;
const ELEVATION_EPSILON = 0.001;

// ==================== Scratch Objects ====================

const _camPos = { x: 0, y: 0, z: 0 };

// ==================== Helpers ====================

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function resolveShakeOptions(config: true | Partial<Camera3DShakeOptions>): Required<Camera3DShakeOptions> {
	if (config === true) return { ...DEFAULT_SHAKE };
	return {
		traumaDecay: config.traumaDecay ?? DEFAULT_SHAKE.traumaDecay,
		maxOffsetX: config.maxOffsetX ?? DEFAULT_SHAKE.maxOffsetX,
		maxOffsetY: config.maxOffsetY ?? DEFAULT_SHAKE.maxOffsetY,
		maxOffsetZ: config.maxOffsetZ ?? DEFAULT_SHAKE.maxOffsetZ,
	};
}

/**
 * Convert spherical coordinates to cartesian. Y-up convention (Three.js default).
 * Azimuth rotates in the XZ plane; elevation goes from XZ plane toward +Y.
 */
export function sphericalToCartesian(
	azimuth: number,
	elevation: number,
	distance: number,
	out: { x: number; y: number; z: number },
): void {
	const cosElev = Math.cos(elevation);
	out.x = distance * cosElev * Math.sin(azimuth);
	out.y = distance * Math.sin(elevation);
	out.z = distance * cosElev * Math.cos(azimuth);
}

// ==================== Plugin Factory ====================

export function createCamera3DPlugin<G extends string = 'camera3d'>(
	options?: Camera3DPluginOptions<G>,
) {
	const {
		systemGroup = 'camera3d',
		phase = 'postUpdate',
		azimuth: initialAzimuth = 0,
		elevation: initialElevation = 0.5,
		distance: initialDistance = 10,
		target: initialTarget,
		fov: initialFov = 75,
		minDistance = 1,
		maxDistance = 100,
		minElevation = -HALF_PI + ELEVATION_EPSILON,
		maxElevation = HALF_PI - ELEVATION_EPSILON,
		orbitSensitivity = 0.003,
		dollySensitivity = 1.1,
		follow: followConfig,
		shake: shakeConfig,
		randomFn = Math.random,
	} = options ?? {};

	const resolvedShake = shakeConfig ? resolveShakeOptions(shakeConfig) : DEFAULT_SHAKE;
	const shakeDecay = resolvedShake.traumaDecay;
	const shakeMaxX = resolvedShake.maxOffsetX;
	const shakeMaxY = resolvedShake.maxOffsetY;
	const shakeMaxZ = resolvedShake.maxOffsetZ;

	return definePlugin('camera3d')
		.withResourceTypes<Camera3DResourceTypes>()
		.withLabels<Camera3DLabels>()
		.withGroups<G>()
		.requires<Camera3DRequiredConfig>()
		.install((world) => {

			// ==================== DOM State ====================

			const drag = { active: false, prevX: 0, prevY: 0, pendingDolly: 0, el: null as HTMLElement | null };

			// ==================== Resource ====================

			const state: Camera3DState = {
				targetX: initialTarget?.x ?? 0,
				targetY: initialTarget?.y ?? 0,
				targetZ: initialTarget?.z ?? 0,
				azimuth: initialAzimuth,
				elevation: clamp(initialElevation, minElevation, maxElevation),
				distance: clamp(initialDistance, minDistance, maxDistance),
				fov: initialFov,

				followTarget: -1,
				followSmoothing: followConfig?.smoothing ?? DEFAULT_FOLLOW.smoothing,
				followOffsetX: followConfig?.offsetX ?? DEFAULT_FOLLOW.offsetX,
				followOffsetY: followConfig?.offsetY ?? DEFAULT_FOLLOW.offsetY,
				followOffsetZ: followConfig?.offsetZ ?? DEFAULT_FOLLOW.offsetZ,

				trauma: 0,
				shakeOffsetX: 0,
				shakeOffsetY: 0,
				shakeOffsetZ: 0,

				// Mutation methods — all closed-over values are already in scope
				follow(target: number | { id: number }, opts?: Camera3DFollowOptions) {
					const targetId = typeof target === 'number' ? target : target.id;
					state.followTarget = targetId;
					state.followSmoothing = opts?.smoothing ?? followConfig?.smoothing ?? DEFAULT_FOLLOW.smoothing;
					state.followOffsetX = opts?.offsetX ?? followConfig?.offsetX ?? DEFAULT_FOLLOW.offsetX;
					state.followOffsetY = opts?.offsetY ?? followConfig?.offsetY ?? DEFAULT_FOLLOW.offsetY;
					state.followOffsetZ = opts?.offsetZ ?? followConfig?.offsetZ ?? DEFAULT_FOLLOW.offsetZ;
				},

				unfollow() {
					state.followTarget = -1;
				},

				setTarget(x: number, y: number, z: number) {
					state.targetX = x;
					state.targetY = y;
					state.targetZ = z;
				},

				setOrbit(az: number, el: number, dist: number) {
					state.azimuth = az;
					state.elevation = clamp(el, minElevation, maxElevation);
					state.distance = clamp(dist, minDistance, maxDistance);
				},

				setDistance(d: number) {
					state.distance = clamp(d, minDistance, maxDistance);
				},

				setFov(f: number) {
					state.fov = f;
				},

				addTrauma(amount: number) {
					state.trauma = clamp(state.trauma + amount, 0, 1);
				},
			};

			world.addResource('camera3DState', state);

			// ==================== DOM Handlers ====================

			function onPointerDown(e: PointerEvent) {
				drag.active = true;
				drag.prevX = e.clientX;
				drag.prevY = e.clientY;
				drag.el?.setPointerCapture(e.pointerId);
			}

			function onPointerMove(e: PointerEvent) {
				if (!drag.active) return;
				const deltaX = e.clientX - drag.prevX;
				const deltaY = e.clientY - drag.prevY;
				drag.prevX = e.clientX;
				drag.prevY = e.clientY;

				state.azimuth -= deltaX * orbitSensitivity;
				state.elevation = clamp(
					state.elevation + deltaY * orbitSensitivity,
					minElevation,
					maxElevation,
				);
			}

			function onPointerUp(e: PointerEvent) {
				drag.active = false;
				drag.el?.releasePointerCapture(e.pointerId);
			}

			function onWheel(e: WheelEvent) {
				e.preventDefault();
				drag.pendingDolly += Math.sign(e.deltaY);
			}

			// ==================== Init System ====================

			// Camera ref cached once at init — never changes at runtime
			let cachedCamera: Renderer3DResourceTypes['camera'] | null = null;
			let cachedPerspCamera: PerspectiveCamera | null = null;

			world
				.addSystem('camera3d-init')
				.inGroup(systemGroup)
				.setOnInitialize((ecs) => {
					const threeRenderer = ecs.getResource('threeRenderer');
					cachedCamera = ecs.getResource('camera');

					// Narrow to PerspectiveCamera once
					cachedPerspCamera = 'aspect' in cachedCamera
						? cachedCamera as PerspectiveCamera
						: null;

					if (cachedPerspCamera) {
						state.fov = cachedPerspCamera.fov;
					}

					// Attach DOM listeners
					drag.el = threeRenderer.domElement;
					drag.el.addEventListener('pointerdown', onPointerDown);
					drag.el.addEventListener('pointermove', onPointerMove);
					drag.el.addEventListener('pointerup', onPointerUp);
					drag.el.addEventListener('wheel', onWheel as EventListener, { passive: false });

					// Initial camera position sync
					sphericalToCartesian(state.azimuth, state.elevation, state.distance, _camPos);
					cachedCamera.position.set(
						state.targetX + _camPos.x,
						state.targetY + _camPos.y,
						state.targetZ + _camPos.z,
					);
					cachedCamera.lookAt(state.targetX, state.targetY, state.targetZ);
				})
				.setOnDetach(() => {
					if (!drag.el) return;
					drag.el.removeEventListener('pointerdown', onPointerDown);
					drag.el.removeEventListener('pointermove', onPointerMove);
					drag.el.removeEventListener('pointerup', onPointerUp);
					drag.el.removeEventListener('wheel', onWheel as EventListener);
					drag.el = null;
					cachedCamera = null;
					cachedPerspCamera = null;
				});

			// ==================== Follow System ====================

			world
				.addSystem('camera3d-follow')
				.setPriority(400)
				.inPhase(phase)
				.inGroup(systemGroup)
				.setProcess(({ ecs, dt }) => {
					if (state.followTarget < 0) return;

					let worldTransform;
					try {
						worldTransform = ecs.getComponent(state.followTarget, 'worldTransform3D');
					} catch {
						// Entity was destroyed — auto-unfollow to avoid repeated throws
						state.followTarget = -1;
						return;
					}
					if (!worldTransform) return;

					const goalX = worldTransform.x + state.followOffsetX;
					const goalY = worldTransform.y + state.followOffsetY;
					const goalZ = worldTransform.z + state.followOffsetZ;

					const factor = Math.min(1, state.followSmoothing * dt);
					state.targetX += (goalX - state.targetX) * factor;
					state.targetY += (goalY - state.targetY) * factor;
					state.targetZ += (goalZ - state.targetZ) * factor;
				});

			// ==================== Shake System ====================

			world
				.addSystem('camera3d-shake')
				.setPriority(390)
				.inPhase(phase)
				.inGroup(systemGroup)
				.setProcess(({ dt }) => {
					if (state.trauma <= 0) {
						state.shakeOffsetX = 0;
						state.shakeOffsetY = 0;
						state.shakeOffsetZ = 0;
						return;
					}

					state.trauma = Math.max(0, state.trauma - shakeDecay * dt);

					const intensity = state.trauma * state.trauma;
					state.shakeOffsetX = shakeMaxX * intensity * (randomFn() * 2 - 1);
					state.shakeOffsetY = shakeMaxY * intensity * (randomFn() * 2 - 1);
					state.shakeOffsetZ = shakeMaxZ * intensity * (randomFn() * 2 - 1);
				});

			// ==================== Sync System ====================

			world
				.addSystem('camera3d-sync')
				.setPriority(380)
				.inPhase(phase)
				.inGroup(systemGroup)
				.setProcess(() => {
					if (!cachedCamera) return;

					// Process pending dolly
					if (drag.pendingDolly !== 0) {
						state.distance = clamp(
							state.distance * Math.pow(dollySensitivity, drag.pendingDolly),
							minDistance,
							maxDistance,
						);
						drag.pendingDolly = 0;
					}

					// Compute camera position from spherical coords
					sphericalToCartesian(state.azimuth, state.elevation, state.distance, _camPos);
					cachedCamera.position.set(
						state.targetX + _camPos.x + state.shakeOffsetX,
						state.targetY + _camPos.y + state.shakeOffsetY,
						state.targetZ + _camPos.z + state.shakeOffsetZ,
					);
					cachedCamera.lookAt(state.targetX, state.targetY, state.targetZ);

					// Update FOV if changed (PerspectiveCamera only)
					if (cachedPerspCamera && cachedPerspCamera.fov !== state.fov) {
						cachedPerspCamera.fov = state.fov;
						cachedPerspCamera.updateProjectionMatrix();
					}
				});
		});
}
