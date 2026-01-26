# ECSpresso

*(pronounced "ex-presso")*

A type-safe, modular, and extensible Entity Component System (ECS) framework for TypeScript and JavaScript.

## Features

- **Type-Safe**: Full TypeScript support with component, event, and resource type inference
- **Modular**: Bundle-based architecture for organizing features
- **Developer-Friendly**: Clean, fluent API with method chaining
- **Event-Driven**: Integrated event system for decoupled communication
- **Resource Management**: Global state management with lazy loading
- **Asset Management**: Eager/lazy asset loading with groups and progress tracking
- **Screen Management**: Game state/screen transitions with overlay support
- **Entity Hierarchy**: Parent-child relationships with traversal and cascade deletion
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

// Subscribe to events with on() - returns unsubscribe function
const unsubscribe = world.on('playerDied', (data) => {
  console.log(`Player ${data.playerId} died`);
});

// Unsubscribe when done
unsubscribe();

// Or unsubscribe by callback reference with off()
const handler = (data) => console.log(`Level complete! Score: ${data.score}`);
world.on('levelComplete', handler);
world.off('levelComplete', handler);

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

### Post-Update Hooks

Register callbacks that run after all systems have processed during `update()`:

```typescript
// Register a post-update hook - returns unsubscribe function
const unsubscribe = world.onPostUpdate((ecs, deltaTime) => {
  // Runs after all systems in update()
  // Useful for cleanup, state sync, or debug logging
  console.log(`Frame completed in ${deltaTime}s`);
});

// Multiple hooks run in registration order
world.onPostUpdate((ecs) => {
  // First hook
});
world.onPostUpdate((ecs) => {
  // Second hook
});

// Unsubscribe when no longer needed
unsubscribe();
```

### Entity Hierarchy

Create parent-child relationships between entities for scene graphs, UI trees, or skeletal hierarchies:

```typescript
const world = new ECSpresso<Components>();

// Create a parent entity
const player = world.spawn({
  position: { x: 0, y: 0 }
});

// Create a child entity using spawnChild
const weapon = world.spawnChild(player.id, {
  position: { x: 10, y: 0 }  // Relative to parent
});

// Or set parent on existing entity
const shield = world.spawn({ position: { x: -10, y: 0 } });
world.setParent(shield.id, player.id);

// Query relationships
world.getParent(weapon.id);           // player.id
world.getChildren(player.id);         // [weapon.id, shield.id]

// Orphan an entity (remove from parent)
world.removeParent(shield.id);
world.getParent(shield.id);           // null
```

#### Traversal Methods

Navigate the hierarchy tree with traversal utilities:

```typescript
// Build a hierarchy: root -> child -> grandchild
const root = world.spawn({ position: { x: 0, y: 0 } });
const child = world.spawnChild(root.id, { position: { x: 10, y: 0 } });
const grandchild = world.spawnChild(child.id, { position: { x: 20, y: 0 } });

// Ancestors (from entity up to root)
world.getAncestors(grandchild.id);    // [child.id, root.id]

// Descendants (depth-first order)
world.getDescendants(root.id);        // [child.id, grandchild.id]

// Get root of any entity
world.getRoot(grandchild.id);         // root.id

// Siblings (other children of same parent)
const child2 = world.spawnChild(root.id, { position: { x: -10, y: 0 } });
world.getSiblings(child.id);          // [child2.id]

// Relationship checks
world.isDescendantOf(grandchild.id, root.id);  // true
world.isAncestorOf(root.id, grandchild.id);    // true

// All root entities (entities with children but no parent)
world.getRootEntities();              // [root.id]

// Child ordering
world.getChildAt(root.id, 0);         // child.id
world.getChildIndex(root.id, child2.id); // 1
```

#### Cascade Deletion

When removing entities, descendants are automatically removed by default:

```typescript
const parent = world.spawn({ position: { x: 0, y: 0 } });
const child = world.spawnChild(parent.id, { position: { x: 10, y: 0 } });
const grandchild = world.spawnChild(child.id, { position: { x: 20, y: 0 } });

// Remove parent - cascades to all descendants
world.removeEntity(parent.id);
world.entityManager.getEntity(child.id);      // undefined
world.entityManager.getEntity(grandchild.id); // undefined

// To orphan children instead of deleting them:
world.removeEntity(parent.id, { cascade: false });
// Children still exist but have no parent
```

#### Hierarchy Events

React to hierarchy changes with the `hierarchyChanged` event:

```typescript
interface Events {
  hierarchyChanged: {
    entityId: number;
    oldParent: number | null;
    newParent: number | null;
  };
}

const world = new ECSpresso<Components, Events>();

world.on('hierarchyChanged', (data) => {
  if (data.newParent !== null) {
    console.log(`Entity ${data.entityId} attached to ${data.newParent}`);
  } else {
    console.log(`Entity ${data.entityId} detached from ${data.oldParent}`);
  }
});

// Events fire on setParent, removeParent, and spawnChild
world.setParent(child.id, parent.id);  // Emits hierarchyChanged
```

### Asset Management

Manage game assets with eager/lazy loading, groups, and progress tracking:

