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

// 2. Create a world using the builder — types are inferred automatically
const world = ECSpresso.create()
  .withComponentTypes<Components>()
  .build();

// 3. Add a movement system
world.addSystem('movement')
  .addQuery('moving', { with: ['position', 'velocity'] })
  .setProcess((queries, deltaTime) => {
    for (const entity of queries.moving) {
      entity.components.position.x += entity.components.velocity.x * deltaTime;
      entity.components.position.y += entity.components.velocity.y * deltaTime;
    }
  });

// 4. Create entities
const player = world.spawn({
  position: { x: 0, y: 0 },
  velocity: { x: 10, y: 5 },
  health: { value: 100 }
});

// 5. Run the game loop
world.update(1/60);
```

## Next Steps

- [Core Concepts](./core-concepts.md) — entities, components, systems, resources
- [Systems](./systems.md) — phases, priorities, groups, lifecycle
- [Plugins](./plugins.md) — organizing and reusing functionality
- [Built-in Plugins](./built-in-plugins.md) — input, timers, physics, rendering
