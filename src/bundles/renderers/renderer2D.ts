/**
 * 2D Renderer Bundle for ECSpresso
 *
 * An opt-in PixiJS-based 2D rendering bundle that automates scene graph wiring.
 * Import from 'ecspresso/bundles/renderers/renderer2D'
 *
 * This bundle includes transform propagation automatically.
 */

import type { Application, ApplicationOptions, Container, Sprite, Graphics } from 'pixi.js';
import { Bundle, mergeBundles } from 'ecspresso';
import type ECSpresso from 'ecspresso';
import {
	createTransformBundle,
	type LocalTransform,
	type WorldTransform,
	type TransformComponentTypes,
	type TransformBundleOptions,
} from 'ecspresso/bundles/utils/transform';
import { createBounds, type BoundsRect } from 'ecspresso/bundles/utils/bounds';

// Re-export transform and bounds types for convenience
export type { LocalTransform, WorldTransform, TransformComponentTypes };
export type { BoundsRect };
export { createTransform, createLocalTransform, createWorldTransform } from 'ecspresso/bundles/utils/transform';

// Dynamic import for Application to avoid requiring pixi.js at bundle creation time
// when using managed mode (init options instead of pre-initialized app)
async function createPixiApplication(options: Partial<ApplicationOptions>): Promise<Application> {
	const { Application } = await import('pixi.js');
	const app = new Application();
	await app.init(options);
	return app;
}

// ==================== Component Types ====================

/**
 * Visibility and alpha component
 */
export interface Visible {
	visible: boolean;
	alpha?: number;
}

/**
 * Aggregate component types for the 2D renderer bundle.
 * Users should extend this interface with their own component types.
 *
 * @example
 * ```typescript
 * interface GameComponents extends Renderer2DComponentTypes {
 *   velocity: { x: number; y: number };
 *   player: true;
 * }
 * ```
 */
export interface Renderer2DComponentTypes extends TransformComponentTypes {
	sprite: Sprite;
	graphics: Graphics;
	container: Container;
	visible: Visible;
	/** Assigns the entity to a named render layer for z-ordering */
	renderLayer: string;
}

// ==================== Event Types ====================

/**
 * Events emitted by the 2D renderer bundle
 */
export interface Renderer2DEventTypes {
	hierarchyChanged: {
		entityId: number;
		oldParent: number | null;
		newParent: number | null;
	};
}

// ==================== Resource Types ====================

/**
 * Resources provided by the 2D renderer bundle
 */
export interface Renderer2DResourceTypes {
	pixiApp: Application;
	rootContainer: Container;
	/** Screen bounds derived from PixiJS screen dimensions, updated on resize */
	bounds: BoundsRect;
}

// ==================== Bundle Options ====================

/**
 * Common options shared between both initialization modes
 */
interface Renderer2DBundleCommonOptions {
	/** Optional custom root container (defaults to app.stage) */
	rootContainer?: Container;
	/** System group name (default: 'renderer2d') */
	systemGroup?: string;
	/** Priority for render sync system (default: 500) */
	renderSyncPriority?: number;
	/** Options for the included transform bundle */
	transform?: TransformBundleOptions;
	/** When true, wires up pixiApp.ticker to drive ecs.update() automatically (default: true) */
	startLoop?: boolean;
	/** Ordered render layer names (back-to-front). Entities with a renderLayer component are placed in the corresponding container. */
	renderLayers?: string[];
}

/**
 * Options when providing a pre-initialized PixiJS Application
 */
export interface Renderer2DBundleAppOptions extends Renderer2DBundleCommonOptions {
	/** The PixiJS Application instance (already initialized) */
	app: Application;
	init?: never;
	container?: never;
}

/**
 * Options when letting the bundle create and manage the PixiJS Application
 */
export interface Renderer2DBundleManagedOptions extends Renderer2DBundleCommonOptions {
	app?: never;
	/** PixiJS ApplicationOptions - bundle will create and initialize the Application */
	init: Partial<ApplicationOptions>;
	/** Container element to append the canvas to, or CSS selector string */
	container?: HTMLElement | string;
}

