/**
 * Isometric Projection Plugin for ECSpresso
 *
 * Converts Cartesian world-space positions to isometric screen positions
 * in the render phase. All ECS-level logic (physics, collision, camera follow)
 * continues to operate in Cartesian world space — only PixiJS display object
 * positions are projected.
 *
 * Optionally provides an isometric-aware camera sync system that projects
 * the camera position before applying it to the root container.
 */

import { definePlugin } from 'ecspresso';
import type { BasePluginOptions } from 'ecspresso';
import type { WorldConfigFrom } from '../../type-utils';
import type { TransformComponentTypes } from '../spatial/transform';
import type { Renderer2DComponentTypes, Renderer2DResourceTypes } from '../rendering/renderer2D';
import type { CameraResourceTypes } from '../spatial/camera';

// ==================== Types ====================

/**
 * Isometric projection configuration.
 */
export interface IsoProjectionState {
	readonly tileWidth: number;
	readonly tileHeight: number;
	readonly originX: number;
	readonly originY: number;
}

export interface IsoProjectionResourceTypes {
	isoProjection: IsoProjectionState;
}

type IsoProjectionRequires = WorldConfigFrom<
	TransformComponentTypes & Pick<Renderer2DComponentTypes, 'sprite' | 'graphics' | 'container'>,
	{},
	Renderer2DResourceTypes & CameraResourceTypes
>;

// ==================== Plugin Options ====================

export interface IsoProjectionPluginOptions<G extends string = 'isometric'> extends BasePluginOptions<G> {
	/** Tile width in pixels (default: 64) */
	tileWidth?: number;
	/** Tile height in pixels (default: 32) */
	tileHeight?: number;
	/** Screen-space X origin offset (default: 0) */
	originX?: number;
	/** Screen-space Y origin offset (default: 0) */
	originY?: number;
	/** Register an isometric-aware camera sync system (default: false).
	 *  When true, set `camera: false` on createRenderer2DPlugin to avoid conflicts. */
	camera?: boolean;
}

// ==================== Coordinate Conversion ====================

// Pre-allocated point for hot-path use — returned by reference, consumed immediately by callers
const _tempPoint = { x: 0, y: 0 };

function worldToIsoInto(
	worldX: number,
	worldY: number,
	halfW: number,
	halfH: number,
	originX: number,
	originY: number,
): { x: number; y: number } {
	_tempPoint.x = (worldX - worldY) * halfW + originX;
	_tempPoint.y = (worldX + worldY) * halfH + originY;
	return _tempPoint;
}

/**
 * Convert Cartesian world coordinates to isometric screen coordinates.
 *
 * @param worldX World-space X coordinate
 * @param worldY World-space Y coordinate
 * @param state Isometric projection state
 * @returns New object with projected { x, y }
 */
export function worldToIso(
	worldX: number,
	worldY: number,
	state: IsoProjectionState,
): { x: number; y: number } {
	return {
		x: (worldX - worldY) * (state.tileWidth / 2) + state.originX,
		y: (worldX + worldY) * (state.tileHeight / 2) + state.originY,
	};
}

/**
 * Convert isometric screen coordinates back to Cartesian world coordinates.
 *
 * @param isoX Isometric screen-space X coordinate
 * @param isoY Isometric screen-space Y coordinate
 * @param state Isometric projection state
 * @returns New object with world-space { x, y }
 */
export function isoToWorld(
	isoX: number,
	isoY: number,
	state: IsoProjectionState,
): { x: number; y: number } {
	const relX = isoX - state.originX;
	const relY = isoY - state.originY;
	return {
		x: relX / state.tileWidth + relY / state.tileHeight,
		y: -relX / state.tileWidth + relY / state.tileHeight,
	};
}

/**
 * Convert screen coordinates (e.g. clientX/clientY) to isometric world (tile) coordinates,
 * accounting for camera position and zoom.
 *
 * @param screenX Screen-space X coordinate (e.g. clientX from a pointer event)
 * @param screenY Screen-space Y coordinate (e.g. clientY from a pointer event)
 * @param cameraState Camera state with position and zoom
 * @param isoState Isometric projection state
 * @param canvas The HTMLCanvasElement used for rendering
 * @returns World-space { x, y } in tile coordinates
 */
