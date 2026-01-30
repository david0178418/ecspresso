import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import {
	createMovementBundle,
	createVelocity,
	type MovementComponentTypes,
} from './movement';
import { createTransform, createTransformBundle } from './transform';

interface TestComponents extends MovementComponentTypes {
	tag: string;
}

interface TestEvents {}

interface TestResources {}

describe('Movement Bundle', () => {
	describe('Position updates', () => {
		test('should update localTransform by velocity × deltaTime', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createVelocity(50, -25),
			});

			ecs.update(0.5);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(125); // 100 + 50 * 0.5
			expect(localTransform?.y).toBe(87.5); // 100 + (-25) * 0.5
		});

		test('should leave position unchanged with zero velocity', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(50, 75),
				...createVelocity(0, 0),
			});

			ecs.update(1.0);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(50);
			expect(localTransform?.y).toBe(75);
		});

		test('should decrease position with negative velocity', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(200, 300),
				...createVelocity(-100, -150),
			});

			ecs.update(1.0);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(100);
			expect(localTransform?.y).toBe(150);
		});

		test('should update all moving entities', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createMovementBundle())
				.build();

			const entity1 = ecs.spawn({
				...createTransform(0, 0),
				...createVelocity(10, 20),
			});

			const entity2 = ecs.spawn({
				...createTransform(100, 100),
				...createVelocity(-5, 15),
			});

			const entity3 = ecs.spawn({
				...createTransform(50, 50),
				...createVelocity(0, -30),
			});

			ecs.update(1.0);

			const pos1 = ecs.entityManager.getComponent(entity1.id, 'localTransform');
			const pos2 = ecs.entityManager.getComponent(entity2.id, 'localTransform');
			const pos3 = ecs.entityManager.getComponent(entity3.id, 'localTransform');

			expect(pos1?.x).toBe(10);
			expect(pos1?.y).toBe(20);

			expect(pos2?.x).toBe(95);
			expect(pos2?.y).toBe(115);

			expect(pos3?.x).toBe(50);
			expect(pos3?.y).toBe(20);
		});
	});

	describe('Query filtering', () => {
		test('should ignore entities with only localTransform', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(100, 100),
			});

			ecs.update(1.0);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(100);
			expect(localTransform?.y).toBe(100);
		});

		test('should ignore entities with only velocity', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				...createVelocity(50, 50),
			});

			// Should not throw and velocity should remain unchanged
			ecs.update(1.0);

			const velocity = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(velocity?.x).toBe(50);
			expect(velocity?.y).toBe(50);
		});
	});

	describe('Helper functions', () => {
		test('createVelocity should return correct shape', () => {
			const result = createVelocity(30, -40);
			expect(result).toEqual({
				velocity: { x: 30, y: -40 },
			});
		});

		test('helpers should work with ecs.spawn', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(50, 75),
				...createVelocity(10, 20),
			});

			ecs.update(1.0);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(60);
			expect(localTransform?.y).toBe(95);
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
				.withBundle(createTransformBundle())
				.withBundle(createMovementBundle({ systemGroup: 'physics' }))
				.build();

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createVelocity(50, 50),
			});

			// Disable the physics group
			ecs.disableSystemGroup('physics');
			ecs.update(1.0);

			// Position should not have changed
			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(100);
			expect(localTransform?.y).toBe(100);

			// Enable and update
			ecs.enableSystemGroup('physics');
			ecs.update(1.0);

			const updatedTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(updatedTransform?.x).toBe(150);
			expect(updatedTransform?.y).toBe(150);
		});
	});

	describe('Change detection', () => {
		test('should mark localTransform as changed after velocity integration', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createVelocity(50, -25),
			});

			const seqBefore = ecs.entityManager.changeSeq;
			ecs.update(0.5);

			const changeSeq = ecs.entityManager.getChangeSeq(entity.id, 'localTransform');
			expect(changeSeq).toBeGreaterThan(seqBefore);
		});

		test('should mark localTransform even with zero velocity', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(50, 75),
				...createVelocity(0, 0),
			});

			const seqBefore = ecs.entityManager.changeSeq;
			ecs.update(1.0);

			const changeSeq = ecs.entityManager.getChangeSeq(entity.id, 'localTransform');
			expect(changeSeq).toBeGreaterThan(seqBefore);
		});
	});

	describe('Integration with transform propagation', () => {
		test('should update worldTransform after movement', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.withBundle(createMovementBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createVelocity(50, 50),
			});

			ecs.update(1.0);

			const worldTransform = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			expect(worldTransform?.x).toBe(150);
			expect(worldTransform?.y).toBe(150);
		});
	});
});
