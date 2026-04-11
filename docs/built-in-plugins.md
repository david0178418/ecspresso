# Built-in Plugins

| Plugin | Import | Default Phase | Description |
|--------|--------|---------------|-------------|
| **Input** | `ecspresso/plugins/input` | `preUpdate` | Frame-accurate keyboard/pointer input with action mapping |
| **Timers** | `ecspresso/plugins/timers` | `preUpdate` | ECS-native timers with event-based completion |
| **Coroutine** | `ecspresso/plugins/coroutine` | `update` | Generator-based coroutines for sequenced logic |
| **State Machine** | `ecspresso/plugins/state-machine` | `update` | Per-entity finite state machines |
| **Tween** | `ecspresso/plugins/tween` | `update` | Declarative property animation with easing, sequences, and loops |
| **Physics2D** | `ecspresso/plugins/physics2D` | `fixedUpdate` | ECS-native 2D arcade physics |
| **Transform** | `ecspresso/plugins/transform` | `postUpdate` | Hierarchical transform propagation (local/world transforms) |
| **Bounds** | `ecspresso/plugins/bounds` | `postUpdate` | Screen bounds enforcement (destroy, clamp, wrap) |
| **Collision** | `ecspresso/plugins/collision` | `postUpdate` | Layer-based AABB/circle collision detection with events |
| **Spatial Index** | `ecspresso/plugins/spatial-index` | `fixedUpdate + postUpdate` | Spatial hashing for efficient proximity queries |
| **Camera** | `ecspresso/plugins/camera` | `postUpdate` | Camera follow, shake, and bounds |
| **Particles** | `ecspresso/plugins/particles` | `update + render` | Pooled particle system with PixiJS ParticleContainer rendering |
| **Sprite Animation** | `ecspresso/plugins/sprite-animation` | `update` | Frame-based sprite animation |
| **Audio** | `ecspresso/plugins/audio` | `update` | Howler.js audio integration |
| **Diagnostics** | `ecspresso/plugins/diagnostics` | `render` | Performance monitoring and debug overlay |
| **2D Renderer** | `ecspresso/plugins/renderers/renderer2D` | `render` | Automated PixiJS scene graph wiring |

Each plugin accepts a `phase` option to override its default.

## Input Plugin

The input plugin provides frame-accurate keyboard, pointer (mouse + touch via PointerEvent), and named action mapping. It's a resource-only plugin — input is polled via the `inputState` resource. DOM events are accumulated between frames and snapshotted once per frame, so all systems see consistent state.

```typescript
import {
  createInputPlugin,
  type InputResourceTypes, type KeyCode
} from 'ecspresso/plugins/input';

const world = ECSpresso.create()
  .withPlugin(createInputPlugin({
    actions: {
      jump: { keys: [' ', 'ArrowUp'] },
      shoot: { keys: ['z'], buttons: [0] },
      moveLeft: { keys: ['a', 'ArrowLeft'] },
      moveRight: { keys: ['d', 'ArrowRight'] },
    },
  }))
  .build();

// In a system:
const input = ecs.getResource('inputState');
if (input.actions.justActivated('jump')) { /* ... */ }
if (input.keyboard.isDown('ArrowRight')) { /* ... */ }
if (input.pointer.justPressed(0)) { /* ... */ }

// Runtime remapping — must include all configured actions
input.setActionMap({
  jump: { keys: ['w'] },
  shoot: { keys: ['z'], buttons: [0] },
  moveLeft: { keys: ['a'] },
  moveRight: { keys: ['d'] },
});
```

Action names are type-safe — `isActive`, `justActivated`, `justDeactivated`, `setActionMap`, and `getActionMap` only accept action names from the config. The type parameter `A` is inferred from the `actions` object keys passed to `createInputPlugin`. Defaults to `string` when no actions are configured.

Key values use the `KeyCode` type — a union of all standard `KeyboardEvent.key` values — providing autocomplete and compile-time validation. Note that the space bar key is `' '` (a space character), not `'Space'`.

### Pointer coordinate conversion

