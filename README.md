# ECSpresso

*(pronounced "ex-presso")*

A type-safe, modular, and extensible Entity Component System (ECS) framework for TypeScript and JavaScript.

## Features

- **Type-Safe**: Full TypeScript support with component, event, and resource type inference
- **Modular**: Bundle-based architecture for organizing features
- **Developer-Friendly**: Clean, fluent API with method chaining
- **Event-Driven**: Integrated event system for decoupled communication
- **Resource Management**: Global state management with lazy loading
- **Query System**: Powerful entity filtering with helper type utilities

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

// 2. Create a world
const world = new ECSpresso<Components>();

// 3. Add a movement system
world.addSystem('movement')
  .addQuery('moving', { with: ['position', 'velocity'] })
  .setProcess((queries, deltaTime) => {
    for (const entity of queries.moving) {
      entity.components.position.x += entity.components.velocity.x * deltaTime;
      entity.components.position.y += entity.components.velocity.y * deltaTime;
    }
  })
  .build();

// 4. Create entities
const player = world.spawn({
  position: { x: 0, y: 0 },
  velocity: { x: 10, y: 5 },
  health: { value: 100 }
});

// 5. Run the game loop
world.update(1/60);
```

## Core Concepts

### Entities and Components

Entities are containers for components. Use `spawn()` to create entities with initial components:

```typescript
// Create entity with components
const entity = world.spawn({
  position: { x: 10, y: 20 },
  health: { value: 100 }
});

// Add components later
world.entityManager.addComponent(entity.id, 'velocity', { x: 5, y: 0 });

// Get component data (returns null if not found)
const position = world.entityManager.getComponent(entity.id, 'position');

// Remove components or entities
world.entityManager.removeComponent(entity.id, 'velocity');
world.entityManager.removeEntity(entity.id);
```

### Systems and Queries

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
    // Process fighters and projectiles
    for (const fighter of queries.fighters) {
      for (const projectile of queries.projectiles) {
        // Combat logic here
      }
    }
  })
  .build();
```

### Resources

Resources provide global state accessible to all systems:

```typescript
interface Resources {
  score: { value: number };
  settings: { difficulty: 'easy' | 'hard' };
}

const world = new ECSpresso<Components, {}, Resources>();

// Add resources
world.addResource('score', { value: 0 });
world.addResource('settings', { difficulty: 'easy' });

// Use in systems
world.addSystem('scoring')
  .setProcess((queries, deltaTime, ecs) => {
    const score = ecs.getResource('score');
    score.value += 10;
  })
  .build();
```

## Working with Systems

### Method Chaining

Chain multiple systems using `.and()` for cleaner code. The `.and()` method returns the parent container (ECSpresso or Bundle), enabling fluent chaining:

```typescript
// Chaining systems on ECSpresso
world.addSystem('physics')
  .addQuery('moving', { with: ['position', 'velocity'] })
  .setProcess((queries, deltaTime) => {
    // Physics logic
  })
  .and() // Returns ECSpresso for continued chaining
  .addSystem('rendering')
  .addQuery('visible', { with: ['position', 'sprite'] })
  .setProcess((queries) => {
    // Rendering logic
  })
  .build();

// Chaining systems in a Bundle
const bundle = new Bundle<Components>()
  .addSystem('movement')
  .setProcess(() => { /* ... */ })
  .and() // Returns Bundle for continued chaining
  .addSystem('collision')
  .setProcess(() => { /* ... */ })
  .and()
  .addResource('config', { speed: 10 });
```

### Query Type Utilities

Extract entity types from queries to create reusable helper functions:

```typescript
import { createQueryDefinition, QueryResultEntity } from 'ecspresso';

// Create reusable query definitions
const movingQuery = createQueryDefinition<Components>({
  with: ['position', 'velocity'] as const,
  without: ['frozen'] as const
});

// Extract entity type for helper functions
type MovingEntity = QueryResultEntity<Components, typeof movingQuery>;

// Create type-safe helper functions
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
  })
  .build();
```

### System Priority

Control execution order with priorities (higher numbers execute first):

```typescript
world.addSystem('physics')
  .setPriority(100) // Runs first
  .setProcess(() => { /* physics */ })
  .and()
  .addSystem('rendering')
  .setPriority(50)  // Runs second
  .setProcess(() => { /* rendering */ })
  .build();
```

## Advanced Features

### Bundles

Organize related systems and resources into reusable bundles:

