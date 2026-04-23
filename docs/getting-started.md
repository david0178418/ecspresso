# Getting Started

## Installation

```sh
npm install ecspresso
```

## Quick Start

```typescript
import ECSpresso from 'ecspresso';

// 1. Define your component types
interface Components {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  health: { value: number };
}

// 2. Create a world using the builder.
//    Component, event, and resource types flow through the chain — you
//    never hand-annotate a system's callback; it all comes from here.
const world = ECSpresso.create()
  .withComponentTypes<Components>()
  .withResource('regenRate', 5)   // heals 5 hp/sec — also previews resources
  // .withEventTypes<{ ... }>()   // events slot in the same way
  .build();

// 3a. Single-query, per-entity iteration → setProcessEach.
//     `mutates: ['position']` auto-stamps change-detection after each tick
//     and narrows `velocity` to Readonly at the type level — writing to it
//     would be a compile error.
world.addSystem('integrate-velocity')
  .setProcessEach(
    {
      with: ['position', 'velocity'],
      mutates: ['position'],
    },
    ({ entity, dt }) => {
      // entity.components.position is { x: number; y: number } — inferred.
      entity.components.position.x += entity.components.velocity.x * dt;
      entity.components.position.y += entity.components.velocity.y * dt;
    },
  );

// 3b. Multi-concern or resource-driven systems → addQuery + setProcess.
//     Same `mutates` contract; the outer for…of is yours to write.
world.addSystem('regen-health')
  .addQuery('injured', {
    with: ['health'],
    mutates: ['health'],
  })
  .withResources(['regenRate'])
  .setProcess(({ queries, dt, resources: { regenRate } }) => {
    for (const entity of queries.injured) {
      entity.components.health.value += regenRate * dt;
    }
  });

// 4. Create entities. Systems default to the `update` phase; see
//    the Systems guide for `fixedUpdate`, `render`, and phase ordering.
const player = world.spawn({
  position: { x: 0, y: 0 },
  velocity: { x: 10, y: 5 },
  health: { value: 80 },
});

// 5. Drive the loop — call world.update(dt) every frame.
const loop = (last: number) => (now: number) => {
  world.update((now - last) / 1000);
  requestAnimationFrame(loop(now));
};
requestAnimationFrame(loop(performance.now()));
```

> **`mutates` in one line:** declares which components a system writes — auto-marks them as changed each tick and narrows the rest of `with` to `Readonly<T>`. Less boilerplate, more compile-time safety.

## Next Steps

- [Core Concepts](./core-concepts.md) — entities, components, systems, resources
- [Systems](./systems.md) — phases, priorities, groups, lifecycle
- [Plugins](./plugins.md) — organizing and reusing functionality
- [Built-in Plugins](./built-in-plugins.md) — input, timers, physics, rendering