By default `inputState.pointer.position` reports raw `clientX` / `clientY` from the DOM event — viewport-relative, not canvas-relative, and not aware of any renderer scaling. Pass `coordinateTransform` to convert pointer coordinates into whatever space your systems expect. The option is renderer-agnostic: wire it to `clientToLogical(...)` from renderer2D when using `screenScale`, or to an equivalent helper from another renderer.

```typescript
import { createInputPlugin } from 'ecspresso/plugins/input';
import {
  createRenderer2DPlugin, clientToLogical, type ViewportScale,
} from 'ecspresso/plugins/renderers/renderer2D';

// The renderer's canvas and viewportScale resource only exist after initialize().
// The closure captures these lazily — pointer events don't fire until after init.
let canvas: HTMLCanvasElement | null = null;
let viewport: ViewportScale | null = null;

const ecs = ECSpresso.create()
  .withPlugin(createRenderer2DPlugin({
    init: { background: '#1a1a2e', resizeTo: window },
    container: document.body,
    screenScale: { width: 1920, height: 1080, mode: 'fit' },
  }))
  .withPlugin(createInputPlugin({
    coordinateTransform: (clientX, clientY) => {
      if (!canvas || !viewport) return { x: clientX, y: clientY };
      return clientToLogical(clientX, clientY, canvas, viewport);
    },
  }))
  .build();

await ecs.initialize();
canvas = ecs.getResource('pixiApp').canvas;
viewport = ecs.getResource('viewportScale');
```

After this wiring, `inputState.pointer.position` reports logical design-space coordinates, so gameplay code can ignore window size and viewport layout entirely.

## 2D Renderer Plugin

The 2D renderer plugin wires a PixiJS `Application` to the ECS scene graph: transforms propagate from ECS components to PixiJS display objects, entity hierarchy mirrors into the scene graph, and a render sync system updates visuals each frame. Full option surface lives in `src/plugins/renderers/renderer2D.ts`; this section covers screen scaling, which is what most examples need to opt into a fixed design resolution.

### Screen scaling

Set `screenScale` to pin a logical design resolution. The renderer wraps its root container in a scaled `viewportContainer` so all gameplay systems work in design coordinates while the visible canvas adapts to the window. Three modes:

- `fit` — letterbox: preserves aspect ratio, fits entirely inside the window, leaves gaps on the short axis
- `cover` — preserves aspect ratio, fills the window completely, crops on the long axis
- `stretch` — non-uniform scale, always fills, distorts aspect ratio

```typescript
import { createRenderer2DPlugin } from 'ecspresso/plugins/renderers/renderer2D';

const ecs = ECSpresso.create()
  .withPlugin(createRenderer2DPlugin({
    init: { background: '#1a1a2e', resizeTo: window },
    container: document.body,
    screenScale: { width: 1920, height: 1080, mode: 'fit' },
  }))
  .build();
```

When `screenScale` is set, the plugin also installs a `viewportScale` resource carrying the current `scaleX` / `scaleY`, `offsetX` / `offsetY`, `physicalWidth` / `physicalHeight`, `mode`, and the original `designWidth` / `designHeight`. Systems that need to place screen-space overlays or convert coordinates can read from this resource.

### Pointer coordinate conversion

`clientToLogical(clientX, clientY, canvas, viewport)` converts a DOM `PointerEvent`'s client coordinates into design-resolution coordinates, accounting for the canvas's position in the viewport, CSS-pixel → physical-pixel scaling, and the letterbox / crop offsets introduced by the scale mode. Wire it into the input plugin's `coordinateTransform` option (see the Input Plugin section above) to make `inputState.pointer.position` report logical coordinates directly. See the `20-viewport-scaling` example for a complete demonstration.

### Runtime mode changes

The `mode` field on `viewportScale` is mutable. To switch modes at runtime, assign a new mode and call `reapplyViewportScale(pixiApp)` to recompute and apply immediately without waiting for a window resize:

```typescript
import { reapplyViewportScale } from 'ecspresso/plugins/renderers/renderer2D';

const viewport = ecs.getResource('viewportScale');
const pixiApp = ecs.getResource('pixiApp');

viewport.mode = 'cover';
reapplyViewportScale(pixiApp);
```

