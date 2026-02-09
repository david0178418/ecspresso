# ECSpresso

A type-safe ECS (Entity-Component-System) library for TypeScript. Uses Bun as runtime/test runner. Emphasizes strong typing, modular plugins, and fluent builder API.

## Source Structure

```
src/
├── ecspresso.ts       # Main ECS class, builder pattern entry point
├── entity-manager.ts  # Entity storage, component indexing, queries
├── hierarchy-manager.ts # Parent-child relationships, traversal
├── system-builder.ts  # Fluent builder for systems
├── plugin.ts          # Grouping systems/resources for modularity
├── event-bus.ts       # Pub/sub event system
├── resource-manager.ts # Global state, factory detection, lazy init
├── command-buffer.ts  # Deferred structural changes (spawn, remove, etc.)
├── asset-manager.ts   # Asset loading, groups, progress tracking
├── asset-types.ts     # Asset type definitions
├── screen-manager.ts  # Screen/state transitions, overlay stack
├── screen-types.ts    # Screen type definitions
├── reactive-query-manager.ts # Reactive queries with enter/exit callbacks
├── types.ts           # Core type definitions
├── type-utils.ts      # Plugin compatibility type utilities
├── math.ts            # Vector2D type + pure vector math functions
├── index.ts           # Public API exports
└── plugins/
    ├── utils/
    │   ├── timers.ts     # Timer plugin with callback-based completion
    │   ├── transform.ts  # Hierarchical local/world transform propagation
    │   ├── physics2D.ts  # ECS-native 2D arcade physics (gravity, forces, drag, collision response via shared narrowphase)
    │   ├── input.ts      # Frame-accurate keyboard/pointer input with action mapping
    │   ├── bounds.ts     # Screen bounds enforcement (destroy, clamp, wrap)
    │   ├── narrowphase.ts # Shared contact-computing narrowphase and collision iteration pipeline
    │   ├── collision.ts  # Layer-based collision detection + pair handler routing (uses shared narrowphase)
    │   ├── state-machine.ts # Per-entity finite state machines with guards and lifecycle hooks
    │   ├── tween.ts      # Declarative property animation with easing, sequences, and loops
    │   ├── audio.ts      # Howler.js audio integration with channels, SFX, and music
    │   ├── sprite-animation.ts # Frame-based sprite animation with loop modes and texture sync
    │   └── particles.ts  # High-performance pooled particle system with PixiJS ParticleContainer rendering
    └── renderers/
        └── renderer2D.ts  # PixiJS scene graph wiring
```

## Core Concepts

- **Components**: Data-only objects stored on entities
- **Systems**: Process entities matching queries, use builder pattern
- **Resources**: Global singleton state accessible to systems. `getResource(key)` throws if missing; `tryGetResource(key)` returns `T | undefined`
- **Events**: Decoupled pub/sub for inter-system communication. `AssetEvents<K, G>` and `ScreenEvents<S>` accept optional type params to narrow event payload keys (default `string` for backward compat)
- **Plugins**: Group related systems/resources for reusability
- **Command Buffer**: Deferred structural changes executed between phases
- **System Phases**: Named execution phases (preUpdate → fixedUpdate → update → postUpdate → render) with fixed-timestep simulation
- **Assets**: Eager/lazy loaded resources with groups and progress tracking
- **Screens**: Game state management with transitions and overlay stack
- **Entity Hierarchy**: Parent-child relationships with traversal and cascade deletion
- **Timer Plugin**: ECS-native timers with optional `onComplete` callback

## Key Patterns

### Builder & Type Inference
- **Builder Pattern**: `world.addSystem().addQuery().setProcess().and()` — `.and()` returns parent (ECSpresso or Plugin)
- **Generic Type Parameters**: `<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>` — prefer builder inference (`.withPlugin()`, `.withComponentTypes<T>()`, `.withEventTypes<T>()`, `.withResource()`) over explicit type params to `create<>()`
- **Type-Level Builder Methods**: `withComponentTypes<T>()`, `withEventTypes<T>()` — no runtime cost, accumulate via intersection with plugin types
- **Inferred World Type**: `const ecs = ECSpresso.create().withPlugin(...).build(); type ECS = typeof ecs;` — derive full world type from the builder chain
- **Built-in Resource Typing**: `.withAssets()` merges `$assets` into `ResourceTypes`; `.withScreens()` merges `$screen`. Without these builder calls, those keys are absent from `ResourceTypes`.
- **Type Extraction**: `ComponentsOf<B>`, `EventsOf<B>`, `ResourcesOf<B>` for plugins; `ComponentsOfWorld<W>`, `EventsOfWorld<W>`, `AssetsOfWorld<W>` for ECSpresso instances

### System Execution
- **Phase Order**: `preUpdate` → `fixedUpdate` → `update` → `postUpdate` → `render`
- **Per-Phase Command Buffer**: Commands play back between each phase — entities spawned in preUpdate are visible to fixedUpdate, etc.
- **System Filtering**: `.inScreens([...])`, `.excludeScreens([...])`, `.requiresAssets([...])` — all type-safe against their respective key types
- **Run When Empty**: `.runWhenEmpty()` — allows a system with queries to run even when all queries return zero entities. By default, such systems are skipped as an optimization.
- **System Groups**: `.inGroup('name')`, `disableSystemGroup()`, `enableSystemGroup()`