```typescript
import { Bundle } from 'ecspresso';

interface GameComponents {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  sprite: { texture: string };
}

interface GameResources {
  gravity: { value: number };
}

// Create a bundle with multiple systems using .and() for chaining
const physicsBundle = new Bundle<GameComponents, {}, GameResources>('physics')
  .addSystem('applyVelocity')
  .addQuery('moving', { with: ['position', 'velocity'] })
  .setProcess((queries, deltaTime) => {
    for (const entity of queries.moving) {
      entity.components.position.x += entity.components.velocity.x * deltaTime;
      entity.components.position.y += entity.components.velocity.y * deltaTime;
    }
  })
  .and()  // Returns the bundle for continued chaining
  .addSystem('applyGravity')
  .addQuery('falling', { with: ['velocity'] })
  .setProcess((queries, deltaTime, ecs) => {
    const gravity = ecs.getResource('gravity');
    for (const entity of queries.falling) {
      entity.components.velocity.y += gravity.value * deltaTime;
    }
  })
  .and()
  .addResource('gravity', { value: 9.8 });

const renderBundle = new Bundle<GameComponents>('render')
  .addSystem('renderer')
  .addQuery('sprites', { with: ['position', 'sprite'] })
  .setProcess((queries) => {
    // Render sprites
  })
  .and();

// Create world with bundles
const game = ECSpresso.create<GameComponents, {}, GameResources>()
  .withBundle(physicsBundle)
  .withBundle(renderBundle)
  .build();
```

### Events

Use events for decoupled system communication:

```typescript
interface Events {
  playerDied: { playerId: number };
  levelComplete: { score: number };
}

const world = new ECSpresso<Components, Events>();

// Handle events in systems
world.addSystem('gameLogic')
  .setEventHandlers({
    playerDied: {
      handler: (data, ecs) => {
        console.log(`Player ${data.playerId} died`);
        // Respawn logic here
      }
    }
  })
  .build();

// Publish events from anywhere
world.eventBus.publish('playerDied', { playerId: 1 });
```

### Resource Factories

Create resources lazily with factory functions:

```typescript
interface Resources {
  config: { difficulty: string; soundEnabled: boolean };
  assets: { textures: any[] };
}

const world = new ECSpresso<Components, {}, Resources>();

// Sync factory
world.addResource('config', () => ({
  difficulty: 'normal',
  soundEnabled: true
}));

// Async factory
world.addResource('assets', async () => {
  const textures = await loadTextures();
  return { textures };
});

// Initialize all resources
await world.initializeResources();
```

### System Lifecycle

Systems can have initialization and cleanup hooks:

```typescript
world.addSystem('gameSystem')
  .setOnInitialize(async (ecs) => {
    // One-time setup
    console.log('System starting...');
  })
  .setOnDetach((ecs) => {
    // Cleanup when system is removed
    console.log('System shutting down...');
  })
  .build();

// Initialize all systems
await world.initialize();
```

## Type Safety

ECSpresso provides comprehensive TypeScript support:

### Component Type Safety
```typescript
// ✅ Valid
world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });

// ❌ TypeScript error - invalid component
world.entityManager.addComponent(entity.id, 'invalid', { data: 'bad' });

// ❌ TypeScript error - wrong component shape
world.entityManager.addComponent(entity.id, 'position', { x: 0 }); // missing y
```

### Query Type Safety
```typescript
world.addSystem('example')
  .addQuery('moving', { with: ['position', 'velocity'] })
  .setProcess((queries) => {
    for (const entity of queries.moving) {
      // ✅ TypeScript knows these exist
      entity.components.position.x;
      entity.components.velocity.y;
      
      // ❌ TypeScript error - not guaranteed to exist
      entity.components.health.value;
    }
  })
  .build();
```

### Bundle Type Compatibility
```typescript
// ✅ Compatible bundles merge cleanly
const bundle1 = new Bundle<{position: {x: number, y: number}}>('bundle1');
const bundle2 = new Bundle<{velocity: {x: number, y: number}}>('bundle2');

const world = ECSpresso.create()
  .withBundle(bundle1)
  .withBundle(bundle2) // Types merge successfully
  .build();

// ❌ Conflicting types error at compile time
const conflictingBundle = new Bundle<{position: string}>('conflict');
world.withBundle(conflictingBundle); // TypeScript prevents this
```

## Component Callbacks

React to component changes with callbacks:

```typescript
// Listen for component additions/removals
world.entityManager.onComponentAdded('health', (value, entity) => {
  console.log(`Health added to entity ${entity.id}:`, value);
});

world.entityManager.onComponentRemoved('health', (oldValue, entity) => {
  console.log(`Health removed from entity ${entity.id}:`, oldValue);
});
```

## Error Handling

ECSpresso provides clear, contextual error messages for common issues:

```typescript
// Resource not found with helpful context
try {
  const missing = world.getResource('nonexistent');
} catch (error) {
  console.error(error.message); 
  // "Resource 'nonexistent' not found. Available resources: [config, score, settings]"
}

// Entity operations with detailed context
try {
  world.entityManager.addComponent(999, 'position', { x: 0, y: 0 });
} catch (error) {
  console.error(error.message);
  // "Cannot add component 'position': Entity with ID 999 does not exist"
}

// Component not found returns null
const component = world.entityManager.getComponent(123, 'position');
if (component === null) {
  console.log('Component not found');
}
```

## Performance Tips

- Extract business logic into testable helper functions using query type utilities
- Bundle related systems for better organization and reusability
- Use system priorities to control execution order
- Use resource factories for expensive initialization (textures, audio, etc.)
- Consider component callbacks for immediate reactions to state changes
- Minimize the number of components in queries when possible to leverage indexing
