# ECSpresso

*(pronounced "ex-presso")*

__Note: This is a VERY early work in progress. No work on performance has been done while the API is being nailed down. The documention is also being autogenerated while ECSpresso is being iterated on.__

A type-safe, modular, and extensible Entity Component System (ECS) framework for TypeScript.

## Features

- 🔒 **Type-Safe**: Full TypeScript support with type inference for components, events, and resources
- 🧩 **Modular**: Bundle-based architecture for modular gameplay systems and features
- 💡 **Flexible**: Easily create entities, add components, and build systems with a clean, fluent API
- 🔄 **Event-Driven**: Integrated event bus for communication between systems
- 🗄️ **Resource Management**: Global resources for sharing state across systems
- ⏱️ **Priority Control**: Set execution priority for systems to ensure proper processing order

## Installation

```sh
npm install ecspresso
```

## Quick Start

```typescript
import { ECSpresso } from 'ecspresso';

// Define your component types
interface Components {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  sprite: { url: string };
}

// Define your event types
interface Events {
  collision: { entity1: number; entity2: number };
  scoreChange: { amount: number };
}

// Define your resource types
interface Resources {
  score: { value: number };
  gameState: 'playing' | 'paused' | 'gameOver';
  assets: { textures: Record<string, any>; sounds: Record<string, any> };
}

// Create a world instance directly
const world = new ECSpresso<Components, Events, Resources>();

// Add resources - can be direct values or factory functions
world.addResource('score', { value: 0 });
world.addResource('gameState', 'paused');
world.addResource('assets', async () => {
  // Simulate loading game assets
  const textures = await loadTextures();
  const sounds = await loadSounds();
  return { textures, sounds };
});

// Add a movement system directly to the world
world.addSystem('movement')
  .addQuery('movingEntities', {
    with: ['position', 'velocity']
  })
  .setProcess((queries, deltaTime) => {
    for (const entity of queries.movingEntities) {
      entity.components.position.x += entity.components.velocity.x * deltaTime;
      entity.components.position.y += entity.components.velocity.y * deltaTime;
    }
  })
  .setOnInitialize(async (ecs) => {
    // One-time initialization of the system
    console.log('Setting up movement system...');
    const gameState = ecs.getResource('gameState');
    gameState.lastMovementUpdate = Date.now();
  })
  .build(); // Don't forget to call build() to finalize the system

// Create an entity with position and velocity components
const entity = world.entityManager.createEntity();
world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });
world.entityManager.addComponent(entity.id, 'velocity', { x: 10, y: 5 });

// Initialize everything (systems and resources with factory functions) in one call
await world.initialize();

// Run a single update
world.update(1/60);

// Check new position
const position = world.entityManager.getComponent(entity.id, 'position');
console.log(position); // { x: 0.16666..., y: 0.08333... }
```

## Building Modular Systems with Bundles

Bundles are a powerful way to organize game features:

```typescript
// Create a player input bundle
const inputBundle = new Bundle<Components, Events, Resources>('input-bundle')
  .addSystem('playerInput')
  .setProcess((_queries, _deltaTime, ecs) => {
    // Handle keyboard input and modify player velocity
    // ...
  });

// Create a rendering bundle
const renderBundle = new Bundle<Components, Events, Resources>('render-bundle')
  .addSystem('renderer')
  .addQuery('sprites', { with: ['position', 'sprite'] })
  .setProcess((queries) => {
    // Render all sprites
    for (const entity of queries.sprites) {
      // Draw entities at their positions
      // ...
    }
  });

// Create a scoring bundle that adds a resource and listens for events
const scoringBundle = new Bundle<Components, Events, Resources>('scoring-bundle')
  .addResource('score', { value: 0 })
  // Resources can also be added using factory functions
  .addResource('gameStats', () => ({
    highScore: 0,
    totalPlayTime: 0,
    sessionStartTime: Date.now()
  }))
  .addSystem('scoreKeeper')
  .setEventHandlers({
    scoreChange: {
      handler: (data, ecs) => {
        const score = ecs.getResource('score');
        score.value += data.amount;
        console.log(`Score: ${score.value}`);
      }
    }
  });

// Create a game initialization bundle with event handlers
const initBundle = new Bundle<Components, Events, Resources>('init-bundle')
  .addSystem('initialization')
  .setOnInitialize(async (ecs) => {
    console.log('Game systems initializing...');
    // Do one-time system setup here
  })
  .setEventHandlers({
    gameStart: {
      async handler(data, ecs) {
        console.log('Game starting...');
        
        // Initialize all resources and systems
        await ecs.initialize();
        
        // Resources and systems are now ready to use
        const assets = ecs.getResource('assets');
        console.log(`Loaded ${Object.keys(assets.textures).length} textures`);
        
        // Continue with game initialization
        // ...
      }
    }
  });

// Create the game world with all features using the builder pattern
const game = ECSpresso.create<Components, Events, Resources>()
  .withBundle(initBundle)
  .withBundle(inputBundle)
  .withBundle(renderBundle)
  .withBundle(scoringBundle)
  .build()
  .addResource('assets', async () => {
    // This won't execute until initializeResources is called
    return { textures: await loadTextures(), sounds: await loadSounds() };
  });

// Start the game
game.eventBus.publish('gameStart', {});
```

