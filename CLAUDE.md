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
├── math.ts            # Vector2D type + pure vector math functions
├── index.ts           # Public API exports
└── bundles/
    ├── utils/
    │   ├── timers.ts     # Timer bundle with event-based completion
    │   ├── transform.ts  # Hierarchical local/world transform propagation
    │   ├── physics2D.ts  # ECS-native 2D arcade physics (gravity, forces, drag, collision response via shared narrowphase)
    │   ├── input.ts      # Frame-accurate keyboard/pointer input with action mapping
    │   ├── bounds.ts     # Screen bounds enforcement (destroy, clamp, wrap)
    │   ├── narrowphase.ts # Shared contact-computing narrowphase and collision iteration pipeline
    │   ├── collision.ts  # Layer-based collision detection + pair handler routing (uses shared narrowphase)
    │   ├── state-machine.ts # Per-entity finite state machines with guards and lifecycle hooks
    │   ├── tween.ts      # Declarative property animation with easing, sequences, and loops
    │   └── audio.ts      # Howler.js audio integration with channels, SFX, and music
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

### Builder & Type Inference
- **Builder Pattern**: `world.addSystem().addQuery().setProcess().and()` — `.and()` returns parent (ECSpresso or Bundle)
- **Generic Type Parameters**: `<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>` — prefer builder inference (`.withBundle()`, `.withComponentTypes<T>()`, `.withEventTypes<T>()`, `.withResource()`) over explicit type params to `create<>()`
- **Type-Level Builder Methods**: `withComponentTypes<T>()`, `withEventTypes<T>()` — no runtime cost, accumulate via intersection with bundle types
- **Inferred World Type**: `const ecs = ECSpresso.create().withBundle(...).build(); type ECS = typeof ecs;` — derive full world type from the builder chain
- **Built-in Resource Typing**: `.withAssets()` merges `$assets` into `ResourceTypes`; `.withScreens()` merges `$screen`. Without these builder calls, those keys are absent from `ResourceTypes`.
- **Type Extraction**: `ComponentsOf<B>`, `EventsOf<B>`, `ResourcesOf<B>` for bundles; `ComponentsOfWorld<W>`, `EventsOfWorld<W>`, `AssetsOfWorld<W>` for ECSpresso instances

### System Execution
- **Phase Order**: `preUpdate` → `fixedUpdate` → `update` → `postUpdate` → `render`
- **Per-Phase Command Buffer**: Commands play back between each phase — entities spawned in preUpdate are visible to fixedUpdate, etc.
- **System Filtering**: `.inScreens([...])`, `.excludeScreens([...])`, `.requiresAssets([...])` — all type-safe against their respective key types
- **System Groups**: `.inGroup('name')`, `disableSystemGroup()`, `enableSystemGroup()`

### Change Detection
- `markChanged(entityId, componentName)` increments a global monotonic sequence; `changed: ['component']` in query filters to match only changed entities
- `spawn()`, `addComponent()`, `addComponents()` auto-mark components as changed
- Each system tracks its last-seen sequence — marks are processed exactly once per system
- Cross-phase visibility: marks from earlier phases (e.g. fixedUpdate) are visible to later phases (e.g. postUpdate) within the same frame
- Manual checks: `em.getChangeSeq(id, comp) > ecs.changeThreshold`

### Required Components
- `registerRequired(trigger, required, factory)` — auto-adds dependent components on spawn/addComponent. Enforced at insertion time only.
- Explicit values win (never overwritten). Transitive resolution (A→B→C). Cycle detection at registration.
- Built-in: transform bundle (`localTransform` → `worldTransform`), physics 2D (`rigidBody` → `velocity` + `force`)

### Queries
- **Optional**: `{ with: ['position'], optional: ['health'] }` — optional components are `T | undefined`, don't affect matching
- **Singleton**: `getSingleton(['player'])` throws on 0 or >1; `tryGetSingleton` returns `undefined` on 0
- **Relationship**: `{ with: ['child'], parentHas: ['container'] }` — filters to entities whose parent has specified components
- **Reactive**: `addReactiveQuery()` with `onEnter`/`onExit` callbacks. Reactive `parentHas` rechecks on hierarchy/component changes.

### Bundle Phase Flow
Physics 2D marks `localTransform` (fixedUpdate) → Transform propagation reads changed, writes+marks `worldTransform` (postUpdate) → Renderer reads changed `worldTransform` (render)

### Kit Pattern (shared across state-machine, tween, audio)
`createXxxKit<W>()` captures world type once; returned helpers validate component/field/sound names at compile time. Standalone untyped versions remain available. Read bundle source files for per-bundle API details.

### Bundle Type Parameters
Most bundles are parameterized with a string union (e.g. `L extends string` for collision layers, `S extends string` for state names, `Ch extends string` for audio channels, `A extends string` for input actions). Defaults allow backward-compatible untyped usage; narrowed unions enable compile-time validation.

## Commands

- `bun test` - Run tests
- `bun run check:types` - Type check
- Examples in `examples/` directory

## Design Principles

- Provide great developer experience enabled by maximum type awareness with minimum manual type annotations from the developer.
- A goal of this library is to keep as strongly typed as possible. Avoid casting in general, and with "any" in particular. Only resort to casting or "any" usage in general when absolutely necessary. Watch for redundant casts that TypeScript can already infer from generic constraints (e.g. `K extends string` is already assignable to `keyof T` when `T extends Record<string, ...>`).
- Avoid excessive object creation and allocation in hot paths. Prefer explicit arguments over wrapping parameters in objects, and synchronous function calls over promises. More generally, minimize any unnecessary allocations in performance-critical code paths, such as system functions that are run every tick.
- Avoid excessive use of "as const". Use it where it's important for the purposes of deepening type-awareness.
