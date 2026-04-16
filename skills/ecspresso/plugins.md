# ECSpresso Plugins

## Defining Plugins

Plugins group related systems, resources, and component types. Two approaches:

### 1. Fluent Builder

```typescript
import { definePlugin } from 'ecspresso';

interface MyComponents {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
}

interface MyResources {
  gravity: { value: number };
}

const physicsPlugin = definePlugin('physics')
  .withComponentTypes<MyComponents>()
  .withResourceTypes<MyResources>()
  .install((world) => {
    world.addResource('gravity', { value: 9.8 });

    world.addSystem('applyVelocity')
      .addQuery('moving', { with: ['position', 'velocity'] })
      .setProcess(({ queries, dt }) => {
        for (const entity of queries.moving) {
          entity.components.position.x += entity.components.velocity.x * dt;
          entity.components.position.y += entity.components.velocity.y * dt;
        }
      });
  });
```

The builder mirrors `ECSpresso.create()`:
- `.withComponentTypes<T>()`, `.withEventTypes<T>()`, `.withResourceTypes<T>()`, `.withAssetTypes<T>()`, `.withScreenTypes<T>()` — declare types this plugin provides
- `.withLabels<L>()`, `.withGroups<G>()`, `.withReactiveQueryNames<N>()` — declare system labels, groups, and reactive query names
- `.requires<W>()` — declare dependency on another plugin's `WorldConfig` type (e.g., `TransformWorldConfig`)
- `.install(fn)` — terminal, returns the finalized `Plugin` object

### 2. Plugin Factory (no type params)

When multiple plugins share the same world types:

```typescript
// types.ts
export const builder = ECSpresso.create()
  .withPlugin(createPhysicsPlugin())
  .withComponentTypes<{ player: boolean; enemy: EnemyData }>()
  .withResourceTypes<{ score: number }>();

export const definePlugin = builder.pluginFactory();

// movement-plugin.ts
import { definePlugin } from './types';

export const movementPlugin = definePlugin({
  id: 'movement',
  install(world) {
    world.addSystem('movement')
      .addQuery('moving', { with: ['position', 'velocity'] })
      .setProcess(({ queries, dt }) => { /* ... */ });
  },
});
```

## Using Plugins

```typescript
const ecs = ECSpresso.create()
  .withPlugin(physicsPlugin)
  .withPlugin(renderPlugin)
  .build();
```

Types from plugins merge automatically. Conflicting types (same key, different shape) produce compile errors.

## Required Components

Plugins can declare that one component auto-adds another when present:

```typescript
world.registerRequired('localTransform', 'worldTransform', () => ({
  x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
}));
```

Or via the builder: `.withRequired('rigidBody', 'velocity', () => ({ x: 0, y: 0 }))`.

Behavior:
- Enforced at insertion time (`spawn`, `addComponent`, `addComponents`, `spawnChild`, command buffer)
- Transitive: A requires B, B requires C -> all three added
- Circular dependencies detected and rejected at registration time
- Explicit values always win over auto-added defaults

## Built-in Plugins

All are created via factory functions (e.g., `createInputPlugin(options)`). Each accepts a `phase` option to override the default.

| Plugin | Import Path | Default Phase | Description |
|--------|-------------|---------------|-------------|
| Input | `ecspresso/plugins/input` | `preUpdate` | Frame-accurate keyboard/pointer input with action mapping |
| Timers | `ecspresso/plugins/timers` | `preUpdate` | ECS-native timers with event-based completion |
| Coroutine | `ecspresso/plugins/coroutine` | `update` | Generator-based coroutines for sequenced logic |
| State Machine | `ecspresso/plugins/state-machine` | `update` | Per-entity finite state machines |
| Tween | `ecspresso/plugins/tween` | `update` | Declarative property animation with easing, sequences, loops |
| Physics2D | `ecspresso/plugins/physics2D` | `fixedUpdate` | ECS-native 2D arcade physics |
| Transform | `ecspresso/plugins/transform` | `postUpdate` | Hierarchical 2D transform propagation (local/world) |
| Transform 3D | `ecspresso/plugins/spatial/transform3D` | `postUpdate` | Hierarchical 3D transform propagation with quaternion composition |
| Bounds | `ecspresso/plugins/bounds` | `postUpdate` | Screen bounds enforcement (destroy, clamp, wrap) |
| Collision | `ecspresso/plugins/collision` | `postUpdate` | Layer-based AABB/circle collision detection with events |
| Collision 3D | `ecspresso/plugins/physics/collision3D` | `postUpdate` | Layer-based AABB3D/sphere collision detection with events |
| Spatial Index | `ecspresso/plugins/spatial-index` | `fixedUpdate + postUpdate` | Spatial hashing for efficient proximity queries |
| Spatial Index 3D | `ecspresso/plugins/spatial/spatial-index3D` | `fixedUpdate + postUpdate` | 3D spatial hashing for efficient proximity queries and broadphase acceleration |
| Camera | `ecspresso/plugins/camera` | `postUpdate` | Camera follow, shake, and bounds |
| Camera 3D | `ecspresso/plugins/spatial/camera3D` | `postUpdate` | Orbit/follow/shake controls for a Three.js PerspectiveCamera or OrthographicCamera (`projection: 'perspective' \| 'orthographic'`; state is a discriminated union with `fov`/`setFov` vs `zoom`/`setZoom`) |
| Physics 3D | `ecspresso/plugins/physics/physics3D` | `fixedUpdate` | Gravity, forces, drag, Euler integration, impulse-based collision response |
| Particles | `ecspresso/plugins/particles` | `update + render` | Pooled particle system with PixiJS ParticleContainer |
| Sprite Animation | `ecspresso/plugins/sprite-animation` | `update` | Frame-based sprite animation |
| Audio | `ecspresso/plugins/audio` | `update` | Howler.js audio integration |
| Detection | `ecspresso/plugins/ai/detection` | `update` | Proximity detection with spatial-index, sorted by distance |
| Flocking | `ecspresso/plugins/ai/flocking` | `update` | Boid flocking — separation, alignment, cohesion via force-based steering |
| Behavior Tree | `ecspresso/plugins/ai/behavior-tree` | `update` | Composable priority-driven AI via behavior trees with hybrid traversal |
| Health | `ecspresso/plugins/combat/health` | (event-driven) | Health/damage/death lifecycle |
| Projectile | `ecspresso/plugins/combat/projectile` | `update` | Homing + linear projectile movement, collision integration |
| Iso Projection | `ecspresso/plugins/isometric/projection` | `render` | Cartesian→isometric coordinate projection, iso camera sync |
| Iso Depth Sort | `ecspresso/plugins/isometric/depth-sort` | `render` | Isometric z-ordering by world position |
| Diagnostics | `ecspresso/plugins/diagnostics` | `render` | Performance monitoring and debug overlay |
| 2D Renderer | `ecspresso/plugins/renderers/renderer2D` | `render` | Automated PixiJS scene graph wiring |
| 3D Renderer | `ecspresso/plugins/rendering/renderer3D` | `render` | Automated Three.js scene graph wiring |

For plugin-specific options and API details, see `docs/built-in-plugins.md`.
