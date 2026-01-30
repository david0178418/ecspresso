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

const FIXED_DT = 1 / 60;

function createEcs(fixedDt = FIXED_DT) {
	return ECSpresso
		.create<TestComponents, TestEvents, TestResources>()
		.withBundle(createTransformBundle())
		.withBundle(createMovementBundle())
		.withFixedTimestep(fixedDt)
		.build();
}

describe('Movement Bundle', () => {
	describe('Position updates', () => {
		test('should update localTransform by velocity × fixedDt per step', () => {
			const ecs = createEcs();

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createVelocity(60, -30),
			});

			// One fixed step
			ecs.update(FIXED_DT);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBeCloseTo(101, 5); // 100 + 60 * (1/60)
			expect(localTransform?.y).toBeCloseTo(99.5, 5); // 100 + (-30) * (1/60)
		});

		test('should accumulate across multiple fixed steps', () => {
			const ecs = createEcs();

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createVelocity(60, -30),
			});

			// Three fixed steps
			ecs.update(3 * FIXED_DT);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBeCloseTo(103, 5); // 100 + 60 * 3 * (1/60)
			expect(localTransform?.y).toBeCloseTo(98.5, 5); // 100 + (-30) * 3 * (1/60)
		});

		test('should leave position unchanged with zero velocity', () => {
			const ecs = createEcs();

			const entity = ecs.spawn({
				...createTransform(50, 75),
				...createVelocity(0, 0),
			});

			ecs.update(FIXED_DT);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(50);
			expect(localTransform?.y).toBe(75);
		});

		test('should decrease position with negative velocity', () => {
			const ecs = createEcs();

			const entity = ecs.spawn({
				...createTransform(200, 300),
				...createVelocity(-600, -900),
			});

			// One fixed step: -600 * (1/60) = -10, -900 * (1/60) = -15
			ecs.update(FIXED_DT);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBeCloseTo(190, 5);
			expect(localTransform?.y).toBeCloseTo(285, 5);
		});

		test('should update all moving entities', () => {
			const ecs = createEcs();

			const entity1 = ecs.spawn({
				...createTransform(0, 0),
				...createVelocity(600, 1200),
			});

			const entity2 = ecs.spawn({
				...createTransform(100, 100),
				...createVelocity(-300, 900),
			});

			const entity3 = ecs.spawn({
				...createTransform(50, 50),
				...createVelocity(0, -1800),
			});

			// One fixed step
			ecs.update(FIXED_DT);

			const pos1 = ecs.entityManager.getComponent(entity1.id, 'localTransform');
			const pos2 = ecs.entityManager.getComponent(entity2.id, 'localTransform');
			const pos3 = ecs.entityManager.getComponent(entity3.id, 'localTransform');

			expect(pos1?.x).toBeCloseTo(10, 5);   // 0 + 600/60
			expect(pos1?.y).toBeCloseTo(20, 5);   // 0 + 1200/60

			expect(pos2?.x).toBeCloseTo(95, 5);   // 100 + (-300)/60
			expect(pos2?.y).toBeCloseTo(115, 5);  // 100 + 900/60

			expect(pos3?.x).toBeCloseTo(50, 5);   // 0 velocity
			expect(pos3?.y).toBeCloseTo(20, 5);   // 50 + (-1800)/60
		});

		test('should not move when frame delta is less than fixedDt', () => {
			const ecs = createEcs();

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createVelocity(600, 600),
			});

			// Half a fixed step — accumulator not enough to trigger
			ecs.update(FIXED_DT / 2);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(100);
			expect(localTransform?.y).toBe(100);
		});
	});

	describe('Query filtering', () => {
		test('should ignore entities with only localTransform', () => {
			const ecs = createEcs();

			const entity = ecs.spawn({
				...createTransform(100, 100),
			});

			ecs.update(FIXED_DT);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(100);
			expect(localTransform?.y).toBe(100);
		});

		test('should ignore entities with only velocity', () => {
			const ecs = createEcs();

			const entity = ecs.spawn({
				...createVelocity(50, 50),
			});

			// Should not throw and velocity should remain unchanged
			ecs.update(FIXED_DT);

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
			const ecs = createEcs();

			const entity = ecs.spawn({
				...createTransform(50, 75),
				...createVelocity(600, 1200),
			});

			// One fixed step: 600/60 = 10, 1200/60 = 20
			ecs.update(FIXED_DT);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBeCloseTo(60, 5);
			expect(localTransform?.y).toBeCloseTo(95, 5);
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
				.withFixedTimestep(FIXED_DT)
				.build();

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createVelocity(600, 600),
			});

			// Disable the physics group
			ecs.disableSystemGroup('physics');
			ecs.update(FIXED_DT);

			// Position should not have changed
			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(100);
			expect(localTransform?.y).toBe(100);

			// Enable and update — one fixed step: 600/60 = 10
			ecs.enableSystemGroup('physics');
			ecs.update(FIXED_DT);

			const updatedTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(updatedTransform?.x).toBeCloseTo(110, 5);
			expect(updatedTransform?.y).toBeCloseTo(110, 5);
		});
	});

	describe('Change detection', () => {
		test('should mark localTransform as changed after velocity integration', () => {
			const ecs = createEcs();

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createVelocity(50, -25),
			});

			const seqBefore = ecs.entityManager.changeSeq;
			ecs.update(FIXED_DT);

			const changeSeq = ecs.entityManager.getChangeSeq(entity.id, 'localTransform');
			expect(changeSeq).toBeGreaterThan(seqBefore);
		});

		test('should mark localTransform even with zero velocity', () => {
			const ecs = createEcs();

			const entity = ecs.spawn({
				...createTransform(50, 75),
				...createVelocity(0, 0),
			});

			const seqBefore = ecs.entityManager.changeSeq;
			ecs.update(FIXED_DT);

			const changeSeq = ecs.entityManager.getChangeSeq(entity.id, 'localTransform');
			expect(changeSeq).toBeGreaterThan(seqBefore);
		});
	});

	describe('Integration with transform propagation', () => {
		test('should update worldTransform after movement', () => {
			const ecs = createEcs();

			const entity = ecs.spawn({
				...createTransform(100, 100),
				...createVelocity(600, 600),
			});

			// One fixed step: movement in fixedUpdate, propagation in postUpdate
			ecs.update(FIXED_DT);

			const worldTransform = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			expect(worldTransform?.x).toBeCloseTo(110, 5); // 100 + 600/60
			expect(worldTransform?.y).toBeCloseTo(110, 5);
		});
	});
});
