/**
 * Camera / Viewport Plugin for ECSpresso
 *
 * Provides a camera entity with world/screen coordinate conversion, smooth follow,
 * trauma-based shake, bounds clamping, and logical viewport dimensions.
 *
 * This plugin is renderer-agnostic. PixiJS or other renderer integration (applying
 * cameraState to a container/stage transform) is the consumer's responsibility.
 *
 * Camera uses its own x/y/zoom/rotation rather than localTransform/worldTransform.
 * It reads the target entity's worldTransform for follow, but doesn't participate
 * in the transform hierarchy itself.
 */

import { definePlugin, type Plugin } from 'ecspresso';
import type { SystemPhase } from 'ecspresso';
import type ECSpresso from 'ecspresso';
import type { TransformComponentTypes } from './transform';

// ==================== Component Types ====================

export interface Camera {
	x: number;
	y: number;
	zoom: number;
	rotation: number;
}

export interface CameraFollow {
	target: number;
	smoothing: number;
	deadzoneX: number;
	deadzoneY: number;
	offsetX: number;
	offsetY: number;
}

export interface CameraShake {
	trauma: number;
	traumaDecay: number;
	maxOffsetX: number;
	maxOffsetY: number;
	maxRotation: number;
}

export interface CameraBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface CameraComponentTypes {
	camera: Camera;
	cameraFollow: CameraFollow;
	cameraShake: CameraShake;
	cameraBounds: CameraBounds;
}

type CombinedComponentTypes = CameraComponentTypes & TransformComponentTypes;

// ==================== Resource Types ====================

export interface CameraState {
	x: number;
	y: number;
	zoom: number;
	rotation: number;
	shakeOffsetX: number;
	shakeOffsetY: number;
	shakeRotation: number;
	viewportWidth: number;
	viewportHeight: number;
}

export interface CameraResourceTypes {
	cameraState: CameraState;
}

// ==================== Plugin Options ====================

export interface CameraPluginOptions<G extends string = 'camera'> {
	viewportWidth?: number;
	viewportHeight?: number;
	systemGroup?: G;
	phase?: SystemPhase;
	randomFn?: () => number;
}

// ==================== Default Values ====================

export const DEFAULT_CAMERA: Readonly<Camera> = {
	x: 0,
	y: 0,
	zoom: 1,
	rotation: 0,
};

export const DEFAULT_CAMERA_STATE: Readonly<CameraState> = {
	x: 0,
	y: 0,
	zoom: 1,
	rotation: 0,
	shakeOffsetX: 0,
	shakeOffsetY: 0,
	shakeRotation: 0,
	viewportWidth: 800,
	viewportHeight: 600,
};

// ==================== Helper Functions ====================

export function createCamera(
	x = 0,
	y = 0,
	zoom = 1,
	rotation = 0,
): Pick<CameraComponentTypes, 'camera'> {
	return {
		camera: { x, y, zoom, rotation },
	};
}

export function createCameraFollow(
	target: number,
	options?: Partial<Omit<CameraFollow, 'target'>>,
): Pick<CameraComponentTypes, 'cameraFollow'> {
	return {
		cameraFollow: {
			target,
			smoothing: options?.smoothing ?? 5,
			deadzoneX: options?.deadzoneX ?? 0,
			deadzoneY: options?.deadzoneY ?? 0,
			offsetX: options?.offsetX ?? 0,
			offsetY: options?.offsetY ?? 0,
		},
	};
}

export function createCameraShake(
	options?: Partial<CameraShake>,
): Pick<CameraComponentTypes, 'cameraShake'> {
	return {
		cameraShake: {
			trauma: options?.trauma ?? 0,
			traumaDecay: options?.traumaDecay ?? 1,
			maxOffsetX: options?.maxOffsetX ?? 10,
			maxOffsetY: options?.maxOffsetY ?? 10,
			maxRotation: options?.maxRotation ?? 0.05,
		},
	};
}

