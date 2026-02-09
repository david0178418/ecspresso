/**
 * 2D Renderer Plugin for ECSpresso
 *
 * An opt-in PixiJS-based 2D rendering plugin that automates scene graph wiring.
 * Import from 'ecspresso/plugins/renderers/renderer2D'
 *
 * This plugin includes transform propagation automatically.
 */

import type { Application, ApplicationOptions, Container, Sprite, Graphics } from 'pixi.js';
import { definePlugin, type Plugin } from 'ecspresso';
import type ECSpresso from 'ecspresso';
import {
	createTransformPlugin,
	type LocalTransform,
	type WorldTransform,
	type TransformComponentTypes,
	type TransformPluginOptions,
} from 'ecspresso/plugins/transform';
import { createBounds, type BoundsRect } from 'ecspresso/plugins/bounds';
import type { CameraResourceTypes, CameraState } from 'ecspresso/plugins/camera';

// Re-export transform and bounds types for convenience
export type { LocalTransform, WorldTransform, TransformComponentTypes };
export type { BoundsRect };
export { createTransform, createLocalTransform, createWorldTransform, DEFAULT_LOCAL_TRANSFORM, DEFAULT_WORLD_TRANSFORM } from 'ecspresso/plugins/transform';

// Dynamic import for Application to avoid requiring pixi.js at plugin creation time
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
 * Aggregate component types for the 2D renderer plugin.
 * Included automatically via `.withPlugin(createRenderer2DPlugin({ ... }))`.
 *
 * @example
 * ```typescript
 * const ecs = ECSpresso.create()
 *   .withPlugin(createRenderer2DPlugin({ ... }))
 *   .withComponentTypes<{ velocity: { x: number; y: number }; player: true }>()
 *   .build();
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
 * Events emitted by the 2D renderer plugin
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
 * Resources provided by the 2D renderer plugin
 */
export interface Renderer2DResourceTypes {
	pixiApp: Application;
	rootContainer: Container;
	/** Screen bounds derived from PixiJS screen dimensions, updated on resize */
	bounds: BoundsRect;
}

// ==================== Scale Mode Types ====================

export type ScaleMode = 'fit' | 'cover' | 'stretch';

export interface ScreenScaleOptions {
	readonly width: number;
	readonly height: number;
	readonly mode?: ScaleMode;
}

export interface ViewportScale {
	scaleX: number;
	scaleY: number;
	offsetX: number;
	offsetY: number;
	physicalWidth: number;
	physicalHeight: number;
	readonly designWidth: number;
	readonly designHeight: number;
}

export interface ViewportScaleResourceTypes {
	viewportScale: ViewportScale;
}

// ==================== Plugin Options ====================

/**
 * Common options shared between both initialization modes
 */
interface Renderer2DPluginCommonOptions<G extends string = 'renderer2d'> {
	/** Optional custom root container (defaults to app.stage) */
	rootContainer?: Container;
	/** System group name (default: 'renderer2d') */
	systemGroup?: G;
	/** Priority for render sync system (default: 500) */
	renderSyncPriority?: number;
	/** Options for the included transform plugin */
	transform?: TransformPluginOptions;
	/** When true, wires up pixiApp.ticker to drive ecs.update() automatically (default: true) */
	startLoop?: boolean;
	/** Ordered render layer names (back-to-front). Entities with a renderLayer component are placed in the corresponding container. */
	renderLayers?: string[];
	/** Automatically apply cameraState resource to rootContainer each frame.
	 *  Requires the camera plugin to be installed. (default: false) */
	camera?: boolean;
	/** Enforce a logical design resolution with automatic aspect-ratio-aware scaling.
	 *  When set, systems work in design-resolution coordinate space. */
	screenScale?: ScreenScaleOptions;
}

/**
 * Options when providing a pre-initialized PixiJS Application
 */
export interface Renderer2DPluginAppOptions<G extends string = 'renderer2d'> extends Renderer2DPluginCommonOptions<G> {
	/** The PixiJS Application instance (already initialized) */
	app: Application;
	init?: never;
	container?: never;
}

/**
 * Options when letting the plugin create and manage the PixiJS Application
 */
export interface Renderer2DPluginManagedOptions<G extends string = 'renderer2d'> extends Renderer2DPluginCommonOptions<G> {
	app?: never;
	/** PixiJS ApplicationOptions - plugin will create and initialize the Application */
	init: Partial<ApplicationOptions>;
	/** Container element to append the canvas to, or CSS selector string */
	container?: HTMLElement | string;
}

/**
 * Configuration options for the 2D renderer plugin.
 *
 * Supports two modes:
 * 1. **Pre-initialized**: Pass an already-initialized Application via `app`
 * 2. **Managed**: Pass `init` options and the plugin creates the Application during `ecs.initialize()`
 *
 * This plugin includes transform propagation automatically - no need to add createTransformPlugin() separately.
 *
 * @example Pre-initialized mode (full control)
 * ```typescript
 * const app = new Application();
 * await app.init({ resizeTo: window });
 * const ecs = ECSpresso.create()
 *   .withPlugin(createRenderer2DPlugin({ app }))
 *   .withComponentTypes<{ player: true }>()
 *   .build();
 * ```
 *
 * @example Managed mode (convenience)
 * ```typescript
 * const ecs = ECSpresso.create()
 *   .withPlugin(createRenderer2DPlugin({
 *     init: { background: '#1099bb', resizeTo: window },
 *     container: document.body,
 *   }))
 *   .withComponentTypes<{ player: true }>()
 *   .build();
 * await ecs.initialize(); // Application created here
 * ```
 */
export type Renderer2DPluginOptions<G extends string = 'renderer2d'> = Renderer2DPluginAppOptions<G> | Renderer2DPluginManagedOptions<G>;

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

// ==================== Viewport Scale Utilities ====================

const scaleModeStrategy: Record<ScaleMode, (ratioX: number, ratioY: number) => { scaleX: number; scaleY: number }> = {
	fit: (ratioX, ratioY) => {
		const s = Math.min(ratioX, ratioY);
		return { scaleX: s, scaleY: s };
	},
	cover: (ratioX, ratioY) => {
		const s = Math.max(ratioX, ratioY);
		return { scaleX: s, scaleY: s };
	},
	stretch: (ratioX, ratioY) => ({ scaleX: ratioX, scaleY: ratioY }),
};

export function computeViewportScale(
	physicalW: number,
	physicalH: number,
	designW: number,
	designH: number,
	mode: ScaleMode,
): ViewportScale {
	const ratioX = physicalW / designW;
	const ratioY = physicalH / designH;
	const { scaleX, scaleY } = scaleModeStrategy[mode](ratioX, ratioY);

	return {
		scaleX,
		scaleY,
		offsetX: (physicalW - designW * scaleX) / 2,
		offsetY: (physicalH - designH * scaleY) / 2,
		physicalWidth: physicalW,
		physicalHeight: physicalH,
		designWidth: designW,
		designHeight: designH,
	};
}

/**
 * Convert physical canvas pixel coordinates to design-resolution (logical) coordinates.
 * Compose with camera `screenToWorld()` for full physical→world conversion.
 */
export function physicalToLogical(
	physicalX: number,
	physicalY: number,
	viewport: ViewportScale,
): { x: number; y: number } {
	return {
		x: (physicalX - viewport.offsetX) / viewport.scaleX,
		y: (physicalY - viewport.offsetY) / viewport.scaleY,
	};
}

// ==================== Plugin Factory ====================

/**
 * Create a 2D rendering plugin for ECSpresso.
 *
 * This plugin provides:
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
 *   .withPlugin(createRenderer2DPlugin({ app }))
 *   .build();
 * ```
 *
 * @example Managed mode
 * ```typescript
 * const ecs = ECSpresso.create<GameComponents, {}, {}>()
 *   .withPlugin(createRenderer2DPlugin({
 *     init: { background: '#1099bb', resizeTo: window },
 *     container: document.body,
 *   }))
 *   .build();
 * await ecs.initialize();
 * ```
 */