### Direct Component Access
- `getComponent(entityId, componentName)` — returns `T | undefined`. Type-safe against `ComponentTypes`.
- `addComponent(entityOrId, componentName, value)` — adds or replaces a component. Triggers lifecycle callbacks and marks as changed.
- `removeComponent(entityOrId, componentName)` — removes a component. Triggers removal/dispose callbacks.
- `mutateComponent(entityOrId, componentName, mutator)` — gets the component, passes it to `mutator` for in-place mutation, auto-calls `markChanged`, and returns the component. Throws if the entity or component is missing. Preferred over manual get+mutate+markChanged when modifying components outside queries.
- All of the above are also available on `commands` for deferred execution.

### Change Detection
- `markChanged(entityId, componentName)` increments a global monotonic sequence; `changed: ['component']` in query filters to match only changed entities
- `spawn()`, `addComponent()`, `addComponents()`, `mutateComponent()` auto-mark components as changed
- Each system tracks its last-seen sequence — marks are processed exactly once per system
- Cross-phase visibility: marks from earlier phases (e.g. fixedUpdate) are visible to later phases (e.g. postUpdate) within the same frame
- Manual checks: `em.getChangeSeq(id, comp) > ecs.changeThreshold`

### Required Components
- `registerRequired(trigger, required, factory)` — auto-adds dependent components on spawn/addComponent. Enforced at insertion time only.
- Explicit values win (never overwritten). Transitive resolution (A→B→C). Cycle detection at registration.
- Built-in: transform plugin (`localTransform` → `worldTransform`), physics 2D (`rigidBody` → `velocity` + `force`)

### Queries
- **Optional**: `{ with: ['position'], optional: ['health'] }` — optional components are `T | undefined`, don't affect matching
- **Singleton**: `getSingleton(['player'])` throws on 0 or >1; `tryGetSingleton` returns `undefined` on 0
- **Relationship**: `{ with: ['child'], parentHas: ['container'] }` — filters to entities whose parent has specified components
- **Reactive**: `addReactiveQuery()` with `onEnter`/`onExit` callbacks. Reactive `parentHas` rechecks on hierarchy/component changes.

### Resources
- `getResource(key)` — throws if not found. Use for resources guaranteed to exist (registered by the same plugin or builder).
- `tryGetResource<K>(key)` — returns `T | undefined`. Two overloads:
  - Known key: `ecs.tryGetResource('score')` — type inferred from `ResourceTypes`, rejects unknown keys at compile time
  - Cross-plugin: `ecs.tryGetResource<SpatialIndex>('spatialIndex')` — requires explicit type param, accepts any string key. Use for optional dependencies on resources from other plugins.

### Plugin Phase Flow
Physics 2D marks `localTransform` (fixedUpdate) → Transform propagation reads changed, writes+marks `worldTransform` (postUpdate) → Renderer reads changed `worldTransform` (render)

### onComplete Callbacks
Plugins with completion semantics (timers, tween, particles, sprite-animation, coroutine) accept `onComplete?: (data: XxxEventData) => void`. The callback fires synchronously when the action completes, with plugin-specific data (always includes `entityId`). To bridge to the event bus: `onComplete: (data) => ecs.eventBus.publish('myEvent', data)`.

### Kit Pattern (shared across state-machine, tween, coroutine, audio)
`createXxxKit<W>()` captures world type once; returned helpers validate component/field/sound/event names at compile time. Standalone untyped versions remain available. Read plugin source files for per-plugin API details.

### Application Plugin Factory
`createPluginFactory<C, E, R>()` (or `createPluginFactory<WorldType>()`) captures types once; the returned function is a zero-param `definePlugin` equivalent. Eliminates repeated `<Components, Events, Resources>` across application-level plugins. `definePlugin<WorldType>({...})` is also available as a single-call alternative when a factory isn't needed. Library plugins (src/plugins/) remain generic and don't use this pattern.

### Plugin Type Parameters
Most library plugins are parameterized with a string union (e.g. `L extends string` for collision layers, `S extends string` for state names, `Ch extends string` for audio channels, `A extends string` for input actions). Defaults allow backward-compatible untyped usage; narrowed unions enable compile-time validation.

## Commands

- `bun test` - Run tests
- `bun run check:types` - Type check
- Examples in `examples/` directory

## Design Principles

- Provide great developer experience enabled by maximum type awareness with minimum manual type annotations from the developer.
- A goal of this library is to keep as strongly typed as possible. Avoid casting in general, and with "any" in particular. Only resort to casting or "any" usage in general when absolutely necessary. Watch for redundant casts that TypeScript can already infer from generic constraints (e.g. `K extends string` is already assignable to `keyof T` when `T extends Record<string, ...>`).
- Avoid excessive object creation and allocation in hot paths. Prefer explicit arguments over wrapping parameters in objects, and synchronous function calls over promises. More generally, minimize any unnecessary allocations in performance-critical code paths, such as system functions that are run every tick.
- Avoid excessive use of "as const". Use it where it's important for the purposes of deepening type-awareness.
