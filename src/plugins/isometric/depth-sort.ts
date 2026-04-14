/**
 * Isometric Depth Sort Plugin for ECSpresso
 *
 * Sets PixiJS `zIndex` on entities based on their world-space position,
 * ensuring correct visual overlap in isometric rendering. Entities with
 * higher world X + Y values render in front.
 *
 * Requires `rootContainer` from the renderer2D plugin.
 * Enables `sortableChildren` on the root container at initialization.
 */

import { definePlugin } from 'ecspresso';
import type { BasePluginOptions } from 'ecspresso';
import type { WorldConfigFrom } from '../../type-utils';
import type { TransformComponentTypes } from '../spatial/transform';
import type { Renderer2DComponentTypes, Renderer2DResourceTypes } from '../rendering/renderer2D';

// ==================== Component Types ====================

/**
 * Optional component that offsets an entity's depth sort value.
 * Entities with a positive depthOffset render in front of entities
 * at the same world position (e.g., a player on top of a ground tile).
 */
export interface IsoDepthSortComponentTypes {
	depthOffset: number;
}

type IsoDepthSortRequires = WorldConfigFrom<
	TransformComponentTypes & Pick<Renderer2DComponentTypes, 'sprite' | 'graphics' | 'container'>,
	{},
	Renderer2DResourceTypes
>;

// ==================== Plugin Options ====================

export interface IsoDepthSortPluginOptions<G extends string = 'isometric'> extends BasePluginOptions<G> {
	/** Custom depth function. Receives world-space x/y, returns a sort key.
	 *  Default: `(x, y) => x + y` */
	depthFn?: (worldX: number, worldY: number) => number;
}

// ==================== Default Depth Function ====================

function defaultDepthFn(worldX: number, worldY: number): number {
	return worldX + worldY;
}

// ==================== Plugin Factory ====================

/**
 * Create an isometric depth sort plugin.
 *
 * Adds a render-phase system that sets PixiJS `zIndex` based on world-space
 * position, enabling correct front-to-back ordering in isometric views.
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso.create()
 *   .withPlugin(createRenderer2DPlugin({ ... }))
 *   .withPlugin(createIsoDepthSortPlugin())
 *   .build();
 * ```
 */
export function createIsoDepthSortPlugin<G extends string = 'isometric'>(
	options?: IsoDepthSortPluginOptions<G>,
) {
	const {
		depthFn = defaultDepthFn,
		systemGroup = 'isometric',
	} = options ?? {};

	return definePlugin('isometric-depth-sort')
		.withComponentTypes<IsoDepthSortComponentTypes>()
		.requires<IsoDepthSortRequires>()
		.withGroups<G>()
		.install((world) => {
			// ==================== Init: Enable Sorting ====================

			world
				.addSystem('isometric-depth-sort-init')
				.inGroup(systemGroup)
				.setOnInitialize((ecs) => {
					const root = ecs.getResource('rootContainer');
					root.sortableChildren = true;
				});

			// ==================== Depth Sort System ====================

			world
				.addSystem('isometric-depth-sort')
				.setPriority(350)
				.inPhase('render')
				.inGroup(systemGroup)
				.addQuery('sprites', {
					with: ['sprite', 'worldTransform'],
					changed: ['worldTransform'],
					optional: ['depthOffset'],
				})
				.addQuery('graphics', {
					with: ['graphics', 'worldTransform'],
					changed: ['worldTransform'],
					optional: ['depthOffset'],
				})
				.addQuery('containers', {
					with: ['container', 'worldTransform'],
					changed: ['worldTransform'],
					optional: ['depthOffset'],
				})
				.setProcess(({ queries }) => {
					for (const entity of queries.sprites) {
						const { sprite, worldTransform, depthOffset } = entity.components;
						sprite.zIndex = depthFn(worldTransform.x, worldTransform.y) + (depthOffset ?? 0);
					}

					for (const entity of queries.graphics) {
						const { graphics, worldTransform, depthOffset } = entity.components;
						graphics.zIndex = depthFn(worldTransform.x, worldTransform.y) + (depthOffset ?? 0);
					}

					for (const entity of queries.containers) {
						const { container, worldTransform, depthOffset } = entity.components;
						container.zIndex = depthFn(worldTransform.x, worldTransform.y) + (depthOffset ?? 0);
					}
				});
		});
}
