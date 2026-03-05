# Core Concepts

## Entities and Components

Entities are containers for components. Use `spawn()` to create entities with initial components:

```typescript
// Create entity with components
const entity = world.spawn({
  position: { x: 10, y: 20 },
  health: { value: 100 }
});

// Add components later
world.entityManager.addComponent(entity.id, 'velocity', { x: 5, y: 0 });

// Get component data (returns undefined if not found)
const position = world.entityManager.getComponent(entity.id, 'position');

// Remove components or entities
world.entityManager.removeComponent(entity.id, 'velocity');
world.entityManager.removeEntity(entity.id);
```

### Component Callbacks

React to component additions and removals. Both methods return an unsubscribe function:

```typescript
const unsubAdd = world.onComponentAdded('health', ({ value, entity }) => {
  console.log(`Health added to entity ${entity.id}:`, value);
});

const unsubRemove = world.onComponentRemoved('health', ({ value, entity }) => {
  console.log(`Health removed from entity ${entity.id}:`, value);
});

// Unsubscribe when done
unsubAdd();
unsubRemove();
```

Also available on `world.entityManager.onComponentAdded()` / `onComponentRemoved()`.

## Systems and Queries

Systems process entities that match specific component patterns:

```typescript
world.addSystem('combat')
  .addQuery('fighters', {
    with: ['position', 'health'],
    without: ['dead']
  })
  .addQuery('projectiles', {
    with: ['position', 'damage']
  })
  .setProcess((queries, deltaTime) => {
    for (const fighter of queries.fighters) {
      for (const projectile of queries.projectiles) {
        // Combat logic here
      }
    }
  });
```

For more on systems, see [Systems](./systems.md).

## Resources

Resources provide global state accessible to all systems.

```typescript
interface Resources {
  score: { value: number };
  settings: { difficulty: 'easy' | 'hard' };
}

const world = ECSpresso.create()
  .withComponentTypes<Components>()
  .withResourceTypes<Resources>()
  .withResource('score', { value: 0 })
  .build();

// Sync or async factories (lazy initialization)
world.addResource('config', () => ({ difficulty: 'normal', soundEnabled: true }));
world.addResource('database', async () => await connectToDatabase());

// Factory with dependencies (initialized after dependencies are ready)
world.addResource('cache', {
  dependsOn: ['database'],
  factory: (ecs) => ({ db: ecs.getResource('database') })
});

// Initialize all resources (respects dependency order, detects circular deps)
await world.initializeResources();

// Use in systems
world.addSystem('scoring')
  .setProcess((queries, deltaTime, ecs) => {
    const score = ecs.getResource('score');
    score.value += 10;
  });
```

Resources also chain naturally with plugins in the builder:

```typescript
const world = ECSpresso.create()
  .withPlugin(physicsPlugin)
  .withResource('config', { debug: true, maxEntities: 1000 })
  .withResource('score', () => ({ value: 0 }))
  .withResource('cache', {
    dependsOn: ['database'],
    factory: (ecs) => createCache(ecs.getResource('database'))
  })
  .build();
```

### Disposal

Resources can define cleanup logic with `onDispose` callbacks:

```typescript
world.addResource('keyboard', {
  factory: () => {
    const handler = (e: KeyboardEvent) => { /* ... */ };
    window.addEventListener('keydown', handler);
    return { handler };
  },
  onDispose: (resource) => {
    window.removeEventListener('keydown', resource.handler);
  }
});

await world.disposeResource('keyboard');     // Dispose a single resource
await world.disposeResources();              // All, in reverse dependency order
```

`onDispose` receives the resource value and the ECSpresso instance. Supports sync and async callbacks. Only initialized resources have their `onDispose` called. `removeResource()` still exists for removal without disposal.
