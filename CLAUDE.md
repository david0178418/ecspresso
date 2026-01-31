# ECSpresso

A type-safe ECS (Entity-Component-System) library for TypeScript. Uses Bun as runtime/test runner. Emphasizes strong typing, modular bundles, and fluent builder API.

## Source Structure

```
src/
├── ecspresso.ts       # Main ECS class, builder pattern entry point
├── entity-manager.ts  # Entity storage, component indexing, queries
├── hierarchy-manager.ts # Parent-child relationships, traversal
├── system-builder.ts  # Fluent builder for systems
├── bundle.ts          # Grouping systems/resources for modularity
├── event-bus.ts       # Pub/sub event system
├── resource-manager.ts # Global state, factory detection, lazy init
├── command-buffer.ts  # Deferred structural changes (spawn, remove, etc.)
├── asset-manager.ts   # Asset loading, groups, progress tracking
├── asset-types.ts     # Asset type definitions
├── screen-manager.ts  # Screen/state transitions, overlay stack
├── screen-types.ts    # Screen type definitions
├── reactive-query-manager.ts # Reactive queries with enter/exit callbacks
├── types.ts           # Core type definitions
├── type-utils.ts      # Bundle compatibility type utilities
├── index.ts           # Public API exports
└── bundles/
    ├── utils/
    │   ├── timers.ts     # Timer bundle with event-based completion
    │   ├── transform.ts  # Hierarchical local/world transform propagation
    │   ├── movement.ts   # Velocity-based movement integration
    │   ├── input.ts      # Frame-accurate keyboard/pointer input with action mapping
    │   ├── bounds.ts     # Screen bounds enforcement (destroy, clamp, wrap)
    │   └── collision.ts  # Layer-based AABB/circle collision detection
    └── renderers/
        └── renderer2D.ts  # PixiJS scene graph wiring
```

## Core Concepts

- **Components**: Data-only objects stored on entities
- **Systems**: Process entities matching queries, use builder pattern
- **Resources**: Global singleton state accessible to systems
- **Events**: Decoupled pub/sub for inter-system communication
- **Bundles**: Group related systems/resources for reusability
- **Command Buffer**: Deferred structural changes executed between phases
- **System Phases**: Named execution phases (preUpdate → fixedUpdate → update → postUpdate → render) with fixed-timestep simulation
- **Assets**: Eager/lazy loaded resources with groups and progress tracking
- **Screens**: Game state management with transitions and overlay stack
- **Entity Hierarchy**: Parent-child relationships with traversal and cascade deletion
- **Timer Bundle**: ECS-native timers with optional event-based completion

## Key Patterns

- **Builder Pattern**: `world.addSystem().addQuery().setProcess().and()`
- **Method Chaining**: `.and()` returns parent (ECSpresso or Bundle)
- **Generic Type Parameters**: `<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>`
- **Query Type Utilities**: `createQueryDefinition()`, `QueryResultEntity<>`
- **Asset Builder**: `ECSpresso.create().withAssets(a => a.add().addGroup()).build()`
- **Screen Builder**: `ECSpresso.create().withScreens(s => s.add()).build()`
- **Screen-Scoped Systems**: `.inScreens(['menu'])`, `.excludeScreens(['pause'])`
- **Asset-Required Systems**: `.requiresAssets(['playerTexture'])`
- **System Phases**: `.inPhase('fixedUpdate')`, phases execute in order: `preUpdate` → `fixedUpdate` → `update` → `postUpdate` → `render`
- **Fixed Timestep**: `ECSpresso.create().withFixedTimestep(1/60).build()`, `ecs.fixedDt`, `ecs.interpolationAlpha`
- **Runtime Phase Change**: `updateSystemPhase(label, phase)` moves a system between phases
- **System Groups**: `.inGroup('rendering')`, `disableSystemGroup()`, `enableSystemGroup()`
- **Entity Hierarchy**: `spawnChild(parentId, components)`, `getParent()`, `getChildren()`, `getAncestors()`, `getDescendants()`
- **Hierarchy Traversal**: `forEachInHierarchy()`, `hierarchyIterator()` for parent-first iteration
- **Cascade Deletion**: `removeEntity(id)` removes descendants by default; use `{ cascade: false }` to orphan children
- **Component Lifecycle**: `onComponentAdded()`, `onComponentRemoved()` return unsubscribe functions
- **Reactive Queries**: `addReactiveQuery()` with `onEnter`/`onExit` callbacks for query match changes
- **World Position Pattern**: `worldPos = localPos + parent.worldPos` (parent's world pos includes all grandparents)
- **Resource Dependencies**: `addResource('cache', { dependsOn: ['db'], factory: (ecs) => ... })`
- **Resource Builder**: `ECSpresso.create().withResource('key', value).build()` for fluent resource addition
- **Resource Disposal**: `onDispose` callback for cleanup, `disposeResource()`, `disposeResources()` for proper teardown
- **Command Buffer**: `ecs.commands.removeEntity(id)`, `ecs.commands.spawn({...})` for deferred execution
- **Input Bundle**: `createInputBundle({ actions: { jump: { keys: [' ', 'ArrowUp'] } } })`, resource-only bundle providing `inputState` resource
- **Input Key Codes**: `KeyCode` type covers all standard `KeyboardEvent.key` values; action bindings use `KeyCode[]` for compile-time key validation
- **Input Action Mapping**: `defineActionMap()` for typed action definitions, `inputState.setActionMap()` for runtime remapping
- **Timer Bundle**: `createTimerBundle<Events>()`, `createTimer<Events>(duration, { onComplete: 'eventName' })`
- **Timer Event Data**: Events used with timer `onComplete` must have `TimerEventData` payload type
- **Change Detection**: `markChanged(entityId, componentName)` increments a global monotonic sequence; `changed: ['component']` in query filters to only match changed entities. Each system tracks its last-seen sequence so marks are processed exactly once.
- **Auto-Marking**: `spawn()`, `addComponent()`, `addComponents()` auto-mark components as changed
- **Single-Update Expiry**: Marks expire after one update cycle (per-system sequence tracking eliminates the old 2-tick window)
- **Change Threshold**: `ecs.changeThreshold` returns the active threshold. During system execution it's the system's last-seen sequence; between updates it's the global sequence after command buffer playback. Manual checks: `em.getChangeSeq(id, comp) > ecs.changeThreshold`
- **Cross-Phase Visibility**: Marks from earlier phases (e.g. fixedUpdate) are visible to later phases (e.g. postUpdate) within the same frame
- **Bundle Phase Flow**: Movement marks `localTransform` (fixedUpdate) → Transform propagation reads `localTransform` changed, writes+marks `worldTransform` (postUpdate) → Renderer reads `worldTransform` changed (render)
- **Per-Phase Command Buffer**: Commands are played back between each phase, so entities spawned in preUpdate are visible to fixedUpdate, etc.

## Commands

- `bun test` - Run tests
- `bun run check:types` - Type check
- Examples in `examples/` directory

## Design Principles

- A goal of this library is to keep as strongly typed as possible. Avoid casting in general, and with "any" in particular. Only resort to casting or "any" usage in general when absolutely necessary.
- Avoid excessive object creation and allocation in hot paths. Prefer explicit arguments over wrapping parameters in objects, and synchronous function calls over promises. More generally, minimize any unnecessary allocations in performance-critical code paths, such as system functions that are run every tick.
- Avoid excessive use of "as const". Use it where it's important for the purposes of deepening type-awareness.
