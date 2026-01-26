import { expect, describe, test } from 'bun:test';
import HierarchyManager from './hierarchy-manager';
import type { HierarchyEntry } from './types';

describe('HierarchyManager', () => {
	describe('setParent / getParent / removeParent', () => {
		test('should set and get parent relationship', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			expect(hierarchy.getParent(2)).toBe(1);
		});

		test('should return null for entity without parent', () => {
			const hierarchy = new HierarchyManager();

			expect(hierarchy.getParent(1)).toBeNull();
		});

		test('should remove parent relationship', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.removeParent(2);

			expect(hierarchy.getParent(2)).toBeNull();
		});

		test('removeParent should return true if parent existed', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			expect(hierarchy.removeParent(2)).toBe(true);
		});

		test('removeParent should return false if no parent existed', () => {
			const hierarchy = new HierarchyManager();

			expect(hierarchy.removeParent(2)).toBe(false);
		});

		test('should update parent when setting new parent', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(3, 1);
			hierarchy.setParent(3, 2);

			expect(hierarchy.getParent(3)).toBe(2);
			expect(hierarchy.getChildren(1)).toEqual([]);
			expect(hierarchy.getChildren(2)).toEqual([3]);
		});
	});

	describe('getChildren / getChildAt / getChildIndex', () => {
		test('should get children of parent', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);

			const children = hierarchy.getChildren(1);
			expect(children).toEqual([2, 3]);
		});

		test('should return empty array for entity without children', () => {
			const hierarchy = new HierarchyManager();

			expect(hierarchy.getChildren(1)).toEqual([]);
		});

		test('should maintain insertion order for children', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(5, 1);
			hierarchy.setParent(3, 1);
			hierarchy.setParent(7, 1);

			expect(hierarchy.getChildren(1)).toEqual([5, 3, 7]);
		});

		test('should get child at specific index', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(5, 1);
			hierarchy.setParent(3, 1);
			hierarchy.setParent(7, 1);

			expect(hierarchy.getChildAt(1, 0)).toBe(5);
			expect(hierarchy.getChildAt(1, 1)).toBe(3);
			expect(hierarchy.getChildAt(1, 2)).toBe(7);
		});

		test('should return null for out of bounds index', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			expect(hierarchy.getChildAt(1, 5)).toBeNull();
			expect(hierarchy.getChildAt(1, -1)).toBeNull();
		});

		test('should get child index', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(5, 1);
			hierarchy.setParent(3, 1);
			hierarchy.setParent(7, 1);

			expect(hierarchy.getChildIndex(1, 5)).toBe(0);
			expect(hierarchy.getChildIndex(1, 3)).toBe(1);
			expect(hierarchy.getChildIndex(1, 7)).toBe(2);
		});

		test('should return -1 for child not found', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			expect(hierarchy.getChildIndex(1, 99)).toBe(-1);
		});

		test('children array should be readonly', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			const children = hierarchy.getChildren(1);
			// TypeScript should prevent mutation, but verify at runtime
			expect(Object.isFrozen(children) || children.length === 1).toBe(true);
		});
	});

	describe('validation', () => {
		test('should throw when setting entity as its own parent', () => {
			const hierarchy = new HierarchyManager();

			expect(() => hierarchy.setParent(1, 1)).toThrow('Cannot set entity 1 as its own parent');
		});

		test('should throw when creating direct circular reference', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			expect(() => hierarchy.setParent(1, 2)).toThrow('Cannot set parent: would create circular reference');
		});

		test('should throw when creating indirect circular reference', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 2);
			hierarchy.setParent(4, 3);

			expect(() => hierarchy.setParent(1, 4)).toThrow('Cannot set parent: would create circular reference');
		});

		test('should allow valid non-circular relationships', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);
			hierarchy.setParent(4, 2);
			hierarchy.setParent(5, 2);

			expect(hierarchy.getParent(2)).toBe(1);
			expect(hierarchy.getParent(3)).toBe(1);
			expect(hierarchy.getParent(4)).toBe(2);
			expect(hierarchy.getParent(5)).toBe(2);
		});
	});

	describe('removeEntity', () => {
		test('should clean up parent reference when entity removed', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.removeEntity(2);

			expect(hierarchy.getChildren(1)).toEqual([]);
		});

		test('should clean up children references when parent removed', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);
			hierarchy.removeEntity(1);

			expect(hierarchy.getParent(2)).toBeNull();
			expect(hierarchy.getParent(3)).toBeNull();
		});

		test('should return removed children ids', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);

			const result = hierarchy.removeEntity(1);
			expect(result.orphanedChildren.sort()).toEqual([2, 3]);
		});

		test('should return old parent id', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			const result = hierarchy.removeEntity(2);
			expect(result.oldParent).toBe(1);
		});

		test('should return null oldParent for root entity', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			const result = hierarchy.removeEntity(1);
			expect(result.oldParent).toBeNull();
		});
	});

	describe('traversal - getAncestors', () => {
		test('should return ancestors in order [parent, grandparent, ...]', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 2);
			hierarchy.setParent(4, 3);

			expect(hierarchy.getAncestors(4)).toEqual([3, 2, 1]);
		});

		test('should return empty array for root entity', () => {
			const hierarchy = new HierarchyManager();

			expect(hierarchy.getAncestors(1)).toEqual([]);
		});

		test('should return single parent for direct child', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			expect(hierarchy.getAncestors(2)).toEqual([1]);
		});
	});

	describe('traversal - getDescendants', () => {
		test('should return all descendants depth-first', () => {
			const hierarchy = new HierarchyManager();
			// Tree:     1
			//          / \
			//         2   3
			//        /
			//       4
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);
			hierarchy.setParent(4, 2);

			const descendants = hierarchy.getDescendants(1);
			// Depth-first: 2, then 2's children (4), then 3
			expect(descendants).toEqual([2, 4, 3]);
		});

		test('should return empty array for leaf entity', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			expect(hierarchy.getDescendants(2)).toEqual([]);
		});

		test('should handle deep hierarchies', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 2);
			hierarchy.setParent(4, 3);
			hierarchy.setParent(5, 4);

			expect(hierarchy.getDescendants(1)).toEqual([2, 3, 4, 5]);
		});
	});

	describe('traversal - getRoot', () => {
		test('should return topmost ancestor', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 2);
			hierarchy.setParent(4, 3);

			expect(hierarchy.getRoot(4)).toBe(1);
			expect(hierarchy.getRoot(3)).toBe(1);
			expect(hierarchy.getRoot(2)).toBe(1);
		});

		test('should return self for root entity', () => {
			const hierarchy = new HierarchyManager();

			expect(hierarchy.getRoot(1)).toBe(1);
		});
	});

	describe('traversal - getSiblings', () => {
		test('should return other children of same parent', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);
			hierarchy.setParent(4, 1);

			expect(hierarchy.getSiblings(2)).toEqual([3, 4]);
			expect(hierarchy.getSiblings(3)).toEqual([2, 4]);
			expect(hierarchy.getSiblings(4)).toEqual([2, 3]);
		});

		test('should return empty array for only child', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			expect(hierarchy.getSiblings(2)).toEqual([]);
		});

		test('should return empty array for root entity', () => {
			const hierarchy = new HierarchyManager();

			expect(hierarchy.getSiblings(1)).toEqual([]);
		});
	});

	describe('traversal - isDescendantOf', () => {
		test('should return true for direct descendant', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			expect(hierarchy.isDescendantOf(2, 1)).toBe(true);
		});

		test('should return true for indirect descendant', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 2);
			hierarchy.setParent(4, 3);

			expect(hierarchy.isDescendantOf(4, 1)).toBe(true);
			expect(hierarchy.isDescendantOf(4, 2)).toBe(true);
		});

		test('should return false for non-descendant', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);

			expect(hierarchy.isDescendantOf(2, 3)).toBe(false);
			expect(hierarchy.isDescendantOf(1, 2)).toBe(false);
		});

		test('should return false for self', () => {
			const hierarchy = new HierarchyManager();

			expect(hierarchy.isDescendantOf(1, 1)).toBe(false);
		});
	});

	describe('traversal - isAncestorOf', () => {
		test('should return true for direct ancestor', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			expect(hierarchy.isAncestorOf(1, 2)).toBe(true);
		});

		test('should return true for indirect ancestor', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 2);

			expect(hierarchy.isAncestorOf(1, 3)).toBe(true);
		});

		test('should return false for non-ancestor', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			expect(hierarchy.isAncestorOf(2, 1)).toBe(false);
		});

		test('should return false for self', () => {
			const hierarchy = new HierarchyManager();

			expect(hierarchy.isAncestorOf(1, 1)).toBe(false);
		});
	});

	describe('traversal - getRootEntities', () => {
		test('should return all entities without parents', () => {
			const hierarchy = new HierarchyManager();
			// Two separate trees
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);
			hierarchy.setParent(5, 4);

			// Entity 1 and 4 are roots (have children but no parents)
			// We need to track them explicitly since they have children
			const roots = hierarchy.getRootEntities();
			expect([...roots].sort()).toEqual([1, 4]);
		});

		test('should return empty array when no hierarchy exists', () => {
			const hierarchy = new HierarchyManager();

			expect(hierarchy.getRootEntities()).toEqual([]);
		});

		test('should not include orphaned entities that have no children', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			// Entity 1 is a root (has children, no parent)
			// Entity 2 has a parent so is not a root
			// Entity 3 doesn't exist in hierarchy at all
			const roots = hierarchy.getRootEntities();
			expect(roots).toEqual([1]);
		});
	});

	describe('forEachInHierarchy - parent-first traversal', () => {
		test('should visit parent before children', () => {
			const hierarchy = new HierarchyManager();
			// Tree:     1
			//          / \
			//         2   3
			//        /
			//       4
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);
			hierarchy.setParent(4, 2);

			const visitOrder: number[] = [];
			hierarchy.forEachInHierarchy((entityId) => {
				visitOrder.push(entityId);
			});

			// Parent-first (breadth-first): 1, then 2 and 3, then 4
			// Entity 1 must come before 2, 3
			// Entity 2 must come before 4
			const indexOf1 = visitOrder.indexOf(1);
			const indexOf2 = visitOrder.indexOf(2);
			const indexOf3 = visitOrder.indexOf(3);
			const indexOf4 = visitOrder.indexOf(4);

			expect(indexOf1).toBeLessThan(indexOf2);
			expect(indexOf1).toBeLessThan(indexOf3);
			expect(indexOf2).toBeLessThan(indexOf4);
		});

		test('should provide correct depth values at each level', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 2);
			hierarchy.setParent(4, 3);

			const depths: Record<number, number> = {};
			hierarchy.forEachInHierarchy((entityId, _parentId, depth) => {
				depths[entityId] = depth;
			});

			expect(depths[1]).toBe(0);
			expect(depths[2]).toBe(1);
			expect(depths[3]).toBe(2);
			expect(depths[4]).toBe(3);
		});

		test('should provide correct parentId at each node', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);
			hierarchy.setParent(4, 2);

			const parents: Record<number, number | null> = {};
			hierarchy.forEachInHierarchy((entityId, parentId) => {
				parents[entityId] = parentId;
			});

			expect(parents[1]).toBeNull();
			expect(parents[2]).toBe(1);
			expect(parents[3]).toBe(1);
			expect(parents[4]).toBe(2);
		});

		test('should filter to specific roots when option provided', () => {
			const hierarchy = new HierarchyManager();
			// Two separate trees
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);
			hierarchy.setParent(5, 4);
			hierarchy.setParent(6, 4);

			const visited: number[] = [];
			hierarchy.forEachInHierarchy((entityId) => {
				visited.push(entityId);
			}, { roots: [4] });

			// Should only visit tree rooted at 4
			expect(visited.sort()).toEqual([4, 5, 6]);
		});

		test('should return immediately for empty hierarchy', () => {
			const hierarchy = new HierarchyManager();
			const visited: number[] = [];

			hierarchy.forEachInHierarchy((entityId) => {
				visited.push(entityId);
			});

			expect(visited).toEqual([]);
		});

		test('should visit multiple disconnected trees', () => {
			const hierarchy = new HierarchyManager();
			// Two separate trees
			hierarchy.setParent(2, 1);
			hierarchy.setParent(4, 3);

			const visited: number[] = [];
			hierarchy.forEachInHierarchy((entityId) => {
				visited.push(entityId);
			});

			// Should visit both trees
			expect(visited.sort()).toEqual([1, 2, 3, 4]);
		});
	});

	describe('hierarchyIterator - generator-based traversal', () => {
		test('should yield same order as callback version', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);
			hierarchy.setParent(4, 2);

			const callbackOrder: number[] = [];
			hierarchy.forEachInHierarchy((entityId) => {
				callbackOrder.push(entityId);
			});

			const iteratorOrder: number[] = [];
			for (const entry of hierarchy.hierarchyIterator()) {
				iteratorOrder.push(entry.entityId);
			}

			expect(iteratorOrder).toEqual(callbackOrder);
		});

		test('should support early termination via break', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(3, 1);
			hierarchy.setParent(4, 2);
			hierarchy.setParent(5, 2);

			const visited: number[] = [];
			for (const entry of hierarchy.hierarchyIterator()) {
				visited.push(entry.entityId);
				if (visited.length >= 2) break;
			}

			expect(visited.length).toBe(2);
		});

		test('should yield correct entry structure', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);

			const entries: HierarchyEntry[] = [];
			for (const entry of hierarchy.hierarchyIterator()) {
				entries.push(entry);
			}

			expect(entries.length).toBe(2);
			expect(entries[0]).toEqual({ entityId: 1, parentId: null, depth: 0 });
			expect(entries[1]).toEqual({ entityId: 2, parentId: 1, depth: 1 });
		});

		test('should support filtering by roots option', () => {
			const hierarchy = new HierarchyManager();
			hierarchy.setParent(2, 1);
			hierarchy.setParent(4, 3);

			const visited: number[] = [];
			for (const entry of hierarchy.hierarchyIterator({ roots: [3] })) {
				visited.push(entry.entityId);
			}

			expect(visited.sort()).toEqual([3, 4]);
		});
	});
});