## Timer Plugin

The timer plugin provides ECS-native timers that follow the "data, not callbacks" philosophy. Timers are components processed each frame, with optional event-based completion notifications.

```typescript
import {
  createTimerPlugin, createTimer, createRepeatingTimer,
  type TimerComponentTypes, type TimerEventData
} from 'ecspresso/plugins/timers';

// Events used with onComplete must have TimerEventData payload
interface Events {
  hideMessage: TimerEventData;   // { entityId, duration, elapsed }
  spawnWave: TimerEventData;
}

const world = ECSpresso
  .create()
  .withPlugin(createTimerPlugin())
  .withComponentTypes<{ position: { x: number; y: number } }>()
  .withEventTypes<Events>()
  .build();

// One-shot timer (poll justFinished or use onComplete event)
world.spawn({ ...createTimer(2.0), position: { x: 0, y: 0 } });
world.spawn({ ...createTimer(1.5, { onComplete: 'hideMessage' }) });

// Repeating timer
world.spawn({ ...createRepeatingTimer(5.0, { onComplete: 'spawnWave' }) });
```

Timer components expose `elapsed`, `duration`, `repeat`, `active`, `justFinished`, and optional `onComplete` for runtime control.

## Collision Plugin

The collision plugin detects overlaps between entities with `aabbCollider` or `circleCollider` components and publishes `collision` events. It's event-only — it never mutates position or velocity. Use it for gameplay hit detection; pair it with the physics2D plugin when you also want impulse response.

Collision pairs are filtered by layer. `defineCollisionLayers` declares the layer graph once and produces typed factory helpers plus a `Layer` type that flows through event subscribers and pair handlers.

```typescript
import {
  createCollisionPlugin,
  createAABBCollider, createCircleCollider,
  defineCollisionLayers, createCollisionPairHandler,
  type LayersOf,
} from 'ecspresso/plugins/collision';
import { createTransformPlugin, createTransform } from 'ecspresso/plugins/transform';

const layers = defineCollisionLayers({
  player: ['enemy', 'pickup'],
  enemy: ['player'],
  pickup: [],
});
type Layer = LayersOf<typeof layers>;

const ecs = ECSpresso.create()
  .withPlugin(createTransformPlugin())
  .withPlugin(createCollisionPlugin({ layers }))
  .build();

ecs.spawn({
  ...createTransform(100, 100),
  ...createAABBCollider(50, 50),
  ...layers.player(),
});

ecs.spawn({
  ...createTransform(120, 120),
  ...createCircleCollider(20),
  ...layers.enemy(),
});

// Route pairs to layer-specific handlers
type ECS = typeof ecs;
const onCollide = createCollisionPairHandler<ECS, Layer>({
  'player:enemy': (playerId, enemyId, world) => {
    world.commands.removeEntity(enemyId);
  },
  'player:pickup': (playerId, pickupId, world) => {
    world.commands.removeEntity(pickupId);
  },
});
ecs.eventBus.subscribe('collision', (data) => onCollide({ data, ecs }));
```

`collision` events carry `entityA`, `entityB`, `layerA`, `layerB`, and flat contact fields `normalX` / `normalY` / `depth`. The normal points from A toward B. Declaring `"a:b"` in a pair handler automatically also handles `(layerA=b, layerB=a)` with the entity arguments swapped so the declared key order holds.

Collider positions are read from `worldTransform`, so hierarchical parents and offsets work correctly. Optional `offsetX` / `offsetY` on the collider itself shifts the collision shape relative to the entity's transform.

Without a spatial index installed, the collision system uses O(N²) brute-force pair testing. Install `createSpatialIndexPlugin()` for broadphase acceleration — see the Spatial Index section below.

## Physics2D Plugin

The physics2D plugin provides ECS-native 2D arcade physics: gravity, forces, drag, semi-implicit Euler integration, and impulse-based collision response with restitution and friction. It reuses the collider types from the collision plugin and runs in `fixedUpdate` so timestep is deterministic.

