import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import {
	createBoundsBundle,
	createBounds,
	createDestroyOutOfBounds,
	createClampToBounds,
	createWrapAtBounds,
	type BoundsComponentTypes,
	type BoundsEventTypes,
	type BoundsResourceTypes,
} from './bounds';
import { createTransformBundle, createTransform, type TransformComponentTypes } from './transform';
import { createMovementBundle, createVelocity, type MovementComponentTypes } from './movement';

interface TestComponents extends TransformComponentTypes, MovementComponentTypes, BoundsComponentTypes {
	tag: string;
}

interface TestEvents extends BoundsEventTypes {}

interface TestResources extends BoundsResourceTypes {}

describe('Bounds Bundle', () => {
	describe('Destroy out of bounds', () => {
		test('should remove entity when exiting bounds', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(850, 300), // Outside right edge
				...createDestroyOutOfBounds(),
			});

			expect(ecs.entityManager.getEntity(entity.id)).toBeDefined();
			ecs.update(0.016);
			expect(ecs.entityManager.getEntity(entity.id)).toBeUndefined();
		});

		test('should keep entity when inside bounds', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(400, 300),
				...createDestroyOutOfBounds(),
			});

			ecs.update(0.016);
			expect(ecs.entityManager.getEntity(entity.id)).toBeDefined();
		});

		test('should respect padding - positive padding extends threshold', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			// Entity at 820 with 50 padding - should still be alive (threshold is 850)
			const entity = ecs.spawn({
				...createTransform(820, 300),
				...createDestroyOutOfBounds(50),
			});

			ecs.update(0.016);
			expect(ecs.entityManager.getEntity(entity.id)).toBeDefined();

			// Move beyond threshold between updates
			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			if (localTransform) localTransform.x = 860;
			ecs.markChanged(entity.id, 'localTransform');
			ecs.update(0.016);
			expect(ecs.entityManager.getEntity(entity.id)).toBeUndefined();
		});

		test('should fire entityOutOfBounds event with correct edge', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const events: Array<{ entityId: number; exitEdge: string }> = [];
			ecs.eventBus.subscribe('entityOutOfBounds', (data) => {
				events.push(data);
			});

			const rightEntity = ecs.spawn({
				...createTransform(850, 300),
				...createDestroyOutOfBounds(),
			});

			const topEntity = ecs.spawn({
				...createTransform(400, -50),
				...createDestroyOutOfBounds(),
			});

			const leftEntity = ecs.spawn({
				...createTransform(-50, 300),
				...createDestroyOutOfBounds(),
			});

			const bottomEntity = ecs.spawn({
				...createTransform(400, 650),
				...createDestroyOutOfBounds(),
			});

			ecs.update(0.016);

			expect(events.length).toBe(4);
			expect(events).toContainEqual({ entityId: rightEntity.id, exitEdge: 'right' });
			expect(events).toContainEqual({ entityId: topEntity.id, exitEdge: 'top' });
			expect(events).toContainEqual({ entityId: leftEntity.id, exitEdge: 'left' });
			expect(events).toContainEqual({ entityId: bottomEntity.id, exitEdge: 'bottom' });
		});

		test('should not remove entity when autoRemove is false', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle({ autoRemove: false }))
				.build();

			let eventFired = false;
			ecs.eventBus.subscribe('entityOutOfBounds', () => {
				eventFired = true;
			});

			const entity = ecs.spawn({
				...createTransform(850, 300),
				...createDestroyOutOfBounds(),
			});

			ecs.update(0.016);
			expect(eventFired).toBe(true);
			expect(ecs.entityManager.getEntity(entity.id)).toBeDefined();
		});
	});

	describe('Clamp to bounds', () => {
		test('should clamp position to stay within bounds', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(850, 650),
				...createClampToBounds(),
			});

			ecs.update(0.016);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(800);
			expect(localTransform?.y).toBe(600);
		});

		test('should clamp negative positions to minimum', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(-50, -100),
				...createClampToBounds(),
			});

			ecs.update(0.016);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(0);
			expect(localTransform?.y).toBe(0);
		});

		test('should respect margin - shrinks valid area', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(790, 590),
				...createClampToBounds(20),
			});

			ecs.update(0.016);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(780); // 800 - 20
			expect(localTransform?.y).toBe(580); // 600 - 20
		});

		test('should not change position when already within bounds', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(400, 300),
				...createClampToBounds(),
			});

			ecs.update(0.016);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(400);
			expect(localTransform?.y).toBe(300);
		});
	});

	describe('Wrap at bounds', () => {
		test('should wrap to opposite edge when exiting right', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(850, 300),
				...createWrapAtBounds(),
			});

			ecs.update(0.016);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(50); // Wrapped to left + overflow
			expect(localTransform?.y).toBe(300);
		});

		test('should wrap to opposite edge when exiting left', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(-50, 300),
				...createWrapAtBounds(),
			});

			ecs.update(0.016);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(750); // Wrapped to right - overflow
			expect(localTransform?.y).toBe(300);
		});

		test('should wrap vertically', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(400, 650),
				...createWrapAtBounds(),
			});

			ecs.update(0.016);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(400);
			expect(localTransform?.y).toBe(50);
		});

		test('should respect padding for wrap threshold', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			// At 810 with 20 padding - should not wrap yet (threshold is 820)
			const entity = ecs.spawn({
				...createTransform(810, 300),
				...createWrapAtBounds(20),
			});

			ecs.update(0.016);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(810); // No wrap yet
		});
	});

	describe('Custom bounds', () => {
		test('should use custom x/y offset', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(400, 300, 100, 50))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(50, 30), // Outside left edge (min is 100)
				...createClampToBounds(),
			});

			ecs.update(0.016);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(100);
			expect(localTransform?.y).toBe(50);
		});

		test('should work with custom bounds resource key', () => {
			interface CustomResources extends BoundsResourceTypes {
				gameBounds: { x?: number; y?: number; width: number; height: number };
			}

			const ecs = ECSpresso
				.create<TestComponents, TestEvents, CustomResources>()
				.withResource('gameBounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle({ boundsResourceKey: 'gameBounds' }))
				.build();

			const entity = ecs.spawn({
				...createTransform(850, 300),
				...createClampToBounds(),
			});

			ecs.update(0.016);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(800);
		});
	});

	describe('Helper functions', () => {
		test('createBounds should return correct shape', () => {
			const bounds = createBounds(800, 600);
			expect(bounds).toEqual({ width: 800, height: 600 });
		});

		test('createBounds should include x/y when provided', () => {
			const bounds = createBounds(800, 600, 100, 50);
			expect(bounds).toEqual({ x: 100, y: 50, width: 800, height: 600 });
		});

		test('createDestroyOutOfBounds should return correct shape', () => {
			const result = createDestroyOutOfBounds();
			expect(result).toEqual({ destroyOutOfBounds: {} });
		});

		test('createDestroyOutOfBounds should include padding', () => {
			const result = createDestroyOutOfBounds(20);
			expect(result).toEqual({ destroyOutOfBounds: { padding: 20 } });
		});

		test('createClampToBounds should return correct shape', () => {
			const result = createClampToBounds();
			expect(result).toEqual({ clampToBounds: {} });
		});

		test('createClampToBounds should include margin', () => {
			const result = createClampToBounds(30);
			expect(result).toEqual({ clampToBounds: { margin: 30 } });
		});

		test('createWrapAtBounds should return correct shape', () => {
			const result = createWrapAtBounds();
			expect(result).toEqual({ wrapAtBounds: {} });
		});

		test('createWrapAtBounds should include padding', () => {
			const result = createWrapAtBounds(10);
			expect(result).toEqual({ wrapAtBounds: { padding: 10 } });
		});
	});

	describe('Change detection', () => {
		test('should mark localTransform when clamped', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(850, 650),
				...createClampToBounds(),
			});

			const seqBefore = ecs.entityManager.changeSeq;
			ecs.update(0.016);

			const changeSeq = ecs.entityManager.getChangeSeq(entity.id, 'localTransform');
			expect(changeSeq).toBeGreaterThan(seqBefore);
		});

		test('should NOT mark localTransform when entity is within bounds', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(400, 300),
				...createClampToBounds(),
			});

			// First update: spawn marks + no correction needed
			ecs.update(0.016);

			// After first update, capture the sequence
			const seqAfterFirstUpdate = ecs.entityManager.changeSeq;

			// Second update: no correction needed, bounds should not re-mark
			ecs.update(0.016);

			const changeSeq = ecs.entityManager.getChangeSeq(entity.id, 'localTransform');
			expect(changeSeq).toBeLessThanOrEqual(seqAfterFirstUpdate);
		});

		test('should mark localTransform when wrapped', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(850, 300),
				...createWrapAtBounds(),
			});

			const seqBefore = ecs.entityManager.changeSeq;
			ecs.update(0.016);

			const changeSeq = ecs.entityManager.getChangeSeq(entity.id, 'localTransform');
			expect(changeSeq).toBeGreaterThan(seqBefore);
		});
	});

	describe('Integration with movement', () => {
		test('should work with movement bundle', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withResource('bounds', createBounds(800, 600))
				.withBundle(createTransformBundle())
				.withBundle(createMovementBundle())
				.withBundle(createBoundsBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(780, 300),
				...createVelocity(100, 0),
				...createClampToBounds(),
			});

			// After 1 second, position would be 880 but should clamp to 800
			ecs.update(1.0);

			const localTransform = ecs.entityManager.getComponent(entity.id, 'localTransform');
			expect(localTransform?.x).toBe(800);
		});
	});
});
