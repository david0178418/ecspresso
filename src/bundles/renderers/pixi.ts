/**
 * PixiJS Renderer Bundle for ECSpresso
 *
 * An opt-in PixiJS rendering bundle that automates scene graph wiring.
 * Import from 'ecspresso/bundles/renderers/pixi'
 *
 * This bundle includes transform propagation automatically.
 */

import type { Application, ApplicationOptions, Container, Sprite, Graphics } from 'pixi.js';
import Bundle, { mergeBundles } from '../../bundle';
import type ECSpresso from '../../ecspresso';
import {
	createTransformBundle,
	type LocalTransform,
	type WorldTransform,
	type TransformComponentTypes,
	type TransformBundleOptions,
} from '../utils/transform';
import { createBounds, type BoundsRect } from '../utils/bounds';

// Re-export transform and bounds types for convenience
export type { LocalTransform, WorldTransform, TransformComponentTypes };
export type { BoundsRect };
export { createTransform, createLocalTransform, createWorldTransform } from '../utils/transform';

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
 * PixiJS Sprite component
 */
export interface PixiSprite {
	sprite: Sprite;
	anchor?: { x: number; y: number };
}

/**
 * PixiJS Graphics component
 */
export interface PixiGraphics {
	graphics: Graphics;
}

/**
 * PixiJS Container component
 */
export interface PixiContainer {
	container: Container;
}

/**
 * Visibility and alpha component
 */
export interface PixiVisible {
	visible: boolean;
	alpha?: number;
}

/**
 * Aggregate component types for PixiJS bundle.
 * Users should extend this interface with their own component types.
 *
 * @example
 * ```typescript
 * interface GameComponents extends PixiComponentTypes {
 *   velocity: { x: number; y: number };
 *   player: true;
 * }
 * ```
 */
export interface PixiComponentTypes extends TransformComponentTypes {
	pixiSprite: PixiSprite;
	pixiGraphics: PixiGraphics;
	pixiContainer: PixiContainer;
	pixiVisible: PixiVisible;
	/** Assigns the entity to a named render layer for z-ordering */
	pixiRenderLayer: string;
}

// ==================== Event Types ====================

/**
 * Events emitted by the PixiJS bundle
 */
export interface PixiEventTypes {
	hierarchyChanged: {
		entityId: number;
		oldParent: number | null;
		newParent: number | null;
	};
}

// ==================== Resource Types ====================

/**
 * Resources provided by the PixiJS bundle
 */
export interface PixiResourceTypes {
	pixiApp: Application;
	pixiRootContainer: Container;
	/** Screen bounds derived from PixiJS screen dimensions, updated on resize */
	bounds: BoundsRect;
}

// ==================== Bundle Options ====================

/**
 * Common options shared between both initialization modes
 */
interface PixiBundleCommonOptions {
	/** Optional custom root container (defaults to app.stage) */
	rootContainer?: Container;
	/** System group name (default: 'pixi-renderer') */
	systemGroup?: string;
	/** Priority for render sync system (default: 500) */
	renderSyncPriority?: number;
	/** Options for the included transform bundle */
	transform?: TransformBundleOptions;
	/** When true, wires up pixiApp.ticker to drive ecs.update() automatically (default: true) */
	startLoop?: boolean;
	/** Ordered render layer names (back-to-front). Entities with a pixiRenderLayer component are placed in the corresponding container. */
	renderLayers?: string[];
}

/**
 * Options when providing a pre-initialized PixiJS Application
 */
export interface PixiBundleAppOptions extends PixiBundleCommonOptions {
	/** The PixiJS Application instance (already initialized) */
	app: Application;
	init?: never;
	container?: never;
}

/**
 * Options when letting the bundle create and manage the PixiJS Application
 */
export interface PixiBundleManagedOptions extends PixiBundleCommonOptions {
	app?: never;
	/** PixiJS ApplicationOptions - bundle will create and initialize the Application */
	init: Partial<ApplicationOptions>;
	/** Container element to append the canvas to, or CSS selector string */
	container?: HTMLElement | string;
}

/**
 * Configuration options for the PixiJS bundle.
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
 *   .withBundle(createPixiBundle({ app }))
 *   .build();
 * ```
 *
 * @example Managed mode (convenience)
 * ```typescript
 * const ecs = ECSpresso.create<GameComponents, {}, {}>()
 *   .withBundle(createPixiBundle({
 *     init: { background: '#1099bb', resizeTo: window },
 *     container: document.body,
 *   }))
 *   .build();
 * await ecs.initialize(); // Application created here
 * ```
 */
