# Type Safety

ECSpresso provides comprehensive TypeScript support:

```typescript
// ✅ Valid
world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });

// ❌ TypeScript error - invalid component name
world.entityManager.addComponent(entity.id, 'invalid', { data: 'bad' });

// ❌ TypeScript error - wrong component shape
world.entityManager.addComponent(entity.id, 'position', { x: 0 }); // missing y

// Query type safety - TypeScript knows which components exist
world.addSystem('example')
  .addQuery('moving', { with: ['position', 'velocity'] })
  .setProcess(({ queries }) => {
    for (const entity of queries.moving) {
      entity.components.position.x;   // ✅ guaranteed
      entity.components.health.value; // ❌ not in query
    }
  });

// Plugin type compatibility - conflicting types error at compile time
const plugin1 = definePlugin<WorldConfigFrom<{ position: { x: number; y: number } }>>({
  id: 'p1', install() {},
});
const plugin2 = definePlugin<WorldConfigFrom<{ velocity: { x: number; y: number } }>>({
  id: 'p2', install() {},
});
// Builder merges plugin types automatically — no manual type params needed
const world = ECSpresso.create()
  .withPlugin(plugin1)
  .withPlugin(plugin2)
  .build();
```

## Error Handling

ECSpresso provides clear, contextual error messages:

```typescript
world.getResource('nonexistent');
// → "Resource 'nonexistent' not found. Available resources: [config, score, settings]"

world.entityManager.addComponent(999, 'position', { x: 0, y: 0 });
// → "Cannot add component 'position': Entity with ID 999 does not exist"

// Component not found returns undefined (no throw)
world.entityManager.getComponent(123, 'position'); // undefined
```
