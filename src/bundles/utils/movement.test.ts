import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import {
	createMovementBundle,
	createPosition,
	createVelocity,
	createMovable,
	type MovementComponentTypes,
} from './movement';

interface TestComponents extends MovementComponentTypes {
	tag: string;
}

interface TestEvents {}

interface TestResources {}

describe('Movement Bundle', () => {
	describe('Position updates', () => {
		test('should update position by velocity × deltaTime', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				position: { x: 100, y: 100 },
				velocity: { x: 50, y: -25 },
			});

			ecs.update(0.5);

			const position = ecs.entityManager.getComponent(entity.id, 'position');
			expect(position?.x).toBe(125); // 100 + 50 * 0.5
			expect(position?.y).toBe(87.5); // 100 + (-25) * 0.5
		});

		test('should leave position unchanged with zero velocity', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				position: { x: 50, y: 75 },
				velocity: { x: 0, y: 0 },
			});

			ecs.update(1.0);

			const position = ecs.entityManager.getComponent(entity.id, 'position');
			expect(position?.x).toBe(50);
			expect(position?.y).toBe(75);
		});

		test('should decrease position with negative velocity', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				position: { x: 200, y: 300 },
				velocity: { x: -100, y: -150 },
			});

			ecs.update(1.0);

			const position = ecs.entityManager.getComponent(entity.id, 'position');
			expect(position?.x).toBe(100);
			expect(position?.y).toBe(150);
		});

		test('should update all moving entities', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createMovementBundle())
				.build();

			const entity1 = ecs.spawn({
				position: { x: 0, y: 0 },
				velocity: { x: 10, y: 20 },
			});

			const entity2 = ecs.spawn({
				position: { x: 100, y: 100 },
				velocity: { x: -5, y: 15 },
			});

			const entity3 = ecs.spawn({
				position: { x: 50, y: 50 },
				velocity: { x: 0, y: -30 },
			});

			ecs.update(1.0);

			const pos1 = ecs.entityManager.getComponent(entity1.id, 'position');
			const pos2 = ecs.entityManager.getComponent(entity2.id, 'position');
			const pos3 = ecs.entityManager.getComponent(entity3.id, 'position');

			expect(pos1?.x).toBe(10);
			expect(pos1?.y).toBe(20);

			expect(pos2?.x).toBe(95);
			expect(pos2?.y).toBe(115);

			expect(pos3?.x).toBe(50);
			expect(pos3?.y).toBe(20);
		});
	});

	describe('Query filtering', () => {
		test('should ignore entities with only position', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				position: { x: 100, y: 100 },
			});

			ecs.update(1.0);

			const position = ecs.entityManager.getComponent(entity.id, 'position');
			expect(position?.x).toBe(100);
			expect(position?.y).toBe(100);
		});

		test('should ignore entities with only velocity', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				velocity: { x: 50, y: 50 },
			});

			// Should not throw and velocity should remain unchanged
			ecs.update(1.0);

			const velocity = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(velocity?.x).toBe(50);
			expect(velocity?.y).toBe(50);
		});
	});

	describe('Helper functions', () => {
		test('createPosition should return correct shape', () => {
			const result = createPosition(10, 20);
			expect(result).toEqual({
				position: { x: 10, y: 20 },
			});
		});

		test('createVelocity should return correct shape', () => {
			const result = createVelocity(30, -40);
			expect(result).toEqual({
				velocity: { x: 30, y: -40 },
			});
		});

		test('createMovable should return both components', () => {
			const result = createMovable(100, 200, 50, -25);
			expect(result).toEqual({
				position: { x: 100, y: 200 },
				velocity: { x: 50, y: -25 },
			});
		});

		test('createMovable should default velocity to zero', () => {
			const result = createMovable(100, 200);
			expect(result).toEqual({
				position: { x: 100, y: 200 },
				velocity: { x: 0, y: 0 },
			});
		});

		test('helpers should work with ecs.spawn', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				...createMovable(50, 75, 10, 20),
			});

			ecs.update(1.0);

			const position = ecs.entityManager.getComponent(entity.id, 'position');
			expect(position?.x).toBe(60);
			expect(position?.y).toBe(95);
		});
	});

	describe('Bundle options', () => {
		test('should use default system group and priority', () => {
			const bundle = createMovementBundle();
			const builders = bundle.getSystemBuilders();

			expect(builders.length).toBe(1);
			const builder = builders[0];
			if (!builder) throw new Error('Expected builder');
			expect(builder.label).toBe('movement');
		});

		test('should work with custom options', () => {
			// Verify bundle factory accepts options without error
			const bundle = createMovementBundle({ systemGroup: 'custom-physics', priority: 50 });
			const builders = bundle.getSystemBuilders();

			expect(builders.length).toBe(1);
		});

		test('should disable with system group', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createMovementBundle({ systemGroup: 'physics' }))
				.build();

			const entity = ecs.spawn({
				position: { x: 100, y: 100 },
				velocity: { x: 50, y: 50 },
			});

			// Disable the physics group
			ecs.disableSystemGroup('physics');
			ecs.update(1.0);

			// Position should not have changed
			const position = ecs.entityManager.getComponent(entity.id, 'position');
			expect(position?.x).toBe(100);
			expect(position?.y).toBe(100);

			// Enable and update
			ecs.enableSystemGroup('physics');
			ecs.update(1.0);

			const updatedPosition = ecs.entityManager.getComponent(entity.id, 'position');
			expect(updatedPosition?.x).toBe(150);
			expect(updatedPosition?.y).toBe(150);
		});
	});
});