```typescript
import {
  createPhysics2DPlugin, createRigidBody, applyForce, applyImpulse,
} from 'ecspresso/plugins/physics2D';
import {
  createAABBCollider, defineCollisionLayers,
} from 'ecspresso/plugins/collision';
import { createTransformPlugin, createTransform } from 'ecspresso/plugins/transform';

const layers = defineCollisionLayers({
  ball: ['ball', 'wall'],
  wall: ['ball'],
});

const ecs = ECSpresso.create()
  .withPlugin(createTransformPlugin())
  .withPlugin(createPhysics2DPlugin({ gravity: { x: 0, y: 980 }, layers }))
  .withFixedTimestep(1 / 60)
  .build();

// Dynamic body — gravity, forces, and collision response all apply
ecs.spawn({
  ...createTransform(100, 50),
  ...createRigidBody('dynamic', { mass: 1, restitution: 0.6, friction: 0.2 }),
  velocity: { x: 0, y: 0 },
  ...createAABBCollider(20, 20),
  ...layers.ball(),
});

// Static body — immovable, mass automatically set to Infinity
ecs.spawn({
  ...createTransform(400, 600),
  ...createRigidBody('static'),
  velocity: { x: 0, y: 0 },
  ...createAABBCollider(800, 20),
  ...layers.wall(),
});

// Accumulate a force inside a system:
applyForce(ecs, entityId, 0, -500);
// Or apply an instantaneous impulse:
applyImpulse(ecs, entityId, 100, 0);
```

Body types: `'dynamic'` (fully simulated), `'kinematic'` (moves via velocity only, ignores gravity and collision response), `'static'` (immovable). `rigidBody` auto-creates `velocity` and `force` components via required-component registration, so you only need to spread `createRigidBody(...)` plus an explicit `velocity` if you want a non-zero initial value.

`physicsCollision` events carry `entityA`, `entityB`, and flat contact fields `normalX` / `normalY` / `depth`. Collision response happens before the event fires, so subscribers observe post-impulse state.

The collision system can be placed in an additional group via `collisionSystemGroup`, which lets you toggle collision detection on/off independently of integration. Like the collision plugin, physics2D benefits from `createSpatialIndexPlugin()` for anything beyond a handful of bodies.

## Spatial Index Plugin

The spatial index plugin provides a uniform-grid spatial hash that accelerates collision detection and proximity queries. Installing it alongside `createCollisionPlugin()` or `createPhysics2DPlugin()` automatically switches them from O(N²) brute-force to a broadphase + narrowphase pipeline — no other code changes required.

```typescript
import { createSpatialIndexPlugin } from 'ecspresso/plugins/spatial-index';

const ecs = ECSpresso.create()
  .withPlugin(createTransformPlugin())
  .withPlugin(createCollisionPlugin({ layers }))
  .withPlugin(createSpatialIndexPlugin({ cellSize: 64 }))
  .withFixedTimestep(1 / 60)
  .build();

// Proximity queries from any system:
const si = ecs.getResource('spatialIndex');
const nearbyIds = si.queryRadius(playerX, playerY, 200);
const inRect = si.queryRect(minX, minY, maxX, maxY);
```

Options:

- `cellSize` (default `64`) — roughly 1–2× the size of a typical collider. Too small wastes memory on empty cells; too large collapses the broadphase back toward brute force.
- `phases` (default `['fixedUpdate', 'postUpdate']`) — when to rebuild the grid. `fixedUpdate` is required for physics2D; `postUpdate` is required for the collision plugin's default phase. Limit to one phase if you only use one plugin.
- `priority` (default `2000`) — runs before collision detection (priority `0`) so each consumer sees a freshly rebuilt grid.

Steady-state rebuilds allocate zero `SpatialEntry` objects and zero cell buckets — both are pooled in place across frames. Rebuild cost is proportional to the number of colliders, not the world size.

Besides accelerating collision, the `spatialIndex` resource exposes `queryRect`, `queryRadius`, and the out-parameter variants `queryRectInto` / `queryRadiusInto` (write into a caller-owned `Set<number>`, zero allocations per call) for game-logic proximity checks.
