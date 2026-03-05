# Entity Hierarchy

Create parent-child relationships between entities for scene graphs, UI trees, or skeletal hierarchies:

```typescript
const player = world.spawn({ position: { x: 0, y: 0 } });

// Create child entity
const weapon = world.spawnChild(player.id, { position: { x: 10, y: 0 } });

// Or set parent on existing entity
const shield = world.spawn({ position: { x: -10, y: 0 } });
world.setParent(shield.id, player.id);

// Orphan an entity
world.removeParent(shield.id);
```

## Traversal

| Method | Returns | Description |
|--------|---------|-------------|
| `getParent(id)` | `number \| null` | Parent entity ID |
| `getChildren(id)` | `number[]` | Direct children |
| `getAncestors(id)` | `number[]` | Entity up to root |
| `getDescendants(id)` | `number[]` | Depth-first order |
| `getRoot(id)` | `number` | Root of the hierarchy |
| `getSiblings(id)` | `number[]` | Other children of same parent |
| `getRootEntities()` | `number[]` | All root entities |
| `getChildAt(id, index)` | `number` | Child at index |
| `getChildIndex(parentId, childId)` | `number` | Index of child |
| `isDescendantOf(id, ancestorId)` | `boolean` | Relationship check |
| `isAncestorOf(id, descendantId)` | `boolean` | Relationship check |

## Parent-First Traversal

Iterate the hierarchy with guaranteed parent-first order (useful for transform propagation):

```typescript
// Callback-based traversal
world.forEachInHierarchy((entityId, parentId, depth) => {
  // Parents are always visited before their children
});

// Filter to specific subtrees
world.forEachInHierarchy(callback, { roots: [root.id] });

// Generator-based (supports early termination)
for (const { entityId, parentId, depth } of world.hierarchyIterator()) {
  if (depth > 2) break;
}
```

## Cascade Deletion

When removing entities, descendants are automatically removed by default:

```typescript
world.removeEntity(parent.id);
// All descendants are removed

// To orphan children instead:
world.removeEntity(parent.id, { cascade: false });
```

Hierarchy changes emit the `hierarchyChanged` event (see [Events](./events.md)).

**World position pattern**: `worldPos = localPos + parent.worldPos`. A parent's world position already includes all grandparents, so each entity only needs to combine its local position with its immediate parent's world position. The Transform plugin implements this automatically.
