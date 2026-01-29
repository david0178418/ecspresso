# ECSpresso Framework Gap Analysis

An evaluation of the current bundle ecosystem and core framework, with
recommendations for bundles and base features that would bring ECSpresso closer
to the capabilities of mature ECS frameworks like Bevy.

---

## Current State Assessment

### Existing Bundles

| Bundle | Purpose | Sophistication |
|--------|---------|---------------|
| **Timers** | Duration tracking, repeat, event-on-complete | Simple — no pause/resume, no speed scaling |
| **Transform** | 2D local/world propagation via hierarchy | Solid math, but 2D-only, no inverse transform |
| **Movement** | Euler integration of velocity into position | Minimal — no acceleration, drag, or damping |
| **Bounds** | Destroy/clamp/wrap at screen edges | Good — three behaviors, event on destroy |
| **Collision** | Layer-based AABB/circle detection | Functional — but O(n²), no broad phase, detection only (no resolution) |
| **Renderer2D** | PixiJS scene graph sync | Most complex bundle — reactive queries, render layers, hierarchy mirroring |

The bundles cover the basics for a simple 2D arcade game. The Space Invaders
example exercises most of them. The 3D Turret Shooter example, however, builds
nearly everything from scratch — its own input system, its own collision, its
own rendering integration — which highlights how much is missing.

### What the Examples Reveal

1. **Input handling is ad-hoc.** Both games build custom keyboard/mouse
   resources with manual event listener registration and cleanup. The turret
   shooter has ~80 lines of pointer lock boilerplate.

2. **No time abstraction.** Examples show confusion between milliseconds and
   seconds. The turret shooter manually divides `performance.now()` by 1000.
   No concept of time scale, pause, or fixed timestep.

3. **No audio at all.** The resource example mentions a `sounds` placeholder but
   nothing ever plays a sound.

4. **No animation/tweening.** Enemy destruction in the turret shooter manually
   pulses scale and fades opacity. Space Invaders has no animation.

5. **Game state is a resource string.** Both games store `status: 'playing' |
   'paused' | 'gameOver'` in a resource and toggle system groups manually. The
   screen manager exists but neither game uses it for this purpose.

6. **Cleanup is manual and error-prone.** PixiJS sprites, THREE.js meshes,
   HTML elements, and event listeners all require separate teardown paths. The
   `isDestroying` flag pattern in the turret shooter is a workaround for
   missing component-removal hooks.

7. **Collision is reimplemented.** The turret shooter ignores the collision
   bundle entirely and does manual sphere distance checks, because the bundle
   is 2D AABB/circle only.

---

## Recommended Core Framework Improvements

These are changes to the base framework (not bundles) that would unlock
significantly more powerful add-ons.

### 1. Change Detection on Queries

**What:** Allow queries to filter for `Added<T>`, `Changed<T>`, and
`Removed<T>` components — similar to Bevy's change detection filters.

**Why this matters:** Without change detection, every system that cares about
state transitions must either poll every entity every frame or rely on events.
This is the single biggest gap versus Bevy.

