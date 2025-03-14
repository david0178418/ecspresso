# ECSpresso

*(pronounced "ex-presso")*

__Note: This is a VERY early work in progress.__

To install dependencies:

```bash
bun install
```

To run tests:

```bash
bun test
```


# ECSpresso

A lightweight, type-safe Entity Component System (ECS) library for TypeScript applications and games.

## Overview

ECSpresso is a flexible and efficient Entity Component System implementation that provides:

- **Type-safe API**: Fully leverages TypeScript's type system for component, event, and resource definitions
- **Event System**: Built-in pub/sub event system for communication between systems
- **Resource Management**: Global state management through a dedicated resource manager
- **Bundle System**: Modular and reusable collections of components, resources, and systems
- **Query System**: Efficient entity filtering based on component presence/absence

## Core Concepts

### Entity Component System

The ECS pattern separates data (Components) from behavior (Systems) through Entities:

- **Entities**: Unique identifiers that components can be attached to
- **Components**: Plain data objects that hold state but no behavior
- **Systems**: Logic that processes entities with specific components
- **Resources**: Global state shared between systems
- **Events**: Messages passed between systems

### Key Features

- Type-safe queries to filter entities based on component combinations
- Fluent builder API for creating systems and bundles
- Event handling with lifecycle hooks for systems
- Resource management for global state
- Simplified system API - all system methods receive the ECSpresso instance

### System API Design

All system methods (process, onAttach, onDetach, and event handlers) receive the ECSpresso instance as a parameter, which provides:

- Access to entity management via `ecs.entityManager`
- Access to resources via `ecs.resourceManager`
- Access to events via `ecs.eventBus`

This design simplifies the API and allows systems access to all ECS functionality through a single reference. Benefits of this approach include:

- **Simpler method signatures**: Systems only need to deal with one additional parameter (the ECS instance) rather than multiple managers
- **Future extensibility**: New functionality added to the ECSpresso class is automatically available to all systems without changing method signatures
- **Consistency**: All system methods (process, lifecycle hooks, event handlers) use the same parameter pattern
- **Reduced verbosity**: Systems can be written more concisely while still having access to all ECS functionality

## Installation

```bash
# Add the library to your project
npm install ecspresso
```

## Usage

### Basic Setup

```typescript
import ECSpresso, { Bundle } from 'ecspresso';

// Define your component types
interface Position {
  x: number;
  y: number;
}

interface Velocity {
  dx: number;
  dy: number;
}

// Define your event types
interface CollisionEvent {
  entityA: number;
  entityB: number;
}

// Define your resource types
interface GameState {
  score: number;
  level: number;
}

// Create an ECS instance with your types
const ecs = new ECSpresso<
  { position: Position; velocity: Velocity },
  { collision: CollisionEvent },
  { gameState: GameState }
>();

// Add resources
ecs.addResource('gameState', { score: 0, level: 1 });

// Create an entity
const entity = ecs.entityManager.createEntity();

// Add components to the entity
ecs.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });
ecs.entityManager.addComponent(entity.id, 'velocity', { dx: 1, dy: 2 });

// Run the simulation
ecs.update(16.67); // Pass delta time in ms
```

### Creating Systems

```typescript
// Create a movement system
const movementSystem = ecs.entityManager
  .createSystem('movement')
  .addQuery('movable', {
    with: ['position', 'velocity']
  })
  .setProcess((queries, deltaTime, ecs) => {
    // Process entities with both position and velocity
    for (const entity of queries.movable) {
      const { position, velocity } = entity.components;
      position.x += velocity.dx * (deltaTime / 1000);
      position.y += velocity.dy * (deltaTime / 1000);
    }
  });

// Add the system to the ECS
ecs.addSystem(movementSystem);
```

### Using Bundles

```typescript
// Create a physics bundle
const physicsBundle = new Bundle<
  { position: Position; velocity: Velocity },
  { collision: CollisionEvent },
  {}
>('physics');

// Add a collision system to the bundle
physicsBundle
  .addSystem('collision')
  .addQuery('collidable', {
    with: ['position']
  })
  .setProcess((queries, deltaTime, ecs) => {
    // Check for collisions
    // ...
    // Emit collision events
    ecs.eventBus.publish('collision', { entityA: 1, entityB: 2 });
  });

// Install the bundle
ecs.install(physicsBundle);
```

### Event Handling

```typescript
// Create a system that handles collision events
const scoreSystem = ecs.entityManager
  .createSystem('score')
  .setEventHandlers({
    collision: {
      handler: (event, ecs) => {
        // Handle collision event
        const gameState = ecs.resourceManager.getResource('gameState');
        if (gameState) {
          gameState.score += 10;
        }
      }
    }
  });

// Add the system to the ECS
ecs.addSystem(scoreSystem);
```

## Advanced Features

### Merging Bundles

```typescript
import { mergeBundles } from 'ecspresso';

// Merge multiple bundles into one
const gameBundle = mergeBundles(
  'game',
  physicsBundle,
  renderBundle,
  inputBundle
);

// Install the merged bundle
ecs.install(gameBundle);
```

### System Lifecycle Hooks

```typescript
// Create a system with lifecycle hooks
const renderSystem = ecs.entityManager
  .createSystem('render')
  .setOnAttach((ecs) => {
    // Initialize rendering resources
    console.log('Render system attached');
  })
  .setOnDetach((ecs) => {
    // Clean up rendering resources
    console.log('Render system detached');
  });
```

### Complex System Example

The following example demonstrates a system that uses multiple aspects of the ECS (queries, resources, and events) with the simplified API:

```typescript
// Create a complex AI system that needs access to multiple ECS features
const aiSystem = ecs.entityManager
  .createSystem('enemyAI')
  .addQuery('enemies', {
    with: ['position', 'ai', 'health'],
    without: ['stunned']
  })
  .addQuery('players', {
    with: ['position', 'player']
  })
  .setProcess((queries, deltaTime, ecs) => {
    // Access game configuration from resources
    const config = ecs.resourceManager.get('gameConfig');
    const difficultyMultiplier = config?.difficulty || 1.0;
    
    // Process each enemy
    for (const enemy of queries.enemies) {
      // Find the nearest player
      let nearestPlayer = null;
      let shortestDistance = Infinity;
      
      for (const player of queries.players) {
        const distance = calculateDistance(
          enemy.components.position,
          player.components.position
        );
        
        if (distance < shortestDistance) {
          nearestPlayer = player;
          shortestDistance = distance;
        }
      }
      
      if (nearestPlayer && shortestDistance < enemy.components.ai.detectionRange * difficultyMultiplier) {
        // Enemy detected player, update AI state
        if (enemy.components.ai.state !== 'chasing') {
          enemy.components.ai.state = 'chasing';
          
          // Emit event that enemy spotted player
          ecs.eventBus.publish('enemySpottedPlayer', {
            enemyId: enemy.id,
            playerId: nearestPlayer.id
          });
        }
        
        // Move enemy toward player
        moveToward(enemy, nearestPlayer, deltaTime);
      }
    }
  });
```

This example shows how having access to the entire ECS through a single parameter simplifies the code, as the system can easily work with entity queries, access resources, and publish events without needing separate parameters for each manager.

This project was created using `bun init` in bun v1.2.4. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