export function createCameraBounds(
	minX: number,
	minY: number,
	maxX: number,
	maxY: number,
): Pick<CameraComponentTypes, 'cameraBounds'> {
	return {
		cameraBounds: { minX, minY, maxX, maxY },
	};
}

export function addTrauma<
	C extends CombinedComponentTypes,
	R extends CameraResourceTypes,
>(
	ecs: ECSpresso<C, any, R>,
	entityId: number,
	amount: number,
): void {
	const shake = ecs.getComponent(entityId, 'cameraShake');
	if (!shake) return;
	shake.trauma = Math.min(1, Math.max(0, shake.trauma + amount));
}

// ==================== Coordinate Conversion ====================

export function worldToScreen(
	worldX: number,
	worldY: number,
	state: CameraState,
): { x: number; y: number } {
	const dx = worldX - (state.x + state.shakeOffsetX);
	const dy = worldY - (state.y + state.shakeOffsetY);

	const angle = -(state.rotation + state.shakeRotation);
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const rx = dx * cos - dy * sin;
	const ry = dx * sin + dy * cos;

	return {
		x: rx * state.zoom + state.viewportWidth / 2,
		y: ry * state.zoom + state.viewportHeight / 2,
	};
}

export function screenToWorld(
	screenX: number,
	screenY: number,
	state: CameraState,
): { x: number; y: number } {
	const cx = (screenX - state.viewportWidth / 2) / state.zoom;
	const cy = (screenY - state.viewportHeight / 2) / state.zoom;

	const angle = state.rotation + state.shakeRotation;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const rx = cx * cos - cy * sin;
	const ry = cx * sin + cy * cos;

	return {
		x: rx + state.x + state.shakeOffsetX,
		y: ry + state.y + state.shakeOffsetY,
	};
}

// ==================== Plugin Factory ====================

