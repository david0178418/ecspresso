# Plugins

Organize related systems and resources into reusable plugins:

```typescript
import ECSpresso, { definePlugin } from 'ecspresso';

interface PhysicsComponents {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
}

interface PhysicsResources {
  gravity: { value: number };
}

const physicsPlugin = definePlugin('physics')
  .withComponentTypes<PhysicsComponents>()
  .withResourceTypes<PhysicsResources>()
  .install((world) => {
    world.addSystem('applyVelocity')
      .addQuery('moving', { with: ['position', 'velocity'] })
      .setProcess(({ queries, dt }) => {
        for (const entity of queries.moving) {
          entity.components.position.x += entity.components.velocity.x * dt;
          entity.components.position.y += entity.components.velocity.y * dt;
        }
      });

    world.addSystem('applyGravity')
      .addQuery('falling', { with: ['velocity'] })
      .setProcess(({ queries, dt, ecs }) => {
        const gravity = ecs.getResource('gravity');
        for (const entity of queries.falling) {
          entity.components.velocity.y += gravity.value * dt;
        }
      });

    world.addResource('gravity', { value: 9.8 });
  });

// Register plugins with the world — types merge automatically
const game = ECSpresso.create()
  .withPlugin(physicsPlugin)
  .build();
```

## Plugin Factory

When multiple plugins share the same types (common in application code), use `pluginFactory()` on the builder or built world to capture types automatically:

```typescript
// types.ts — builder accumulates all types
export const builder = ECSpresso.create()
  .withPlugin(createPhysicsPlugin())
  .withComponentTypes<{ player: boolean; enemy: EnemyData }>()
  .withResourceTypes<{ score: number }>();

// Types flow from the builder — no manual imports or extends chains
export const definePlugin = builder.pluginFactory();

// movement-plugin.ts — no type params needed
import { definePlugin } from './types';

export const movementPlugin = definePlugin({
  id: 'movement',
  install(world) {
    world.addSystem('movement')
      .addQuery('moving', { with: ['position', 'velocity'] })
      .setProcess(({ queries, dt }) => { /* ... */ });
  },
});
```

## Required Components

Plugins can declare that certain components depend on others. When an entity gains a trigger component, any required components that aren't already present are auto-added with default values:

```typescript
const transformPlugin = definePlugin('transform')
  .withComponentTypes<TransformComponents>()
  .install((world) => {
    world.registerRequired('localTransform', 'worldTransform', () => ({
      x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
    }));
  });

const world = ECSpresso.create()
  .withPlugin(transformPlugin)
  .build();

// worldTransform is auto-added with defaults
const entity = world.spawn({
  localTransform: { x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 },
});

// Explicit values always win — no auto-add if already provided
const entity2 = world.spawn({
  localTransform: { x: 100, y: 200, rotation: 0, scaleX: 1, scaleY: 1 },
  worldTransform: { x: 50, y: 50, rotation: 0, scaleX: 2, scaleY: 2 }, // used as-is
});
```

Requirements can also be registered via the builder or at runtime:

```typescript
// Builder
const world = ECSpresso.create()
  .withComponentTypes<Components>()
  .withRequired('rigidBody', 'velocity', () => ({ x: 0, y: 0 }))
  .withRequired('rigidBody', 'force', () => ({ x: 0, y: 0 }))
  .build();

// Runtime
world.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));
```

### Behavior

- Enforced at insertion time (`spawn`, `addComponent`, `addComponents`, `spawnChild`, command buffer)
- Removal is unrestricted — removing a required component does not cascade
- Transitive requirements resolve automatically (A requires B, B requires C → all three added)
- Circular dependencies are detected and rejected at registration time
- Auto-added components are marked as changed and trigger reactive queries
- Component names and factory return types are fully type-checked

### Built-in Requirements

The Transform plugin registers `localTransform` → `worldTransform`. The Physics 2D plugin registers `rigidBody` → `velocity` and `rigidBody` → `force`.