export function screenToIsoWorld(
	screenX: number,
	screenY: number,
	cameraState: { x: number; y: number; zoom: number },
	isoState: IsoProjectionState,
	canvas: HTMLCanvasElement,
): { x: number; y: number } {
	const rect = canvas.getBoundingClientRect();
	const screenOffX = screenX - (rect.left + rect.width / 2);
	const screenOffY = screenY - (rect.top + rect.height / 2);
	const camIso = worldToIso(cameraState.x, cameraState.y, isoState);
	return isoToWorld(
		camIso.x + screenOffX / cameraState.zoom,
		camIso.y + screenOffY / cameraState.zoom,
		isoState,
	);
}

// ==================== Plugin Factory ====================

/**
 * Create an isometric projection plugin.
 *
 * Adds a render-phase system that overwrites PixiJS display object positions
 * with isometric projections of their `worldTransform` coordinates.
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso.create()
 *   .withPlugin(createRenderer2DPlugin({ camera: false, ... }))
 *   .withPlugin(createCameraPlugin({ ... }))
 *   .withPlugin(createIsoProjectionPlugin({ tileWidth: 64, tileHeight: 32, camera: true }))
 *   .build();
 * ```
 */
export function createIsoProjectionPlugin<G extends string = 'isometric'>(
	options?: IsoProjectionPluginOptions<G>,
) {
	const {
		tileWidth = 64,
		tileHeight = 32,
		originX = 0,
		originY = 0,
		camera = false,
		systemGroup = 'isometric',
	} = options ?? {};

	return definePlugin('isometric-projection')
		.withResourceTypes<IsoProjectionResourceTypes>()
		.requires<IsoProjectionRequires>()
		.withGroups<G>()
		.install((world) => {
			const halfW = tileWidth / 2;
			const halfH = tileHeight / 2;

			world.addResource('isoProjection', {
				tileWidth,
				tileHeight,
				originX,
				originY,
			});

			// ==================== Projection System ====================

			world
				.addSystem('isometric-projection')
				.setPriority(400)
				.inPhase('render')
				.inGroup(systemGroup)
				.addQuery('sprites', {
					with: ['sprite', 'worldTransform'],
					changed: ['worldTransform'],
				})
				.addQuery('graphics', {
					with: ['graphics', 'worldTransform'],
					changed: ['worldTransform'],
				})
				.addQuery('containers', {
					with: ['container', 'worldTransform'],
					changed: ['worldTransform'],
				})
				.setProcess(({ queries }) => {
					for (const entity of queries.sprites) {
						const { sprite, worldTransform } = entity.components;
						const projected = worldToIsoInto(worldTransform.x, worldTransform.y, halfW, halfH, originX, originY);
						sprite.position.set(projected.x, projected.y);
					}

					for (const entity of queries.graphics) {
						const { graphics, worldTransform } = entity.components;
						const projected = worldToIsoInto(worldTransform.x, worldTransform.y, halfW, halfH, originX, originY);
						graphics.position.set(projected.x, projected.y);
					}

					for (const entity of queries.containers) {
						const { container, worldTransform } = entity.components;
						const projected = worldToIsoInto(worldTransform.x, worldTransform.y, halfW, halfH, originX, originY);
						container.position.set(projected.x, projected.y);
					}
				});

			// ==================== Isometric Camera Sync (opt-in) ====================

			if (camera) {
				world
					.addSystem('isometric-camera-sync')
					.setPriority(900)
					.inPhase('render')
					.inGroup(systemGroup)
					.withResources(['cameraState', 'rootContainer', 'pixiApp'])
					.setProcess(({ resources: { cameraState: state, rootContainer: root, pixiApp: app } }) => {
						const centerW = app.screen.width;
						const centerH = app.screen.height;

						const camIso = worldToIsoInto(
							state.x + state.shakeOffsetX,
							state.y + state.shakeOffsetY,
							halfW, halfH, originX, originY,
						);

						root.position.set(
							centerW / 2 - camIso.x * state.zoom,
							centerH / 2 - camIso.y * state.zoom,
						);
						root.scale.set(state.zoom);
						root.rotation = -(state.rotation + state.shakeRotation);
					});
			}
		});
}
