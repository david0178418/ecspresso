/**
 * Camera / Viewport Plugin for ECSpresso
 *
 * Provides a declarative camera with world/screen coordinate conversion, smooth follow,
 * trauma-based shake, bounds clamping, cursor-centered zoom, and logical viewport dimensions.
 *
 * This plugin is renderer-agnostic. PixiJS or other renderer integration (applying
 * cameraState to a container/stage transform) is the consumer's responsibility.
 *
 * Camera uses its own x/y/zoom/rotation rather than localTransform/worldTransform.
 * It reads the target entity's worldTransform for follow, but doesn't participate
 * in the transform hierarchy itself.
 */

import { definePlugin } from 'ecspresso';
import type { SystemPhase } from 'ecspresso';
import type ECSpresso from 'ecspresso';
import type { WorldConfigFrom } from '../type-utils';
import type { TransformWorldConfig } from './transform';

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

// ==================== Resource Types ====================

export interface FollowOptions {
	smoothing?: number;
	deadzoneX?: number;
	deadzoneY?: number;
	offsetX?: number;
	offsetY?: number;
}

export type EntityHandle = { id: number };

export interface CameraState {
	// Read-only data (synced from camera entity each frame)
	x: number;
	y: number;
	zoom: number;
	rotation: number;
	shakeOffsetX: number;
	shakeOffsetY: number;
	shakeRotation: number;
	viewportWidth: number;
	viewportHeight: number;
	entityId: number;

	// Mutation methods
	follow(target: number | EntityHandle, options?: FollowOptions): void;
	unfollow(): void;
	setPosition(x: number, y: number): void;
	setZoom(zoom: number): void;
	setRotation(rotation: number): void;
	setBounds(minX: number, minY: number, maxX: number, maxY: number): void;
	clearBounds(): void;
	addTrauma(amount: number): void;
}

export interface CameraResourceTypes {
	cameraState: CameraState;
}

// ==================== Plugin Options ====================

export interface CameraPluginOptions<G extends string = 'camera'> {
	viewportWidth?: number;
	viewportHeight?: number;
	initial?: {
		x?: number;
		y?: number;
		zoom?: number;
		rotation?: number;
	};
	follow?: FollowOptions;
	shake?: boolean | Partial<Omit<CameraShake, 'trauma'>>;
	bounds?:
		| { minX: number; minY: number; maxX: number; maxY: number }
		| [number, number, number, number];
	zoom?: {
		zoomStep?: number;
		minZoom?: number;
		maxZoom?: number;
	};
	systemGroup?: G;
	phase?: SystemPhase;
	randomFn?: () => number;
}

// ==================== Default Values ====================

const DEFAULT_SHAKE: Readonly<Omit<CameraShake, 'trauma'>> = {
	traumaDecay: 1,
	maxOffsetX: 10,
	maxOffsetY: 10,
	maxRotation: 0.05,
};

const DEFAULT_FOLLOW: Readonly<Omit<CameraFollow, 'target'>> = {
	smoothing: 5,
	deadzoneX: 0,
	deadzoneY: 0,
	offsetX: 0,
	offsetY: 0,
};

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

// ==================== Internal Helpers ====================

function resolveTarget(target: number | EntityHandle): number {
	return typeof target === 'number' ? target : target.id;
}

function resolveShakeOptions(shake: true | Partial<Omit<CameraShake, 'trauma'>>): CameraShake {
	const opts = shake === true ? {} : shake;
	return {
		trauma: 0,
		traumaDecay: opts.traumaDecay ?? DEFAULT_SHAKE.traumaDecay,
		maxOffsetX: opts.maxOffsetX ?? DEFAULT_SHAKE.maxOffsetX,
		maxOffsetY: opts.maxOffsetY ?? DEFAULT_SHAKE.maxOffsetY,
		maxRotation: opts.maxRotation ?? DEFAULT_SHAKE.maxRotation,
	};
}

function resolveBounds(
	bounds: { minX: number; minY: number; maxX: number; maxY: number } | [number, number, number, number],
): CameraBounds {
	if (Array.isArray(bounds)) {
		return { minX: bounds[0], minY: bounds[1], maxX: bounds[2], maxY: bounds[3] };
	}
	return { ...bounds };
}