**Examples of what it enables:**
- A transform bundle that only recomputes world transforms for entities whose
  local transform actually changed (or whose parent's did).
- A renderer that only syncs position/rotation to the rendering engine when the
  world transform is dirty.
- A collision system that only rebuilds spatial structures for moved entities.
- Reactive UI that re-renders only when bound data changes.

**Implementation sketch:** Each component slot gets a `lastChanged` tick
counter. The framework increments a global tick on each `update()`. Queries
with `changed: ['Position']` filter to entities where
`component.lastChanged === currentTick`. `Added` and `Removed` can use
ring buffers or per-frame sets that are cleared after each update cycle.

### 2. System Phases / Schedules

**What:** Named execution phases that run in a defined order within each
`update()` call. At minimum: `preUpdate`, `fixedUpdate`, `update`,
`postUpdate`, `render`.

**Why this matters:** Right now, system ordering is purely numeric priority.
There is no separation between physics (which should run at fixed timestep),
gameplay logic, and rendering. Bundles that need to run "after all movement
systems but before rendering" have no reliable way to express that beyond
picking a priority number and hoping nothing else uses it.

**What it enables:**
- Fixed timestep physics (accumulator-based) that is decoupled from frame rate.
- Clear separation between simulation and presentation.
- Bundle authors can declare which phase their systems belong to without
  worrying about priority conflicts with other bundles.

### 3. Fixed Timestep

**What:** A built-in fixed-rate update loop (e.g., 60 Hz) with accumulator,
separate from the variable-rate frame update.

**Why this matters:** Any physics or deterministic simulation needs a fixed
timestep. Both example games run physics at frame rate, which means different
behavior at different frame rates. This is table stakes for any framework
that supports physics.

### 4. Component Cleanup Hooks (onRemove per component type)

**What:** Allow registering a cleanup callback that fires when a specific
component type is removed from an entity (or when the entity is destroyed).

**Why this matters:** The turret shooter has ~40 lines of manual cleanup for
THREE.js objects. The renderer2D bundle uses reactive queries to approximate
this, but a direct component cleanup hook would be simpler and more reliable.
This pattern is critical for any component that owns an external resource
(GPU texture, DOM element, audio node, WebSocket connection).

**Current workaround:** `onComponentRemoved()` exists but fires after removal.
The limitation is that bundles need to know about all possible cleanup paths
and register handlers proactively. A component-level `onRemove` hook
(registered when the component is defined or added) would be more ergonomic.

### 5. Prefabs / Entity Templates

**What:** Named, reusable entity definitions that can be instantiated
repeatedly, optionally with overrides.

**Why this matters:** Both example games have factory functions that create
component spreads. This works, but there's no way to define an entity
archetype declaratively, no way to clone an existing entity, and no way
to serialize/deserialize entity templates. Prefabs are a core feature in
Unity, Bevy, and most mature ECS frameworks.

### 6. Query Enhancements

**What:**
- **Optional components:** Query for entities that have `Position`, and include
  `Velocity` if present (without requiring it).
- **Relationship queries:** Query for "entities that are children of an entity
  with component X" or "entities whose parent has component Y."
- **Singleton queries:** Shorthand for "get the one entity with this component"
  (common for cameras, players, etc.).

**Why:** Optional components avoid splitting logic across multiple systems.
Relationship queries are essential for hierarchy-aware gameplay. Singleton
queries reduce boilerplate for the extremely common "find the player" pattern.

### 7. Entity Tagging / Marker Components

**What:** Zero-size marker components (tags) that don't allocate storage but
participate in queries. Entities already support `player: true` as a boolean
component, but these still store a value. True tags would be more memory
efficient and semantically clearer.

**Why:** Tags are used constantly in both example games (`enemy: true`,
`playerProjectile: true`, `messageTimer: true`). A first-class tag type
would signal intent and could be optimized differently in storage.

---

## Recommended Bundles

Ordered roughly by impact — the first few would benefit nearly every game,
while later ones are more specialized.

### Tier 1: Nearly Every Game Needs These

#### 1. Input Bundle

**What it provides:**
- Unified keyboard, mouse, pointer, and gamepad input.
- State-based polling: `isKeyDown('Space')`, `isKeyPressed('Space')` (just this
  frame), `isKeyReleased('Space')`.
- Mouse/pointer position (screen and world space), delta movement, button state.
- Gamepad axis values and button states.
- Action mapping: define named actions (`'jump'`, `'fire'`) mapped to physical
  inputs, so game logic references actions, not keys.
- Pointer lock management (the turret shooter's ~80 lines of boilerplate).

**Components:** None needed (input is global state).

**Resources:** `InputState` with polling API, `ActionMap` configuration.

**Why:** Both example games build ad-hoc input from scratch. This is the #1
source of boilerplate. Every game needs input.

**Bevy equivalent:** `bevy_input` plugin.

#### 2. Time Bundle

**What it provides:**
- `Time` resource: `deltaTime` (seconds), `elapsedTime`, `frameCount`,
  `timeScale` (for slow-mo / pause), `unscaledDeltaTime`.
- `FixedTime` resource: fixed timestep accumulator, configurable rate.
- Systems automatically receive scaled delta time.
- `pause()` / `resume()` that sets `timeScale` to 0/1.

**Components:** None (global resource).

**Resources:** `Time`, `FixedTime`.

**Why:** Every game needs consistent time. The current framework passes raw
`deltaTime` with no units contract, no scaling, and no fixed step. Both
examples get this wrong in different ways.

**Bevy equivalent:** `bevy_time`.

#### 3. Tween / Animation Bundle

**What it provides:**
- Declarative property animation: tween any numeric component field over time.
- Easing functions (linear, ease-in, ease-out, elastic, bounce, etc.).
- Tween sequences, parallel groups, delays, loops, yoyo.
- Component: `Tween` (target component, field, from, to, duration, easing,
  onComplete event).
- Callback events on tween completion.
- Common presets: `fadeIn`, `fadeOut`, `scalePulse`, `shake`, `moveTo`.

**Why:** The turret shooter manually interpolates scale/opacity for
destruction effects. Space Invaders has no animation. Animation is fundamental
to game feel and currently requires manual per-frame math.

**Bevy equivalent:** No built-in (community `bevy_tweening` crate), but Unity
has DOTween, Godot has Tweens as core.

#### 4. Audio Bundle

**What it provides:**
- Web Audio API integration.
- Sound effect playback: `playSound('explosion')` (fire and forget).
- Music playback: `playMusic('bgm')` with crossfade, loop.
- Volume control: master, SFX, music channels.
- Positional/spatial audio (optional, for 2D: pan based on x position).
- Integration with Asset Manager for loading audio files.
- Resource: `AudioManager`.
- Events: `PlaySoundEvent`, `StopMusicEvent`.

**Why:** Neither example has any audio. Sound is essential for game feel and
is a standard framework feature. Loading audio through the asset manager is
a natural fit.

**Bevy equivalent:** `bevy_audio`.

---

### Tier 2: Most 2D Games Need These

#### 5. Camera / Viewport Bundle

**What it provides:**
- Camera entity with position, zoom, rotation.
- World-to-screen and screen-to-world coordinate conversion.
- Camera follow (smooth follow a target entity, with optional deadzone).
- Camera shake (trauma-based, with decay).
- Camera bounds (constrain camera to level boundaries).
- Viewport/letterboxing for resolution independence.
- Multiple cameras (split screen, minimap).

**Components:** `Camera`, `CameraFollow`, `CameraShake`, `CameraBounds`.

**Resources:** `ActiveCamera`, screen dimensions.

**Why:** The renderer2D bundle operates in screen space only. Any game with
scrolling, zooming, or a world larger than the screen needs a camera. The
input bundle needs world-space mouse coordinates, which requires a camera
inverse transform. Camera shake is trivial to add but enormously impactful
for game feel.

**Bevy equivalent:** `Camera2dBundle` / `Camera3dBundle`.

#### 6. Sprite Animation Bundle

**What it provides:**
- Sprite sheet / atlas support: define frames within a texture.
- `SpriteAnimation` component: frame list, frame duration, loop mode (loop,
  once, ping-pong), current frame.
- Animation state machine: named animations (`'idle'`, `'run'`, `'attack'`)
  with transitions.
- Event on animation complete or on specific frame (e.g., "spawn projectile
  on frame 3 of attack animation").
- Integration with Renderer2D (updates PixiJS sprite texture/frame).

**Components:** `SpriteAnimation`, `AnimationState`.

**Why:** Sprite animation is fundamental to 2D games. Without it, entities
are static images. The current renderer2D sets a sprite but never changes it.

**Bevy equivalent:** `bevy_sprite` with `TextureAtlas`.

#### 7. Debug / Diagnostic Bundle

**What it provides:**
- FPS counter (resource + optional overlay).
- Entity count display.
- System execution time profiling (per-system, per-phase).
- Collider visualization (draw AABB/circle outlines).
- Hierarchy visualization (draw parent-child lines).
- Query match count display.
- Toggle on/off at runtime.
- Memory usage tracking (entity/component counts).

**Components:** `DebugDraw` (optional per-entity marker).

**Resources:** `DiagnosticsState`.

**Why:** Debugging ECS games is hard because state is distributed. Knowing
which systems are slow, how many entities match a query, and visualizing
colliders saves enormous development time. This is cheap to build and
immediately useful.

**Bevy equivalent:** `bevy_diagnostic`, `bevy_inspector_egui` (community).

---

### Tier 3: Specific Game Types

#### 8. Physics Bundle (Lightweight)

**What it provides:**
- Velocity + acceleration integration (replaces the trivial movement bundle).
- Drag / friction / damping coefficients.
- Gravity (global resource, per-entity override).
- Impulse application (`applyForce`, `applyImpulse`).
- Basic collision response (separation, bounce, slide).
- Kinematic vs dynamic bodies.
- Integration with the collision bundle for resolution (not just detection).
- Runs in fixed timestep (requires Phase system or fixed update).

**Components:** `RigidBody` (kinematic | dynamic), `PhysicsConfig` (mass,
drag, restitution, friction), `Force`.

**Resources:** `Gravity`, `PhysicsConfig`.

**Why:** The current movement bundle is 3 lines of `position += velocity *
dt`. Real games need acceleration, drag, and collision response. The gap
between "detection only" collision and "things bounce off each other" is
where most indie devs get stuck.

**Bevy equivalent:** `bevy_rapier` / `bevy_xpbd` (community physics
integrations).

#### 9. Spatial Index Bundle

**What it provides:**
- Grid-based or quadtree spatial partitioning.
- Broad-phase collision acceleration (replaces O(n²) in collision bundle).
- Spatial queries: "all entities within radius R of point P,"
  "all entities in rectangle," "nearest entity to point."
- Automatic index maintenance as entities move (via change detection, if
  available, or per-frame rebuild).

**Components:** `SpatialIndex` (marker to include entity in index).

**Resources:** `SpatialGrid` or `QuadTree`.

**Why:** The collision bundle is O(n²). With 100 entities, that's 10,000
pair checks per frame. With 500, it's 250,000. A spatial index makes this
O(n log n) or O(n) with a grid. Also enables proximity queries that many
gameplay systems need (nearest enemy, entities in explosion radius, etc.).

**Bevy equivalent:** No built-in (community `bevy_spatial` crate).

#### 10. State Machine Bundle

**What it provides:**
- Per-entity finite state machine.
- States with enter/exit/update callbacks.
- Typed transitions with guards (conditions).
- Event-driven transitions (`on('hit') => 'stunned'`).
- Integration with sprite animation (state change triggers animation change).

**Components:** `StateMachine<States>`, `CurrentState`.

**Why:** Both example games have implicit state machines (enemy movement
direction, game state, destruction sequences). Explicit state machines
reduce bugs, make behavior readable, and integrate cleanly with animation.
This is particularly useful for AI, player controllers, and UI elements.

**Bevy equivalent:** No built-in (community `seldom_state`, `big-brain`).

#### 11. Particle System Bundle

**What it provides:**
- Emitter component: spawn rate, burst count, lifetime, shape (point, circle,
  cone).
- Particle properties: initial velocity (with variance), acceleration/gravity,
  color over lifetime, size over lifetime, rotation.
- Pooled particle storage (particles are not full ECS entities — too expensive).
- Integration with renderer (PixiJS ParticleContainer, or custom canvas draw).
- Presets: explosion, smoke, fire, sparkle, trail.

**Components:** `ParticleEmitter`, `ParticleConfig`.

**Why:** The turret shooter manually creates explosion effects with
individual entities. Particles should be lightweight, pooled objects managed
outside the entity system for performance. This is a standard feature in
every game engine.

**Bevy equivalent:** `bevy_hanabi` (community).

#### 12. UI / HUD Bundle

**What it provides:**
- ECS-driven UI elements (text, panel, button, progress bar, list).
- Layout: simple anchoring (top-left, center, bottom-right) and basic
  flex/stack layout.
- Data binding: UI element displays value of a resource or component.
- Interaction: hover, click, focus events on UI entities.
- Integration with renderer (PixiJS text/graphics, or DOM overlay).
- Screen-aware: UI elements can be scoped to screens.

**Components:** `UIElement`, `UIText`, `UIPanel`, `UIButton`, `UIAnchor`.

**Why:** Both example games build UI from raw PixiJS text objects or DOM
elements. A UI bundle would provide consistent layout, interaction handling,
and data binding. Game HUDs (health bars, score, minimap frames) are
universal.

**Bevy equivalent:** `bevy_ui` (built-in flexbox-based UI).

#### 13. Coroutine / Sequence Bundle

**What it provides:**
- Generator-based coroutines that can yield for N seconds, yield until an
  event fires, or yield until a condition is true.
- Useful for scripted sequences: cutscenes, tutorials, boss attack patterns,
  spawn waves.
- Component: `Coroutine` wrapping a generator function.
- System processes active coroutines each frame, advancing them.

**Example:**
```typescript
function* bossPattern(ecs) {
  yield wait(2);           // wait 2 seconds
  yield spawnMinions(ecs); // spawn minions, wait for completion
  yield wait(1);
  yield fireBarrage(ecs);  // fire projectile barrage
  yield waitForEvent('allMinionsDead');
  // repeat
}
```

**Why:** Complex game sequences are painful to express as pure ECS systems.
Timer-based state machines work but become unreadable. Coroutines let you
write sequential logic that the ECS executes over many frames. This bridges
the gap between "everything is data" and "I need to script a boss fight."

**Bevy equivalent:** No direct equivalent (Bevy uses `async` with
`bevy_tasks`).

#### 14. Pathfinding / Navigation Bundle

**What it provides:**
- Grid-based A* pathfinding.
- Navigation mesh support (optional, for non-grid maps).
- `PathFollower` component: entity follows computed path.
- Obstacle avoidance (steering behaviors).
- Flow field for many-entity pathfinding.

**Components:** `PathFollower`, `NavigationAgent`, `Obstacle`.

**Resources:** `NavigationGrid`.

**Why:** Any game with AI-controlled movement needs pathfinding. The current
framework has no support for this. Even simple top-down games need grid-based
A* at minimum.

**Bevy equivalent:** No built-in (community crates).

---

## Priority Summary

### Core framework changes (unblocks everything else):

| Priority | Feature | Impact |
|----------|---------|--------|
| **Critical** | Change Detection | Enables efficient rendering, physics, reactive UI |
| **Critical** | System Phases | Enables fixed timestep, clean simulation/render split |
| **High** | Fixed Timestep | Required for deterministic physics |
| **High** | Component Cleanup Hooks | Required for safe external resource management |
| **Medium** | Query Enhancements (optional, singleton) | Reduces boilerplate significantly |
| **Medium** | Prefabs / Entity Templates | Standard feature, reduces spawn boilerplate |
| **Low** | Entity Tags (zero-size markers) | Optimization, not blocking |

### Bundle priorities:

| Priority | Bundle | Justification |
|----------|--------|---------------|
| **Critical** | Input | Every game needs it; both examples build it from scratch |
| **Critical** | Time | Every game needs it; current delta time handling is error-prone |
| **High** | Tween/Animation | Core game feel; currently impossible without manual math |
| **High** | Audio | Standard expectation; completely absent |
| **High** | Camera/Viewport | Required for any non-trivial 2D game |
| **High** | Debug/Diagnostic | Cheap to build, massive development quality-of-life |
| **Medium** | Sprite Animation | Standard for 2D games with animated characters |
| **Medium** | Physics (lightweight) | Bridges gap between movement bundle and real physics |
| **Medium** | Spatial Index | Required for collision to scale beyond ~100 entities |
| **Medium** | State Machine | Cleans up common ad-hoc patterns |
| **Lower** | Particle System | Important for game feel, specialized |
| **Lower** | UI/HUD | Useful but highly game-specific |
| **Lower** | Coroutine/Sequence | Powerful for scripted content, niche |
| **Lower** | Pathfinding | Genre-specific (top-down, strategy, RPG) |

---

## Comparison: ECSpresso vs Bevy Feature Coverage

| Category | Bevy | ECSpresso | Gap |
|----------|------|-----------|-----|
| ECS Core | Archetypal ECS | Sparse set ECS | Different approach, both valid |
| Type Safety | Rust type system | TypeScript generics | ECSpresso does well here |
| System Scheduling | Stages, run criteria, sets, ordering | Priority number only | **Large gap** |
| Change Detection | Built-in (Added, Changed) | None | **Large gap** |
| Fixed Timestep | Built-in (FixedUpdate) | None | **Large gap** |
| Input | Built-in (keyboard, mouse, gamepad, touch) | None | **Large gap** |
| Time | Built-in (Time, FixedTime, Stopwatch, Timer) | Basic timer bundle | **Medium gap** |
| Audio | Built-in (basic), rodio backend | None | **Large gap** |
| Transforms | Built-in (3D + 2D) | 2D bundle | Small gap |
| Rendering | Built-in (2D + 3D PBR) | PixiJS bundle | Different scope |
| Camera | Built-in (2D + 3D cameras) | None | **Medium gap** |
| Sprite | Built-in (sprite, atlas, animation) | Basic via PixiJS | **Medium gap** |
| Animation | Built-in (skeletal, blend) | None | **Large gap** |
| UI | Built-in (flexbox) | None | **Medium gap** |
| Physics | Community (Rapier, XPBD) | Basic movement bundle | **Large gap** |
| Asset Loading | Built-in (async, hot reload) | Built-in (async, groups) | Comparable |
| Scenes | Built-in (serialize/deserialize) | Screen manager | Different approach |
| Hierarchy | Built-in (parent/children) | Built-in | Comparable |
| Events | Built-in (EventWriter/Reader) | Built-in (pub/sub) | Comparable |
| States | Built-in (State, NextState) | Screen manager (partial) | **Small gap** |
| Diagnostics | Built-in (FPS, frame time) | None | **Medium gap** |
| Reflection | Built-in (Reflect trait) | TypeScript reflection limited | Language difference |
| Plugins | Built-in (Plugin trait) | Bundles | Comparable |

---

## Final Notes

ECSpresso has a solid typed core with good ergonomics for the builder pattern.
The framework's main strength — TypeScript type safety across components,
events, resources, and queries — is genuinely useful and well-executed. The
bundle system is a good foundation for extensibility.

The largest gaps are in **infrastructure** (change detection, system phases,
fixed timestep) rather than content. Adding the three "Critical" core features
would make the framework viable for serious projects and would make every
subsequent bundle more powerful. Without change detection and system phases,
bundles are forced into either polling everything every frame or building
ad-hoc event-based workarounds.

For bundles, **Input** and **Time** are the obvious first additions — they
remove the most boilerplate from every game. **Tween**, **Audio**, and
**Camera** follow closely as "expected in any game engine" features.
