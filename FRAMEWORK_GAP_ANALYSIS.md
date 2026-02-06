# ECSpresso Framework Gap Analysis

An evaluation of ECSpresso's current bundles and examples against mature ECS frameworks like Bevy, with recommendations for new bundles and core improvements.

---

## Current Inventory

### Bundles (13 total)

| Bundle | Domain | Phase | Dependencies |
|--------|--------|-------|-------------|
| transform | Hierarchical local/world transform propagation | postUpdate | hierarchy (core) |
| physics2D | Arcade physics: gravity, forces, drag, impulse response | fixedUpdate | transform, collision, narrowphase |
| collision | Layer-based collision detection with events | postUpdate | transform, narrowphase |
| narrowphase (util) | Contact computation shared by collision + physics2D | — | — |
| spatial-index | Uniform-grid spatial hash for broadphase + proximity queries | preUpdate | transform |
| input | Frame-accurate keyboard/pointer with action mapping | preUpdate | — |
| bounds | Screen-edge enforcement: destroy, clamp, wrap | postUpdate | transform |
| timers | ECS-native timers with optional event completion | preUpdate | — |
| state-machine | Per-entity FSM with guards and lifecycle hooks | update | — |
| tween | Declarative property animation with 31 easings | update | — |
| audio | Howler.js audio with channels and volume hierarchy | update | (optional) assets |
| camera | Follow, shake, bounds clamping, coordinate conversion | postUpdate | transform |
| diagnostics | FPS, per-system/phase timing, DOM overlay | render | — |
| renderer2D | PixiJS scene graph wiring and transform sync | render | transform, (optional) camera |

### Examples (16 total)

Ranging from single-concept tutorials (movement, input, events, bundles) through intermediate patterns (resources, hierarchy, camera, state machines, tweens, screens, diagnostics, audio) to two complete games:

- **Space Invaders** (2D, ~600 LOC across 7 files) — formation AI, waves, collision routing, screen management
- **Turret Shooter** (3D with Three.js, ~800 LOC across 8 files) — wave spawning, radar, custom physics

### What the examples reveal about gaps

1. The turret shooter had to write its own 3D physics, collision, and rendering from scratch — the framework only has 2D bundles.
2. No example demonstrates sprite sheet animation, particles, UI layout, pathfinding, save/load, or networking.
3. Collision in the 3D example is a manual O(n^2) sphere check — no spatial index integration for 3D.
4. Both game examples create DOM elements directly for HUD text — there's no ECS-driven UI system.

---

## Recommended New Bundles

These are ordered roughly by impact and how foundational they are (earlier ones enable later ones).

### Tier 1 — High impact, fill the most obvious gaps

#### 1. Sprite Animation Bundle

**What:** Frame-based sprite sheet animation — the single most conspicuously missing 2D game feature.

**Components:**
- `spriteAnimation` — current clip name, frame index, elapsed time, playback speed, loop mode
- `spriteSheet` — texture reference, frame dimensions, frame count, rows/cols

**Systems:**
- `sprite-animation-update` (update) — advance frame timer, update frame index, publish `animationComplete` events
- `sprite-animation-render` (render) — set PixiJS sprite texture frame/crop rectangle from current frame index

**API sketch:**
```ts
const sheet = defineSpriteSheet('player', { frameWidth: 32, frameHeight: 32, cols: 8, rows: 4 });
const clips = defineAnimationClips(sheet, {
  idle:   { row: 0, frames: 4, fps: 8, loop: true },
  run:    { row: 1, frames: 8, fps: 12, loop: true },
  attack: { row: 2, frames: 6, fps: 16, loop: false },
});
```

**Why:** Almost every 2D game needs animated sprites. Currently users would have to write their own frame-stepping system from scratch. This is table-stakes for a 2D game framework.

---

#### 2. Particle Emitter Bundle

**What:** High-performance particle effects (explosions, smoke, fire, trails, ambient effects).

