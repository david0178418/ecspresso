# Queries

## Query Type Utilities

Extract entity types from queries to create reusable helper functions:

```typescript
import { createQueryDefinition, QueryResultEntity } from 'ecspresso';

// Create reusable query definitions
const movingQuery = createQueryDefinition<Components>({
  with: ['position', 'velocity'],
  without: ['frozen']
});

// Extract entity type for helper functions
type MovingEntity = QueryResultEntity<Components, typeof movingQuery>;

function updatePosition(entity: MovingEntity, deltaTime: number) {
  entity.components.position.x += entity.components.velocity.x * deltaTime;
  entity.components.position.y += entity.components.velocity.y * deltaTime;
}

// Use in systems
world.addSystem('movement')
  .addQuery('entities', movingQuery)
  .setProcess((queries, deltaTime) => {
    for (const entity of queries.entities) {
      updatePosition(entity, deltaTime);
    }
  });
```

## Reactive Queries

Get callbacks when entities enter or exit a query match. Unlike regular queries that you poll during `update()`, reactive queries push notifications when the entity's components change:

```typescript
world.addReactiveQuery('enemies', {
  with: ['position', 'enemy'],
  without: ['dead'],
  onEnter: (entity) => {
    console.log(`Enemy ${entity.id} appeared at`, entity.components.position);
    spawnHealthBar(entity.id);
  },
  onExit: (entityId) => {
    // Receives ID since entity may already be removed
    console.log(`Enemy ${entityId} gone`);
    removeHealthBar(entityId);
  },
});

// Triggers onEnter: spawning matching entity, adding required component, removing excluded component
const enemy = world.spawn({ position: { x: 0, y: 0 }, enemy: true }); // onEnter fires

// Triggers onExit: removing required component, adding excluded component, removing entity
world.entityManager.addComponent(enemy.id, 'dead', true); // onExit fires

// Existing matching entities trigger onEnter when query is added
// Component replacement does NOT trigger enter/exit (match status unchanged)

// Remove reactive query when no longer needed
world.removeReactiveQuery('enemies'); // returns true if existed
```