/**
 * Configuration options for the 2D renderer bundle.
 *
 * Supports two modes:
 * 1. **Pre-initialized**: Pass an already-initialized Application via `app`
 * 2. **Managed**: Pass `init` options and the bundle creates the Application during `ecs.initialize()`
 *
 * This bundle includes transform propagation automatically - no need to add createTransformBundle() separately.
 *
 * @example Pre-initialized mode (full control)
 * ```typescript
 * const app = new Application();
 * await app.init({ resizeTo: window });
 * const ecs = ECSpresso.create<GameComponents, {}, {}>()
 *   .withBundle(createRenderer2DBundle({ app }))
 *   .build();
 * ```
 *
 * @example Managed mode (convenience)
 * ```typescript
 * const ecs = ECSpresso.create<GameComponents, {}, {}>()
 *   .withBundle(createRenderer2DBundle({
 *     init: { background: '#1099bb', resizeTo: window },
 *     container: document.body,
 *   }))
 *   .build();
 * await ecs.initialize(); // Application created here
 * ```
 */
export type Renderer2DBundleOptions = Renderer2DBundleAppOptions | Renderer2DBundleManagedOptions;

// ==================== Default Values ====================

/**
 * Default local transform values
 */
export const DEFAULT_LOCAL_TRANSFORM: Readonly<LocalTransform> = {
	x: 0,
	y: 0,
	rotation: 0,
	scaleX: 1,
	scaleY: 1,
};

/**
 * Default world transform values
 */
export const DEFAULT_WORLD_TRANSFORM: Readonly<WorldTransform> = {
	x: 0,
	y: 0,
	rotation: 0,
	scaleX: 1,
	scaleY: 1,
};

// ==================== Helper Utilities ====================

interface PositionOption {
	x?: number;
	y?: number;
}

interface TransformOptions {
	rotation?: number;
	scale?: number | { x: number; y: number };
	visible?: boolean;
	alpha?: number;
}

function createLocalTransformInternal(
	position?: PositionOption,
	options?: TransformOptions
): LocalTransform {
	const scaleValue = options?.scale;
	const scaleX = typeof scaleValue === 'number'
		? scaleValue
		: scaleValue?.x ?? 1;
	const scaleY = typeof scaleValue === 'number'
		? scaleValue
		: scaleValue?.y ?? 1;

	return {
		x: position?.x ?? 0,
		y: position?.y ?? 0,
		rotation: options?.rotation ?? 0,
		scaleX,
		scaleY,
	};
}

function createWorldTransformInternal(
	position?: PositionOption,
	options?: TransformOptions
): WorldTransform {
	const scaleValue = options?.scale;
	const scaleX = typeof scaleValue === 'number'
		? scaleValue
		: scaleValue?.x ?? 1;
	const scaleY = typeof scaleValue === 'number'
		? scaleValue
		: scaleValue?.y ?? 1;

	return {
		x: position?.x ?? 0,
		y: position?.y ?? 0,
		rotation: options?.rotation ?? 0,
		scaleX,
		scaleY,
	};
}

function createVisibleComponent(options?: TransformOptions): Visible {
	return {
		visible: options?.visible ?? true,
		alpha: options?.alpha,
	};
}

/**
 * Create components for a sprite entity.
 * Returns an object suitable for spreading into spawn().
 *
 * @example
 * ```typescript
 * const player = ecs.spawn({
 *   ...createSpriteComponents(new Sprite(texture), { x: 100, y: 100 }),
 *   velocity: { x: 0, y: 0 },
 * });
 * ```
 */
export function createSpriteComponents(
	sprite: Sprite,
	position?: PositionOption,
	options?: TransformOptions & { anchor?: { x: number; y: number } }
): Pick<Renderer2DComponentTypes, 'sprite' | 'localTransform' | 'worldTransform' | 'visible'> {
	if (options?.anchor) {
		sprite.anchor.set(options.anchor.x, options.anchor.y);
	}
	return {
		sprite,
		localTransform: createLocalTransformInternal(position, options),
		worldTransform: createWorldTransformInternal(position, options),
		visible: createVisibleComponent(options),
	};
}

/**
 * Create components for a graphics entity.
 * Returns an object suitable for spreading into spawn().
 *
 * @example
 * ```typescript
 * const rect = ecs.spawn({
 *   ...createGraphicsComponents(graphics, { x: 50, y: 50 }),
 * });
 * ```
 */