**Components:**
- `particleEmitter` — emission rate, burst count, emitter shape (point/circle/rect/cone), lifetime range, speed range, gravity modifier, one-shot vs continuous
- `particleStyle` — start/end color, start/end alpha, start/end size, blend mode, texture key

**Systems:**
- `particle-spawn` (update) — emit particles based on rate/burst, use entity pool
- `particle-update` (update) — advance lifetime, interpolate size/color/alpha over lifetime, apply velocity + gravity
- `particle-render` (render) — batch-render particles (PixiJS ParticleContainer for performance)

**Design notes:**
- Particles should NOT be full ECS entities (too expensive at high counts). Use a flat typed array or struct-of-arrays per emitter for the particle data, with only the emitter itself being an entity.
- Provide `emitBurst(emitterId, count)` helper for one-shot effects.
- Support pooling and pre-warming.

**Why:** Particles are expected in any visual game framework. Bevy has `bevy_hanabi` in its ecosystem; Unity and Godot have built-in particle systems.

---

#### 3. UI/HUD Bundle

**What:** ECS-driven UI layout system for menus, HUD, buttons, and panels without manual DOM manipulation.

**Components:**
- `uiNode` — layout direction (row/column), justify, align, padding, gap
- `uiText` — text content, font size, color, alignment
- `uiButton` — state (idle/hover/pressed/disabled), onClick event name
- `uiImage` — texture key, scale mode (fit/fill/stretch)
- `uiProgressBar` — value (0-1), fill color, background color
- `uiInteractable` — hit testing flag

**Systems:**
- `ui-layout` (postUpdate) — flexbox-like layout pass computing absolute positions
- `ui-input` (preUpdate) — hit testing against pointer position, publish click/hover events
- `ui-render` (render) — sync UI entities to PixiJS display objects (or DOM overlay)

**Design notes:**
- UI entities live in screen-space, separate from world-space game entities.
- Support both PixiJS-native rendering (for in-game HUD) and optional DOM overlay mode (for menus where HTML is more practical).
- Data binding: `uiText.bind = { resource: 'score', field: 'value', format: 'Score: {}' }`.

**Why:** Both game examples resort to raw DOM manipulation for UI. Every real game needs HUD and menus. Bevy has a built-in UI plugin with flex layout; Godot has Control nodes; Unity has Canvas/UI toolkit.

---

#### 4. Object Pool / Entity Recycling Bundle

**What:** Pre-allocated entity pools to avoid GC pressure from frequent spawn/destroy cycles (projectiles, particles, enemies, effects).

**Resources:**
- `entityPool` — pool registry with acquire/release/warmup API

**API sketch:**
```ts
const pool = createEntityPool<ECS>({
  bullet: {
    prefab: { ...createTransform(0, 0), ...createCircleCollider(4), ...layers.playerProjectile() },
    initialSize: 50,
    maxSize: 200,
    onAcquire: (ecs, id) => { /* reset position, enable */ },
    onRelease: (ecs, id) => { /* disable, move offscreen */ },
  },
});

// Usage in systems:
const bulletId = pool.acquire('bullet');
pool.release('bullet', bulletId);
```

**Design notes:**
- Released entities have components cleared/reset but entity ID is reused.
- Use a "dormant" component or disable flag rather than actually removing entities.
- Integrate with command buffer: `commands.acquireFromPool('bullet')`.

**Why:** The Space Invaders example spawns/destroys dozens of projectiles per second. At scale (bullet-hell, particle effects), GC pressure from repeated spawn/destroy becomes a real performance problem.

---

### Tier 2 — Important for real games, extends framework capabilities

#### 5. Tilemap Bundle

**What:** Tile-based map rendering and collision for platformers, RPGs, and top-down games.

**Components:**
- `tilemap` — tile data (2D array or flat buffer), tile size, tileset texture
- `tilemapCollision` — collision flag per tile ID, or per-tile collision shapes
- `tilemapLayer` — layer index for multi-layer maps (ground, objects, foreground)

