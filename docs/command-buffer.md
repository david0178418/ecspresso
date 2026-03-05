# Command Buffer

Queue structural changes during system execution that execute between phases. This prevents issues when modifying entities during iteration.

```typescript
world.addSystem('combat')
  .addQuery('enemies', { with: ['enemy', 'health'] })
  .setProcess((queries, dt, ecs) => {
    for (const entity of queries.enemies) {
      if (entity.components.health.value <= 0) {
        ecs.commands.removeEntity(entity.id);
        ecs.commands.spawn({
          position: entity.components.position,
          explosion: true,
        });
      }
    }
  });
```

## Available Commands

```typescript
// Entity operations
ecs.commands.spawn({ position: { x: 0, y: 0 } });
ecs.commands.spawnChild(parentId, { position: { x: 10, y: 0 } });
ecs.commands.removeEntity(entityId);
ecs.commands.removeEntity(entityId, { cascade: false });

// Component operations
ecs.commands.addComponent(entityId, 'velocity', { x: 5, y: 0 });
ecs.commands.addComponents(entityId, { velocity: { x: 5, y: 0 }, health: { value: 100 } });
ecs.commands.removeComponent(entityId, 'velocity');

// Hierarchy operations
ecs.commands.setParent(childId, parentId);
ecs.commands.removeParent(childId);

// Mutate a component via callback (marks changed automatically)
ecs.commands.mutateComponent(entityId, 'position', (pos) => {
  pos.x += 10;
});

// Change detection
ecs.commands.markChanged(entityId, 'position');

// Utility
ecs.commands.length;  // Number of queued commands
ecs.commands.clear(); // Discard all queued commands
```

Commands execute in FIFO order. If a command fails (e.g., entity doesn't exist), it logs a warning and continues with remaining commands.
