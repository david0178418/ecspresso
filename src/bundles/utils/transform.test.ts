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

			// Modify local transform and mark changed
			const local = ecs.entityManager.getComponent(entity.id, 'localTransform');
			if (local) local.x = 200;
			ecs.markChanged(entity.id, 'localTransform');

			ecs.update(0.016);

			// World should not be updated (group is disabled)
			const world = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			expect(world?.x).toBe(100);

			// Enable and update — mark again so propagation sees it
			ecs.markChanged(entity.id, 'localTransform');
			ecs.enableSystemGroup('custom-transform');
			ecs.update(0.016);

			const updatedWorld = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			expect(updatedWorld?.x).toBe(200);
		});
	});

	describe('Change detection', () => {
		test('should propagate worldTransform when localTransform changed between updates', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(100, 200),
			});

			// First update: propagates spawn
			ecs.update(0.016);
			const world = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			expect(world?.x).toBe(100);

			// Mutate localTransform between updates and mark changed
			const local = ecs.entityManager.getComponent(entity.id, 'localTransform');
			if (!local) throw new Error('localTransform missing');
			local.x = 300;
			ecs.markChanged(entity.id, 'localTransform');

			ecs.update(0.016);
			expect(world?.x).toBe(300);
		});

		test('should skip propagation when localTransform unchanged', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(100, 200),
			});

			// Flush spawn marks (single update expires them)
			ecs.update(0.016);

			// Manually set worldTransform to a sentinel without marking anything
			const world = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			if (!world) throw new Error('worldTransform missing');
			world.x = 999;

			// Next update: no localTransform change → propagation should skip
			ecs.update(0.016);

			// Sentinel value should persist (propagation didn't overwrite)
			expect(world.x).toBe(999);
		});

		test('should propagate entities spawned before first update', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.build();

			// Spawn before any update — auto-marks at tick 0
			const entity = ecs.spawn({
				...createTransform(50, 75),
			});

			// First update: spawn marks match current tick → propagated
			ecs.update(0.016);

			const world = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			expect(world?.x).toBe(50);
			expect(world?.y).toBe(75);
		});

		test('should cascade: parent moved → child worldTransform updated', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.build();

			const parent = ecs.spawn({ ...createTransform(100, 0) });
			const child = ecs.spawnChild(parent.id, { ...createTransform(50, 0) });

			// First update: propagates spawn
			ecs.update(0.016);

			// Move parent between updates
			const parentLocal = ecs.entityManager.getComponent(parent.id, 'localTransform');
			if (!parentLocal) throw new Error('parent localTransform missing');
			parentLocal.x = 200;
			ecs.markChanged(parent.id, 'localTransform');

			ecs.update(0.016);

			// Child world position should reflect parent movement
			const childWorld = ecs.entityManager.getComponent(child.id, 'worldTransform');
			expect(childWorld?.x).toBe(250); // 200 + 50
		});

		test('should NOT cascade: parent NOT moved → child NOT re-propagated', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.build();

			const parent = ecs.spawn({ ...createTransform(100, 0) });
			const child = ecs.spawnChild(parent.id, { ...createTransform(50, 0) });

			// Single update settles hierarchy — no cascade amplification
			ecs.update(0.016);

			// Set sentinel on child worldTransform without marking anything
			const childWorld = ecs.entityManager.getComponent(child.id, 'worldTransform');
			if (!childWorld) throw new Error('child worldTransform missing');
			childWorld.x = 999;

			// Next update: neither parent nor child changed → propagation skipped
			ecs.update(0.016);

			// Sentinel should persist
			expect(childWorld.x).toBe(999);
		});
	});

	describe('Cross-priority change detection', () => {
		test('should propagate localTransform marked by lower-priority system', () => {
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withBundle(createTransformBundle())
				.build();

			const entity = ecs.spawn({
				...createTransform(100, 100),
			});

			// Low-priority system mutates + marks localTransform (priority 0 < propagation's 500)
			ecs.addSystem('custom-movement')
				.setPriority(0)
				.addQuery('entities', { with: ['localTransform'] as const })
				.setProcess((queries, _dt, ecs) => {
					for (const e of queries.entities) {
						e.components.localTransform.x += 50;
						ecs.markChanged(e.id, 'localTransform');
					}
				})
				.and();

			// First update: propagation sees spawn, movement mutates after
			ecs.update(0.016);

			// Second update: propagation should catch movement's mark
			ecs.update(0.016);

			const world = ecs.entityManager.getComponent(entity.id, 'worldTransform');
			// worldTransform should reflect movement's first mutation (150), not be stuck at 100
			expect(world?.x).toBe(150);
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
