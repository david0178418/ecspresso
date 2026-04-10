# Asset Management

Manage game assets with eager/lazy loading, groups, and progress tracking:

```typescript
type Assets = {
  playerTexture: { data: ImageBitmap };
  level1Music: { buffer: AudioBuffer };
  level1Background: { data: ImageBitmap };
};

const game = ECSpresso.create()
  .withComponentTypes<Components>()
  .withEventTypes<Events>()
  .withResourceTypes<Resources>()
  .withAssets(assets => assets
    // Eager assets - loaded automatically during initialize()
    .add('playerTexture', async () => {
      const img = await loadImage('player.png');
      return { data: img };
    })
    // Lazy asset group - loaded on demand
    .addGroup('level1', {
      level1Music: async () => ({ buffer: await loadAudio('level1.mp3') }),
      level1Background: async () => ({ data: await loadImage('level1-bg.png') }),
    })
  )
  .build();

await game.initialize();                          // Loads eager assets
const player = game.getAsset('playerTexture');    // Access loaded asset
game.isAssetLoaded('playerTexture');              // Check if loaded

await game.loadAssetGroup('level1');              // Load group on demand
game.getAssetGroupProgress('level1');             // 0-1 progress
game.isAssetGroupLoaded('level1');                // Check if group is ready
```

## Required Assets

Systems can declare required assets and will only run when those assets are loaded:

```typescript
game.addSystem('gameplay')
  .requiresAssets(['playerTexture'])
  .setProcess(({ ecs }) => {
    const player = ecs.getAsset('playerTexture');
  });
```

## Asset Events

Asset events (`assetLoaded`, `assetFailed`, `assetGroupProgress`, `assetGroupLoaded`) are available through the [event system](./events.md).
