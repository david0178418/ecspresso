import { expect, describe, test } from 'bun:test';
import { EntityManager } from '../dist';

interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	health: { value: number };
	collision: { radius: number; isColliding: boolean };
	damage: { value: number };
	lifetime: { remaining: number };
	state: { current: string; previous: string };
}


describe('Entity Manager', () => {
	describe('type checks', () => {
		test('should allow type-safe component access', () => {
			const entityManager = new EntityManager<TestComponents>();
			const entity = entityManager.createEntity();

			// @ts-expect-error // TypeScript should complain if we try to access a non-existent component
			entity.components.doesNotExist;

			entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });

			const filteredComponent = entityManager.getEntitiesWithComponents(['position']);

			expect(filteredComponent.length).toBe(1);
			expect(entity.components.position?.x).toBe(0);
			expect(entity.components.velocity?.y).toBeUndefined();

			const entity2 = entityManager.createEntity();
			entityManager.addComponent(entity2.id, 'velocity', { x: 10, y: 20 });

			const filteredComponent2 = entityManager.getEntitiesWithComponents(['velocity']);

			filteredComponent2[0].components.velocity.y;

			try {
				// @ts-expect-error // TypeScript should complain if we try to access a non-existent component
				filteredComponent2[0].components.position.y;
			} catch {
				// expect error...
			}

			expect(filteredComponent2.length).toBe(1);
			expect(entity2.components.velocity?.x).toBe(10);
			expect(entity2.components.position?.y).toBeUndefined();

			const filteredComponent3 = entityManager.getEntitiesWithComponents(['velocity'], ['position']);

			const entity3 = filteredComponent3[0];

			entity3.components.velocity.y;

			try {
				// @ts-expect-error // TypeScript should complain if we try to access a component that is excluded
				entity3.components.position;
			} catch {
				// expect error...
			}

			expect(filteredComponent3.length).toBe(1);
			expect(entity3.components.velocity.x).toBe(10);
			expect(Object.keys(entity3.components)).not.toInclude('position');
		});
	});
});