**Systems:**
- `tilemap-render` (render) — camera-culled tile rendering (only draw visible tiles)
- `tilemap-collision` (fixedUpdate) — AABB-vs-tile collision for entities, resolve penetration

**Asset integration:**
- Loader for Tiled (.tmx/.json) format — the de facto standard for 2D tile maps.

**Why:** Tilemaps are the foundation of platformers, RPGs, strategy games, and roguelikes. Bevy recently added tilemap chunk rendering in 0.17; the community `bevy_ecs_tilemap` crate has been one of the most popular Bevy plugins for years.

---

#### 6. Pathfinding / Navigation Bundle

**What:** A* grid pathfinding and steering behaviors for AI agents.

**Components:**
- `navAgent` — speed, path array, current waypoint index, arrival threshold
- `steeringBehavior` — active behaviors (seek, flee, arrive, wander, avoid) with weights

**Resources:**
- `navGrid` — 2D walkability grid, cell size, dynamic obstacle marking

**Systems:**
- `pathfinding-request` (update) — process path requests, run A*, populate navAgent.path
- `steering` (update) — compute steering forces from active behaviors, apply to velocity
- `nav-agent-follow` (update) — advance along path waypoints, request repath on blockage

**API sketch:**
```ts
const path = navGrid.findPath(startX, startY, endX, endY);
ecs.addComponent(enemyId, 'navAgent', { path, speed: 100 });
```

**Why:** Any game with AI enemies that need to navigate around obstacles requires pathfinding. This is the #1 AI feature request in game frameworks. Bevy's ecosystem has `bevy_pathmesh` and `oxidized_navigation`.

---

#### 7. Behavior Tree Bundle

**What:** Behavior trees for complex AI — complements the existing state machine bundle for more declarative, composable AI logic.

**Components:**
- `behaviorTree` — references immutable tree definition, current node, blackboard

**Node types:**
- Composites: `sequence`, `selector`, `parallel`
- Decorators: `inverter`, `repeater`, `timeout`, `cooldown`, `guard`
- Leaves: `action`, `condition`, `wait`

**API sketch:**
```ts
const tree = defineBehaviorTree<ECS>('enemy-ai', {
  type: 'selector',
  children: [
    { type: 'sequence', children: [
      { type: 'condition', check: (ecs, id) => isPlayerVisible(ecs, id) },
      { type: 'action', run: (ecs, id, dt) => chasePlayer(ecs, id, dt) },
    ]},
    { type: 'action', run: (ecs, id, dt) => patrol(ecs, id, dt) },
  ],
});
```

**Why:** FSMs are good for simple AI but become unwieldy for complex behaviors. Behavior trees are the industry standard (Unreal's BT system, Godot's BT plugin). Combined with the existing FSM bundle, this covers both simple and complex AI needs.

---

#### 8. Coroutine / Sequence Bundle

**What:** Generator-based coroutines for scripting complex multi-step sequences without state machine boilerplate.

**Components:**
- `coroutine` — generator instance, current yield instruction, elapsed time

**Systems:**
- `coroutine-update` (update) — advance generators, handle yield instructions

**API sketch:**
```ts
function* bossIntro(ecs: ECS, bossId: number) {
  yield waitForSeconds(1.0);
  ecs.addComponent(bossId, 'tween', createTween('localTransform', 'y', 300, 2.0));
  yield waitForTween(bossId);
  yield waitForSeconds(0.5);
  ecs.eventBus.publish('bossReady', { entityId: bossId });
  yield waitForEvent('playerReady');
  ecs.enableSystemGroup('bossPhase1');
}

ecs.spawn({ coroutine: startCoroutine(bossIntro, ecs, bossId) });
```

**Yield instructions:** `waitForSeconds(n)`, `waitForFrames(n)`, `waitUntil(predicate)`, `waitForEvent(name)`, `waitForTween(entityId)`, `parallel(...coroutines)`.

