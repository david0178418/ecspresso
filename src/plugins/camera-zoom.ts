/**
 * Camera Zoom Plugin for ECSpresso
 *
 * Provides mouse-wheel zoom that centers on the cursor position.
 * When zooming, the world point under the cursor stays fixed on screen.
 *
 * Requires the camera plugin (for camera component and cameraState resource)
 * and the input plugin (for pointer position).
 */

import { definePlugin, type BasePluginOptions } from 'ecspresso';
import type { WorldConfigFrom } from 'ecspresso';
import type { CameraComponentTypes, CameraResourceTypes } from './camera';
import { screenToWorld } from './camera';
import type { InputResourceTypes } from './input';
import type { Renderer2DResourceTypes } from './renderers/renderer2D';

// ==================== Dependency Types ====================

type CameraZoomRequires = WorldConfigFrom<
	CameraComponentTypes,
	{},
	CameraResourceTypes & InputResourceTypes & Renderer2DResourceTypes
>;

// ==================== Plugin Options ====================

/**
 * Configuration options for the camera zoom plugin.
 */
export interface CameraZoomPluginOptions<G extends string = 'camera'> extends BasePluginOptions<G> {
	/** Zoom multiplier per wheel tick (default: 0.1) */
	zoomStep?: number;
	/** Minimum zoom level (default: 0.1) */
	minZoom?: number;
	/** Maximum zoom level (default: 10) */
	maxZoom?: number;
}

// ==================== Plugin Factory ====================

/**
 * Create a camera zoom plugin for ECSpresso.
 *
 * Provides cursor-centered zoom via mouse wheel. The world point under
 * the cursor remains fixed on screen during zoom, creating the natural
 * "zoom to cursor" behavior expected in RTS and map applications.
 *
 * Requires the camera plugin, input plugin, and renderer2D plugin.
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso.create()
 *   .withPlugin(createRenderer2DPlugin({ camera: true }))
 *   .withPlugin(createCameraPlugin())
 *   .withPlugin(createInputPlugin())
 *   .withPlugin(createCameraZoomPlugin({ minZoom: 0.5, maxZoom: 3 }))
 *   .build();
 * ```
 */
export function createCameraZoomPlugin<G extends string = 'camera'>(
	options?: CameraZoomPluginOptions<G>
) {
	const {
		systemGroup = 'camera',
		priority = 410,
		phase = 'preUpdate',
		zoomStep = 0.1,
		minZoom = 0.1,
		maxZoom = 10,
	} = options ?? {};

	// Accumulated wheel steps between frames (sign-based to preserve multi-notch responsiveness)
	let pendingSteps = 0;

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		pendingSteps += Math.sign(e.deltaY);
	}

	return definePlugin('camera-zoom')
		.withLabels<'camera-zoom'>()
		.withGroups<G>()
		.requires<CameraZoomRequires>()
		.install((world) => {
			world
				.addSystem('camera-zoom')
				.setPriority(priority)
				.inPhase(phase)
				.inGroup(systemGroup)
				.addQuery('cameras', {
					with: ['camera'],
				})
				.withResources(['inputState', 'cameraState', 'pixiApp'])
				.setOnInitialize((ecs) => {
					const pixiApp = ecs.getResource('pixiApp');
					pixiApp.canvas.addEventListener('wheel', onWheel as EventListener, { passive: false });
				})
				.setOnDetach((ecs) => {
					const pixiApp = ecs.getResource('pixiApp');
					pixiApp.canvas.removeEventListener('wheel', onWheel as EventListener);
				})
				.setProcess(({ queries, resources }) => {
					if (pendingSteps === 0) return;

					const steps = pendingSteps;
					pendingSteps = 0;

					const [cameraEntity] = queries.cameras;
					if (!cameraEntity) return;

					const cam = cameraEntity.components.camera;
					const { cameraState, inputState: input } = resources;

					// World point under cursor before zoom
					const worldBefore = screenToWorld(
						input.pointer.position.x,
						input.pointer.position.y,
						cameraState,
					);

					// Apply zoom — proportional to number of wheel steps
					const direction = steps > 0 ? (1 - zoomStep) : (1 + zoomStep);
					cam.zoom = Math.max(minZoom, Math.min(maxZoom, cam.zoom * Math.pow(direction, Math.abs(steps))));

					// Adjust camera position so the world point under cursor stays fixed
					cam.x = worldBefore.x - (input.pointer.position.x - cameraState.viewportWidth / 2) / cam.zoom;
					cam.y = worldBefore.y - (input.pointer.position.y - cameraState.viewportHeight / 2) / cam.zoom;
				});
		});
}
