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
├── resource-manager.ts # Global state, factory detection, lazy init, change subscriptions
├── command-buffer.ts  # Deferred structural changes (spawn, remove, etc.)
├── asset-manager.ts   # Asset loading, groups, progress tracking
├── asset-types.ts     # Asset type definitions
├── screen-manager.ts  # Screen/state transitions, overlay stack
├── screen-types.ts    # Screen type definitions
├── reactive-query-manager.ts # Reactive queries with enter/exit callbacks
├── types.ts           # Core type definitions
├── type-utils.ts      # WorldConfig, type extraction, plugin compatibility utilities
├── math.ts            # Vector2D type + pure vector math functions
├── index.ts           # Public API exports
└── plugins/
    ├── spatial/
    │   ├── transform.ts     # Hierarchical local/world transform propagation
    │   ├── bounds.ts        # Screen bounds enforcement (destroy, clamp, wrap)
    │   ├── camera.ts        # Viewport, follow, shake, zoom
    │   └── spatial-index.ts # Uniform-grid spatial hash for broadphase/proximity queries
    ├── physics/
    │   ├── physics2D.ts     # ECS-native 2D arcade physics
    │   ├── collision.ts     # Layer-based collision detection + pair handler routing
    │   └── steering.ts      # Move-to-target with arrival detection
    ├── rendering/
    │   ├── renderer2D.ts    # PixiJS scene graph wiring
    │   ├── particles.ts     # Pooled particle system with PixiJS ParticleContainer rendering
    │   └── sprite-animation.ts # Frame-based sprite animation
    ├── input/
    │   ├── input.ts         # Frame-accurate keyboard/pointer input with action mapping
    │   └── selection.ts     # Pointer-driven box/click selection with visual feedback
    ├── scripting/
    │   ├── coroutine.ts     # Generator-based multi-frame scripted sequences
    │   ├── timers.ts        # ECS-native timer components
    │   ├── state-machine.ts # Per-entity finite state machines
    │   └── tween.ts         # Declarative property animation with easing, sequences, and loops
    ├── audio/
    │   └── audio.ts         # Howler.js audio integration
    └── debug/
        └── diagnostics.ts   # FPS, entity count, per-system timing overlay
```

## Core Concepts

- **Components**: Data-only objects stored on entities
- **Systems**: Process entities matching queries, use builder pattern
- **Resources**: Global singleton state accessible to systems
- **Events**: Decoupled pub/sub for inter-system communication
- **Plugins**: Group related systems/resources for reusability
- **Command Buffer**: Deferred structural changes executed between phases
- **System Phases**: `preUpdate` → `fixedUpdate` → `update` → `postUpdate` → `render` with per-phase command buffer playback
- **Assets**: Eager/lazy loaded resources with groups and progress tracking
- **Screens**: Game state management with transitions and overlay stack
- **Entity Hierarchy**: Parent-child relationships with traversal and cascade deletion

## Key Patterns

### WorldConfig & Type Threading
`WorldConfig` is the single config object `{ components, events, resources, assets, screens }` that parameterizes all core classes. `WorldConfigFrom<C, E, R, A, S>` constructs one from individual type dimensions (all default to `{}`). `EmptyConfig` is the all-defaults alias.

### Callback Parameter Convention
**1 param = positional, 2+ params = named object.** All multi-param callbacks use a single destructured object parameter. Read source for specific callback signatures.

### Builder & Type Inference
Prefer the builder chain (`.withPlugin()`, `.withComponentTypes<T>()`, `.withEventTypes<T>()`, `.withResource()`) over explicit type params. The builder accumulates types into a `WorldConfig` via `MergeConfigs`. Derive the full world type with `type ECS = typeof ecs`.

## Commands

- `bun test` - Run tests
- `bun run check:types` - Type check
- Examples in `examples/` directory

## Plugin Exports

Each plugin is a distinct entry point in `package.json` `exports` (e.g. `ecspresso/plugins/spatial/transform`). This lets consumers import only the plugins they use, keeping bundles lean. **Any new plugin file must have a corresponding export entry added to `package.json` before it can be used as an npm package import.**

## Design Principles

- Enable a developer to express game logic and structure with as little boilerplate and framework drag as possible.
- Provide great developer experience enabled by maximum type awareness with minimum manual type annotations from the developer.
- Keep as strongly typed as possible. Never use "!". Avoid casting in general, and with "any" in particular. Only resort to casting or "any" when absolutely necessary. Watch for redundant casts that TypeScript can already infer from generic constraints.
- Avoid excessive object creation and allocation in hot paths. Pre-allocate and reuse objects where possible. Prefer synchronous function calls over promises.
- Avoid excessive use of "as const". Use it where it's important for deepening type-awareness.
