# ECSpresso

*(pronounced "ex-presso")*

A type-safe, modular, and extensible Entity Component System (ECS) framework for TypeScript and JavaScript.

## Features

- **Type-Safe**: Full TypeScript support with component, event, and resource type inference
- **Modular**: Plugin-based architecture for organizing features
- **Developer-Friendly**: Clean, fluent API with method chaining
- **Event-Driven**: Integrated event system for decoupled communication
- **Resource Management**: Global state management with lazy loading
- **Asset Management**: Eager/lazy asset loading with groups and progress tracking
- **Screen Management**: Game state/screen transitions with overlay support
- **Entity Hierarchy**: Parent-child relationships with traversal and cascade deletion
- **Query System**: Powerful entity filtering with helper type utilities
- **System Phases**: Named execution phases (preUpdate → fixedUpdate → update → postUpdate → render) with fixed-timestep simulation
- **Change Detection**: Per-system monotonic sequence change tracking with `changed` query filters
- **Reactive Queries**: Enter/exit callbacks when entities match or unmatch queries
- **System Groups**: Enable/disable groups of systems at runtime
- **Component Lifecycle**: Callbacks for component add/remove with unsubscribe support
- **Required Components**: Auto-add dependent components on spawn/addComponent (e.g. `localTransform` implies `worldTransform`)
- **Command Buffer**: Deferred structural changes for safe entity/component operations during systems
- **Timer Plugin**: ECS-native timers with event-based completion notifications

## Installation

```sh
npm install ecspresso
```

## Table of Contents

- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Entities and Components](#entities-and-components) -- [Component Callbacks](#component-callbacks), [Reactive Queries](#reactive-queries)
  - [Systems and Queries](#systems-and-queries)
  - [Resources](#resources)
- [Systems in Depth](#systems-in-depth)
  - [Method Chaining](#method-chaining)
  - [Query Type Utilities](#query-type-utilities)
  - [System Phases](#system-phases)
  - [System Priority](#system-priority)
  - [System Groups](#system-groups)
  - [System Lifecycle](#system-lifecycle)
- [Events](#events)
- [Entity Hierarchy](#entity-hierarchy) -- [Traversal](#traversal), [Parent-First Traversal](#parent-first-traversal), [Cascade Deletion](#cascade-deletion)
- [Change Detection](#change-detection) -- [Marking Changes](#marking-changes), [Changed Query Filter](#changed-query-filter), [Sequence Timing](#sequence-timing)
- [Command Buffer](#command-buffer) -- [Available Commands](#available-commands)
- [Plugins](#plugins) -- [Plugin Factory](#plugin-factory), [Required Components](#required-components), [Built-in Plugins](#built-in-plugins), [Timer Plugin](#timer-plugin)
- [Asset Management](#asset-management)
- [Screen Management](#screen-management) -- [Screen-Scoped Systems](#screen-scoped-systems), [Screen Resource](#screen-resource)
- [Type Safety](#type-safety)
- [Error Handling](#error-handling)
- [Performance Tips](#performance-tips)

## Quick Start

```typescript
import ECSpresso from 'ecspresso';

// 1. Define your component types
interface Components {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  health: { value: number };
}

// 2. Create a world
const world = new ECSpresso<Components>();

// 3. Add a movement system
world.addSystem('movement')
  .addQuery('moving', { with: ['position', 'velocity'] })
  .setProcess((queries, deltaTime) => {
    for (const entity of queries.moving) {
      entity.components.position.x += entity.components.velocity.x * deltaTime;
      entity.components.position.y += entity.components.velocity.y * deltaTime;
    }
  })
  .build();

// 4. Create entities
const player = world.spawn({
  position: { x: 0, y: 0 },
  velocity: { x: 10, y: 5 },
  health: { value: 100 }
});

// 5. Run the game loop
world.update(1/60);
```

## Core Concepts

### Entities and Components

Entities are containers for components. Use `spawn()` to create entities with initial components:

```typescript
// Create entity with components
const entity = world.spawn({
  position: { x: 10, y: 20 },
  health: { value: 100 }
});

// Add components later
world.entityManager.addComponent(entity.id, 'velocity', { x: 5, y: 0 });

// Get component data (returns undefined if not found)
const position = world.entityManager.getComponent(entity.id, 'position');

// Remove components or entities
world.entityManager.removeComponent(entity.id, 'velocity');
world.entityManager.removeEntity(entity.id);
```

#### Component Callbacks

React to component additions and removals. Both methods return an unsubscribe function:

```typescript
const unsubAdd = world.onComponentAdded('health', (value, entity) => {
  console.log(`Health added to entity ${entity.id}:`, value);
});

const unsubRemove = world.onComponentRemoved('health', (oldValue, entity) => {
  console.log(`Health removed from entity ${entity.id}:`, oldValue);
});

// Unsubscribe when done
unsubAdd();
unsubRemove();
```

Also available on `world.entityManager.onComponentAdded()` / `onComponentRemoved()`.

#### Reactive Queries

Get callbacks when entities enter or exit a query match. Unlike regular queries that you poll during `update()`, reactive queries push notifications when the entity's components change:

```typescript
world.addReactiveQuery('enemies', {
  with: ['position', 'enemy'],
  without: ['dead'],
  onEnter: (entity) => {
    console.log(`Enemy ${entity.id} appeared at`, entity.components.position);
    spawnHealthBar(entity.id);
  },
  onExit: (entityId) => {
    // Receives ID since entity may already be removed
    console.log(`Enemy ${entityId} gone`);
    removeHealthBar(entityId);
  },
});

// Triggers onEnter: spawning matching entity, adding required component, removing excluded component
const enemy = world.spawn({ position: { x: 0, y: 0 }, enemy: true }); // onEnter fires

// Triggers onExit: removing required component, adding excluded component, removing entity
world.entityManager.addComponent(enemy.id, 'dead', true); // onExit fires

// Existing matching entities trigger onEnter when query is added
// Component replacement does NOT trigger enter/exit (match status unchanged)

// Remove reactive query when no longer needed
world.removeReactiveQuery('enemies'); // returns true if existed
```

### Systems and Queries

Systems process entities that match specific component patterns:

```typescript
world.addSystem('combat')
  .addQuery('fighters', {
    with: ['position', 'health'],
    without: ['dead']
  })
  .addQuery('projectiles', {
    with: ['position', 'damage']
  })
  .setProcess((queries, deltaTime) => {
    for (const fighter of queries.fighters) {
      for (const projectile of queries.projectiles) {
        // Combat logic here
      }
    }
  })
  .build();
```

### Resources

Resources provide global state accessible to all systems.

```typescript
interface Resources {
  score: { value: number };
  settings: { difficulty: 'easy' | 'hard' };
}

const world = new ECSpresso<Components, {}, Resources>();

// Direct values
world.addResource('score', { value: 0 });

// Sync or async factories (lazy initialization)
world.addResource('config', () => ({ difficulty: 'normal', soundEnabled: true }));
world.addResource('database', async () => await connectToDatabase());

// Factory with dependencies (initialized after dependencies are ready)
world.addResource('cache', {
  dependsOn: ['database'],
  factory: (ecs) => ({ db: ecs.getResource('database') })
});

// Initialize all resources (respects dependency order, detects circular deps)
await world.initializeResources();

// Use in systems
world.addSystem('scoring')
  .setProcess((queries, deltaTime, ecs) => {
    const score = ecs.getResource('score');
    score.value += 10;
  })
  .build();
```

**Builder pattern** -- resources chain naturally with other builder methods:

```typescript
const world = ECSpresso
  .create<Components, Events, Resources>()
  .withPlugin(physicsPlugin)
  .withResource('config', { debug: true, maxEntities: 1000 })
  .withResource('score', () => ({ value: 0 }))
  .withResource('cache', {
    dependsOn: ['database'],
    factory: (ecs) => createCache(ecs.getResource('database'))
  })
  .build();
```

**Disposal** -- resources can define cleanup logic with `onDispose` callbacks:

```typescript
world.addResource('keyboard', {
  factory: () => {
    const handler = (e: KeyboardEvent) => { /* ... */ };
    window.addEventListener('keydown', handler);
    return { handler };
  },
  onDispose: (resource) => {
    window.removeEventListener('keydown', resource.handler);
  }
});

await world.disposeResource('keyboard');     // Dispose a single resource
await world.disposeResources();              // All, in reverse dependency order
```

`onDispose` receives the resource value and the ECSpresso instance. Supports sync and async callbacks. Only initialized resources have their `onDispose` called. `removeResource()` still exists for removal without disposal.

## Systems in Depth

### Method Chaining

Chain multiple systems using `.and()`. The `.and()` method returns the parent container (ECSpresso or Plugin), enabling fluent chaining:

```typescript
world.addSystem('physics')
  .addQuery('moving', { with: ['position', 'velocity'] })
  .setProcess((queries, deltaTime) => {
    // Physics logic
  })
  .and() // Returns ECSpresso for continued chaining
  .addSystem('rendering')
  .addQuery('visible', { with: ['position', 'sprite'] })
  .setProcess((queries) => {
    // Rendering logic
  })
  .build();
```

### Query Type Utilities

Extract entity types from queries to create reusable helper functions:

```typescript
import { createQueryDefinition, QueryResultEntity } from 'ecspresso';

// Create reusable query definitions
const movingQuery = createQueryDefinition<Components>({
  with: ['position', 'velocity'],
  without: ['frozen']
});

// Extract entity type for helper functions
type MovingEntity = QueryResultEntity<Components, typeof movingQuery>;

function updatePosition(entity: MovingEntity, deltaTime: number) {
  entity.components.position.x += entity.components.velocity.x * deltaTime;
  entity.components.position.y += entity.components.velocity.y * deltaTime;
}

// Use in systems
world.addSystem('movement')
  .addQuery('entities', movingQuery)
  .setProcess((queries, deltaTime) => {
    for (const entity of queries.entities) {
      updatePosition(entity, deltaTime);
    }
  })
  .build();
```

### System Phases

Systems are organized into named execution phases that run in a fixed order:

```
preUpdate → fixedUpdate → update → postUpdate → render
```

Each phase's command buffer is played back before the next phase begins, so entities spawned in `preUpdate` are visible to `fixedUpdate`, and so on. Systems without `.inPhase()` default to `update`.

```typescript
world.addSystem('input')
  .inPhase('preUpdate')
  .setProcess((queries, dt, ecs) => { /* Read input, update timers */ })
  .and()
  .addSystem('physics')
  .inPhase('fixedUpdate')
  .setProcess((queries, dt, ecs) => {
    // dt is always fixedDt here (e.g. 1/60)
    // Runs 0..N times per frame based on accumulated time
  })
  .and()
  .addSystem('gameplay')
  .inPhase('update')  // default phase
  .setProcess((queries, dt, ecs) => { /* Game logic, AI */ })
  .and()
  .addSystem('transform-sync')
  .inPhase('postUpdate')
  .setProcess((queries, dt, ecs) => { /* Transform propagation */ })
  .and()
  .addSystem('renderer')
  .inPhase('render')
  .setProcess((queries, dt, ecs) => { /* Visual output */ })
  .build();
```

**Fixed Timestep** -- The `fixedUpdate` phase uses a time accumulator for deterministic simulation. A spiral-of-death cap (8 steps) prevents runaway accumulation.

```typescript
const world = ECSpresso.create<Components, Events, Resources>()
  .withFixedTimestep(1 / 60)  // 60Hz physics (default)
  .build();
```

**Interpolation** -- Use `ecs.interpolationAlpha` (0..1) in the render phase to smooth between fixed steps.

**Runtime Phase Changes** -- Move systems between phases at runtime with `world.updateSystemPhase('debug-overlay', 'render')`.

### System Priority

Within each phase, systems execute in priority order (higher numbers first). Systems with the same priority execute in registration order:

```typescript
world.addSystem('physics')
  .inPhase('fixedUpdate')
  .setPriority(100) // Runs first within fixedUpdate
  .setProcess(() => { /* physics */ })
  .and()
  .addSystem('constraints')
  .inPhase('fixedUpdate')
  .setPriority(50)  // Runs second within fixedUpdate
  .setProcess(() => { /* constraints */ })
  .build();
```

### System Groups

Organize systems into groups that can be enabled/disabled at runtime:

```typescript
world.addSystem('renderSprites')
  .inGroup('rendering')
  .addQuery('sprites', { with: ['position', 'sprite'] })
  .setProcess((queries) => { /* ... */ })
  .and()
  .addSystem('renderParticles')
  .inGroup('rendering')
  .inGroup('effects')  // Systems can belong to multiple groups
  .setProcess(() => { /* ... */ })
  .build();

world.disableSystemGroup('rendering');              // All rendering systems skip
world.enableSystemGroup('rendering');               // Resume rendering
world.isSystemGroupEnabled('rendering');            // true/false
world.getSystemsInGroup('rendering');               // ['renderSprites', 'renderParticles']

// If a system belongs to multiple groups, disabling ANY group skips the system
```

### System Lifecycle

Systems can have initialization, cleanup, and post-update hooks:

```typescript
world.addSystem('gameSystem')
  .setOnInitialize(async (ecs) => {
    console.log('System starting...');
  })
  .setOnDetach((ecs) => {
    console.log('System shutting down...');
  })
  .build();

await world.initialize();
```

**Post-Update Hooks** -- Register callbacks that run between the `postUpdate` and `render` phases:

```typescript
// Returns unsubscribe function; multiple hooks run in registration order
const unsubscribe = world.onPostUpdate((ecs, deltaTime) => {
  console.log(`Frame completed in ${deltaTime}s`);
});

unsubscribe();
```

## Events

Use events for decoupled system communication. Events work across all features -- hierarchy changes, asset loading, timer completion, and custom game events all use the same system.

```typescript
interface Events {
  playerDied: { playerId: number };
  levelComplete: { score: number };
  // Hierarchy events (if using entity hierarchy)
  hierarchyChanged: {
    entityId: number;
    oldParent: number | null;
    newParent: number | null;
  };
}

const world = new ECSpresso<Components, Events>();

// Subscribe - returns unsubscribe function
const unsubscribe = world.on('playerDied', (data) => {
  console.log(`Player ${data.playerId} died`);
});
unsubscribe();

// Or unsubscribe by callback reference
const handler = (data) => console.log(`Score: ${data.score}`);
world.on('levelComplete', handler);
world.off('levelComplete', handler);

// Handle events in systems
world.addSystem('gameLogic')
  .setEventHandlers({
    playerDied: (data, ecs) => {
      // Respawn logic
    }
  })
  .build();

// Publish events from anywhere
world.eventBus.publish('playerDied', { playerId: 1 });
```

**Built-in events**: `hierarchyChanged` (entity parent changes), `assetLoaded` / `assetFailed` / `assetGroupProgress` / `assetGroupLoaded` (asset loading), and timer `onComplete` events (see [Plugins](#plugins)).

## Entity Hierarchy

Create parent-child relationships between entities for scene graphs, UI trees, or skeletal hierarchies:

```typescript
const player = world.spawn({ position: { x: 0, y: 0 } });

// Create child entity
const weapon = world.spawnChild(player.id, { position: { x: 10, y: 0 } });

// Or set parent on existing entity
const shield = world.spawn({ position: { x: -10, y: 0 } });
world.setParent(shield.id, player.id);

// Orphan an entity
world.removeParent(shield.id);
```

### Traversal

| Method | Returns | Description |
|--------|---------|-------------|
| `getParent(id)` | `number \| null` | Parent entity ID |
| `getChildren(id)` | `number[]` | Direct children |
| `getAncestors(id)` | `number[]` | Entity up to root |
| `getDescendants(id)` | `number[]` | Depth-first order |
| `getRoot(id)` | `number` | Root of the hierarchy |
| `getSiblings(id)` | `number[]` | Other children of same parent |
| `getRootEntities()` | `number[]` | All root entities |
| `getChildAt(id, index)` | `number` | Child at index |
| `getChildIndex(parentId, childId)` | `number` | Index of child |
| `isDescendantOf(id, ancestorId)` | `boolean` | Relationship check |
| `isAncestorOf(id, descendantId)` | `boolean` | Relationship check |

### Parent-First Traversal

Iterate the hierarchy with guaranteed parent-first order (useful for transform propagation):

```typescript
// Callback-based traversal
world.forEachInHierarchy((entityId, parentId, depth) => {
  // Parents are always visited before their children
});

// Filter to specific subtrees
world.forEachInHierarchy(callback, { roots: [root.id] });

// Generator-based (supports early termination)
for (const { entityId, parentId, depth } of world.hierarchyIterator()) {
  if (depth > 2) break;
}
```

### Cascade Deletion

When removing entities, descendants are automatically removed by default:

```typescript
world.removeEntity(parent.id);
// All descendants are removed

// To orphan children instead:
world.removeEntity(parent.id, { cascade: false });
```

Hierarchy changes emit the `hierarchyChanged` event (see [Events](#events)).

**World position pattern**: `worldPos = localPos + parent.worldPos`. A parent's world position already includes all grandparents, so each entity only needs to combine its local position with its immediate parent's world position. The Transform plugin implements this automatically.

## Change Detection

ECSpresso tracks component changes using a per-system monotonic sequence. Each `markChanged` call increments a global counter and stamps the component with a unique sequence number. Each system tracks the highest sequence it has seen; on its next execution, it only processes marks with a sequence greater than its last-seen value. This means each mark is processed exactly once per system, and marks expire after a single update cycle.

### Marking Changes

Components are automatically marked as changed when added via `spawn()`, `addComponent()`, or `addComponents()`. For in-place mutations, call `markChanged` explicitly:

```typescript
const position = world.entityManager.getComponent(entity.id, 'position');
if (position) {
  position.x += 10;
  world.markChanged(entity.id, 'position');
}
```

### Changed Query Filter

Add `changed` to a query definition to filter entities to only those whose specified components changed since the system last ran:

```typescript
world.addSystem('render-sync')
  .addQuery('moved', {
    with: ['position', 'sprite'],
    changed: ['position'],  // Only entities whose position changed this tick
  })
  .setProcess((queries) => {
    for (const entity of queries.moved) {
      syncSpritePosition(entity);
    }
  })
  .build();
```

When multiple components are listed in `changed`, entities matching **any** of them are included (OR semantics).

### Sequence Timing

- Marks made between updates are visible to all systems on the next update
- Spawn auto-marks are visible on the first update
- Marks from earlier phases are visible to later phases within the same frame
- Within a phase, a higher-priority system's marks are visible to lower-priority systems
- Each mark is processed exactly once per system (single-update expiry)

For manual change detection outside of system queries:

```typescript
const em = ecs.entityManager;
if (em.getChangeSeq(entity.id, 'localTransform') > ecs.changeThreshold) {
  // Component changed since last system execution (or since last update if between updates)
}
```

**Deferred marking**: `ecs.commands.markChanged(entity.id, 'position')` queues a mark for command buffer playback.

**Built-in plugin usage**: Movement marks `localTransform` (fixedUpdate) → Transform propagation reads `localTransform` changed, writes+marks `worldTransform` (postUpdate) → Renderer reads `worldTransform` changed (render).

## Command Buffer

Queue structural changes during system execution that execute between phases. This prevents issues when modifying entities during iteration.

```typescript
world.addSystem('combat')
  .addQuery('enemies', { with: ['enemy', 'health'] })
  .setProcess((queries, dt, ecs) => {
    for (const entity of queries.enemies) {
      if (entity.components.health.value <= 0) {
        ecs.commands.removeEntity(entity.id);
        ecs.commands.spawn({
          position: entity.components.position,
          explosion: true,
        });
      }
    }
  })
  .build();
```

### Available Commands

```typescript
// Entity operations
ecs.commands.spawn({ position: { x: 0, y: 0 } });
ecs.commands.spawnChild(parentId, { position: { x: 10, y: 0 } });
ecs.commands.removeEntity(entityId);
ecs.commands.removeEntity(entityId, { cascade: false });

// Component operations
ecs.commands.addComponent(entityId, 'velocity', { x: 5, y: 0 });
ecs.commands.addComponents(entityId, { velocity: { x: 5, y: 0 }, health: { value: 100 } });
ecs.commands.removeComponent(entityId, 'velocity');

// Hierarchy operations
ecs.commands.setParent(childId, parentId);
ecs.commands.removeParent(childId);

// Change detection
ecs.commands.markChanged(entityId, 'position');

// Utility
ecs.commands.length;  // Number of queued commands
ecs.commands.clear(); // Discard all queued commands
```

Commands execute in FIFO order. If a command fails (e.g., entity doesn't exist), it logs a warning and continues with remaining commands.

## Plugins

Organize related systems and resources into reusable plugins:

```typescript
import { definePlugin } from 'ecspresso';

const physicsPlugin = definePlugin<GameComponents, {}, GameResources>({
  id: 'physics',
  install(world) {
    world.addSystem('applyVelocity')
      .addQuery('moving', { with: ['position', 'velocity'] })
      .setProcess((queries, deltaTime) => {
        for (const entity of queries.moving) {
          entity.components.position.x += entity.components.velocity.x * deltaTime;
          entity.components.position.y += entity.components.velocity.y * deltaTime;
        }
      })
      .and()
      .addSystem('applyGravity')
      .addQuery('falling', { with: ['velocity'] })
      .setProcess((queries, deltaTime, ecs) => {
        const gravity = ecs.getResource('gravity');
        for (const entity of queries.falling) {
          entity.components.velocity.y += gravity.value * deltaTime;
        }
      })
      .and()
      .addResource('gravity', { value: 9.8 });
  },
});

// Register plugins with the world
const game = ECSpresso.create<GameComponents, {}, GameResources>()
  .withPlugin(physicsPlugin)
  .build();
```

### Plugin Factory

When multiple plugins share the same types (common in application code), use `createPluginFactory` to capture the type parameters once:

```typescript
import { createPluginFactory } from 'ecspresso';

// types.ts — capture types once
const definePlugin = createPluginFactory<Components, Events, Resources>();
export { definePlugin };

// movement-plugin.ts — no type params needed
import { definePlugin } from './types';

export const movementPlugin = definePlugin({
  id: 'movement',
  install(world) {
    world.addSystem('movement')
      .addQuery('moving', { with: ['position', 'velocity'] })
      .setProcess((queries, dt) => { /* ... */ })
      .and();
  },
});
```

You can also pass a world type directly to `definePlugin` as a one-off alternative:

```typescript
type MyWorld = typeof ecs; // derive from a built world
const plugin = definePlugin<MyWorld>({
  id: 'my-plugin',
  install(world) { /* world is fully typed */ },
});
```

### Required Components

Plugins can declare that certain components depend on others. When an entity gains a trigger component, any required components that aren't already present are auto-added with default values:

```typescript
const transformPlugin = definePlugin<TransformComponents>({
  id: 'transform',
  install(world) {
    world.registerRequired('localTransform', 'worldTransform', () => ({
      x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
    }));
  },
});

const world = ECSpresso.create()
  .withPlugin(transformPlugin)
  .build();

// worldTransform is auto-added with defaults
const entity = world.spawn({
  localTransform: { x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 },
});

// Explicit values always win — no auto-add if already provided
const entity2 = world.spawn({
  localTransform: { x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 },
  worldTransform: { x: 50, y: 50, rotation: 0, scaleX: 2, scaleY: 2 }, // used as-is
});
```

Requirements can also be registered via the builder or at runtime:

```typescript
// Builder
const world = ECSpresso.create()
  .withComponentTypes<Components>()
  .withRequired('rigidBody', 'velocity', () => ({ x: 0, y: 0 }))
  .withRequired('rigidBody', 'force', () => ({ x: 0, y: 0 }))
  .build();

// Runtime
world.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));
```

**Behavior:**
- Enforced at insertion time (`spawn`, `addComponent`, `addComponents`, `spawnChild`, command buffer)
- Removal is unrestricted — removing a required component does not cascade
- Transitive requirements resolve automatically (A requires B, B requires C → all three added)
- Circular dependencies are detected and rejected at registration time
- Auto-added components are marked as changed and trigger reactive queries
- Component names and factory return types are fully type-checked

**Built-in requirements:** The Transform plugin registers `localTransform` → `worldTransform`. The Physics 2D plugin registers `rigidBody` → `velocity` and `rigidBody` → `force`.

### Built-in Plugins

| Plugin | Import | Default Phase | Description |
|--------|--------|---------------|-------------|
| **Input** | `ecspresso/plugins/input` | `preUpdate` | Frame-accurate keyboard/pointer input with action mapping |
| **Timers** | `ecspresso/plugins/timers` | `preUpdate` | ECS-native timers with event-based completion |
| **Movement** | `ecspresso/plugins/movement` | `fixedUpdate` | Velocity-based movement integration |
| **Transform** | `ecspresso/plugins/transform` | `postUpdate` | Hierarchical transform propagation (local/world transforms) |
| **Bounds** | `ecspresso/plugins/bounds` | `postUpdate` | Screen bounds enforcement (destroy, clamp, wrap) |
| **Collision** | `ecspresso/plugins/collision` | `postUpdate` | Layer-based AABB/circle collision detection with events |
| **2D Renderer** | `ecspresso/plugins/renderers/renderer2D` | `render` | Automated PixiJS scene graph wiring |

Each plugin accepts a `phase` option to override its default.

### Input Plugin

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

### Timer Plugin

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

## Asset Management

Manage game assets with eager/lazy loading, groups, and progress tracking:

```typescript
type Assets = {
  playerTexture: { data: ImageBitmap };
  level1Music: { buffer: AudioBuffer };
  level1Background: { data: ImageBitmap };
};

const game = ECSpresso.create<Components, Events, Resources, Assets>()
  .withAssets(assets => assets
    // Eager assets - loaded automatically during initialize()
    .add('playerTexture', async () => {
      const img = await loadImage('player.png');
      return { data: img };
    })
    // Lazy asset group - loaded on demand
    .addGroup('level1', {
      level1Music: async () => ({ buffer: await loadAudio('level1.mp3') }),
      level1Background: async () => ({ data: await loadImage('level1-bg.png') }),
    })
  )
  .build();

await game.initialize();                          // Loads eager assets
const player = game.getAsset('playerTexture');    // Access loaded asset
game.isAssetLoaded('playerTexture');              // Check if loaded

await game.loadAssetGroup('level1');              // Load group on demand
game.getAssetGroupProgress('level1');             // 0-1 progress
game.isAssetGroupLoaded('level1');                // Check if group is ready
```

Systems can declare required assets and will only run when those assets are loaded:

```typescript
game.addSystem('gameplay')
  .requiresAssets(['playerTexture'])
  .setProcess((queries, dt, ecs) => {
    const player = ecs.getAsset('playerTexture');
  })
  .build();
```

Asset events (`assetLoaded`, `assetFailed`, `assetGroupProgress`, `assetGroupLoaded`) are available through the event system -- see [Events](#events).

## Screen Management

Manage game states/screens with transitions and overlay support:

```typescript
import type { ScreenDefinition } from 'ecspresso';

type Screens = {
  menu: ScreenDefinition<
    Record<string, never>,           // Config (passed when entering)
    { selectedOption: number }       // State (mutable during screen)
  >;
  gameplay: ScreenDefinition<
    { difficulty: string; level: number },
    { score: number; isPaused: boolean }
  >;
  pause: ScreenDefinition<Record<string, never>, Record<string, never>>;
};

const game = ECSpresso.create<Components, Events, Resources, {}, Screens>()
  .withScreens(screens => screens
    .add('menu', {
      initialState: () => ({ selectedOption: 0 }),
      onEnter: () => console.log('Entered menu'),
      onExit: () => console.log('Left menu'),
    })
    .add('gameplay', {
      initialState: () => ({ score: 0, isPaused: false }),
      onEnter: (config) => console.log(`Starting level ${config.level}`),
      onExit: () => console.log('Gameplay ended'),
      requiredAssetGroups: ['level1'],
    })
    .add('pause', {
      initialState: () => ({}),
    })
  )
  .build();

await game.initialize();
await game.setScreen('menu', {});                     // Set initial screen
await game.setScreen('gameplay', { difficulty: 'hard', level: 1 }); // Transition
await game.pushScreen('pause', {});                   // Push overlay
await game.popScreen();                               // Pop overlay

const current = game.getCurrentScreen();              // 'gameplay'
const config = game.getScreenConfig();                // { difficulty: 'hard', level: 1 }
const state = game.getScreenState();                  // { score: 0, isPaused: false }
game.updateScreenState({ score: 100 });
```

### Screen-Scoped Systems

```typescript
game.addSystem('menuUI')
  .inScreens(['menu'])                         // Only runs in 'menu'
  .setProcess((queries, dt, ecs) => {
    renderMenu(ecs.getScreenState().selectedOption);
  })
  .build();

game.addSystem('animations')
  .excludeScreens(['pause'])                   // Runs in all screens except 'pause'
  .setProcess(() => { /* ... */ })
  .build();
```

### Screen Resource

Access screen state through the `$screen` resource:

```typescript
game.addSystem('ui')
  .setProcess((queries, dt, ecs) => {
    const screen = ecs.getResource('$screen');
    screen.current;        // Current screen name
    screen.config;         // Current screen config
    screen.state;          // Current screen state (mutable)
    screen.isOverlay;      // true if screen was pushed
    screen.stackDepth;     // Number of screens in stack
    screen.isCurrent('gameplay');   // Check current screen
    screen.isActive('menu');        // true if in current or stack
  })
  .build();
```

## Type Safety

ECSpresso provides comprehensive TypeScript support:

```typescript
// ✅ Valid
world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });

// ❌ TypeScript error - invalid component name
world.entityManager.addComponent(entity.id, 'invalid', { data: 'bad' });

// ❌ TypeScript error - wrong component shape
world.entityManager.addComponent(entity.id, 'position', { x: 0 }); // missing y

// Query type safety - TypeScript knows which components exist
world.addSystem('example')
  .addQuery('moving', { with: ['position', 'velocity'] })
  .setProcess((queries) => {
    for (const entity of queries.moving) {
      entity.components.position.x;   // ✅ guaranteed
      entity.components.health.value; // ❌ not in query
    }
  })
  .build();

// Plugin type compatibility - conflicting types error at compile time
const plugin1 = definePlugin<{position: {x: number, y: number}}>({
  id: 'p1', install() {},
});
const plugin2 = definePlugin<{velocity: {x: number, y: number}}>({
  id: 'p2', install() {},
});
const world = ECSpresso.create()
  .withPlugin(plugin1)
  .withPlugin(plugin2)  // Types merge successfully
  .build();
```

## Error Handling

ECSpresso provides clear, contextual error messages:

```typescript
world.getResource('nonexistent');
// → "Resource 'nonexistent' not found. Available resources: [config, score, settings]"

world.entityManager.addComponent(999, 'position', { x: 0, y: 0 });
// → "Cannot add component 'position': Entity with ID 999 does not exist"

// Component not found returns undefined (no throw)
world.entityManager.getComponent(123, 'position'); // undefined
```

## Performance Tips

- Use `changed` query filters to skip unchanged entities in render sync, transform propagation, and similar systems
- Call `markChanged` after in-place mutations so downstream systems can detect the change
- Extract business logic into testable helper functions using query type utilities
- Group related systems into plugins for better organization and reusability
- Use system phases to separate concerns (physics in `fixedUpdate`, rendering in `render`) and priorities for ordering within a phase
- Use resource factories for expensive initialization (textures, audio, etc.)
- Consider component callbacks for immediate reactions to state changes
- Minimize the number of components in queries when possible to leverage indexing