type Renderer2DLabels = 'renderer2d-sync' | 'renderer2d-scene-graph' | 'renderer2d-camera-sync' | 'transform-propagation';
type Renderer2DReactiveQueryNames = 'renderer2d-sprites' | 'renderer2d-graphics' | 'renderer2d-containers';

export function createRenderer2DPlugin<G extends string = 'renderer2d'>(
	options: Renderer2DPluginOptions<G> & { screenScale: ScreenScaleOptions; camera: true }
): Plugin<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes & ViewportScaleResourceTypes & CameraResourceTypes, {}, {}, Renderer2DLabels, G, never, Renderer2DReactiveQueryNames>;
export function createRenderer2DPlugin<G extends string = 'renderer2d'>(
	options: Renderer2DPluginOptions<G> & { screenScale: ScreenScaleOptions }
): Plugin<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes & ViewportScaleResourceTypes, {}, {}, Renderer2DLabels, G, never, Renderer2DReactiveQueryNames>;
export function createRenderer2DPlugin<G extends string = 'renderer2d'>(
	options: Renderer2DPluginOptions<G> & { camera: true }
): Plugin<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes & CameraResourceTypes, {}, {}, Renderer2DLabels, G, never, Renderer2DReactiveQueryNames>;
export function createRenderer2DPlugin<G extends string = 'renderer2d'>(
	options: Renderer2DPluginOptions<G>
): Plugin<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes, {}, {}, Renderer2DLabels, G, never, Renderer2DReactiveQueryNames>;
export function createRenderer2DPlugin<G extends string = 'renderer2d'>(
	options: Renderer2DPluginOptions<G> & { camera?: boolean; screenScale?: ScreenScaleOptions }
): Plugin<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes, {}, {}, Renderer2DLabels, G, never, Renderer2DReactiveQueryNames>
| Plugin<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes & CameraResourceTypes, {}, {}, Renderer2DLabels, G, never, Renderer2DReactiveQueryNames>
| Plugin<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes & ViewportScaleResourceTypes, {}, {}, Renderer2DLabels, G, never, Renderer2DReactiveQueryNames>
| Plugin<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes & ViewportScaleResourceTypes & CameraResourceTypes, {}, {}, Renderer2DLabels, G, never, Renderer2DReactiveQueryNames> {
	const {
		rootContainer: customRootContainer,
		systemGroup = 'renderer2d',
		renderSyncPriority = 500,
		transform: transformOptions,
		startLoop = true,
		renderLayers = [],
		camera = false,
		screenScale,
	} = options;

	const hasScreenScale = screenScale !== undefined;
	const designWidth = screenScale?.width ?? 0;
	const designHeight = screenScale?.height ?? 0;
	const screenScaleMode: ScaleMode = screenScale?.mode ?? 'fit';

	// Entity ID -> PixiJS Container mapping for scene graph management
	const entityToPixiObject = new Map<number, Container>();

	// Render layer name -> PixiJS Container mapping
	const layerContainers = new Map<string, Container>();

	// Container constructor captured during initialization via dynamic import
	// Used by getOrCreateLayerContainer for lazy layer creation
	let createLayerContainer: (label: string) => Container = () => {
		throw new Error('renderer2D: createLayerContainer called before initialization');
	};

	// Helper to get the PixiJS display object for an entity
	function getPixiObject(entityId: number, ecs: ECSpresso<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes>): Container | null {
		// Check cache first
		const cached = entityToPixiObject.get(entityId);
		if (cached) return cached;

		// Try to get from components
		const spriteComp = ecs.getComponent(entityId, 'sprite');
		if (spriteComp) {
			entityToPixiObject.set(entityId, spriteComp);
			return spriteComp;
		}

		const graphicsComp = ecs.getComponent(entityId, 'graphics');
		if (graphicsComp) {
			entityToPixiObject.set(entityId, graphicsComp);
			return graphicsComp;
		}

		const containerComp = ecs.getComponent(entityId, 'container');
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
		const layerName = ecs.getComponent(entityId, 'renderLayer');
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

	// Determine mode and set up resource registration closures
	const isManaged = 'init' in options && options.init !== undefined;

	return definePlugin<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes, {}, {}, Renderer2DLabels, G, never, Renderer2DReactiveQueryNames>({
		id: 'renderer2d',
		install(world) {
			// Install transform plugin (deduplicates if already installed)
			world.installPlugin(createTransformPlugin(transformOptions));

			// Register resources based on mode
			if (isManaged) {
				const initOptions = (options as Renderer2DPluginManagedOptions<G>).init;
				const containerOption = (options as Renderer2DPluginManagedOptions<G>).container;

				world.addResource('pixiApp', async () => {
					const app = await createPixiApplication(initOptions);

					if (containerOption) {
						const containerEl = typeof containerOption === 'string'
							? document.querySelector(containerOption)
							: containerOption;

						if (containerEl) {
							containerEl.appendChild(app.canvas);
						} else if (typeof containerOption === 'string') {
							console.warn(`Renderer2D plugin: container selector "${containerOption}" not found`);
						}
					}

					return app;
				});

				world.addResource('rootContainer', {
					dependsOn: ['pixiApp'],
					factory: (ecs) => customRootContainer ?? ecs.getResource('pixiApp').stage,
				});

				world.addResource('bounds', {
					dependsOn: ['pixiApp'],
					factory: (ecs) => {
						if (hasScreenScale) return createBounds(designWidth, designHeight);
						const pixiApp = ecs.getResource('pixiApp');
						return createBounds(pixiApp.screen.width, pixiApp.screen.height);
					},
				});

				if (hasScreenScale) {
					world.addResource('viewportScale' as keyof Renderer2DResourceTypes, {
						dependsOn: ['pixiApp'],
						factory: (ecs: ECSpresso<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes>) => {
							const pixiApp = ecs.getResource('pixiApp');
							return computeViewportScale(pixiApp.screen.width, pixiApp.screen.height, designWidth, designHeight, screenScaleMode);
						},
					} as any);
				}
			} else {
				const app = (options as Renderer2DPluginAppOptions<G>).app;
				world.addResource('pixiApp', app);
				world.addResource('rootContainer', customRootContainer ?? app.stage);
				world.addResource('bounds', hasScreenScale
					? createBounds(designWidth, designHeight)
					: createBounds(app.screen.width, app.screen.height));

				if (hasScreenScale) {
					world.addResource('viewportScale' as keyof Renderer2DResourceTypes,
						computeViewportScale(app.screen.width, app.screen.height, designWidth, designHeight, screenScaleMode) as any);
				}
			}

			// Register dispose callbacks for display object components
			world.registerDispose('sprite', (sprite) => {
				sprite.removeFromParent();
			});
			world.registerDispose('graphics', (graphics) => {
				graphics.removeFromParent();
			});
			world.registerDispose('container', (container) => {
				container.removeFromParent();
			});

			// Display objects require localTransform and visible
			world.registerRequired('sprite', 'localTransform', () => createLocalTransformInternal());
			world.registerRequired('sprite', 'visible', () => createVisibleComponent());
			world.registerRequired('graphics', 'localTransform', () => createLocalTransformInternal());
			world.registerRequired('graphics', 'visible', () => createVisibleComponent());
			world.registerRequired('container', 'localTransform', () => createLocalTransformInternal());
			world.registerRequired('container', 'visible', () => createVisibleComponent());

			// ==================== Render Sync System ====================
			world
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
					for (const entity of queries.sprites) {
						const { sprite, worldTransform } = entity.components;

						sprite.position.set(worldTransform.x, worldTransform.y);
						sprite.rotation = worldTransform.rotation;
						sprite.scale.set(worldTransform.scaleX, worldTransform.scaleY);

						const visibleComp = ecs.getComponent(entity.id, 'visible');
						if (visibleComp) {
							sprite.visible = visibleComp.visible;
							if (visibleComp.alpha !== undefined) {
								sprite.alpha = visibleComp.alpha;
							}
						}
					}

					for (const entity of queries.graphics) {
						const { graphics, worldTransform } = entity.components;

						graphics.position.set(worldTransform.x, worldTransform.y);
						graphics.rotation = worldTransform.rotation;
						graphics.scale.set(worldTransform.scaleX, worldTransform.scaleY);

						const visibleComp = ecs.getComponent(entity.id, 'visible');
						if (visibleComp) {
							graphics.visible = visibleComp.visible;
							if (visibleComp.alpha !== undefined) {
								graphics.alpha = visibleComp.alpha;
							}
						}
					}

					for (const entity of queries.containers) {
						const { container, worldTransform } = entity.components;

						container.position.set(worldTransform.x, worldTransform.y);
						container.rotation = worldTransform.rotation;
						container.scale.set(worldTransform.scaleX, worldTransform.scaleY);

						const visibleComp = ecs.getComponent(entity.id, 'visible');
						if (visibleComp) {
							container.visible = visibleComp.visible;
							if (visibleComp.alpha !== undefined) {
								container.alpha = visibleComp.alpha;
							}
						}
					}
				});

			// ==================== Scene Graph Manager System ====================
			world
				.addSystem('renderer2d-scene-graph')
				.setPriority(9999)
				.inGroup(systemGroup)
				.setOnInitialize(async (ecs) => {
					const pixiApp = ecs.getResource('pixiApp');
					let rootCont = ecs.getResource('rootContainer');

					const { Container: ContainerClass } = await import('pixi.js');
					createLayerContainer = (label: string) => {
						const cont = new ContainerClass();
						cont.label = label;
						return cont;
					};

					let viewportContainer: Container | undefined;
					if (hasScreenScale) {
						viewportContainer = new ContainerClass();
						viewportContainer.label = 'viewportContainer';

						const vs = ecs.tryGetResource<ViewportScale>('viewportScale');
						if (!vs) throw new Error('renderer2D: viewportScale resource not found');
						viewportContainer.position.set(vs.offsetX, vs.offsetY);
						viewportContainer.scale.set(vs.scaleX, vs.scaleY);

						const newRoot = new ContainerClass();
						newRoot.label = 'rootContainer';

						pixiApp.stage.addChild(viewportContainer);
						viewportContainer.addChild(newRoot);

						ecs.updateResource('rootContainer', () => newRoot);
						rootCont = newRoot;
					}

					for (const layerName of renderLayers) {
						const cont = createLayerContainer(`layer:${layerName}`);
						layerContainers.set(layerName, cont);
						rootCont.addChild(cont);
					}

					ecs.addReactiveQuery('renderer2d-sprites', {
						with: ['sprite'],
						onEnter: (entity) => {
							const pixiObject = entity.components.sprite;
							entityToPixiObject.set(entity.id, pixiObject);
							addToSceneGraph(entity.id, pixiObject, ecs);
						},
						onExit: (entityId) => {
							entityToPixiObject.delete(entityId);
						},
					});

					ecs.addReactiveQuery('renderer2d-graphics', {
						with: ['graphics'],
						onEnter: (entity) => {
							const pixiObject = entity.components.graphics;
							entityToPixiObject.set(entity.id, pixiObject);
							addToSceneGraph(entity.id, pixiObject, ecs);
						},
						onExit: (entityId) => {
							entityToPixiObject.delete(entityId);
						},
					});

					ecs.addReactiveQuery('renderer2d-containers', {
						with: ['container'],
						onEnter: (entity) => {
							const pixiObject = entity.components.container;
							entityToPixiObject.set(entity.id, pixiObject);
							addToSceneGraph(entity.id, pixiObject, ecs);
						},
						onExit: (entityId) => {
							entityToPixiObject.delete(entityId);
						},
					});

					ecs.on('hierarchyChanged', ({ entityId }) => {
						updateSceneGraphParent(entityId, ecs);
					});

					ecs.onComponentAdded('renderLayer', (_layerName, entity) => {
						updateSceneGraphParent(entity.id, ecs);
					});

					ecs.onComponentRemoved('renderLayer', (_oldLayerName, entity) => {
						updateSceneGraphParent(entity.id, ecs);
					});

					if (camera) {
						const cameraState = ecs.tryGetResource<CameraState>('cameraState');
						if (!cameraState) throw new Error('renderer2D: cameraState resource not found');
						cameraState.viewportWidth = hasScreenScale ? designWidth : pixiApp.screen.width;
						cameraState.viewportHeight = hasScreenScale ? designHeight : pixiApp.screen.height;
					}

					pixiApp.renderer.on('resize', (width: number, height: number) => {
						if (hasScreenScale) {
							const vs = computeViewportScale(width, height, designWidth, designHeight, screenScaleMode);
							const vpResource = ecs.tryGetResource<ViewportScale>('viewportScale');
							if (!vpResource) throw new Error('renderer2D: viewportScale resource not found');
							vpResource.scaleX = vs.scaleX;
							vpResource.scaleY = vs.scaleY;
							vpResource.offsetX = vs.offsetX;
							vpResource.offsetY = vs.offsetY;
							vpResource.physicalWidth = width;
							vpResource.physicalHeight = height;

							if (viewportContainer) {
								viewportContainer.position.set(vs.offsetX, vs.offsetY);
								viewportContainer.scale.set(vs.scaleX, vs.scaleY);
							}
						} else {
							const bounds = ecs.getResource('bounds');
							bounds.width = width;
							bounds.height = height;

							if (camera) {
								const cameraState = ecs.tryGetResource<CameraState>('cameraState');
								if (!cameraState) throw new Error('renderer2D: cameraState resource not found');
								cameraState.viewportWidth = width;
								cameraState.viewportHeight = height;
							}
						}
					});

					if (startLoop) {
						pixiApp.ticker.add((ticker) => {
							ecs.update(ticker.deltaMS / 1_000);
						});
					}
				});

			// ==================== Camera Sync System (opt-in) ====================
			if (camera) {
				world
					.addSystem('renderer2d-camera-sync')
					.setPriority(900)
					.inPhase('render')
					.inGroup(systemGroup)
					.setProcess((_queries, _dt, ecs) => {
						const state = ecs.tryGetResource<CameraState>('cameraState');
						if (!state) throw new Error('renderer2D: cameraState resource not found');
						const root = ecs.getResource('rootContainer');
						const [centerW, centerH] = hasScreenScale
							? [designWidth, designHeight]
							: [ecs.getResource('pixiApp').screen.width, ecs.getResource('pixiApp').screen.height];

						root.position.set(
							centerW / 2 - (state.x + state.shakeOffsetX) * state.zoom,
							centerH / 2 - (state.y + state.shakeOffsetY) * state.zoom,
						);
						root.scale.set(state.zoom);
						root.rotation = -(state.rotation + state.shakeRotation);
					});
			}
		},
	}) as unknown as Plugin<Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes & ViewportScaleResourceTypes & CameraResourceTypes, {}, {}, Renderer2DLabels, G, never, Renderer2DReactiveQueryNames>;
}
