import { describe, test, expect } from 'bun:test';
import ECSpresso from '../../ecspresso';
import {
	createTransformBundle,
	createTransform,
	createLocalTransform,
	createWorldTransform,
	type TransformComponentTypes,
} from './transform';

interface TestComponents extends TransformComponentTypes {
	tag: string;
}

interface TestEvents {}

interface TestResources {}

describe('Transform Bundle', () => {
	describe('Transform propagation', () => {
		test('should copy local transform to world transform for root entities', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(100, 200),
			});

			ecs.update(0.016);

			const worldTransform = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			expect(worldTransform?.x).toBe(100);
			expect(worldTransform?.y).toBe(200);
			expect(worldTransform?.rotation).toBe(0);
			expect(worldTransform?.scaleX).toBe(1);
			expect(worldTransform?.scaleY).toBe(1);
		});

		test('should combine transforms for child entities', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.build();

			const parent = ecs.spawn({
				...createTransform(100, 100),
			});

			const child = ecs.spawnChild(parent.id, {
				...createTransform(50, 50),
			});

			ecs.update(0.016);

			const childWorld = ecs.entityManager.getComponent(child.id, 'worldTransform');
			expect(childWorld?.x).toBe(150); // 100 + 50
			expect(childWorld?.y).toBe(150); // 100 + 50
		});

		test('should apply parent scale to child position', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.build();

			const parent = ecs.spawn({
				...createTransform(0, 0, { scale: 2 }),
			});

			const child = ecs.spawnChild(parent.id, {
				...createTransform(50, 50),
			});

			ecs.update(0.016);

			const childWorld = ecs.entityManager.getComponent(child.id, 'worldTransform');
			expect(childWorld?.x).toBe(100); // 50 * 2
			expect(childWorld?.y).toBe(100); // 50 * 2
			expect(childWorld?.scaleX).toBe(2); // inherited
			expect(childWorld?.scaleY).toBe(2); // inherited
		});

		test('should apply parent rotation to child position', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.build();

			const parent = ecs.spawn({
				...createTransform(0, 0, { rotation: Math.PI / 2 }), // 90 degrees
			});

			const child = ecs.spawnChild(parent.id, {
				...createTransform(100, 0),
			});

			ecs.update(0.016);

			const childWorld = ecs.entityManager.getComponent(child.id, 'worldTransform');
			// 100,0 rotated 90 degrees = 0,100
			expect(childWorld?.x).toBeCloseTo(0, 5);
			expect(childWorld?.y).toBeCloseTo(100, 5);
			expect(childWorld?.rotation).toBeCloseTo(Math.PI / 2, 5);
		});

		test('should propagate through multiple levels', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.build();

			const grandparent = ecs.spawn({
				...createTransform(100, 0),
			});

			const parent = ecs.spawnChild(grandparent.id, {
				...createTransform(50, 0),
			});

			const child = ecs.spawnChild(parent.id, {
				...createTransform(25, 0),
			});

			ecs.update(0.016);

			const childWorld = ecs.entityManager.getComponent(child.id, 'worldTransform');
			expect(childWorld?.x).toBe(175); // 100 + 50 + 25
			expect(childWorld?.y).toBe(0);
		});
	});

	describe('Helper functions', () => {
		test('createTransform should return both local and world transforms', () => {
			const result = createTransform(100, 200);
			expect(result.localTransform).toEqual({
				x: 100,
				y: 200,
				rotation: 0,
				scaleX: 1,
				scaleY: 1,
			});
			expect(result.worldTransform).toEqual({
				x: 100,
				y: 200,
				rotation: 0,
				scaleX: 1,
				scaleY: 1,
			});
		});

		test('createTransform should accept rotation option', () => {
			const result = createTransform(0, 0, { rotation: Math.PI });
			expect(result.localTransform.rotation).toBe(Math.PI);
			expect(result.worldTransform.rotation).toBe(Math.PI);
		});

		test('createTransform should accept uniform scale option', () => {
			const result = createTransform(0, 0, { scale: 2 });
			expect(result.localTransform.scaleX).toBe(2);
			expect(result.localTransform.scaleY).toBe(2);
		});

		test('createTransform should accept separate scale options', () => {
			const result = createTransform(0, 0, { scaleX: 2, scaleY: 3 });
			expect(result.localTransform.scaleX).toBe(2);
			expect(result.localTransform.scaleY).toBe(3);
		});

		test('createLocalTransform should return only local transform', () => {
			const result = createLocalTransform(100, 200);
			expect(result).toEqual({
				localTransform: {
					x: 100,
					y: 200,
					rotation: 0,
					scaleX: 1,
					scaleY: 1,
				},
			});
		});

		test('createWorldTransform should return only world transform', () => {
			const result = createWorldTransform(100, 200);
			expect(result).toEqual({
				worldTransform: {
					x: 100,
					y: 200,
					rotation: 0,
					scaleX: 1,
					scaleY: 1,
				},
			});
		});
	});

	describe('Bundle options', () => {
		test('should use custom system group', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle({ systemGroup: 'custom-transform' }))
				.build();

			const entity = ecs.spawn({
				...createTransform(100, 100),
			});

			// Disable the custom group
			ecs.disableSystemGroup('custom-transform');

			// Modify local transform
			const local = ecs.entityManager.getComponent(entity.id, 'localTransform');
			if (local) local.x = 200;

			ecs.update(0.016);

			// World should not be updated
			const world = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			expect(world?.x).toBe(100);

			// Enable and update
			ecs.enableSystemGroup('custom-transform');
			ecs.update(0.016);

			const updatedWorld = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			expect(updatedWorld?.x).toBe(200);
		});
	});

	describe('Orphaned entities', () => {
		test('should handle entities not in hierarchy', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(50, 75),
			});

			ecs.update(0.016);

			const world = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			expect(world?.x).toBe(50);
			expect(world?.y).toBe(75);
		});
	});
});
