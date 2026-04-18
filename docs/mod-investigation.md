# Data-Driven / Modding Investigation

Status: exploratory — no implementation, no decisions committed.

## Goal

Make ECSpresso more **data-driven**: world structure (entities, components, resources, assets, scenes) defined in external data files rather than code. Two motivations:

1. **Iteration speed** — change game content without recompiling / redeploying.
2. **Modding** — allow third parties to extend a shipped game without forking source.

Logic (systems) stays in code. Structure (data) becomes loadable.

## Prior art

### Bevy

Three-layer stack:

1. **Reflection** (`#[derive(Reflect)]`) — components opt into runtime type introspection. Rust has no native reflection, so Bevy maintains a registry of types → fields → (de)serializers. Foundation for everything else.
2. **Scene files** (`.scn.ron`) — RON-format text describing entities and their components. Loader uses the reflection registry to materialize them.
3. **BSN (Bevy Scene Notation)** — in-flight replacement. Treats scenes as **composable patches** (layered overrides on a base), unifying prefabs / templates / scenes. Designed to be both a Rust macro and a file format.

Useful design property: scenes are *data*, but the same reflection machinery powers editor inspectors, diffing for hot-reload, and migrations.

### Unity DOTS

**Authoring/runtime split.** Designers edit `ScriptableObject`s and prefabs in the editor. A **baking system** converts them into ECS components at build/load time. Authoring stays ergonomic; runtime stays lean. Blob assets used for read-only config to avoid GC.

### GLTF (Bevy / Godot / others)

Repurpose a non-ECS file format as an entity-spawn source. A `.glb` becomes an entity hierarchy with transform + mesh + material components. Lets external DCC tools (Blender etc.) author game content directly.

### Flecs

Ships a JSON serializer for components and queries, plus a built-in REST endpoint and explorer for inspecting/editing a running world. Modding via runtime introspection rather than file format.

### Minecraft / Factorio

**Namespaced registries with a dependency DAG.** `minecraft:stone` vs `mymod:custom_block`. Mods declare what they depend on; load order is a topological sort. Establishes the pattern of *layered* content where each layer can reference ancestors but not peers (unless declared).

## Common shape across all of these

> Component schemas registered somewhere → text/binary file describes entities as bags of components → a loader materializes them at runtime.

Differences are mostly in:
- How schemas are registered (macro derive, manual, decorator, baking step)
- File format (RON, JSON, binary, DCC formats)
- Whether layering / composition is first-class

## TypeScript-specific considerations

Rust needs reflection because types evaporate at runtime. **TS components are already plain objects**, so JSON (de)serialization is nearly free. The cost isn't serialization — it's:

- Losing the compile-time `WorldConfig` guarantees the builder currently provides.
- Validating that loaded data matches expected component shapes.
- Resolving cross-references (entity → entity, entity → asset).

## Validation: Zod (or similar)

Zod schemas can be the **source of truth** for component shapes, with TS types derived via `z.infer`:

```ts
const Position = z.object({ x: z.number(), y: z.number() });
type Position = z.infer<typeof Position>;
```

Builder integration concept:

```ts
.withComponentSchemas({ position: Position, velocity: Velocity })
```

…would do two jobs at once:
- Contribute to the compile-time `WorldConfig` (via `z.infer`).
- Register a runtime validator keyed by component name for use by the loader.

Existing `.withComponentTypes<T>()` stays as the type-only escape hatch.

### Library options

- **Zod** — incumbent, large ecosystem, ~50KB.
- **Valibot** — same shape, ~10x smaller bundle, modular. Likely better default for browser games.
- **ArkType** — TS-syntax-style schemas, fast.
- **Typia** — compile-time, zero runtime cost, but requires a TS transformer (build complexity).

For a library that will ship in browser game bundles, **Valibot is the leading candidate**.

## Layered content model

Map directly onto the Minecraft/Factorio pattern:

```
Layer = {
  id: string
  dependsOn: string[]
  componentSchemas: Record<string, Schema>
  resources: Record<string, unknown>
  scenes: Scene[]
  assets: AssetManifest
}
```

- **Core** declares schemas under its own namespace; resolves only against itself.
- **Mods** can reference any ancestor layer's schemas/assets/entities, but not peers (unless declared as a dep).
- Load order = topological sort over `dependsOn`.

### Validation passes

1. **Schema** — each component blob matches its declared schema.
2. **Reference** — every `{ $ref: "core:player" }`, asset handle, etc. resolves in scope (self + ancestors).
3. **Composition** — no two layers define the same namespaced key; required components are present on entities that claim a given archetype.

### Type-safety property

Core never imports mod types → core stays self-contained and typeable. Mods type against core via `z.infer` over their declared dependencies. A mod author's TS build needs to see ancestor schema exports — implies a generated `core.schemas.ts` or equivalent, similar to GraphQL codegen.

## Open questions (need decisions before any implementation)

- **Override semantics** — do mods *override* core values (Factorio: override + load-order) or only *add* (Minecraft: mostly add-only + tags)?
- **Peer conflicts** — when two peer mods touch the same entity/value: declared precedence, last-write-wins, or hard error?
- **Asset scoping** — is the layer boundary also the asset-resolution boundary (mod textures resolve relative to mod root)?
- **Scene format** — JSON (universal, debuggable, large), binary (compact, fast, tooling-required), or both?
- **Hot reload** — is incremental reload of a layer in scope, or load-once-at-boot only?
- **Builder integration** — does `.withLayer()` compose with the existing chain, or is layering a separate runtime-only system?
- **Scope of "data-driven"** — components/entities only, or also include resources, events, screen definitions, asset manifests?

## References

- [Bevy's Next Generation Scene/UI System (#14437)](https://github.com/bevyengine/bevy/discussions/14437)
- [Bevy UI and Scene Evolution Proposal (#9538)](https://github.com/bevyengine/bevy/discussions/9538)
- [Thoughts on a binary scene format (#21233)](https://github.com/bevyengine/bevy/discussions/21233)
- [Bevy Cheat Book — GLTF & Scenes](https://bevy-cheatbook.github.io/3d/gltf)
- [Unity ECS + ScriptableObject baking patterns](https://discussions.unity.com/t/architecture-with-scriptable-objects-and-ecs/715812)