export type PixiBundleOptions = PixiBundleAppOptions | PixiBundleManagedOptions;

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
} as const;

/**
 * Default world transform values
 */
export const DEFAULT_WORLD_TRANSFORM: Readonly<WorldTransform> = {
	x: 0,
	y: 0,
	rotation: 0,
	scaleX: 1,
	scaleY: 1,
} as const;

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

function createVisibleComponent(options?: TransformOptions): PixiVisible {
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
): Pick<PixiComponentTypes, 'pixiSprite' | 'localTransform' | 'worldTransform' | 'pixiVisible'> {
	return {
		pixiSprite: {
			sprite,
			anchor: options?.anchor,
		},
		localTransform: createLocalTransformInternal(position, options),
		worldTransform: createWorldTransformInternal(position, options),
		pixiVisible: createVisibleComponent(options),
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
): Pick<PixiComponentTypes, 'pixiGraphics' | 'localTransform' | 'worldTransform' | 'pixiVisible'> {
	return {
		pixiGraphics: { graphics },
		localTransform: createLocalTransformInternal(position, options),
		worldTransform: createWorldTransformInternal(position, options),
		pixiVisible: createVisibleComponent(options),
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
): Pick<PixiComponentTypes, 'pixiContainer' | 'localTransform' | 'worldTransform' | 'pixiVisible'> {
	return {
		pixiContainer: { container },
		localTransform: createLocalTransformInternal(position, options),
		worldTransform: createWorldTransformInternal(position, options),
		pixiVisible: createVisibleComponent(options),
	};
}

// ==================== Bundle Factory ====================

/**
 * Create a PixiJS rendering bundle for ECSpresso.
 *
 * This bundle provides:
 * - Transform propagation (localTransform → worldTransform)
 * - Render sync system (updates PixiJS objects from ECS components)
 * - Scene graph management (mirrors ECS hierarchy in PixiJS scene graph)
 *
 * @example Pre-initialized mode
 * ```typescript
 * const app = new Application();
 * await app.init({ resizeTo: window });
 *
 * const ecs = ECSpresso.create<GameComponents, {}, {}>()
 *   .withBundle(createPixiBundle({ app }))
 *   .build();
 * ```
 *
 * @example Managed mode
 * ```typescript
 * const ecs = ECSpresso.create<GameComponents, {}, {}>()
 *   .withBundle(createPixiBundle({
 *     init: { background: '#1099bb', resizeTo: window },
 *     container: document.body,
 *   }))
 *   .build();
 * await ecs.initialize();
 * ```
 */
export function createPixiBundle(
	options: PixiBundleOptions
): Bundle<PixiComponentTypes, PixiEventTypes, PixiResourceTypes> {
	const {
		rootContainer: customRootContainer,
		systemGroup = 'pixi-renderer',
		renderSyncPriority = 500,
		transform: transformOptions,
		startLoop = true,
		renderLayers = [],
	} = options;

	const pixiBundle = new Bundle<PixiComponentTypes, PixiEventTypes, PixiResourceTypes>('pixi-renderer-internal');

	// Determine mode and set up resources accordingly
	const isManaged = 'init' in options && options.init !== undefined;

	if (isManaged) {
		// Managed mode: create Application during initialization
		const initOptions = options.init;
		const containerOption = options.container;

		// Resource factory that creates the Application
		pixiBundle.addResource('pixiApp', async () => {
			const app = await createPixiApplication(initOptions);

			// Auto-append canvas if container specified
			if (containerOption) {
				const containerEl = typeof containerOption === 'string'
					? document.querySelector(containerOption)
					: containerOption;

				if (containerEl) {
					containerEl.appendChild(app.canvas);
				} else if (typeof containerOption === 'string') {
					console.warn(`PixiJS bundle: container selector "${containerOption}" not found`);
				}
			}

			return app;
		});

		// pixiRootContainer depends on pixiApp - declarative dependency
		pixiBundle.addResource('pixiRootContainer', {
			dependsOn: ['pixiApp'],
			factory: (ecs) => customRootContainer ?? ecs.getResource('pixiApp').stage,
		});

		// Bounds resource derived from screen dimensions
		pixiBundle.addResource('bounds', {
			dependsOn: ['pixiApp'],
			factory: (ecs) => {
				const pixiApp = ecs.getResource('pixiApp');
				return createBounds(pixiApp.screen.width, pixiApp.screen.height);
			},
		});
	} else {
		// Pre-initialized mode: use provided Application
		const app = options.app;
		pixiBundle.addResource('pixiApp', app);
		pixiBundle.addResource('pixiRootContainer', customRootContainer ?? app.stage);
		pixiBundle.addResource('bounds', createBounds(app.screen.width, app.screen.height));
	}

	// Entity ID -> PixiJS Container mapping for scene graph management
	const entityToPixiObject = new Map<number, Container>();

	// Render layer name -> PixiJS Container mapping
	const layerContainers = new Map<string, Container>();

	// Container constructor captured during initialization via dynamic import
	// Used by getOrCreateLayerContainer for lazy layer creation
	let createLayerContainer: (label: string) => Container;

	// Helper to get the PixiJS display object for an entity
	function getPixiObject(entityId: number, ecs: ECSpresso<PixiComponentTypes, PixiEventTypes, PixiResourceTypes>): Container | null {
		// Check cache first
		const cached = entityToPixiObject.get(entityId);
		if (cached) return cached;

		// Try to get from components
		const spriteComp = ecs.entityManager.getComponent(entityId, 'pixiSprite');
		if (spriteComp) {
			entityToPixiObject.set(entityId, spriteComp.sprite);
			return spriteComp.sprite;
		}

		const graphicsComp = ecs.entityManager.getComponent(entityId, 'pixiGraphics');
		if (graphicsComp) {
			entityToPixiObject.set(entityId, graphicsComp.graphics);
			return graphicsComp.graphics;
		}

		const containerComp = ecs.entityManager.getComponent(entityId, 'pixiContainer');
		if (containerComp) {
			entityToPixiObject.set(entityId, containerComp.container);
			return containerComp.container;
		}

		return null;
	}

	// Helper to get or create a render layer container
	function getOrCreateLayerContainer(
		layerName: string,
		rootContainer: Container
	): Container {
		const existing = layerContainers.get(layerName);
		if (existing) return existing;

		// Lazy-create for undeclared layers, appended to end
		const container = createLayerContainer(`layer:${layerName}`);
		layerContainers.set(layerName, container);
		rootContainer.addChild(container);
		return container;
	}

	// Helper to resolve the target container for an entity
	function resolveTargetContainer(
		entityId: number,
		ecs: ECSpresso<PixiComponentTypes, PixiEventTypes, PixiResourceTypes>
	): Container {
		const rootContainer = ecs.getResource('pixiRootContainer');

		// 1. Check ECS parent hierarchy
		const parentId = ecs.getParent(entityId);
		const parentPixiObject = parentId !== null ? getPixiObject(parentId, ecs) : null;
		if (parentPixiObject) return parentPixiObject;

		// 2. Check render layer component
		const layerName = ecs.entityManager.getComponent(entityId, 'pixiRenderLayer');
		if (layerName) return getOrCreateLayerContainer(layerName, rootContainer);

		// 3. Fall back to root container
		return rootContainer;
	}

	// Helper to add a PixiJS object to the scene graph
	function addToSceneGraph(
		entityId: number,
		pixiObject: Container,
		ecs: ECSpresso<PixiComponentTypes, PixiEventTypes, PixiResourceTypes>
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
		ecs: ECSpresso<PixiComponentTypes, PixiEventTypes, PixiResourceTypes>
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
	pixiBundle
		.addSystem('pixi-render-sync')
		.setPriority(renderSyncPriority)
		.inGroup(systemGroup)
		.addQuery('sprites', {
			with: ['pixiSprite', 'worldTransform'] as const,
		})
		.addQuery('graphics', {
			with: ['pixiGraphics', 'worldTransform'] as const,
		})
		.addQuery('containers', {
			with: ['pixiContainer', 'worldTransform'] as const,
		})
		.setProcess((queries, _deltaTime, ecs) => {
			// Process sprites
			for (const entity of queries.sprites) {
				const { pixiSprite, worldTransform } = entity.components;
				const { sprite, anchor } = pixiSprite;

				sprite.position.set(worldTransform.x, worldTransform.y);
				sprite.rotation = worldTransform.rotation;
				sprite.scale.set(worldTransform.scaleX, worldTransform.scaleY);

				if (anchor) {
					sprite.anchor.set(anchor.x, anchor.y);
				}

				// Apply visibility if component exists
				const visible = ecs.entityManager.getComponent(entity.id, 'pixiVisible');
				if (visible) {
					sprite.visible = visible.visible;
					if (visible.alpha !== undefined) {
						sprite.alpha = visible.alpha;
					}
				}
			}

			// Process graphics
			for (const entity of queries.graphics) {
				const { pixiGraphics, worldTransform } = entity.components;
				const { graphics } = pixiGraphics;

				graphics.position.set(worldTransform.x, worldTransform.y);
				graphics.rotation = worldTransform.rotation;
				graphics.scale.set(worldTransform.scaleX, worldTransform.scaleY);

				// Apply visibility if component exists
				const visible = ecs.entityManager.getComponent(entity.id, 'pixiVisible');
				if (visible) {
					graphics.visible = visible.visible;
					if (visible.alpha !== undefined) {
						graphics.alpha = visible.alpha;
					}
				}
			}

			// Process containers
			for (const entity of queries.containers) {
				const { pixiContainer, worldTransform } = entity.components;
				const { container } = pixiContainer;

				container.position.set(worldTransform.x, worldTransform.y);
				container.rotation = worldTransform.rotation;
				container.scale.set(worldTransform.scaleX, worldTransform.scaleY);

				// Apply visibility if component exists
				const visible = ecs.entityManager.getComponent(entity.id, 'pixiVisible');
				if (visible) {
					container.visible = visible.visible;
					if (visible.alpha !== undefined) {
						container.alpha = visible.alpha;
					}
				}
			}
		})
		.and();

	// ==================== Scene Graph Manager System ====================
	// Sets up reactive queries to manage scene graph on entity create/destroy
	// High priority ensures this runs before user systems' onInitialize
	pixiBundle
		.addSystem('pixi-scene-graph-manager')
		.setPriority(9999)
		.inGroup(systemGroup)
		.setOnInitialize(async (ecs) => {
			const pixiApp = ecs.getResource('pixiApp');
			const rootContainer = ecs.getResource('pixiRootContainer');

			// Capture Container constructor via dynamic import (same module instance as pixi.js internals)
			const { Container: ContainerClass } = await import('pixi.js');
			createLayerContainer = (label: string) => {
				const container = new ContainerClass();
				container.label = label;
				return container;
			};

			// Create declared render layer containers in order (back-to-front)
			for (const layerName of renderLayers) {
				const container = createLayerContainer(`layer:${layerName}`);
				layerContainers.set(layerName, container);
				rootContainer.addChild(container);
			}

			// Reactive query for sprites
			ecs.addReactiveQuery('pixi-sprites', {
				with: ['pixiSprite'] as const,
				onEnter: (entity) => {
					const pixiObject = entity.components.pixiSprite.sprite;
					entityToPixiObject.set(entity.id, pixiObject);
					addToSceneGraph(entity.id, pixiObject, ecs);
				},
				onExit: (entityId) => {
					removeFromSceneGraph(entityId);
				},
			});

			// Reactive query for graphics
			ecs.addReactiveQuery('pixi-graphics', {
				with: ['pixiGraphics'] as const,
				onEnter: (entity) => {
					const pixiObject = entity.components.pixiGraphics.graphics;
					entityToPixiObject.set(entity.id, pixiObject);
					addToSceneGraph(entity.id, pixiObject, ecs);
				},
				onExit: (entityId) => {
					removeFromSceneGraph(entityId);
				},
			});

			// Reactive query for containers
			ecs.addReactiveQuery('pixi-containers', {
				with: ['pixiContainer'] as const,
				onEnter: (entity) => {
					const pixiObject = entity.components.pixiContainer.container;
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
			ecs.onComponentAdded('pixiRenderLayer', (_layerName, entity) => {
				updateSceneGraphParent(entity.id, ecs);
			});

			// Re-parent entity when render layer is removed
			ecs.onComponentRemoved('pixiRenderLayer', (_oldLayerName, entity) => {
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

	// Merge transform bundle (runs first) with pixi bundle
	const transformBundle = createTransformBundle(transformOptions);
	return mergeBundles('pixi-renderer', transformBundle, pixiBundle);
}