```typescript
// Define asset types
type Assets = {
  playerTexture: { data: ImageBitmap };
  enemyTexture: { data: ImageBitmap };
  level1Music: { buffer: AudioBuffer };
  level1Background: { data: ImageBitmap };
};

// Create world with assets using the builder pattern
const game = ECSpresso.create<Components, Events, Resources, Assets>()
  .withAssets(assets => assets
    // Eager assets - loaded automatically during initialize()
    .add('playerTexture', async () => {
      const img = await loadImage('player.png');
      return { data: img };
    })
    .add('enemyTexture', async () => {
      const img = await loadImage('enemy.png');
      return { data: img };
    })
    // Lazy asset group - loaded on demand
    .addGroup('level1', {
      level1Music: async () => {
        const buffer = await loadAudio('level1.mp3');
        return { buffer };
      },
      level1Background: async () => {
        const img = await loadImage('level1-bg.png');
        return { data: img };
      },
    })
  )
  .build();

// Initialize loads eager assets automatically
await game.initialize();

// Access loaded assets
const player = game.getAsset('playerTexture');

// Check if asset is loaded
if (game.isAssetLoaded('enemyTexture')) {
  const enemy = game.getAsset('enemyTexture');
}

// Load asset groups on demand (e.g., when entering a level)
await game.loadAssetGroup('level1');

// Track loading progress
const progress = game.getAssetGroupProgress('level1'); // 0-1

// Check if group is fully loaded
if (game.isAssetGroupLoaded('level1')) {
  const music = game.getAsset('level1Music');
}
```

#### Asset Events

React to asset loading with built-in events:

```typescript
game.addSystem('loadingUI')
  .setEventHandlers({
    assetLoaded: {
      handler: (data) => console.log(`Loaded: ${data.key}`)
    },
    assetFailed: {
      handler: (data) => console.error(`Failed: ${data.key}`, data.error)
    },
    assetGroupProgress: {
      handler: (data) => {
        console.log(`${data.group}: ${data.loaded}/${data.total}`);
      }
    },
    assetGroupLoaded: {
      handler: (data) => console.log(`Group ready: ${data.group}`)
    }
  })
  .build();
```

#### Systems with Asset Requirements

Systems can declare required assets and will only run when those assets are loaded:

```typescript
game.addSystem('gameplay')
  .requiresAssets(['playerTexture', 'enemyTexture'])
  .setProcess((queries, dt, ecs) => {
    // This only runs when both assets are loaded
    const player = ecs.getAsset('playerTexture');
  })
  .build();
```

### Screen Management

Manage game states/screens with transitions and overlay support:

```typescript
import type { ScreenDefinition } from 'ecspresso';

// Define screen types with config and state
type Screens = {
  menu: ScreenDefinition<
    Record<string, never>,           // Config (passed when entering)
    { selectedOption: number }       // State (mutable during screen)
  >;
  gameplay: ScreenDefinition<
    { difficulty: string; level: number },  // Config
    { score: number; isPaused: boolean }    // State
  >;
  pause: ScreenDefinition<
    Record<string, never>,
    Record<string, never>
  >;
};

// Create world with screens
const game = ECSpresso.create<Components, Events, Resources, {}, Screens>()
  .withScreens(screens => screens
    .add('menu', {
      initialState: () => ({ selectedOption: 0 }),
      onEnter: () => console.log('Entered menu'),
      onExit: () => console.log('Left menu'),
    })
    .add('gameplay', {
      initialState: () => ({ score: 0, isPaused: false }),
      onEnter: (config) => console.log(`Starting level ${config.level}`),
      onExit: () => console.log('Gameplay ended'),
      // Require assets before screen can be entered
      requiredAssetGroups: ['level1'],
    })
    .add('pause', {
      initialState: () => ({}),
      onEnter: () => console.log('Paused'),
      onExit: () => console.log('Resumed'),
    })
  )
  .build();

await game.initialize();

// Set initial screen
await game.setScreen('menu', {});

// Transition to gameplay (clears screen stack)
await game.setScreen('gameplay', { difficulty: 'hard', level: 1 });

// Push overlay screen (adds to stack, previous screen stays active)
await game.pushScreen('pause', {});

// Pop overlay (returns to previous screen)
await game.popScreen();

// Access current screen info
const current = game.getCurrentScreen();        // 'gameplay'
const config = game.getScreenConfig();          // { difficulty: 'hard', level: 1 }
const state = game.getScreenState();            // { score: 0, isPaused: false }

// Update screen state
game.updateScreenState({ score: 100 });
```

#### Screen-Scoped Systems

Systems can be restricted to run only in specific screens:

```typescript
// Only runs when 'menu' is the current screen
game.addSystem('menuUI')
  .inScreens(['menu'])
  .setProcess((queries, dt, ecs) => {
    const state = ecs.getScreenState();
    renderMenu(state.selectedOption);
  })
  .build();

// Only runs in 'gameplay' screen
game.addSystem('scoring')
  .inScreens(['gameplay'])
  .setProcess((queries, dt, ecs) => {
    const state = ecs.getScreenState();
    ecs.updateScreenState({ score: state.score + 1 });
  })
  .build();

// Runs in all screens EXCEPT 'pause'
game.addSystem('animations')
  .excludeScreens(['pause'])
  .setProcess(() => {
    // Animations continue except when paused
  })
  .build();
```

#### Screen Resource

Access screen state through the `$screen` resource:

```typescript
game.addSystem('ui')
  .setProcess((queries, dt, ecs) => {
    const screen = ecs.getResource('$screen');

    console.log(screen.current);     // Current screen name
    console.log(screen.config);      // Current screen config
    console.log(screen.state);       // Current screen state (mutable)
    console.log(screen.isOverlay);   // true if screen was pushed
    console.log(screen.stackDepth);  // Number of screens in stack

    // Check screen status
    if (screen.isCurrent('gameplay')) {
      // ...
    }
    if (screen.isActive('menu')) {
      // true if menu is current OR in the stack
    }
  })
  .build();
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