function resolveFollowOptions(options?: FollowOptions): Omit<CameraFollow, 'target'> {
	return {
		smoothing: options?.smoothing ?? DEFAULT_FOLLOW.smoothing,
		deadzoneX: options?.deadzoneX ?? DEFAULT_FOLLOW.deadzoneX,
		deadzoneY: options?.deadzoneY ?? DEFAULT_FOLLOW.deadzoneY,
		offsetX: options?.offsetX ?? DEFAULT_FOLLOW.offsetX,
		offsetY: options?.offsetY ?? DEFAULT_FOLLOW.offsetY,
	};
}

// ==================== Plugin Factory ====================

type CameraWorldConfig = WorldConfigFrom<CameraComponentTypes, {}, CameraResourceTypes>;

type CameraLabels =
	| 'camera-init'
	| 'camera-follow'
	| 'camera-shake-update'
	| 'camera-bounds'
	| 'camera-state-sync'
	| 'camera-zoom';

export function createCameraPlugin<G extends string = 'camera'>(
	options?: CameraPluginOptions<G>,
) {
	const {
		viewportWidth = 800,
		viewportHeight = 600,
		initial,
		follow: followConfig,
		shake: shakeConfig,
		bounds: boundsConfig,
		zoom: zoomConfig,
		systemGroup = 'camera',
		phase = 'postUpdate',
		randomFn = Math.random,
	} = options ?? {};

	return definePlugin('camera')
		.withComponentTypes<CameraComponentTypes>()
		.withResourceTypes<CameraResourceTypes>()
		.withLabels<CameraLabels>()
		.withGroups<G>()
		.requires<TransformWorldConfig>()
		.install((world) => {
			// Build mutation methods as closures over the world reference.
			// The cameraState resource is created immediately with placeholder methods,
			// then the init system populates entityId and wires up real methods.

			const cameraState: CameraState = {
				x: initial?.x ?? 0,
				y: initial?.y ?? 0,
				zoom: initial?.zoom ?? 1,
				rotation: initial?.rotation ?? 0,
				shakeOffsetX: 0,
				shakeOffsetY: 0,
				shakeRotation: 0,
				viewportWidth,
				viewportHeight,
				entityId: -1,

				// Mutation methods — wired up after camera entity is spawned
				follow: () => {},
				unfollow: () => {},
				setPosition: () => {},
				setZoom: () => {},
				setRotation: () => {},
				setBounds: () => {},
				clearBounds: () => {},
				addTrauma: () => {},
			};

			world.addResource('cameraState', cameraState);

			// camera-init: spawns camera entity and wires up mutation closures
			world
				.addSystem('camera-init')
				.inGroup(systemGroup)
				.setOnInitialize((ecs: ECSpresso<CameraWorldConfig & TransformWorldConfig>) => {
					// Spawn with required camera component
					const entity = ecs.spawn({
						camera: {
							x: initial?.x ?? 0,
							y: initial?.y ?? 0,
							zoom: initial?.zoom ?? 1,
							rotation: initial?.rotation ?? 0,
						},
					});

					// Conditionally add optional components
					if (followConfig) {
						ecs.addComponent(entity.id, 'cameraFollow', {
							target: -1,
							...resolveFollowOptions(followConfig),
						});
					}

					if (shakeConfig) {
						ecs.addComponent(entity.id, 'cameraShake', resolveShakeOptions(shakeConfig));
					}

					if (boundsConfig) {
						ecs.addComponent(entity.id, 'cameraBounds', resolveBounds(boundsConfig));
					}
					cameraState.entityId = entity.id;

					// Wire up mutation methods
					cameraState.follow = (target: number | EntityHandle, opts?: FollowOptions) => {
						const targetId = resolveTarget(target);
						const followData: CameraFollow = {
							target: targetId,
							...resolveFollowOptions(opts),
						};
						const existing = ecs.getComponent(cameraState.entityId, 'cameraFollow');
						if (existing) {
							existing.target = followData.target;
							existing.smoothing = followData.smoothing;
							existing.deadzoneX = followData.deadzoneX;
							existing.deadzoneY = followData.deadzoneY;
							existing.offsetX = followData.offsetX;
							existing.offsetY = followData.offsetY;
						} else {
							ecs.addComponent(cameraState.entityId, 'cameraFollow', followData);
						}
					};

					cameraState.unfollow = () => {
						const existing = ecs.getComponent(cameraState.entityId, 'cameraFollow');
						if (existing) {
							ecs.removeComponent(cameraState.entityId, 'cameraFollow');
						}
					};

					cameraState.setPosition = (x: number, y: number) => {
						const camera = ecs.getComponent(cameraState.entityId, 'camera');
						if (!camera) return;
						camera.x = x;
						camera.y = y;
					};

					cameraState.setZoom = (zoom: number) => {
						const camera = ecs.getComponent(cameraState.entityId, 'camera');
						if (!camera) return;
						camera.zoom = zoom;
					};

					cameraState.setRotation = (rotation: number) => {
						const camera = ecs.getComponent(cameraState.entityId, 'camera');
						if (!camera) return;
						camera.rotation = rotation;
					};

					cameraState.setBounds = (minX: number, minY: number, maxX: number, maxY: number) => {
						const existing = ecs.getComponent(cameraState.entityId, 'cameraBounds');
						if (existing) {
							existing.minX = minX;
							existing.minY = minY;
							existing.maxX = maxX;
							existing.maxY = maxY;
						} else {
							ecs.addComponent(cameraState.entityId, 'cameraBounds', { minX, minY, maxX, maxY });
						}
					};

					cameraState.clearBounds = () => {
						const existing = ecs.getComponent(cameraState.entityId, 'cameraBounds');
						if (existing) {
							ecs.removeComponent(cameraState.entityId, 'cameraBounds');
						}
					};

					cameraState.addTrauma = (amount: number) => {
						const shake = ecs.getComponent(cameraState.entityId, 'cameraShake');
						if (shake) {
							shake.trauma = Math.min(1, Math.max(0, shake.trauma + amount));
						} else {
							ecs.addComponent(cameraState.entityId, 'cameraShake', {
								...resolveShakeOptions(true),
								trauma: Math.min(1, Math.max(0, amount)),
							});
						}
					};
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
				.setProcess(({ queries, dt, ecs }) => {
					const t = Math.min(1, dt);
					for (const entity of queries.cameras) {
						const { camera, cameraFollow } = entity.components;
						if (cameraFollow.target < 0) continue;

						let targetWorld;
						try {
							targetWorld = ecs.getComponent(cameraFollow.target, 'worldTransform');
						} catch {
							continue;
						}
						if (!targetWorld) continue;

						const goalX = targetWorld.x + cameraFollow.offsetX;
						const goalY = targetWorld.y + cameraFollow.offsetY;
						const dx = goalX - camera.x;
						const dy = goalY - camera.y;

						if (Math.abs(dx) > cameraFollow.deadzoneX) {
							const sign = dx > 0 ? 1 : -1;
							const excessX = dx - sign * cameraFollow.deadzoneX;
							const factor = Math.min(1, cameraFollow.smoothing * t);
							camera.x += excessX * factor;
						}
						if (Math.abs(dy) > cameraFollow.deadzoneY) {
							const sign = dy > 0 ? 1 : -1;
							const excessY = dy - sign * cameraFollow.deadzoneY;
							const factor = Math.min(1, cameraFollow.smoothing * t);
							camera.y += excessY * factor;
						}
					}
				});

			// camera-shake-update: priority 390
			world
				.addSystem('camera-shake-update')
				.setPriority(390)
				.inPhase(phase)
				.inGroup(systemGroup)
				.addQuery('shakeCameras', {
					with: ['camera', 'cameraShake'],
				})
				.setProcess(({ queries, dt }) => {
					for (const entity of queries.shakeCameras) {
						const { cameraShake } = entity.components;
						cameraShake.trauma = Math.max(0, cameraShake.trauma - cameraShake.traumaDecay * dt);
					}
				});

			// camera-bounds: priority 380
			world
				.addSystem('camera-bounds')
				.setPriority(380)
				.inPhase(phase)
				.inGroup(systemGroup)
				.addQuery('boundedCameras', {
					with: ['camera', 'cameraBounds'],
				})
				.setProcess(({ queries }) => {
					for (const entity of queries.boundedCameras) {
						const { camera, cameraBounds } = entity.components;
						const halfW = cameraState.viewportWidth / (2 * camera.zoom);
						const halfH = cameraState.viewportHeight / (2 * camera.zoom);

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
				});

			// camera-state-sync: priority 370
			world
				.addSystem('camera-state-sync')
				.setPriority(370)
				.inPhase(phase)
				.inGroup(systemGroup)
				.setProcess(({ ecs }) => {
					const camera = ecs.getComponent(cameraState.entityId, 'camera');
					if (!camera) {
						cameraState.x = 0;
						cameraState.y = 0;
						cameraState.zoom = 1;
						cameraState.rotation = 0;
						cameraState.shakeOffsetX = 0;
						cameraState.shakeOffsetY = 0;
						cameraState.shakeRotation = 0;
						return;
					}

					cameraState.x = camera.x;
					cameraState.y = camera.y;
					cameraState.zoom = camera.zoom;
					cameraState.rotation = camera.rotation;

					const shake = ecs.getComponent(cameraState.entityId, 'cameraShake');
					if (shake && shake.trauma > 0) {
						const intensity = shake.trauma * shake.trauma;
						cameraState.shakeOffsetX = shake.maxOffsetX * intensity * (randomFn() * 2 - 1);
						cameraState.shakeOffsetY = shake.maxOffsetY * intensity * (randomFn() * 2 - 1);
						cameraState.shakeRotation = shake.maxRotation * intensity * (randomFn() * 2 - 1);
					} else {
						cameraState.shakeOffsetX = 0;
						cameraState.shakeOffsetY = 0;
						cameraState.shakeRotation = 0;
					}
				});

			// camera-zoom: conditionally registered when zoom option is provided
			if (zoomConfig) {
				const {
					zoomStep = 0.1,
					minZoom = 0.1,
					maxZoom = 10,
				} = zoomConfig;

				let pendingSteps = 0;
				let zoomActive = false;

				function onWheel(e: WheelEvent) {
					e.preventDefault();
					pendingSteps += Math.sign(e.deltaY);
				}

				world
					.addSystem('camera-zoom')
					.setPriority(410)
					.inPhase('preUpdate')
					.inGroup(systemGroup)
					.addQuery('cameras', {
						with: ['camera'],
					})
					.setOnInitialize((ecs) => {
						// Check for required dependencies
						type InputState = { pointer: { position: { x: number; y: number } } };
						const inputState = ecs.tryGetResource<InputState>('inputState');
						const pixiApp = ecs.tryGetResource<{ canvas: HTMLCanvasElement }>('pixiApp');

						if (!inputState || !pixiApp) {
							console.error(
								'[camera] zoom requires the input plugin and renderer2D plugin. ' +
								'Zoom will be disabled.',
							);
							return;
						}

						pixiApp.canvas.addEventListener('wheel', onWheel as EventListener, { passive: false });
						zoomActive = true;
					})
					.setOnDetach((ecs) => {
						if (!zoomActive) return;
						const pixiApp = ecs.tryGetResource('pixiApp') as { canvas: HTMLCanvasElement } | undefined;
						if (pixiApp) {
							pixiApp.canvas.removeEventListener('wheel', onWheel as EventListener);
						}
					})
					.setProcess(({ queries, ecs }) => {
						if (!zoomActive || pendingSteps === 0) return;

						const steps = pendingSteps;
						pendingSteps = 0;

						const [cameraEntity] = queries.cameras;
						if (!cameraEntity) return;

						const cam = cameraEntity.components.camera;
						type InputState = { pointer: { position: { x: number; y: number } } };
						const inputState = ecs.tryGetResource<InputState>('inputState');
						if (!inputState) return;

						// World point under cursor before zoom
						const worldBefore = screenToWorld(
							inputState.pointer.position.x,
							inputState.pointer.position.y,
							cameraState,
						);

						// Apply zoom — proportional to number of wheel steps
						const direction = steps > 0 ? (1 - zoomStep) : (1 + zoomStep);
						cam.zoom = Math.max(minZoom, Math.min(maxZoom, cam.zoom * Math.pow(direction, Math.abs(steps))));

						// Adjust camera position so the world point under cursor stays fixed
						cam.x = worldBefore.x - (inputState.pointer.position.x - cameraState.viewportWidth / 2) / cam.zoom;
						cam.y = worldBefore.y - (inputState.pointer.position.y - cameraState.viewportHeight / 2) / cam.zoom;
					});
			}
		});
}
