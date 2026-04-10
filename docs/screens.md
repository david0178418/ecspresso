# Screen Management

Manage game states/screens with transitions and overlay support:

```typescript
import type { ScreenDefinition } from 'ecspresso';

type Screens = {
  menu: ScreenDefinition<
    Record<string, never>,           // Config (passed when entering)
    { selectedOption: number }       // State (mutable during screen)
  >;
  gameplay: ScreenDefinition<
    { difficulty: string; level: number },
    { score: number; isPaused: boolean }
  >;
  pause: ScreenDefinition<Record<string, never>, Record<string, never>>;
};

const game = ECSpresso.create()
  .withComponentTypes<Components>()
  .withEventTypes<Events>()
  .withResourceTypes<Resources>()
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
      requiredAssetGroups: ['level1'],
    })
    .add('pause', {
      initialState: () => ({}),
    })
  )
  .build();

await game.initialize();
await game.setScreen('menu', {});                     // Set initial screen
await game.setScreen('gameplay', { difficulty: 'hard', level: 1 }); // Transition
await game.pushScreen('pause', {});                   // Push overlay
await game.popScreen();                               // Pop overlay

const current = game.getCurrentScreen();              // 'gameplay'
const config = game.getScreenConfig();                // { difficulty: 'hard', level: 1 }
const state = game.getScreenState();                  // { score: 0, isPaused: false }
game.updateScreenState({ score: 100 });
```

## Screen-Scoped Systems

```typescript
game.addSystem('menuUI')
  .inScreens(['menu'])                         // Only runs in 'menu'
  .setProcess(({ ecs }) => {
    renderMenu(ecs.getScreenState().selectedOption);
  });

game.addSystem('animations')
  .excludeScreens(['pause'])                   // Runs in all screens except 'pause'
  .setProcess(() => { /* ... */ });
```

## Screen Resource

Access screen state through the `$screen` resource:

```typescript
game.addSystem('ui')
  .setProcess(({ ecs }) => {
    const screen = ecs.getResource('$screen');
    screen.current;        // Current screen name
    screen.config;         // Current screen config
    screen.state;          // Current screen state (mutable)
    screen.isOverlay;      // true if screen was pushed
    screen.stackDepth;     // Number of screens in stack
    screen.isCurrent('gameplay');   // Check current screen
    screen.isActive('menu');        // true if in current or stack
  });
```
