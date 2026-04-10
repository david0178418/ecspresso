# Events

Use events for decoupled system communication. Events work across all features — hierarchy changes, asset loading, timer completion, and custom game events all use the same system.

```typescript
interface Events {
  playerDied: { playerId: number };
  levelComplete: { score: number };
  // Hierarchy events (if using entity hierarchy)
  hierarchyChanged: {
    entityId: number;
    oldParent: number | null;
    newParent: number | null;
  };
}

const world = ECSpresso.create()
  .withComponentTypes<Components>()
  .withEventTypes<Events>()
  .build();

// Subscribe - returns unsubscribe function
const unsubscribe = world.on('playerDied', (data) => {
  console.log(`Player ${data.playerId} died`);
});
unsubscribe();

// Or unsubscribe by callback reference
const handler = (data) => console.log(`Score: ${data.score}`);
world.on('levelComplete', handler);
world.off('levelComplete', handler);

// Handle events in systems
world.addSystem('gameLogic')
  .setEventHandlers({
    playerDied: ({ data, ecs }) => {
      // Respawn logic
    }
  });

// Publish events from anywhere
world.eventBus.publish('playerDied', { playerId: 1 });
```

## Built-in Events

- `hierarchyChanged` — entity parent changes
- `assetLoaded` / `assetFailed` / `assetGroupProgress` / `assetGroupLoaded` — asset loading
- Timer `onComplete` events — see [Built-in Plugins](./built-in-plugins.md)