## Type Safety with the Builder Pattern

ECSpresso uses a builder pattern to provide strong type checking for bundle compatibility:

```typescript
// These bundles have compatible component types
const bundle1 = new Bundle<{position: {x: number, y: number}}>('bundle1');
const bundle2 = new Bundle<{velocity: {x: number, y: number}}>('bundle2');

// Create a world with both bundles - TypeScript will allow this
const world = ECSpresso.create()
  .withBundle(bundle1)
  .withBundle(bundle2)
  .build();

// These bundles have conflicting component types
const bundle3 = new Bundle<{position: {x: number, y: number}}>('bundle3');
const bundle4 = new Bundle<{position: string}>('bundle4');

// TypeScript will show an error because bundles have conflicting types
const world2 = ECSpresso.create()
  .withBundle(bundle3)
  // @ts-expect-error - TypeScript will flag this because the position types conflict
  .withBundle(bundle4)
  .build();
```

## Working with Entities and Components

```typescript
const world = ECSpresso.create<Components, Events, Resources>()
  .withBundle(/* your bundle */)
  .build();

// Create an entity
const entity = world.entityManager.createEntity();

// Add components individually
world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });
world.entityManager.addComponent(entity.id, 'velocity', { x: 0, y: 0 });

// Add multiple components at once
world.entityManager.addComponents(entity, {
  position: { x: 10, y: 20 },
  velocity: { x: 5, y: -2 }
});

// Get component data
const position = world.entityManager.getComponent(entity.id, 'position');

// Check if an entity has a component
const hasPosition = world.entityManager.hasComponent(entity.id, 'position');

// Remove a component
world.entityManager.removeComponent(entity.id, 'velocity');

// Remove an entity (and all its components)
world.entityManager.removeEntity(entity.id);
```

## Working with Systems and Queries

Systems can be added directly to an ECSpresso instance:

```typescript
const world = ECSpresso.create<Components, Events, Resources>()
  .build();

world.addSystem('physicsSystem')
  // Set system execution priority (higher numbers execute first)
  .setPriority(50)
  // Query entities that have both position and velocity components
  .addQuery('movingEntities', {
    with: ['position', 'velocity']
  })
  // Query entities that have position but not player component
  .addQuery('nonPlayerObjects', {
    with: ['position'],
    without: ['player']
  })
  // Query entities with different component combinations
  .addQuery('flyingNonPlayerEntities', {
    with: ['flying', 'position'],
    without: ['player', 'grounded']
  })
  .setProcess((queries, deltaTime) => {
    // Process moving entities
    for (const entity of queries.movingEntities) {
      entity.components.position.x += entity.components.velocity.x * deltaTime;
      entity.components.position.y += entity.components.velocity.y * deltaTime;
    }
    
    // Process non-player objects
    for (const entity of queries.nonPlayerObjects) {
      // Do something with non-player objects
    }
    
    // Process flying non-player entities
    for (const entity of queries.flyingNonPlayerEntities) {
      // Apply flying behavior
    }
  })
  .build(); // Finalizes and adds the system to the world
```

## System Lifecycle Hooks

ECSpresso systems have two lifecycle hooks you can implement:

```typescript
world.addSystem('gameSystem')
  // Called when `initialize()` is invoked on the ECSpresso instance
  // Good for one-time setup that depends on resources
  .setOnInitialize(async (ecs) => {
    console.log('System initializing');
    // Load assets, configure resources, etc.
  })

  // Called when the system is removed or detached from the ECSpresso instance
  .setOnDetach((ecs) => {
    console.log('System detached');
    // Clean up resources, cancel subscriptions, etc.
  })

  .build();
```

The `initialize()` method on the ECSpresso instance initializes pending resources first and then calls `onInitialize` on all systems:

```typescript
await ecs.initialize();
```

## System Priority

ECSpresso allows you to control the execution order of systems using priorities:

```typescript
// Systems with higher priority values execute before those with lower values
// Default priority is 0 if not specified

// Rendering system (runs first)
world.addSystem('renderSystem')
  .setPriority(100)
  .setProcess(() => {
    // Rendering logic
  })
  .build();

// Physics system (runs second)
world.addSystem('physicsSystem')
  .setPriority(50)
  .setProcess(() => {
    // Physics update logic
  })
  .build();

// Cleanup system (runs last)
world.addSystem('cleanupSystem')
  .setPriority(0) // Default priority if not specified
  .setProcess(() => {
    // Cleanup logic
  })
  .build();
```

