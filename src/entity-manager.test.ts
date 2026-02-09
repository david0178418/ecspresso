import { expect, describe, test } from 'bun:test';
import EntityManager from './entity-manager';

interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	health: { value: number };
	collision: { radius: number; isColliding: boolean };
	damage: { value: number };
	lifetime: { remaining: number };
	state: { current: string; previous: string };
	name: { value: string };
}


describe('Entity Manager', () => {
	describe('type checks', () => {
		test('should allow type-safe component access', () => {
			const entityManager = new EntityManager<TestComponents>();
			const entity = entityManager.createEntity();

			// @ts-expect-error // TypeScript should complain if we try to access a non-existent component
			entity.components.doesNotExist;

			entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });

			const filteredComponents = entityManager.getEntitiesWithQuery(['position']);

			expect(filteredComponents.length).toBe(1);
			expect(entity.components.position?.x).toBe(0);
			expect(entity.components.velocity?.y).toBeUndefined();

			const entity2 = entityManager.createEntity();
			entityManager.addComponent(entity2.id, 'velocity', { x: 10, y: 20 });

			const filteredComponents2 = entityManager.getEntitiesWithQuery(['velocity']);
			const [filteredEntity2] = filteredComponents2;

			filteredEntity2?.components.velocity.y;

			try {
				// @ts-expect-error // TypeScript should complain if we try to access a non-existent component
				filteredComponents2.components.position.y;
			} catch {
				// expect error...
			}

			expect(filteredComponents2.length).toBe(1);
			expect(filteredEntity2?.components.velocity.x).toBe(10);
			expect(filteredEntity2?.components.position?.y).toBeUndefined();
			expect(entity2.components.velocity?.x).toBe(10);
			expect(entity2.components.position?.y).toBeUndefined();

			const filteredComponent3 = entityManager.getEntitiesWithQuery(['velocity'], ['position']);

			const [filteredEntity3] = filteredComponent3;

			filteredEntity3?.components.velocity.y;

			try {
				// @ts-expect-error // TypeScript should complain if we try to access a component that is excluded
				filteredEntity3.components.position;
			} catch {
				// expect error...
			}

			expect(filteredComponent3.length).toBe(1);
			expect(filteredEntity3?.components.velocity.x).toBe(10);
			expect(filteredEntity3).toBeDefined();
			expect(filteredEntity3 && Object.keys(filteredEntity3.components)).not.toInclude('position');
		});
	});

	// Callbacks tests
	describe('callbacks', () => {
		test('should call onComponentAdded callback when a component is added', () => {
			const manager = new EntityManager<TestComponents>();
			let callbackCount = 0;
			let callbackValue: TestComponents['health'] | undefined;
			let callbackEntityId = -1;
			const entity = manager.createEntity();
			manager.onComponentAdded('health', (value, ent) => {
				callbackCount++;
				callbackValue = value;
				callbackEntityId = ent.id;
			});
			manager.addComponent(entity.id, 'health', { value: 75 });
			expect(callbackCount).toBe(1);
			expect(callbackValue).toEqual({ value: 75 });
			expect(callbackEntityId).toBe(entity.id);
		});

		test('should call onComponentRemoved callback when a component is removed', () => {
			const manager = new EntityManager<TestComponents>();
			let callbackCount = 0;
			let callbackOldValue: TestComponents['state'] | undefined;
			let callbackEntityId = -1;
			const entity = manager.createEntity();
			manager.addComponent(entity.id, 'state', { current: 'start', previous: '' });
			manager.onComponentRemoved('state', (oldValue, ent) => {
				callbackCount++;
				callbackOldValue = oldValue;
				callbackEntityId = ent.id;
			});
			manager.removeComponent(entity.id, 'state');
			expect(callbackCount).toBe(1);
			expect(callbackOldValue).toEqual({ current: 'start', previous: '' });
			expect(callbackEntityId).toBe(entity.id);
		});

		test('onComponentAdded should return unsubscribe function', () => {
			const manager = new EntityManager<TestComponents>();
			let callbackCount = 0;
			const entity = manager.createEntity();

			const unsubscribe = manager.onComponentAdded('health', () => {
				callbackCount++;
			});

			manager.addComponent(entity.id, 'health', { value: 100 });
			expect(callbackCount).toBe(1);

			unsubscribe();

			const entity2 = manager.createEntity();
			manager.addComponent(entity2.id, 'health', { value: 50 });
			expect(callbackCount).toBe(1); // Should not increase after unsubscribe
		});

		test('onComponentRemoved should return unsubscribe function', () => {
			const manager = new EntityManager<TestComponents>();
			let callbackCount = 0;
			const entity1 = manager.createEntity();
			const entity2 = manager.createEntity();

			manager.addComponent(entity1.id, 'position', { x: 0, y: 0 });
			manager.addComponent(entity2.id, 'position', { x: 10, y: 10 });

			const unsubscribe = manager.onComponentRemoved('position', () => {
				callbackCount++;
			});

			manager.removeComponent(entity1.id, 'position');
			expect(callbackCount).toBe(1);

			unsubscribe();

			manager.removeComponent(entity2.id, 'position');
			expect(callbackCount).toBe(1); // Should not increase after unsubscribe
		});

		test('multiple callbacks for same component should all fire', () => {
			const manager = new EntityManager<TestComponents>();
			let count1 = 0;
			let count2 = 0;
			const entity = manager.createEntity();

			manager.onComponentAdded('velocity', () => { count1++; });
			manager.onComponentAdded('velocity', () => { count2++; });

			manager.addComponent(entity.id, 'velocity', { x: 5, y: 10 });

			expect(count1).toBe(1);
			expect(count2).toBe(1);
		});

		test('unsubscribe during callback execution should not affect current iteration', () => {
			const manager = new EntityManager<TestComponents>();
			const callOrder: string[] = [];
			const entity = manager.createEntity();

			let unsub2: (() => void) | undefined;

			manager.onComponentAdded('health', () => {
				callOrder.push('first');
				unsub2?.();
			});

			unsub2 = manager.onComponentAdded('health', () => {
				callOrder.push('second');
			});

			manager.addComponent(entity.id, 'health', { value: 100 });

			// Both callbacks should have been called despite unsubscribe during execution
			expect(callOrder).toEqual(['first', 'second']);

			// But subsequent adds should only call the first callback
			callOrder.length = 0;
			const entity2 = manager.createEntity();
			manager.addComponent(entity2.id, 'health', { value: 50 });
			expect(callOrder).toEqual(['first']);
		});
	});

	describe('hierarchy', () => {
		test('should set and get parent', () => {
			const manager = new EntityManager<TestComponents>();
			const parent = manager.createEntity();
			const child = manager.createEntity();

			manager.setParent(child.id, parent.id);

			expect(manager.getParent(child.id)).toBe(parent.id);
		});

		test('should get children', () => {
			const manager = new EntityManager<TestComponents>();
			const parent = manager.createEntity();
			const child1 = manager.createEntity();
			const child2 = manager.createEntity();

			manager.setParent(child1.id, parent.id);
			manager.setParent(child2.id, parent.id);

			expect(manager.getChildren(parent.id)).toEqual([child1.id, child2.id]);
		});

		test('should remove parent', () => {
			const manager = new EntityManager<TestComponents>();
			const parent = manager.createEntity();
			const child = manager.createEntity();

			manager.setParent(child.id, parent.id);
			manager.removeParent(child.id);

			expect(manager.getParent(child.id)).toBeNull();
		});

		test('spawnChild should create entity with parent', () => {
			const manager = new EntityManager<TestComponents>();
			const parent = manager.createEntity();
			manager.addComponent(parent.id, 'position', { x: 0, y: 0 });

			const child = manager.spawnChild(parent.id, { position: { x: 10, y: 10 } });

			expect(manager.getParent(child.id)).toBe(parent.id);
			expect(manager.getChildren(parent.id)).toEqual([child.id]);
			expect(child.components.position).toEqual({ x: 10, y: 10 });
		});

		test('removeEntity should cascade to descendants by default', () => {
			const manager = new EntityManager<TestComponents>();
			const parent = manager.createEntity();
			const child = manager.createEntity();
			const grandchild = manager.createEntity();

			manager.setParent(child.id, parent.id);
			manager.setParent(grandchild.id, child.id);

			manager.removeEntity(parent.id);

			expect(manager.getEntity(parent.id)).toBeUndefined();
			expect(manager.getEntity(child.id)).toBeUndefined();
			expect(manager.getEntity(grandchild.id)).toBeUndefined();
		});

		test('removeEntity with cascade:false should orphan children', () => {
			const manager = new EntityManager<TestComponents>();
			const parent = manager.createEntity();
			const child = manager.createEntity();

			manager.setParent(child.id, parent.id);

			manager.removeEntity(parent.id, { cascade: false });

			expect(manager.getEntity(parent.id)).toBeUndefined();
			expect(manager.getEntity(child.id)).toBeDefined();
			expect(manager.getParent(child.id)).toBeNull();
		});

		test('removeEntity should fire component removal callbacks for cascaded entities', () => {
			const manager = new EntityManager<TestComponents>();
			const parent = manager.createEntity();
			const child = manager.createEntity();

			manager.addComponent(parent.id, 'name', { value: 'parent' });
			manager.addComponent(child.id, 'name', { value: 'child' });
			manager.setParent(child.id, parent.id);

			const removedNames: string[] = [];
			manager.onComponentRemoved('name', (value) => {
				removedNames.push(value.value);
			});

			manager.removeEntity(parent.id);

			expect(removedNames.sort()).toEqual(['child', 'parent']);
		});

		test('traversal methods should delegate to hierarchy manager', () => {
			const manager = new EntityManager<TestComponents>();
			const root = manager.createEntity();
			const child1 = manager.createEntity();
			const child2 = manager.createEntity();
			const grandchild = manager.createEntity();

			manager.setParent(child1.id, root.id);
			manager.setParent(child2.id, root.id);
			manager.setParent(grandchild.id, child1.id);

			expect(manager.getAncestors(grandchild.id)).toEqual([child1.id, root.id]);
			expect(manager.getDescendants(root.id)).toEqual([child1.id, grandchild.id, child2.id]);
			expect(manager.getRoot(grandchild.id)).toBe(root.id);
			expect(manager.getSiblings(child1.id)).toEqual([child2.id]);
			expect(manager.isDescendantOf(grandchild.id, root.id)).toBe(true);
			expect(manager.isAncestorOf(root.id, grandchild.id)).toBe(true);
			expect(manager.getRootEntities()).toEqual([root.id]);
			expect(manager.getChildAt(root.id, 0)).toBe(child1.id);
			expect(manager.getChildIndex(root.id, child2.id)).toBe(1);
		});
	});

	describe('lifecycle hooks', () => {
		test('afterComponentAdded fires with correct entityId and componentName', () => {
			const manager = new EntityManager<TestComponents>();
			const entity = manager.createEntity();
			const calls: Array<{ entityId: number; componentName: keyof TestComponents }> = [];

			manager.onAfterComponentAdded((entityId, componentName) => {
				calls.push({ entityId, componentName });
			});

			manager.addComponent(entity.id, 'position', { x: 1, y: 2 });

			expect(calls).toEqual([{ entityId: entity.id, componentName: 'position' }]);
		});

		test('afterEntityMutated fires once after single addComponent', () => {
			const manager = new EntityManager<TestComponents>();
			const entity = manager.createEntity();
			const mutatedIds: number[] = [];

			manager.onAfterEntityMutated((entityId) => {
				mutatedIds.push(entityId);
			});

			manager.addComponent(entity.id, 'position', { x: 0, y: 0 });

			expect(mutatedIds).toEqual([entity.id]);
		});

		test('afterEntityMutated fires once (not N times) after addComponents with N components', () => {
			const manager = new EntityManager<TestComponents>();
			const entity = manager.createEntity();
			const mutatedIds: number[] = [];

			manager.onAfterEntityMutated((entityId) => {
				mutatedIds.push(entityId);
			});

			manager.addComponents(entity.id, {
				position: { x: 0, y: 0 },
				velocity: { x: 1, y: 1 },
				health: { value: 100 },
			});

			expect(mutatedIds).toEqual([entity.id]);
		});

		test('afterComponentAdded fires N times during addComponents (before batch flush)', () => {
			const manager = new EntityManager<TestComponents>();
			const entity = manager.createEntity();
			const addedComponents: Array<keyof TestComponents> = [];

			manager.onAfterComponentAdded((_entityId, componentName) => {
				addedComponents.push(componentName);
			});

			manager.addComponents(entity.id, {
				position: { x: 0, y: 0 },
				velocity: { x: 1, y: 1 },
				health: { value: 100 },
			});

			expect(addedComponents).toEqual(['position', 'velocity', 'health']);
		});

		test('afterComponentRemoved fires with correct entityId and componentName', () => {
			const manager = new EntityManager<TestComponents>();
			const entity = manager.createEntity();
			manager.addComponent(entity.id, 'position', { x: 0, y: 0 });

			const calls: Array<{ entityId: number; componentName: keyof TestComponents }> = [];

			manager.onAfterComponentRemoved((entityId, componentName) => {
				calls.push({ entityId, componentName });
			});

			manager.removeComponent(entity.id, 'position');

			expect(calls).toEqual([{ entityId: entity.id, componentName: 'position' }]);
		});

		test('beforeEntityRemoved fires before entity is deleted (entity still accessible)', () => {
			const manager = new EntityManager<TestComponents>();
			const entity = manager.createEntity();
			manager.addComponent(entity.id, 'health', { value: 50 });

			let entityWasAccessible = false;

			manager.onBeforeEntityRemoved((entityId) => {
				const e = manager.getEntity(entityId);
				entityWasAccessible = e !== undefined && 'health' in e.components;
			});

			manager.removeEntity(entity.id);

			expect(entityWasAccessible).toBe(true);
			expect(manager.getEntity(entity.id)).toBeUndefined();
		});

		test('beforeEntityRemoved fires for descendants in cascade removal', () => {
			const manager = new EntityManager<TestComponents>();
			const parent = manager.createEntity();
			const child = manager.createEntity();
			const grandchild = manager.createEntity();

			manager.setParent(child.id, parent.id);
			manager.setParent(grandchild.id, child.id);

			const removedIds: number[] = [];

			manager.onBeforeEntityRemoved((entityId) => {
				removedIds.push(entityId);
			});

			manager.removeEntity(parent.id);

			// Descendants should fire first (reverse order), then the entity itself
			expect(removedIds).toContain(parent.id);
			expect(removedIds).toContain(child.id);
			expect(removedIds).toContain(grandchild.id);
			// Descendants before the entity
			expect(removedIds.indexOf(grandchild.id)).toBeLessThan(removedIds.indexOf(parent.id));
		});

		test('afterParentChanged fires after setParent', () => {
			const manager = new EntityManager<TestComponents>();
			const parent = manager.createEntity();
			const child = manager.createEntity();
			const calls: number[] = [];

			manager.onAfterParentChanged((childId) => {
				calls.push(childId);
			});

			manager.setParent(child.id, parent.id);

			expect(calls).toEqual([child.id]);
		});

		test('afterParentChanged fires after removeParent', () => {
			const manager = new EntityManager<TestComponents>();
			const parent = manager.createEntity();
			const child = manager.createEntity();
			manager.setParent(child.id, parent.id);

			const calls: number[] = [];

			manager.onAfterParentChanged((childId) => {
				calls.push(childId);
			});

			manager.removeParent(child.id);

			expect(calls).toEqual([child.id]);
		});

		test('afterParentChanged does NOT fire when removeParent returns false (no parent)', () => {
			const manager = new EntityManager<TestComponents>();
			const entity = manager.createEntity();
			const calls: number[] = [];

			manager.onAfterParentChanged((childId) => {
				calls.push(childId);
			});

			const result = manager.removeParent(entity.id);

			expect(result).toBe(false);
			expect(calls).toEqual([]);
		});

		test('unsubscribe works for each hook type', () => {
			const manager = new EntityManager<TestComponents>();
			const entity = manager.createEntity();
			const parent = manager.createEntity();
			const calls: string[] = [];

			const unsub1 = manager.onAfterComponentAdded(() => { calls.push('added'); });
			const unsub2 = manager.onAfterEntityMutated(() => { calls.push('mutated'); });
			const unsub3 = manager.onAfterComponentRemoved(() => { calls.push('removed'); });
			const unsub4 = manager.onBeforeEntityRemoved(() => { calls.push('entityRemoved'); });
			const unsub5 = manager.onAfterParentChanged(() => { calls.push('parentChanged'); });

			// Unsubscribe all
			unsub1();
			unsub2();
			unsub3();
			unsub4();
			unsub5();

			manager.addComponent(entity.id, 'position', { x: 0, y: 0 });
			manager.removeComponent(entity.id, 'position');
			manager.setParent(entity.id, parent.id);
			manager.removeParent(entity.id);
			manager.removeEntity(parent.id);

			expect(calls).toEqual([]);
		});

		test('recursive addComponent during batch (from afterComponentAdded hook) defers afterEntityMutated', () => {
			const manager = new EntityManager<TestComponents>();
			const entity = manager.createEntity();
			const mutatedIds: number[] = [];
			const addedComponents: Array<keyof TestComponents> = [];

			// Hook that recursively adds a component when 'position' is added
			manager.onAfterComponentAdded((entityId, componentName) => {
				addedComponents.push(componentName);
				if (componentName === 'position') {
					const e = manager.getEntity(entityId);
					if (e && !('velocity' in e.components)) {
						manager.addComponent(entityId, 'velocity', { x: 0, y: 0 });
					}
				}
			});

			manager.onAfterEntityMutated((entityId) => {
				mutatedIds.push(entityId);
			});

			// Single addComponent should trigger recursive add, but afterEntityMutated only once at the end
			manager.addComponent(entity.id, 'position', { x: 1, y: 1 });

			expect(addedComponents).toEqual(['position', 'velocity']);
			// afterEntityMutated should fire once after the recursion completes
			expect(mutatedIds).toEqual([entity.id]);
		});

		test('afterComponentRemoved does NOT fire when removing a component that does not exist', () => {
			const manager = new EntityManager<TestComponents>();
			const entity = manager.createEntity();
			const calls: Array<keyof TestComponents> = [];

			manager.onAfterComponentRemoved((_entityId, componentName) => {
				calls.push(componentName);
			});

			// Remove a component that was never added
			manager.removeComponent(entity.id, 'position');

			expect(calls).toEqual([]);
		});
	});
});
