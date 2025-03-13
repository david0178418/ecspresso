# ecspresso

To install dependencies:

```bash
bun install
```

To run tests:

```bash
bun test
```


# SimpleECS

A lightweight, type-safe Entity Component System (ECS) library for TypeScript applications and games.

## Overview

SimpleECS is a flexible and efficient Entity Component System implementation that provides:

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

## Installation

```bash
# Add the library to your project
npm install simple-ecs
```

## Usage

### Basic Setup

```typescript
import SimpleECS, { Bundle } from 'simple-ecs';

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
const ecs = new SimpleECS<
  { position: Position; velocity: Velocity },
  { collision: CollisionEvent },
  { gameState: GameState }
>();

// Add resources
ecs.addResource('gameState', { score: 0, level: 1 });

// Create an entity
const entityId = ecs.createEntity();

// Add components to the entity
ecs.addComponent(entityId, 'position', { x: 0, y: 0 });
ecs.addComponent(entityId, 'velocity', { dx: 1, dy: 2 });

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
  .setProcess((queries, deltaTime) => {
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
  .setProcess((queries, deltaTime, entityManager, resourceManager, eventBus) => {
    // Check for collisions
    // ...
    // Emit collision events
    eventBus.emit('collision', { entityA: 1, entityB: 2 });
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
      handler: (event, entityManager, resourceManager) => {
        // Handle collision event
        const gameState = resourceManager.getResource('gameState');
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
import { mergeBundles } from 'simple-ecs';

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
  .setOnAttach((entityManager, resourceManager, eventBus) => {
    // Initialize rendering resources
    console.log('Render system attached');
  })
  .setOnDetach((entityManager, resourceManager, eventBus) => {
    // Clean up rendering resources
    console.log('Render system detached');
  });
```

This project was created using `bun init` in bun v1.2.4. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.