export function createGraphicsComponents(
	graphics: Graphics,
	position?: PositionOption,
	options?: TransformOptions
): Pick<Renderer2DComponentTypes, 'graphics' | 'localTransform' | 'worldTransform' | 'visible'> {
	return {
		graphics,
		localTransform: createLocalTransformInternal(position, options),
		worldTransform: createWorldTransformInternal(position, options),
		visible: createVisibleComponent(options),
	};
}

/**
 * Create components for a container entity.
 * Returns an object suitable for spreading into spawn().
 *
 * @example
 * ```typescript
 * const group = ecs.spawn({
 *   ...createContainerComponents(new Container(), { x: 0, y: 0 }),
 * });
 * ```
 */
export function createContainerComponents(
	container: Container,
	position?: PositionOption,
	options?: TransformOptions
): Pick<Renderer2DComponentTypes, 'container' | 'localTransform' | 'worldTransform' | 'visible'> {
	return {
		container,
		localTransform: createLocalTransformInternal(position, options),
		worldTransform: createWorldTransformInternal(position, options),
		visible: createVisibleComponent(options),
	};
}

// ==================== Bundle Factory ====================

/**
 * Create a 2D rendering bundle for ECSpresso.
 *
 * This bundle provides:
 * - Transform propagation (localTransform -> worldTransform)
 * - Render sync system (updates PixiJS objects from ECS components)
 * - Scene graph management (mirrors ECS hierarchy in PixiJS scene graph)
 *
 * @example Pre-initialized mode
 * ```typescript
 * const app = new Application();
 * await app.init({ resizeTo: window });
 *
 * const ecs = ECSpresso.create<GameComponents, {}, {}>()
 *   .withBundle(createRenderer2DBundle({ app }))
 *   .build();
 * ```
 *
 * @example Managed mode
 * ```typescript
 * const ecs = ECSpresso.create<GameComponents, {}, {}>()
 *   .withBundle(createRenderer2DBundle({
 *     init: { background: '#1099bb', resizeTo: window },
 *     container: document.body,
 *   }))
 *   .build();
 * await ecs.initialize();
 * ```
 */