Systems with the same priority value execute in the order they were registered, maintaining backward compatibility with existing code.

You can also update a system's priority dynamically at runtime:

```typescript
// Change a system's priority (higher numbers execute first)
world.updateSystemPriority('physicsSystem', 110); // Now physics will run before rendering
```

Priority also works with systems added through bundles:

```typescript
const highPriorityBundle = new Bundle<Components>()
  .addSystem('importantSystem')
  .setPriority(100)
  .setProcess(() => {
    // This will run first
  });

const lowPriorityBundle = new Bundle<Components>()
  .addSystem('lateSystem')
  .setPriority(0)
  .setProcess(() => {
    // This will run last
  });

const world = ECSpresso.create<Components>()
  .withBundle(lowPriorityBundle) // Added first but runs last due to priority
  .withBundle(highPriorityBundle) // Added second but runs first due to priority
  .build();
```

The system priority implementation is optimized with a cached sorting mechanism that only re-sorts systems when priorities change or when systems are added or removed, avoiding unnecessary sorting during each update cycle.

## Event System

The event system allows communication between systems:

```typescript
// Define an event handler in a system
const collisionBundle = new Bundle<Components, Events, Resources>('collision-bundle')
  .addSystem('collisionResponse')
  .setEventHandlers({
    collision: {
      handler: (data, ecs) => {
        // Handle collision event
        // data contains entity1 and entity2 from the event
      }
    }
  });

const world = ECSpresso.create<Components, Events, Resources>()
  .withBundle(collisionBundle)
  .build();

// Publish an event from anywhere
world.eventBus.publish('collision', {
  entity1: 1,
  entity2: 2
});

// Subscribe to events manually (outside of systems)
const unsubscribe = world.eventBus.subscribe('collision', (data) => {
  console.log(`Collision between entities ${data.entity1} and ${data.entity2}`);
});

// Stop listening
unsubscribe();
```

## Resources

Resources provide global state accessible to all systems:

```typescript
// Add a resource directly
world.addResource('score', { value: 0 });

// Get a resource
const score = world.getResource('score');
score.value += 10;

// Check if a resource exists
const hasScore = world.hasResource('score');
```

### Resource Factory Functions

Resources can also be created using factory functions, which is useful for lazy initialization or async resources:

```typescript
// Add a resource using a synchronous factory function
world.addResource('controlMap', () => {
  console.log('Creating control map');
  return {
    up: false,
    down: false,
    left: false,
    right: false
  };
});

// Add a resource using a factory function that receives the ECSpresso instance
world.addResource('playerConfig', (ecs) => {
  // Access other resources during initialization
  const gameConfig = ecs.getResource('gameConfig');
  return {
    speed: gameConfig.difficulty === 'hard' ? 200 : 100,
    startingHealth: gameConfig.difficulty === 'hard' ? 50 : 100
  };
});

// Add a resource using an asynchronous factory function
world.addResource('gameAssets', async (ecs) => {
  console.log('Loading game assets...');
  // You can access other resources during async initialization
  const settings = ecs.getResource('settings');
  const assets = await loadAssets(settings.assetQuality);
  return assets;
});

// Factory functions are executed when the resource is first accessed
const controlMap = world.getResource('controlMap'); // Factory executes here

// Or when explicitly initialized
await world.initializeResources(); // Initializes all pending resources

// You can also initialize specific resources
await world.initializeResources('gameAssets', 'controlMap');
```

Factory functions are useful for:
- Lazy loading of expensive resources
- Async initialization of resources requiring network or file operations
- Resources that depend on other systems being initialized first
- Avoiding circular dependencies in your initialization code

When using async factory functions, ensure you either:
1. Call `initializeResources()` explicitly before accessing the resource, or
2. Use `await` when getting a resource that might return a Promise

## Component Callbacks

You can listen for specific component types being added or removed on any entity using the `EntityManager` API:

```typescript
// Create your entity manager
const entityManager = new EntityManager<Components>();

// Listen for when a "health" component is added
entityManager.onComponentAdded('health', (value, entity) => {
  console.log(`Health added to entity ${entity.id}:`, value);
});

// Listen for when a "health" component is removed
entityManager.onComponentRemoved('health', (oldValue, entity) => {
  console.log(`Health removed from entity ${entity.id}:`, oldValue);
});

// Create an entity and add/remove components to trigger callbacks
const e = entityManager.createEntity();
entityManager.addComponent(e.id, 'health', { value: 100 });
// => logs: Health added to entity 1: { value: 100 }
entityManager.removeComponent(e.id, 'health');
// => logs: Health removed from entity 1: { value: 100 }
```

This is useful for debugging, UI updates, or systems that need to react immediately to component changes.