**Why:** Complex game sequences (cutscenes, boss introductions, tutorials, dialogue) are painful to express as state machines or timer chains. Unity's coroutines and Bevy's `bevy_sequence` address this. TypeScript generators are a natural fit.

---

#### 9. Trail / Line Renderer Bundle

**What:** Visual trail effects behind moving entities (projectile trails, motion blur, laser beams).

**Components:**
- `trail` — max length, width, color/alpha over lifetime, texture, update interval
- `lineRenderer` — array of points, width, color, closed flag

**Systems:**
- `trail-update` (postUpdate) — sample entity position, maintain point history, fade old points
- `trail-render` (render) — draw mesh strip or PixiJS rope from point array

**Why:** Trails are a cheap, high-impact visual effect used constantly in action games (sword slashes, projectile paths, movement traces). They're hard to implement correctly without framework support due to the mesh generation involved.

---

#### 10. Debug Draw Bundle

**What:** Runtime visual debugging overlay — draw collider outlines, velocity vectors, hierarchy connections, navmesh, spatial hash grid cells.

**API sketch:**
```ts
const debug = ecs.getResource('debugDraw');
debug.rect(x, y, w, h, { color: 0xff0000, alpha: 0.3 });
debug.circle(x, y, r, { color: 0x00ff00 });
debug.line(x1, y1, x2, y2, { color: 0xffffff });
debug.arrow(x, y, vx, vy, { color: 0xffff00 }); // velocity vector
debug.text(x, y, 'hp: 100', { size: 12 });

// Auto-draw modes (toggle at runtime):
debug.showColliders = true;    // outlines all AABB/circle colliders
debug.showVelocity = true;     // arrows on all entities with velocity
debug.showHierarchy = true;    // lines from parent to children
debug.showSpatialGrid = true;  // spatial hash grid cells
debug.showNavGrid = true;      // walkability grid overlay
```

**Why:** Visual debugging is essential during development. Bevy has GizmoPlugin built-in. The existing diagnostics bundle covers performance metrics but not spatial/visual debugging.

---

### Tier 3 — Advanced features that mature frameworks offer

#### 11. Scene / Prefab Bundle

**What:** Serializable entity templates and scene snapshots for save/load, level editors, and prefab instantiation.

**Features:**
- `definePrefab('enemy', { health: 100, ...createTransform(0,0), ...createRigidBody('dynamic') })` — reusable entity templates
- `serializeScene(ecs, entityIds?)` — snapshot entities + components to JSON
- `deserializeScene(ecs, json)` — reconstruct entities from snapshot
- `savePrefab` / `loadPrefab` — asset integration for level data