export function createCameraPlugin<G extends string = 'camera'>(
	options?: CameraPluginOptions<G>,
): Plugin<CombinedComponentTypes, {}, CameraResourceTypes, {}, {}, 'camera-follow' | 'camera-shake-update' | 'camera-bounds' | 'camera-state-sync', G> {
	const {
		viewportWidth = 800,
		viewportHeight = 600,
		systemGroup = 'camera',
		phase = 'postUpdate',
		randomFn = Math.random,
	} = options ?? {};

	return definePlugin<CombinedComponentTypes, {}, CameraResourceTypes, {}, {}, 'camera-follow' | 'camera-shake-update' | 'camera-bounds' | 'camera-state-sync', G>({
		id: 'camera',
		install(world) {
			world.addResource('cameraState', {
				x: 0,
				y: 0,
				zoom: 1,
				rotation: 0,
				shakeOffsetX: 0,
				shakeOffsetY: 0,
				shakeRotation: 0,
				viewportWidth,
				viewportHeight,
			});

			// camera-follow: priority 400 (after transform propagation at 500)
			world
				.addSystem('camera-follow')
				.setPriority(400)
				.inPhase(phase)
				.inGroup(systemGroup)
				.addQuery('cameras', {
					with: ['camera', 'cameraFollow'],
				})
				.setProcess((queries, deltaTime, ecs) => {
					const t = Math.min(1, deltaTime);
					for (const entity of queries.cameras) {
						const { camera, cameraFollow } = entity.components;
						let targetWorld;
						try {
							targetWorld = ecs.getComponent(cameraFollow.target, 'worldTransform');
						} catch {
							continue;
						}
						if (!targetWorld) continue;
						if (!targetWorld) continue;

						const goalX = targetWorld.x + cameraFollow.offsetX;
						const goalY = targetWorld.y + cameraFollow.offsetY;
						const dx = goalX - camera.x;
						const dy = goalY - camera.y;

						const absDx = Math.abs(dx);
						const absDy = Math.abs(dy);

						if (absDx > cameraFollow.deadzoneX) {
							const sign = dx > 0 ? 1 : -1;
							const excessX = dx - sign * cameraFollow.deadzoneX;
							const factor = Math.min(1, cameraFollow.smoothing * t);
							camera.x += excessX * factor;
						}
						if (absDy > cameraFollow.deadzoneY) {
							const sign = dy > 0 ? 1 : -1;
							const excessY = dy - sign * cameraFollow.deadzoneY;
							const factor = Math.min(1, cameraFollow.smoothing * t);
							camera.y += excessY * factor;
						}
					}
				})
				.and();

			// camera-shake-update: priority 390
			world
				.addSystem('camera-shake-update')
				.setPriority(390)
				.inPhase(phase)
				.inGroup(systemGroup)
				.addQuery('shakeCameras', {
					with: ['camera', 'cameraShake'],
				})
				.setProcess((queries, deltaTime) => {
					for (const entity of queries.shakeCameras) {
						const { cameraShake } = entity.components;
						cameraShake.trauma = Math.max(0, cameraShake.trauma - cameraShake.traumaDecay * deltaTime);
					}
				})
				.and();

			// camera-bounds: priority 380
			world
				.addSystem('camera-bounds')
				.setPriority(380)
				.inPhase(phase)
				.inGroup(systemGroup)
				.addQuery('boundedCameras', {
					with: ['camera', 'cameraBounds'],
				})
				.setProcess((queries, _deltaTime, ecs) => {
					const state = ecs.getResource('cameraState');
					for (const entity of queries.boundedCameras) {
						const { camera, cameraBounds } = entity.components;
						const halfW = state.viewportWidth / (2 * camera.zoom);
						const halfH = state.viewportHeight / (2 * camera.zoom);

						const effectiveMinX = cameraBounds.minX + halfW;
						const effectiveMaxX = cameraBounds.maxX - halfW;
						const effectiveMinY = cameraBounds.minY + halfH;
						const effectiveMaxY = cameraBounds.maxY - halfH;

						if (effectiveMinX > effectiveMaxX) {
							camera.x = (cameraBounds.minX + cameraBounds.maxX) / 2;
						} else {
							camera.x = Math.max(effectiveMinX, Math.min(effectiveMaxX, camera.x));
						}

						if (effectiveMinY > effectiveMaxY) {
							camera.y = (cameraBounds.minY + cameraBounds.maxY) / 2;
						} else {
							camera.y = Math.max(effectiveMinY, Math.min(effectiveMaxY, camera.y));
						}
					}
				})
				.and();

			// camera-state-sync: priority 370
			world
				.addSystem('camera-state-sync')
				.setPriority(370)
				.inPhase(phase)
				.inGroup(systemGroup)
				.setProcess((_queries, _deltaTime, ecs) => {
					const state = ecs.getResource('cameraState');
					const cameras = ecs.getEntitiesWithQuery(['camera']);
					const first = cameras[0];

					if (!first) {
						state.x = 0;
						state.y = 0;
						state.zoom = 1;
						state.rotation = 0;
						state.shakeOffsetX = 0;
						state.shakeOffsetY = 0;
						state.shakeRotation = 0;
						return;
					}

					const camera = first.components.camera;
					state.x = camera.x;
					state.y = camera.y;
					state.zoom = camera.zoom;
					state.rotation = camera.rotation;

					const shake = ecs.getComponent(first.id, 'cameraShake');
					if (shake && shake.trauma > 0) {
						const intensity = shake.trauma * shake.trauma;
						state.shakeOffsetX = shake.maxOffsetX * intensity * (randomFn() * 2 - 1);
						state.shakeOffsetY = shake.maxOffsetY * intensity * (randomFn() * 2 - 1);
						state.shakeRotation = shake.maxRotation * intensity * (randomFn() * 2 - 1);
					} else {
						state.shakeOffsetX = 0;
						state.shakeOffsetY = 0;
						state.shakeRotation = 0;
					}
				})
				.and();
		},
	});
}
