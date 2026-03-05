# Systems

## Method Chaining

Systems use a fluent builder API: `world.addSystem().addQuery().setProcess()` — systems are automatically registered via deferred finalization. No explicit termination call is needed.

```typescript
world.addSystem('physics')
  .addQuery('moving', { with: ['position', 'velocity'] })
  .setProcess((queries, deltaTime) => {
    // Physics logic
  });

world.addSystem('rendering')
  .addQuery('visible', { with: ['position', 'sprite'] })
  .setProcess((queries) => {
    // Rendering logic
  });
```

## System Phases

Systems are organized into named execution phases that run in a fixed order:

```
preUpdate → fixedUpdate → update → postUpdate → render
```

Each phase's command buffer is played back before the next phase begins, so entities spawned in `preUpdate` are visible to `fixedUpdate`, and so on. Systems without `.inPhase()` default to `update`.

```typescript
world.addSystem('input')
  .inPhase('preUpdate')
  .setProcess((queries, dt, ecs) => { /* Read input, update timers */ });

world.addSystem('physics')
  .inPhase('fixedUpdate')
  .setProcess((queries, dt, ecs) => {
    // dt is always fixedDt here (e.g. 1/60)
    // Runs 0..N times per frame based on accumulated time
  });

world.addSystem('gameplay')
  .inPhase('update')  // default phase
  .setProcess((queries, dt, ecs) => { /* Game logic, AI */ });

world.addSystem('transform-sync')
  .inPhase('postUpdate')
  .setProcess((queries, dt, ecs) => { /* Transform propagation */ });

world.addSystem('renderer')
  .inPhase('render')
  .setProcess((queries, dt, ecs) => { /* Visual output */ });
```

### Fixed Timestep

The `fixedUpdate` phase uses a time accumulator for deterministic simulation. A spiral-of-death cap (8 steps) prevents runaway accumulation.

```typescript
const world = ECSpresso.create()
  .withComponentTypes<Components>()
  .withEventTypes<Events>()
  .withResourceTypes<Resources>()
  .withFixedTimestep(1 / 60)  // 60Hz physics (default)
  .build();
```

### Interpolation

Use `ecs.interpolationAlpha` (0..1) in the render phase to smooth between fixed steps.

### Runtime Phase Changes

Move systems between phases at runtime with `world.updateSystemPhase('debug-overlay', 'render')`.

## System Priority

Within each phase, systems execute in priority order (higher numbers first). Systems with the same priority execute in registration order:

```typescript
world.addSystem('physics')
  .inPhase('fixedUpdate')
  .setPriority(100) // Runs first within fixedUpdate
  .setProcess(() => { /* physics */ });

world.addSystem('constraints')
  .inPhase('fixedUpdate')
  .setPriority(50)  // Runs second within fixedUpdate
  .setProcess(() => { /* constraints */ });
```

## System Groups

Organize systems into groups that can be enabled/disabled at runtime:

```typescript
world.addSystem('renderSprites')
  .inGroup('rendering')
  .addQuery('sprites', { with: ['position', 'sprite'] })
  .setProcess((queries) => { /* ... */ });

world.addSystem('renderParticles')
  .inGroup('rendering')
  .inGroup('effects')  // Systems can belong to multiple groups
  .setProcess(() => { /* ... */ });

world.disableSystemGroup('rendering');              // All rendering systems skip
world.enableSystemGroup('rendering');               // Resume rendering
world.isSystemGroupEnabled('rendering');            // true/false
world.getSystemsInGroup('rendering');               // ['renderSprites', 'renderParticles']

// If a system belongs to multiple groups, disabling ANY group skips the system
```

## System Lifecycle

Systems can have initialization, cleanup, and post-update hooks:

```typescript
world.addSystem('gameSystem')
  .setOnInitialize(async (ecs) => {
    console.log('System starting...');
  })
  .setOnDetach((ecs) => {
    console.log('System shutting down...');
  });

await world.initialize();
```

### Entity Enter Callbacks

Register a callback that fires when an entity first matches a query:

```typescript
world.addSystem('onSpawn')
  .addQuery('enemies', { with: ['enemy', 'health'] })
  .setOnEntityEnter('enemies', ({ entity, ecs }) => {
    console.log(`Enemy ${entity.id} entered query`);
  })
  .setProcess((queries) => { /* ... */ });
```

### Post-Update Hooks

Register callbacks that run between the `postUpdate` and `render` phases:

```typescript
// Returns unsubscribe function; multiple hooks run in registration order
const unsubscribe = world.onPostUpdate(({ ecs, dt }) => {
  console.log(`Frame completed in ${dt}s`);
});

unsubscribe();
```