**Design notes:**
- Component serializers registered per component type (handles PixiJS sprites, Howl instances, etc. that can't be naively serialized).
- Entity ID remapping on load (old IDs -> new IDs, fix parent references).

**Why:** Every game eventually needs save/load. Level editors need serialization. Bevy has its entire scene format (and BSN in 0.18). This is a hard problem but a fundamental one.

---

#### 12. Scheduler / Deferred Action Bundle

**What:** Time-based action scheduling beyond what timers offer — delayed callbacks, repeating schedules, throttling, debouncing.

**Features:**
- `schedule(delay, callback)` — one-shot delayed action
- `scheduleRepeating(interval, callback, options)` — repeating with optional count limit
- `throttle(name, interval, callback)` — at most once per interval
- `debounce(name, delay, callback)` — fire after delay since last trigger
- `nextFrame(callback)` — run on next update

**Why:** The timer bundle works for entity-attached timers, but many game patterns need system-level scheduling that isn't tied to a specific entity (wave spawn timing, periodic effects, cooldown management).

---

#### 13. Sprite Batching / Instanced Rendering Bundle

**What:** Performance optimization for rendering large numbers of identical or similar sprites.

**Features:**
- Batch sprites sharing the same texture into a single draw call.
- Instanced rendering for repeated meshes (grass, trees, bullets).
- Automatic batching decisions based on texture atlas pages.

**Why:** Rendering performance becomes a bottleneck before ECS iteration does in most 2D games. PixiJS has ParticleContainer but the bridge between ECS components and optimized rendering needs framework support. Bevy's GPU-driven rendering in 0.16 was a major selling point.

---

---

## Core Framework Improvements

These are changes to the ECS engine itself that would enable more powerful bundles and bring the framework closer to parity with Bevy.

### Priority 1 — Would unblock significant bundle capabilities

#### A. System Ordering Constraints (`.before()` / `.after()`)

**Current state:** Systems are ordered by numeric priority within a phase. This is fragile — if bundle A uses priority 100 and bundle B uses priority 50, a user combining them has to understand the implicit ordering. Adding a new system between them requires knowing the existing priority numbers.

**Proposed addition:**
```ts
ecs.addSystem('collision-response')
  .after('collision-detection')
  .before('transform-propagation')
```

**Implementation:** Topological sort within each phase, with priorities as tiebreaker for unconstrained systems. Error on cycles.

**Why Bevy has this:** Bevy's system scheduling uses explicit ordering constraints (`.before()`, `.after()`, `.in_set()`) rather than numeric priorities. This is more maintainable when composing bundles from different authors who don't coordinate priority numbers.

---

#### B. Component Lifecycle Observers

**Current state:** Reactive queries provide enter/exit callbacks but they require defining a query. There's no way to simply observe "whenever component X is added to any entity" without a reactive query that matches on `with: ['X']`.

**Proposed addition:**
```ts
ecs.onComponentAdded('health', (entityId, value) => {
  console.log(`Entity ${entityId} gained health: ${value}`);
});

ecs.onComponentRemoved('health', (entityId, lastValue) => {
  console.log(`Entity ${entityId} lost health`);
});

ecs.onComponentChanged('health', (entityId, newValue) => {
  if (newValue <= 0) ecs.commands.removeEntity(entityId);
});
```

**Why:** Bevy 0.15+ has observers that are "wildly popular" per their release notes. They're more ergonomic than reactive queries for simple cases and enable patterns like auto-cleanup, validation, and derived state without polling.

---

#### C. Entity Relationships Beyond Parent-Child

**Current state:** The hierarchy supports single parent-child relationships. Queries can filter with `parentHas`, but there's no way to express other relationships (e.g., "targets entity X", "owned by player Y", "linked to item Z").

**Proposed addition:**
```ts
// Define a relationship type
ecs.addRelationship(attackerId, 'targets', targetId);
ecs.removeRelationship(attackerId, 'targets', targetId);

// Query entities by relationship
ecs.addSystem('homing')
  .addQuery('missiles', {
    with: ['missile', 'velocity'],
    hasRelation: { targets: ['position'] }  // target entity must have position
  })
  .setProcess((queries) => {
    for (const entity of queries.missiles) {
      const targetPos = entity.relations.targets.position; // access target's component
      // steer toward targetPos
    }
  });
```

**Why:** Bevy 0.16 introduced ECS Relationships as one of its headline features. They enable clean modeling of targeting, inventory slots, equipment, team membership, dialogue partners, and more — all cases that currently require workarounds like storing entity IDs in components and manually looking them up.

---

#### D. World Serialization Primitives

**Current state:** No built-in way to serialize or deserialize entity state. Saving a game requires manually iterating entities and writing custom serialization.

**Proposed addition:**
```ts
// Register serializers
ecs.registerComponentSerializer('localTransform', {
  serialize: (value) => ({ x: value.x, y: value.y, rotation: value.rotation }),
  deserialize: (data) => createLocalTransform(data.x, data.y),
});

// Snapshot
const snapshot = ecs.serializeWorld({ include: ['position', 'health', 'inventory'] });
const json = JSON.stringify(snapshot);

// Restore
ecs.deserializeWorld(JSON.parse(json));
```

**Why:** This is infrastructure that the Scene/Prefab bundle (Tier 3 #11) depends on. It also enables replay systems, networking state sync, undo/redo, and debugging snapshots.

---

### Priority 2 — Quality of life and performance

#### E. Command Buffer Entity ID Resolution

**Current state:** `commands.spawn()` doesn't return the new entity ID — it's unavailable until the command buffer plays back. This prevents spawning an entity and immediately setting up relationships or children in the same command batch.

**Proposed addition:**
```ts
const ref = commands.spawn({ position: { x: 0, y: 0 } });  // returns EntityRef (not yet resolved)
commands.spawnChild(ref, { sprite: playerSprite });           // can use ref as parent
commands.addComponent(ref, 'tag', 'player');                  // can add more components
// ref.id resolves after playback
```

**Why:** This is a common pain point in ECS frameworks. Bevy solves it with `Commands::spawn().id()` returning an `Entity` handle immediately. Without this, users break out of the command buffer pattern and use direct `ecs.spawn()` mid-system, which can cause ordering issues.

---

#### F. System Sets / Labels

**Current state:** Systems can be in groups that are enabled/disabled together. But there's no way to apply ordering constraints, screen filtering, or asset requirements to a group of systems at once.

**Proposed addition:**
```ts
ecs.defineSystemSet('combat', {
  inScreens: ['game'],
  after: 'input',
  before: 'rendering',
});

ecs.addSystem('damage').inSet('combat');
ecs.addSystem('knockback').inSet('combat');
// Both systems inherit the screen filter and ordering constraints
```

**Why:** Bevy's SystemSets are the primary mechanism for organizing systems. They reduce boilerplate when many systems share the same constraints and make bundle composition more robust.

---

#### G. Archetype-Based Storage (Long-term)

**Current state:** Components are stored in per-component-type maps (Map<entityId, component>). Queries iterate the smallest component set and filter. This is fine for hundreds of entities but becomes a bottleneck at thousands because of cache misses — each component access for an entity is a separate hash lookup.

**Proposed change:** Store entities with identical component signatures together in contiguous arrays (archetype tables). Queries iterate archetypes, which gives cache-friendly memory access.

**Why:** This is the single biggest performance optimization an ECS can make. Bevy, flecs, and other serious ECS implementations use archetype storage. For ECSpresso to scale to complex games with thousands of entities, this would eventually be needed. However, this is a large internal refactor that doesn't change the public API.

---

#### H. Async System Support

**Current state:** System process functions are synchronous. Any async work (loading, network calls) must go through resources or events.

**Proposed addition:**
```ts
ecs.addSystem('level-loader')
  .setAsyncProcess(async (queries, dt, ecs) => {
    const levelData = await fetch(`/levels/${level}.json`);
    // ...
  });
```

**Design notes:** Async systems would need careful handling — they shouldn't block the frame loop. Consider a pattern where the async system yields after initiating work and resumes when the promise resolves, similar to Bevy's async tasks.

**Why:** Network requests, asset loading, and procedural generation are inherently async. Forcing them through events adds ceremony.

---

## Gap Comparison Matrix

| Feature | ECSpresso | Bevy | Unity | Godot |
|---------|-----------|------|-------|-------|
| Transform hierarchy | Yes | Yes | Yes | Yes |
| Arcade physics | Yes | Via plugin | Built-in | Built-in |
| Constraint physics | No | Via Avian/Rapier | Built-in (PhysX) | Built-in (Godot Physics/Jolt) |
| Sprite animation | **No** | Built-in | Built-in | Built-in |
| Particle system | **No** | Via plugin | Built-in | Built-in |
| UI framework | **No** | Built-in | Built-in (UI Toolkit) | Built-in (Control) |
| Tilemap | **No** | Via plugin (0.17 chunks) | Via plugin | Built-in (TileMap) |
| Pathfinding/Nav | **No** | Via plugin | Built-in (NavMesh) | Built-in (NavigationServer) |
| Behavior trees | **No** | Via plugin | Via plugin | Via plugin |
| Skeletal animation | No | Built-in | Built-in | Built-in |
| Scene serialization | **No** | Built-in (BSN) | Built-in | Built-in (.tscn) |
| Entity pooling | **No** | Manual | Built-in (2021+) | Manual |
| Debug draw/gizmos | **No** | Built-in (GizmoPlugin) | Built-in (Gizmos) | Built-in (DebugDraw) |
| Coroutines | **No** | Via plugin | Built-in | Built-in (await) |
| System ordering constraints | No (priorities only) | Built-in (.before/.after) | N/A (MonoBehaviour) | N/A |
| ECS relationships | Parent-child only | Built-in (0.16) | N/A | N/A |
| Component observers | Via reactive queries | Built-in (observers) | N/A | Built-in (signals) |
| Save/load | **No** | Via scene format | Built-in | Built-in |
| Networking | **No** | Via plugin | Built-in (Netcode) | Built-in (MultiplayerAPI) |
| State machines | Yes | Via plugin | Via Animator | Via AnimationTree |
| Tweening | Yes | Via plugin | Via DOTween | Built-in (Tween) |
| Audio channels | Yes | Built-in | Built-in | Built-in |
| Camera system | Yes | Built-in | Built-in | Built-in |
| Diagnostics | Yes | Built-in | Built-in (Profiler) | Built-in (Monitors) |
| Spatial indexing | Yes | Via plugin | Built-in | Built-in |
| Asset management | Yes | Built-in | Built-in | Built-in |
| Screen/state management | Yes | Built-in (States) | Manual | Manual |
| Input mapping | Yes | Built-in | Via Input System | Built-in (InputMap) |
| Change detection | Yes | Built-in | No | No |
| Required components | Yes | Built-in (0.15) | No | No |

**Bold** = gaps that are most impactful to address.

---

## Recommended Implementation Order

Based on impact, dependency chains, and implementation complexity:

### Phase 1 — Foundations
1. **System ordering constraints** (core) — `.before()` / `.after()` — makes all subsequent bundle composition safer
2. **Sprite Animation Bundle** — most-requested missing feature for 2D games
3. **Object Pool Bundle** — needed before particle system can be performant
4. **Debug Draw Bundle** — accelerates development of everything else

### Phase 2 — Game Features
5. **Particle Emitter Bundle** — depends on object pool for performance
6. **UI/HUD Bundle** — eliminates raw DOM workarounds
7. **Coroutine Bundle** — enables complex sequencing patterns
8. **Tilemap Bundle** — opens up platformer/RPG genres

### Phase 3 — AI & Advanced
9. **Pathfinding Bundle** — depends on tilemap or navmesh data
10. **Behavior Tree Bundle** — complements existing FSM
11. **Trail / Line Renderer Bundle** — visual polish
12. **Component lifecycle observers** (core) — simplifies reactive patterns

### Phase 4 — Infrastructure
13. **World serialization** (core) — enables save/load
14. **Scene / Prefab Bundle** — depends on serialization
15. **Entity relationships** (core) — requires significant design work
16. **Command buffer entity refs** (core) — quality of life

---

## Summary

ECSpresso has a strong core — the ECS primitives, type safety, builder pattern, change detection, and phase system are all well-designed. The existing bundles cover the basics of 2D game physics, input, and rendering.

The most impactful additions would be: **sprite animation**, **particles**, **UI**, and **object pooling** as bundles, plus **system ordering constraints** and **component observers** as core improvements. These six additions alone would cover the majority of what developers expect from a game framework and would make ECSpresso viable for building complete 2D games without needing to write infrastructure code from scratch.