export function createRenderer2DBundle(
	options: Renderer2DBundleOptions
): Bundle<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes> {
	const {
		rootContainer: customRootContainer,
		systemGroup = 'renderer2d',
		renderSyncPriority = 500,
		transform: transformOptions,
		startLoop = true,
		renderLayers = [],
	} = options;

	const rendererBundle = new Bundle<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes>('renderer2d-internal');

	// Determine mode and set up resources accordingly
	const isManaged = 'init' in options && options.init !== undefined;

	if (isManaged) {
		// Managed mode: create Application during initialization
		const initOptions = options.init;
		const containerOption = options.container;

		// Resource factory that creates the Application
		rendererBundle.addResource('pixiApp', async () => {
			const app = await createPixiApplication(initOptions);

			// Auto-append canvas if container specified
			if (containerOption) {
				const containerEl = typeof containerOption === 'string'
					? document.querySelector(containerOption)
					: containerOption;

				if (containerEl) {
					containerEl.appendChild(app.canvas);
				} else if (typeof containerOption === 'string') {
					console.warn(`Renderer2D bundle: container selector "${containerOption}" not found`);
				}
			}

			return app;
		});

		// rootContainer depends on pixiApp - declarative dependency
		rendererBundle.addResource('rootContainer', {
			dependsOn: ['pixiApp'],
			factory: (ecs) => customRootContainer ?? ecs.getResource('pixiApp').stage,
		});

		// Bounds resource derived from screen dimensions
		rendererBundle.addResource('bounds', {
			dependsOn: ['pixiApp'],
			factory: (ecs) => {
				const pixiApp = ecs.getResource('pixiApp');
				return createBounds(pixiApp.screen.width, pixiApp.screen.height);
			},
		});
	} else {
		// Pre-initialized mode: use provided Application
		const app = options.app;
		rendererBundle.addResource('pixiApp', app);
		rendererBundle.addResource('rootContainer', customRootContainer ?? app.stage);
		rendererBundle.addResource('bounds', createBounds(app.screen.width, app.screen.height));
	}

	// Entity ID -> PixiJS Container mapping for scene graph management
	const entityToPixiObject = new Map<number, Container>();

	// Render layer name -> PixiJS Container mapping
	const layerContainers = new Map<string, Container>();

	// Container constructor captured during initialization via dynamic import
	// Used by getOrCreateLayerContainer for lazy layer creation
	let createLayerContainer: (label: string) => Container;

	// Helper to get the PixiJS display object for an entity
	function getPixiObject(entityId: number, ecs: ECSpresso<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes>): Container | null {
		// Check cache first
		const cached = entityToPixiObject.get(entityId);
		if (cached) return cached;

		// Try to get from components
		const spriteComp = ecs.entityManager.getComponent(entityId, 'sprite');
		if (spriteComp) {
			entityToPixiObject.set(entityId, spriteComp);
			return spriteComp;
		}

		const graphicsComp = ecs.entityManager.getComponent(entityId, 'graphics');
		if (graphicsComp) {
			entityToPixiObject.set(entityId, graphicsComp);
			return graphicsComp;
		}

		const containerComp = ecs.entityManager.getComponent(entityId, 'container');
		if (containerComp) {
			entityToPixiObject.set(entityId, containerComp);
			return containerComp;
		}

		return null;
	}

	// Helper to get or create a render layer container
	function getOrCreateLayerContainer(
		layerName: string,
		rootCont: Container
	): Container {
		const existing = layerContainers.get(layerName);
		if (existing) return existing;

		// Lazy-create for undeclared layers, appended to end
		const cont = createLayerContainer(`layer:${layerName}`);
		layerContainers.set(layerName, cont);
		rootCont.addChild(cont);
		return cont;
	}

	// Helper to resolve the target container for an entity
	function resolveTargetContainer(
		entityId: number,
		ecs: ECSpresso<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes>
	): Container {
		const rootCont = ecs.getResource('rootContainer');

		// 1. Check ECS parent hierarchy
		const parentId = ecs.getParent(entityId);
		const parentPixiObject = parentId !== null ? getPixiObject(parentId, ecs) : null;
		if (parentPixiObject) return parentPixiObject;

		// 2. Check render layer component
		const layerName = ecs.entityManager.getComponent(entityId, 'renderLayer');
		if (layerName) return getOrCreateLayerContainer(layerName, rootCont);

		// 3. Fall back to root container
		return rootCont;
	}

	// Helper to add a PixiJS object to the scene graph
	function addToSceneGraph(
		entityId: number,
		pixiObject: Container,
		ecs: ECSpresso<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes>
	): void {
		const targetContainer = resolveTargetContainer(entityId, ecs);

		// Only add if not already a child
		if (pixiObject.parent !== targetContainer) {
			targetContainer.addChild(pixiObject);
		}
	}

	// Helper to remove a PixiJS object from scene graph
	function removeFromSceneGraph(entityId: number): void {
		const pixiObject = entityToPixiObject.get(entityId);
		if (pixiObject) {
			pixiObject.removeFromParent();
			entityToPixiObject.delete(entityId);
		}
	}

	// Helper to update parent in scene graph
	function updateSceneGraphParent(
		entityId: number,
		ecs: ECSpresso<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes>
	): void {
		const pixiObject = entityToPixiObject.get(entityId);
		if (!pixiObject) return;

		const targetContainer = resolveTargetContainer(entityId, ecs);

		if (pixiObject.parent !== targetContainer) {
			pixiObject.removeFromParent();
			targetContainer.addChild(pixiObject);
		}
	}

	// ==================== Render Sync System ====================
	// Updates PixiJS objects from world transforms and visibility
	rendererBundle
		.addSystem('renderer2d-sync')
		.setPriority(renderSyncPriority)
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
		.setProcess((queries, _deltaTime, ecs) => {
			// Process sprites
			for (const entity of queries.sprites) {
				const { sprite, worldTransform } = entity.components;

				sprite.position.set(worldTransform.x, worldTransform.y);
				sprite.rotation = worldTransform.rotation;
				sprite.scale.set(worldTransform.scaleX, worldTransform.scaleY);

				// Apply visibility if component exists
				const visibleComp = ecs.entityManager.getComponent(entity.id, 'visible');
				if (visibleComp) {
					sprite.visible = visibleComp.visible;
					if (visibleComp.alpha !== undefined) {
						sprite.alpha = visibleComp.alpha;
					}
				}
			}

			// Process graphics
			for (const entity of queries.graphics) {
				const { graphics, worldTransform } = entity.components;

				graphics.position.set(worldTransform.x, worldTransform.y);
				graphics.rotation = worldTransform.rotation;
				graphics.scale.set(worldTransform.scaleX, worldTransform.scaleY);

				// Apply visibility if component exists
				const visibleComp = ecs.entityManager.getComponent(entity.id, 'visible');
				if (visibleComp) {
					graphics.visible = visibleComp.visible;
					if (visibleComp.alpha !== undefined) {
						graphics.alpha = visibleComp.alpha;
					}
				}
			}

			// Process containers
			for (const entity of queries.containers) {
				const { container, worldTransform } = entity.components;

				container.position.set(worldTransform.x, worldTransform.y);
				container.rotation = worldTransform.rotation;
				container.scale.set(worldTransform.scaleX, worldTransform.scaleY);

				// Apply visibility if component exists
				const visibleComp = ecs.entityManager.getComponent(entity.id, 'visible');
				if (visibleComp) {
					container.visible = visibleComp.visible;
					if (visibleComp.alpha !== undefined) {
						container.alpha = visibleComp.alpha;
					}
				}
			}
		})
		.and();

	// ==================== Scene Graph Manager System ====================
	// Sets up reactive queries to manage scene graph on entity create/destroy
	// High priority ensures this runs before user systems' onInitialize
	rendererBundle
		.addSystem('renderer2d-scene-graph')
		.setPriority(9999)
		.inGroup(systemGroup)
		.setOnInitialize(async (ecs) => {
			const pixiApp = ecs.getResource('pixiApp');
			const rootCont = ecs.getResource('rootContainer');

			// Capture Container constructor via dynamic import (same module instance as pixi.js internals)
			const { Container: ContainerClass } = await import('pixi.js');
			createLayerContainer = (label: string) => {
				const cont = new ContainerClass();
				cont.label = label;
				return cont;
			};

			// Create declared render layer containers in order (back-to-front)
			for (const layerName of renderLayers) {
				const cont = createLayerContainer(`layer:${layerName}`);
				layerContainers.set(layerName, cont);
				rootCont.addChild(cont);
			}

			// Reactive query for sprites
			ecs.addReactiveQuery('renderer2d-sprites', {
				with: ['sprite'],
				onEnter: (entity) => {
					const pixiObject = entity.components.sprite;
					entityToPixiObject.set(entity.id, pixiObject);
					addToSceneGraph(entity.id, pixiObject, ecs);
				},
				onExit: (entityId) => {
					removeFromSceneGraph(entityId);
				},
			});

			// Reactive query for graphics
			ecs.addReactiveQuery('renderer2d-graphics', {
				with: ['graphics'],
				onEnter: (entity) => {
					const pixiObject = entity.components.graphics;
					entityToPixiObject.set(entity.id, pixiObject);
					addToSceneGraph(entity.id, pixiObject, ecs);
				},
				onExit: (entityId) => {
					removeFromSceneGraph(entityId);
				},
			});

			// Reactive query for containers
			ecs.addReactiveQuery('renderer2d-containers', {
				with: ['container'],
				onEnter: (entity) => {
					const pixiObject = entity.components.container;
					entityToPixiObject.set(entity.id, pixiObject);
					addToSceneGraph(entity.id, pixiObject, ecs);
				},
				onExit: (entityId) => {
					removeFromSceneGraph(entityId);
				},
			});

			// Subscribe to hierarchy changes to mirror reparenting in scene graph
			ecs.on('hierarchyChanged', ({ entityId }) => {
				updateSceneGraphParent(entityId, ecs);
			});

			// Re-parent entity when render layer is added or changed
			ecs.onComponentAdded('renderLayer', (_layerName, entity) => {
				updateSceneGraphParent(entity.id, ecs);
			});

			// Re-parent entity when render layer is removed
			ecs.onComponentRemoved('renderLayer', (_oldLayerName, entity) => {
				updateSceneGraphParent(entity.id, ecs);
			});

			// Track screen bounds on resize
			pixiApp.renderer.on('resize', (width: number, height: number) => {
				const bounds = ecs.getResource('bounds');
				bounds.width = width;
				bounds.height = height;
			});

			// Wire up the game loop if requested
			if (startLoop) {
				pixiApp.ticker.add((ticker) => {
					ecs.update(ticker.deltaMS / 1_000);
				});
			}
		})
		.and();

	// Merge transform bundle (runs first) with renderer bundle
	const transformBundle = createTransformBundle(transformOptions);
	return mergeBundles('renderer2d', transformBundle, rendererBundle);
}
