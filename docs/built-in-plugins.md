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
