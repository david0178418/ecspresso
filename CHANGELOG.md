# Changelog

All notable changes to ECSpresso are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added

- **System callback helper types** for extracted system callbacks:
  - `SystemProcessFn<Cfg, Queries, ResourceKeys?, Singletons?>` names the `.setProcess(...)` callback shape.
  - `SystemLifecycleFn<Cfg>` names the `.setOnInitialize(...)` / `.setOnDetach(...)` callback shape.
- **Configurator callback helper types** for extracting builder callbacks:
  - `AssetConfiguratorFn<Assets, AssetGroups?>` names the `.withAssets(...)` callback shape.
  - `ScreenConfiguratorFn<Screens>` names the `.withScreens(...)` callback shape.
- **Slot-specific `WorldConfig` helper types** for plugin requirements:
  - `ComponentsConfig<T>`, `EventsConfig<T>`, `ResourcesConfig<T>`, `AssetsConfig<T>`, and `ScreensConfig<T>` build single-slot configs without spelling empty `WorldConfigFrom` parameters.
- **Screen definitions now default state to config** when the state type parameter is omitted, reducing boilerplate for screens whose mutable state mirrors the entry config.
- **Spritesheet helpers in `ecspresso/plugins/rendering/sprite-animation`** for PixiJS atlases:
  - `spritesheetLoader<S>(url)` — `AssetConfigurator`-compatible loader; lazy-loads `pixi.js` and runtime-shape-checks the resolved value so non-atlas URLs error at load time instead of deep in the play loop.
  - `clipFromSheet(sheet, name, options?)` and `animationSetFromSheet(id, sheet, options?)` — build clips/sets from a loaded `Spritesheet<S>`. Animation-name union is inferred when `S` is declared as an `interface ... extends SpritesheetData`. Both throw on zero-frame animations.
  - `clipFromGrid({ source, frameWidth, frameHeight, columns, rows?, count?, indices?, ... })` — slice a grid-arranged image without atlas JSON. **Async** (lazy-loads pixi) and validates inputs: exactly one of `rows`/`count`/`indices` is required, indices are integer- and bounds-checked when `rows` is given.
  - New exported types: `SheetClipOverrides<A>`, `SheetAnimationKeys<S>`.

### Internal

- Materialized the Codex plugin wrapper files in-repo and included their plugin manifests in version sync.

## 0.17.0

No breaking changes from 0.16.3.

### Added

- **`builder.disableChangeTracking()`** — opt out of change tracking entirely for worlds with zero `changed:` filters (e.g. benchmarks). Auto-subscription from plugins still grows the bitmap correctly if a plugin with a `changed:` filter is added afterwards.
- **Auto-derived change-tracking subscriptions.** The framework walks `changed:` declarations during `_registerSystem` and subscribes only the components something actually consumes. Unsubscribed components skip the mark walk entirely.

### Performance

- Spatial-index `postUpdate` rebuild auto-skips in flat-hierarchy scenes when the `fixedUpdate` rebuild already ran (2D: −5.7%, 3D: −9.6% ms/frame in the physics bench).
- `EventBus.publish` switched from a conditional-tuple rest signature to two named overloads — empty fast-path is ~7× faster (5.7 → 0.8 ns/call); end-to-end bench −7–10% ms/frame.
- `markChanged` resolves component indices once and uses a flat `Uint32Array` for the per-component change generation.
- Query `_changedIdx` and `_mutatesIdx` are pre-resolved at system registration, removing per-frame name→idx Map lookups.
- Collision and spatial-index plugins replaced per-entity `getComponent` calls with split queries.

### Internal

- Added `bench/ecs-physics3D.bench.ts` and shared `mulberry32` PRNG with the 2D bench.
- Stress-test example gained Phaser and Bevy comparison modes; Bevy wasm builds in docs CI.
