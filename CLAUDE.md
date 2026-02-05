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

- **Builder Pattern**: `world.addSystem().addQuery().setProcess().and()`
- **Method Chaining**: `.and()` returns parent (ECSpresso or Bundle)
- **Generic Type Parameters**: `<ComponentTypes, EventTypes, ResourceTypes, AssetTypes, ScreenStates>` — internal to ECSpresso class; prefer builder inference (`.withBundle()`, `.withComponentTypes<T>()`, `.withEventTypes<T>()`, `.withResource()`) over passing explicit type params to `create<C, E, R>()`
- **Query Type Utilities**: `createQueryDefinition()`, `QueryResultEntity<>`
- **Asset Builder**: `ECSpresso.create().withAssets(a => a.add().addGroup()).build()`
- **Screen Builder**: `ECSpresso.create().withScreens(s => s.add()).build()`
- **Built-in Resource Typing**: `.withAssets()` merges `{ $assets: AssetsResource<A> }` into `ResourceTypes`; `.withScreens()` merges `{ $screen: ScreenResource<S> }`. `ecs.getResource('$assets')` returns fully typed `AssetsResource<A>` — no manual casts needed. Without these builder calls, `$assets`/`$screen` are absent from `ResourceTypes`.
- **Screen Lifecycle Hooks**: `onEnter` and `onExit` receive typed `ecs` parameter when defined via `withScreens()` builder or `Bundle.addScreen()`. Components, events, resources, and assets are fully typed. Screen names are relaxed to `string` within hooks (avoids circular dependency with screen definitions).
- **Screen-Scoped Systems**: `.inScreens(['menu'])`, `.excludeScreens(['pause'])`
- **Asset-Required Systems**: `.requiresAssets(['playerTexture'])`
- **Type-Safe Screen Filtering**: `.inScreens(['menu', 'gameplay'])` — accepts only `keyof ScreenStates`
- **Type-Safe Asset Requirements**: `.requiresAssets(['playerTexture'])` — accepts only `keyof AssetTypes`
- **Fully Typed System Callbacks**: `setProcess`, `setOnInitialize`, `setOnDetach`, `setEventHandlers` receive `ecs: ECSpresso<C, E, R, A, S>` with full asset/screen type safety
- **System Phases**: `.inPhase('fixedUpdate')`, phases execute in order: `preUpdate` → `fixedUpdate` → `update` → `postUpdate` → `render`
- **Fixed Timestep**: `ECSpresso.create().withFixedTimestep(1/60).build()`, `ecs.fixedDt`, `ecs.interpolationAlpha`
- **Runtime Phase Change**: `updateSystemPhase(label, phase)` moves a system between phases
- **System Groups**: `.inGroup('rendering')`, `disableSystemGroup()`, `enableSystemGroup()`
- **Entity Hierarchy**: `spawnChild(parentId, components)`, `getParent()`, `getChildren()`, `getAncestors()`, `getDescendants()`
- **Hierarchy Traversal**: `forEachInHierarchy()`, `hierarchyIterator()` for parent-first iteration
- **Cascade Deletion**: `removeEntity(id)` removes descendants by default; use `{ cascade: false }` to orphan children
- **Component Lifecycle**: `onComponentAdded()`, `onComponentRemoved()` return unsubscribe functions
- **Required Components**: `registerRequired('localTransform', 'worldTransform', () => defaults)` — auto-adds dependent components on spawn/addComponent. Enforced at insertion time only; removal unrestricted.
- **Required Components Registration**: Per-bundle via `bundle.registerRequired(trigger, required, factory)`, per-builder via `.withRequired(trigger, required, factory)`, or at runtime via `ecs.registerRequired(trigger, required, factory)`
- **Required Components Behavior**: Explicit values win (user-provided components are never overwritten). Transitive requirements resolve automatically (A→B→C). Cycle detection at registration time. Auto-added components are marked as changed and trigger reactive queries.
- **Required Components Built-in**: Transform bundle: `localTransform` requires `worldTransform`. Physics 2D bundle: `rigidBody` requires `velocity` and `force`.
- **Reactive Queries**: `addReactiveQuery()` with `onEnter`/`onExit` callbacks for query match changes
- **World Position Pattern**: `worldPos = localPos + parent.worldPos` (parent's world pos includes all grandparents)
- **Resource Dependencies**: `addResource('cache', { dependsOn: ['db'], factory: (ecs) => ... })` — `dependsOn` keys are validated at compile time against `keyof ResourceTypes`
- **Resource Builder**: `ECSpresso.create().withResource('key', value).build()` for fluent resource addition
- **Resource Disposal**: `onDispose` callback for cleanup, `disposeResource()`, `disposeResources()` for proper teardown
- **Command Buffer**: `ecs.commands.removeEntity(id)`, `ecs.commands.spawn({...})` for deferred execution
- **Input Bundle**: `createInputBundle({ actions: { jump: { keys: [' ', 'ArrowUp'] } } })`, resource-only bundle providing `inputState` resource. Action names inferred from config keys as `A extends string`.
- **Input Key Codes**: `KeyCode` type covers all standard `KeyboardEvent.key` values; action bindings use `KeyCode[]` for compile-time key validation
- **Input Action Mapping**: `inputState.setActionMap()` for runtime remapping. Requires all configured action names when `A` is narrowed.
- **Input Type Parameters**: `ActionState<A>`, `InputState<A>`, `InputResourceTypes<A>`, `ActionMap<A>` parameterized with action name union `A extends string` (defaults to `string` for backward compatibility). `createInputBundle` infers `A` from the `actions` config object keys.
- **Timer Bundle**: `createTimerBundle<{ respawn: TimerEventData }>()`, `createTimer<Events>(duration, { onComplete: 'eventName' })` — generic param only needs the events used with `onComplete`, not the full event map
- **Timer Event Data**: Events used with timer `onComplete` must have `TimerEventData` payload type
- **Change Detection**: `markChanged(entityId, componentName)` increments a global monotonic sequence; `changed: ['component']` in query filters to only match changed entities. Each system tracks its last-seen sequence so marks are processed exactly once.
- **Auto-Marking**: `spawn()`, `addComponent()`, `addComponents()` auto-mark components as changed
- **Single-Update Expiry**: Marks expire after one update cycle (per-system sequence tracking eliminates the old 2-tick window)
- **Change Threshold**: `ecs.changeThreshold` returns the active threshold. During system execution it's the system's last-seen sequence; between updates it's the global sequence after command buffer playback. Manual checks: `em.getChangeSeq(id, comp) > ecs.changeThreshold`
- **Cross-Phase Visibility**: Marks from earlier phases (e.g. fixedUpdate) are visible to later phases (e.g. postUpdate) within the same frame
- **Bundle Phase Flow**: Physics 2D marks `localTransform` (fixedUpdate) → Transform propagation reads `localTransform` changed, writes+marks `worldTransform` (postUpdate) → Renderer reads `worldTransform` changed (render)
- **Per-Phase Command Buffer**: Commands are played back between each phase, so entities spawned in preUpdate are visible to fixedUpdate, etc.
- **Optional Components**: `{ with: ['position'], optional: ['health'] }` — optional components appear as `T | undefined` in the entity type, don't affect query matching
- **Singleton Queries**: `getSingleton(['player'])` throws on 0 or >1 match; `tryGetSingleton(['player'])` returns `undefined` on 0, throws on >1
- **Relationship Queries**: `{ with: ['child'], parentHas: ['container'] }` — filters entities to those whose direct parent has specified components. Works in system queries, `getEntitiesWithQuery`, and reactive queries
- **Reactive parentHas**: Reactive queries with `parentHas` recheck children on `setParent`/`removeParent` and when parent gains/loses required components
- **Vector2D Math**: `vec2()`, `vec2Add()`, `vec2Sub()`, `vec2Scale()`, `vec2Normalize()`, `vec2Dot()`, `vec2Cross()`, etc. — pure functions exported from `src/math.ts`
- **Physics 2D Bundle**: `createPhysics2DBundle({ gravity: { x: 0, y: 980 }, layers })` — ECS-native 2D arcade physics. Semi-implicit Euler integration with gravity, forces, drag. Impulse-based collision response with restitution and friction. Emits `physicsCollision` events with contact normal/depth. Optional `layers` parameter (from `defineCollisionLayers`) threads `L` for typed `Physics2DComponentTypes<L>` (defaults to `never`).
- **Physics 2D Components**: `RigidBody` (dynamic/kinematic/static), `velocity: Vector2D`, `force: Vector2D`. Reuses `aabbCollider`, `circleCollider`, `collisionLayer` from collision bundle. `Physics2DComponentTypes<L>` parameterized with `L extends string` (defaults to `never`).
- **Physics 2D Helpers**: `createRigidBody(type, options?)` returns rigidBody + force. `createForce(x, y)` returns force component.
- **Physics 2D Utilities**: `applyForce(ecs, id, fx, fy)` accumulates force, `applyImpulse(ecs, id, ix, iy)` instant velocity change (respects mass), `setVelocity(ecs, id, vx, vy)` direct velocity set
- **Physics 2D Phase Flow**: Integration (fixedUpdate priority 1000) → Collision response (fixedUpdate priority 900) → Transform propagation (postUpdate) → Renderer (render)
- **Physics 2D Body Types**: `'dynamic'` = fully simulated, `'kinematic'` = velocity-only movement (no gravity/forces, immovable in collisions), `'static'` = immovable (mass=Infinity, no position updates)
- **State Machine Bundle**: `createStateMachineBundle<S>()` — per-entity finite state machines with lifecycle hooks and guard transitions. `S extends string` (default `string`) narrows `stateMachine.current`/`previous` and event `from`/`to` to state name literals.
- **State Machine Type Parameters**: `StateMachine<S>`, `StateMachineComponentTypes<S>`, `StateTransitionEvent<S>`, `StateMachineEventTypes<S>` — parameterized with state name union `S extends string` (defaults to `string` for backward compatibility)
- **State Machine StatesOf**: `StatesOf<D>` — extract state name union from a `StateMachineDefinition`. Example: `type AllStates = StatesOf<typeof enemyFSM> | StatesOf<typeof playerFSM>;`
- **State Machine Kit**: `createStateMachineKit<W, S>()` — factory that captures world type `W` and state union `S` once; returned helpers contextually type `ecs` as `W` in hooks/guards. `S` constrains `defineStateMachine` to only accept states in the union.
- **State Machine Kit API**: `const { bundle, defineStateMachine, createStateMachine } = createStateMachineKit<ECS, AllStates>()` — utility functions (`transitionTo`, `sendEvent`, `getStateMachineState`) stay as standalone imports since they accept `StateMachineWorld` (wider than any concrete `W`)
- **State Machine Definition**: `defineStateMachine(id, { initial, states })` — shared immutable definition, type-safe state names inferred from `states` keys
- **State Machine Component**: `createStateMachine(definition, options?)` → `Pick<StateMachineComponentTypes<S>, 'stateMachine'>`, preserves definition's `S` in the returned component
- **State Machine Hooks**: `onEnter(ecs, entityId)`, `onExit(ecs, entityId)`, `onUpdate(ecs, entityId, deltaTime)` per state
- **State Machine Guards**: `transitions: [{ target, guard }]` — evaluated each tick, first passing guard wins
- **State Machine Events**: `sendEvent(ecs, entityId, eventName)` — checks current state's `on` handlers (string target or `{ target, guard }`)
- **State Machine Direct Transition**: `transitionTo(ecs, entityId, targetState)` — immediate transition from any system
- **State Machine Query**: `getStateMachineState(ecs, entityId)` → `string | null`
- **State Machine World**: `StateMachineWorld` interface for hooks — method syntax for bivariant parameter checking under strictFunctionTypes
- **State Transition Events**: `stateTransition` event published on every transition with `{ entityId, from, to, definitionId }`
- **Builder Type Inference**: `withComponentTypes<{ player: true }>()` and `withEventTypes<{ gameStart: true }>()` — pure type-level builder methods, no runtime cost. Accumulate via intersection with bundle types.
- **Inferred World Type**: `const ecs = ECSpresso.create().withBundle(...).withComponentTypes<{...}>().build(); type ECS = typeof ecs;` — derive the full world type from the builder chain instead of manual aggregate interfaces
- **Bundle Type Extraction**: `ComponentsOf<B>`, `EventsOf<B>`, `ResourcesOf<B>` — extract type parameters from a Bundle instance. Useful for reusable helpers.
- **Timer Bundle Events**: Timer bundle still requires explicit `EventTypes` generic for `onComplete` constraint: `createTimerBundle<{ respawn: TimerEventData }>()`
- **Collision Bundle**: `createCollisionBundle({ layers })` — layer-based AABB/circle collision detection with deduplication. `layers` (from `defineCollisionLayers`) is required; infers `L` for typed `CollisionComponentTypes<L>` and `CollisionEventTypes<L>`. Emits `collision` events with `CollisionEvent<L>`.
- **CollisionEvent Contact Data**: `CollisionEvent<L>` includes `normal: { x, y }` (unit normal from entityA toward entityB) and `depth: number` (penetration depth). Computed via shared narrowphase at no extra cost.
- **Collision Type Parameters**: `CollisionLayer<L>`, `CollisionEvent<L>`, `CollisionComponentTypes<L>`, `CollisionEventTypes<L>` — parameterized with layer name union `L extends string` (defaults to `never`)
- **Collision Helpers**: `createAABBCollider(w, h)`, `createCircleCollider(r)`, `createCollisionLayer(layer, collidesWith)` — component factories for spreading into `spawn()`. `createCollisionLayer` infers `L` from arguments.
- **Collision Layer Definitions**: `defineCollisionLayers({ player: ['enemy'], enemy: ['player'] })` — returns typed factory functions per layer. Validates `collidesWith` values reference actual layer keys at compile time (catches typos). Requires `const` inference (built-in).
- **Collision Pair Handler**: `createCollisionPairHandler<W, L>({ 'layerA:layerB': (aId, bId, ecs) => ... })` — routes collision events to layer-pair-specific callbacks. Returns `(event: CollisionEvent<L>, ecs: W) => void`.
- **Collision Pair Layer Validation**: `L` type parameter (defaults to `string`) constrains pair keys to valid `` `${L}:${L}` `` combinations. Use `LayersOf<typeof layers>` with `defineCollisionLayers` result for compile-time layer name validation: `type Layer = LayersOf<typeof layers>; createCollisionPairHandler<ECS, Layer>({...})`
- **Collision Pair Symmetric Matching**: Registering `"a:b"` automatically handles `(layerA=b, layerB=a)` with swapped entity args. If both `"a:b"` and `"b:a"` are registered, each gets its own handler.
- **Collision Pair Self-Collision**: `"enemy:enemy"` is supported — single entry, no implicit reverse needed.
- **Tween Bundle**: `createTweenBundle()` — declarative property animation. Tweens are components processed each frame, automatically cleaned up on completion. Supports single-field, multi-target, and multi-step sequences.
- **Tween Helpers**: `createTween(component, field, to, duration, options?)` — single target shorthand. `createTweenSequence(steps, options?)` — multi-step sequences with parallel targets per step. Both return `Pick<TweenComponentTypes, 'tween'>` for spreading into `spawn()`.
- **Tween Nested Paths**: `createTween('transform', 'position.x', 100, 1)` — dot-separated field paths for nested component properties.
- **Tween Easing**: 31 easing functions exported as named declarations: `linear`, `easeInQuad`..`easeInOutQuad`, cubic/quart/quint/sine/expo/circ/back/elastic/bounce variants. Also `easings` record for runtime lookup by name.
- **Tween Loop Modes**: `'once'` (default, removed after single play), `'loop'` (restarts, finite count via `loops`), `'yoyo'` (reverses direction, swaps from/to). `loops: -1` for infinite.
- **Tween Events**: `onComplete` option publishes `TweenEventData` (`{ entityId, stepCount }`) when tween finishes. Requires event type extending `TweenEventData`.
- **Tween Event Constraint**: `TweenEventName<EventTypes>` — restricts `onComplete` to events with `TweenEventData` payload, same pattern as timer bundle.
- **Tween justFinished**: One-frame flag observable by same-phase systems (lower priority). Tween component is removed via command buffer after the phase completes.
- **Tween Implicit From**: `from: null` (default) captures current component value on first tick. Explicit `from` overrides.
- **Tween Change Detection**: System calls `markChanged` for each modified component, integrating with `changed` query filters.
- **Tween Bundle Options**: `createTweenBundle({ phase?, priority?, systemGroup? })` — defaults to `update` phase, priority 0, group `'tweens'`.
- **Tween Sequences**: `createTweenSequence([{ targets: [...], duration, easing? }, ...], options?)` — steps execute in order with overflow time carried to next step. Each step can animate multiple targets in parallel.
- **Tween Kit**: `createTweenKit<W>()` — factory that captures world type `W` once; returned `createTween` and `createTweenSequence` validate component names and field paths at compile time. Zero runtime overhead — all validation is type-level only.
- **Tween Kit API**: `const { bundle, createTween, createTweenSequence } = createTweenKit<ECS>()` — standalone `createTween`/`createTweenSequence` remain available for untyped usage
- **NumericPaths<T>**: Recursive type utility producing union of dot-separated paths resolving to `number`. Depth-limited to 4 levels. Handles optional fields via `NonNullable`.
- **TypedTweenTargetInput<C>**: Discriminated union over component names — each variant constrains `field` to `NumericPaths` of that component. Used in `TypedTweenSequenceStepInput` for typed sequence targets.
- **ECSpresso Type Extraction**: `ComponentsOfWorld<W>`, `EventsOfWorld<W>`, `AssetsOfWorld<W>` — extract type parameters from an ECSpresso instance type. Complements existing `ComponentsOf<B>`, `EventsOf<B>` for Bundle extraction.
- **Type-Safe Asset Group Names**: `AssetConfigurator.addGroup('level1', {...})` accumulates group names. `Bundle.addAssetGroup('level2', {...})` accumulates on bundle. `withBundle()` and `withAssets()` merge into builder. `ecs.loadAssetGroup(name)`, `ecs.isAssetGroupLoaded(name)`, and `ecs.getResource('$assets').isGroupLoaded(name)` reject unknown names at compile time.
- **Type-Safe Reactive Query Names**: `Builder.withReactiveQueryNames<'sprites' | 'enemies'>()` and `Bundle.withReactiveQueryNames<'sprites'>()` — pure type-level declaration of reactive query names. `ecs.addReactiveQuery(name, def)` and `ecs.removeReactiveQuery(name)` reject unknown names at compile time.
- **Asset Group/RQ Name Extraction**: `AssetGroupNamesOf<B>`, `ReactiveQueryNamesOf<B>` — extract asset group names and reactive query names from a Bundle instance.
- **Asset Group/RQ Backward Compat**: When no asset group names or reactive query names are declared, methods accept `string` (never→string conditional at `build()` time). Existing code requires no changes.
- **NarrowAssetsResource**: `build()` replaces the `$assets` entry in `ResourceTypes` with finalized `AssetGroupNames`, so `ecs.getResource('$assets').isGroupLoaded(name)` is also typed.
- **Audio Bundle**: `createAudioBundle({ channels })` — Howler.js audio integration. User-defined channels with type-safe volume control, hybrid resource + component API, asset manager integration. Peer dep on `howler` (optional, like `pixi.js`).
- **Audio Channels**: `defineAudioChannels({ sfx: { volume: 1 }, music: { volume: 0.7 } })` — returns frozen config with inferred channel name union `Ch`. `ChannelsOf<typeof channels>` extracts the union.
- **Audio Type Parameters**: `AudioSource<Ch>`, `AudioState<Ch>`, `AudioComponentTypes<Ch>`, `AudioEventTypes<Ch>`, `AudioResourceTypes<Ch>` — parameterized with channel name union `Ch extends string` (defaults to `string` for backward compatibility).
- **Audio Resource**: `audioState` resource for fire-and-forget SFX (`play(sound, opts)`), music control (`playMusic`/`stopMusic`/`pauseMusic`/`resumeMusic`), volume hierarchy (`setChannelVolume`/`setMasterVolume`/`mute`/`unmute`/`toggleMute`). Effective volume = individual * channel * master.
- **Audio Component**: `audioSource` component for entity-attached sounds. Sound starts on spawn (via reactive query), stops on entity removal (dispose callback). `autoRemove: true` removes entity when sound ends.
- **Audio Events**: `playSound` event triggers fire-and-forget playback. `stopMusic` event triggers music stop. `soundEnded` event published on completion (entity-attached or fire-and-forget).
- **Audio Helpers**: `createAudioSource(sound, channel, options?)` — component factory. `loadSound(src, options?)` — returns `() => Promise<Howl>` loader for asset manager.
- **Audio Asset Integration**: Sounds must be preloaded via asset pipeline. `audioState.play()` resolves Howl from `$assets` resource. Use `loadSound('/path.mp3')` with `.withAssets(a => a.add('key', loadSound(...)))`.
- **Audio Kit**: `createAudioKit<W, Ch>({ channels })` — factory capturing world type `W` and channel type `Ch`. Returned `createAudioSource` validates sound keys against `AssetsOfWorld<W>` at compile time.
- **Audio Kit API**: `const { bundle, createAudioSource, loadSound } = createAudioKit<ECS, Ch>({ channels })` — standalone `createAudioSource`/`loadSound` remain available for untyped usage.
- **Audio Bundle Options**: `createAudioBundle({ channels, phase?, priority?, systemGroup? })` — defaults to `update` phase, priority 0, group `'audio'`.
- **Audio Music Exclusivity**: `playMusic()` on a channel with existing music stops the current track first.

## Commands

- `bun test` - Run tests
- `bun run check:types` - Type check
- Examples in `examples/` directory

## Design Principles

- Provide great developer experience enabled by maximum type awareness with minimum manual type annotations from the developer.
- A goal of this library is to keep as strongly typed as possible. Avoid casting in general, and with "any" in particular. Only resort to casting or "any" usage in general when absolutely necessary. Watch for redundant casts that TypeScript can already infer from generic constraints (e.g. `K extends string` is already assignable to `keyof T` when `T extends Record<string, ...>`).
- Avoid excessive object creation and allocation in hot paths. Prefer explicit arguments over wrapping parameters in objects, and synchronous function calls over promises. More generally, minimize any unnecessary allocations in performance-critical code paths, such as system functions that are run every tick.
- Avoid excessive use of "as const". Use it where it's important for the purposes of deepening type-awareness.
