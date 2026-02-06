import { expect, describe, test } from 'bun:test';
import ECSpresso, { Bundle } from './index';
import { mergeBundles } from './bundle';

interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	health: { value: number };
	sprite: { texture: string };
	localTransform: { x: number; y: number; rotation: number };
	worldTransform: { x: number; y: number; rotation: number };
	rigidBody: { type: 'dynamic' | 'static'; mass: number };
	force: { x: number; y: number };
	componentA: { a: number };
	componentB: { b: number };
	componentC: { c: number };
}

describe('Required Components', () => {
	describe('auto-addition on spawn', () => {
		test('should auto-add required component when trigger is spawned', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('position', 'velocity', () => ({ x: 0, y: 0 }))
				.build();

			const entity = ecs.spawn({ position: { x: 10, y: 20 } });

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel).toEqual({ x: 0, y: 0 });
		});

		test('should preserve explicit value over default', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('position', 'velocity', () => ({ x: 0, y: 0 }))
				.build();

			const entity = ecs.spawn({
				position: { x: 10, y: 20 },
				velocity: { x: 5, y: 5 },
			});

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel).toEqual({ x: 5, y: 5 });
		});

		test('should handle multiple requirements from one trigger', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('rigidBody', 'velocity', () => ({ x: 0, y: 0 }))
				.withRequired('rigidBody', 'force', () => ({ x: 0, y: 0 }))
				.build();

			const entity = ecs.spawn({
				rigidBody: { type: 'dynamic', mass: 1 },
			});

			expect(ecs.entityManager.getComponent(entity.id, 'velocity')).toEqual({ x: 0, y: 0 });
			expect(ecs.entityManager.getComponent(entity.id, 'force')).toEqual({ x: 0, y: 0 });
		});

		test('should handle transitive requirements (A requires B, B requires C)', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('componentA', 'componentB', () => ({ b: 0 }))
				.withRequired('componentB', 'componentC', () => ({ c: 0 }))
				.build();

			const entity = ecs.spawn({ componentA: { a: 1 } });

			expect(ecs.entityManager.getComponent(entity.id, 'componentB')).toEqual({ b: 0 });
			expect(ecs.entityManager.getComponent(entity.id, 'componentC')).toEqual({ c: 0 });
		});

		test('should call factory each time to produce independent objects', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('position', 'velocity', () => ({ x: 0, y: 0 }))
				.build();

			const e1 = ecs.spawn({ position: { x: 0, y: 0 } });
			const e2 = ecs.spawn({ position: { x: 0, y: 0 } });

			const vel1 = ecs.entityManager.getComponent(e1.id, 'velocity');
			const vel2 = ecs.entityManager.getComponent(e2.id, 'velocity');

			expect(vel1).not.toBe(vel2);
			expect(vel1).toEqual(vel2);
		});
	});

	describe('auto-addition on addComponent', () => {
		test('should auto-add when adding trigger to existing entity', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			ecs.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			const entity = ecs.spawn({ health: { value: 100 } });
			ecs.entityManager.addComponent(entity.id, 'position', { x: 10, y: 20 });

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel).toEqual({ x: 0, y: 0 });
		});

		test('should not overwrite existing component', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			ecs.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			const entity = ecs.spawn({ velocity: { x: 5, y: 5 } });
			ecs.entityManager.addComponent(entity.id, 'position', { x: 10, y: 20 });

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel).toEqual({ x: 5, y: 5 });
		});

		test('should handle transitive requirements on addComponent', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			ecs.registerRequired('componentA', 'componentB', () => ({ b: 0 }));
			ecs.registerRequired('componentB', 'componentC', () => ({ c: 0 }));

			const entity = ecs.spawn({ health: { value: 100 } });
			ecs.entityManager.addComponent(entity.id, 'componentA', { a: 1 });

			expect(ecs.entityManager.getComponent(entity.id, 'componentB')).toEqual({ b: 0 });
			expect(ecs.entityManager.getComponent(entity.id, 'componentC')).toEqual({ c: 0 });
		});
	});

	describe('auto-addition on addComponents', () => {
		test('should auto-add when using addComponents', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			ecs.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			const entity = ecs.spawn({ health: { value: 100 } });
			ecs.entityManager.addComponents(entity.id, { position: { x: 10, y: 20 } });

			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel).toEqual({ x: 0, y: 0 });
		});
	});

	describe('auto-addition on spawnChild', () => {
		test('should auto-add required components for child entities', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('position', 'velocity', () => ({ x: 0, y: 0 }))
				.build();

			const parent = ecs.spawn({ health: { value: 100 } });
			const child = ecs.spawnChild(parent.id, { position: { x: 0, y: 0 } });

			const vel = ecs.entityManager.getComponent(child.id, 'velocity');
			expect(vel).toEqual({ x: 0, y: 0 });
		});
	});

	describe('cycle detection', () => {
		test('should throw on self-reference', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			expect(() => {
				ecs.registerRequired('position', 'position', () => ({ x: 0, y: 0 }));
			}).toThrow();
		});

		test('should throw on direct cycle (A requires B, B requires A)', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			ecs.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			expect(() => {
				ecs.registerRequired('velocity', 'position', () => ({ x: 0, y: 0 }));
			}).toThrow(/[Cc]ircular/);
		});

		test('should throw on indirect cycle (A requires B, B requires C, C requires A)', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			ecs.registerRequired('componentA', 'componentB', () => ({ b: 0 }));
			ecs.registerRequired('componentB', 'componentC', () => ({ c: 0 }));

			expect(() => {
				ecs.registerRequired('componentC', 'componentA', () => ({ a: 0 }));
			}).toThrow(/[Cc]ircular/);
		});

		test('should throw on duplicate requirement registration', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			ecs.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			expect(() => {
				ecs.registerRequired('position', 'velocity', () => ({ x: 1, y: 1 }));
			}).toThrow(/already registered/);
		});
	});

	describe('bundle registration', () => {
		test('should register required components from bundle', () => {
			const bundle = new Bundle<TestComponents>('test');
			bundle.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			const ecs = ECSpresso.create()
				.withBundle(bundle)
				.build();

			const entity = ecs.spawn({ position: { x: 10, y: 20 } });
			const vel = ecs.entityManager.getComponent(entity.id, 'velocity');
			expect(vel).toEqual({ x: 0, y: 0 });
		});

		test('should merge required components from multiple bundles', () => {
			const bundle1 = new Bundle<Pick<TestComponents, 'position' | 'velocity'>>('b1');
			bundle1.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			const bundle2 = new Bundle<Pick<TestComponents, 'componentA' | 'componentB'>>('b2');
			bundle2.registerRequired('componentA', 'componentB', () => ({ b: 0 }));

			const ecs = ECSpresso.create()
				.withBundle(bundle1)
				.withBundle(bundle2)
				.build();

			const e1 = ecs.spawn({ position: { x: 1, y: 1 } });
			expect(ecs.entityManager.getComponent(e1.id, 'velocity')).toEqual({ x: 0, y: 0 });

			const e2 = ecs.spawn({ componentA: { a: 1 } });
			expect(ecs.entityManager.getComponent(e2.id, 'componentB')).toEqual({ b: 0 });
		});

		test('should propagate required components through mergeBundles', () => {
			const bundle1 = new Bundle<Pick<TestComponents, 'position' | 'velocity'>>('b1');
			bundle1.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			const bundle2 = new Bundle<Pick<TestComponents, 'componentA' | 'componentB'>>('b2');
			bundle2.registerRequired('componentA', 'componentB', () => ({ b: 0 }));

			const merged = mergeBundles('merged', bundle1 as Bundle<any>, bundle2 as Bundle<any>);

			const ecs = ECSpresso.create()
				.withBundle(merged)
				.build();

			const entity = ecs.spawn({ position: { x: 1, y: 1 } });
			expect(ecs.entityManager.getComponent(entity.id, 'velocity')).toEqual({ x: 0, y: 0 });
		});

		test('bundle cycle detection should work within a bundle', () => {
			const bundle = new Bundle<TestComponents>('test');
			bundle.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			expect(() => {
				bundle.registerRequired('velocity', 'position', () => ({ x: 0, y: 0 }));
			}).toThrow(/[Cc]ircular/);
		});
	});

	describe('builder withRequired', () => {
		test('should register requirements via builder', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('position', 'velocity', () => ({ x: 0, y: 0 }))
				.build();

			const entity = ecs.spawn({ position: { x: 10, y: 20 } });
			expect(ecs.entityManager.getComponent(entity.id, 'velocity')).toEqual({ x: 0, y: 0 });
		});

		test('should support chaining multiple withRequired calls', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('rigidBody', 'velocity', () => ({ x: 0, y: 0 }))
				.withRequired('rigidBody', 'force', () => ({ x: 0, y: 0 }))
				.build();

			const entity = ecs.spawn({ rigidBody: { type: 'dynamic', mass: 1 } });
			expect(ecs.entityManager.getComponent(entity.id, 'velocity')).toEqual({ x: 0, y: 0 });
			expect(ecs.entityManager.getComponent(entity.id, 'force')).toEqual({ x: 0, y: 0 });
		});
	});

	describe('change detection integration', () => {
		test('should mark auto-added components as changed', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('position', 'velocity', () => ({ x: 0, y: 0 }))
				.build();

			const entity = ecs.spawn({ position: { x: 10, y: 20 } });

			const velChangeSeq = ecs.entityManager.getChangeSeq(entity.id, 'velocity');
			expect(velChangeSeq).toBeGreaterThan(0);
		});

		test('auto-added components should be visible to changed queries', () => {
			const changedEntities: number[] = [];

			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('position', 'velocity', () => ({ x: 0, y: 0 }))
				.build();

			ecs.addSystem('detect-velocity-changes')
				.addQuery('changed', {
					with: ['velocity'],
					changed: ['velocity'],
				})
				.setProcess((queries) => {
					for (const e of queries.changed) {
						changedEntities.push(e.id);
					}
				})
				.build();

			ecs.spawn({ position: { x: 10, y: 20 } });
			ecs.update(1 / 60);

			expect(changedEntities.length).toBe(1);
		});
	});

	describe('reactive query integration', () => {
		test('should trigger reactive query for auto-added components', () => {
			const enteredEntities: number[] = [];

			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('position', 'velocity', () => ({ x: 0, y: 0 }))
				.build();

			ecs.addReactiveQuery('has-both', {
				with: ['position', 'velocity'],
				onEnter: (entity) => {
					enteredEntities.push(entity.id);
				},
			});

			const entity = ecs.spawn({ position: { x: 10, y: 20 } });

			expect(enteredEntities).toContain(entity.id);
		});
	});

	describe('command buffer integration', () => {
		test('should auto-add required components on command buffer spawn', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('position', 'velocity', () => ({ x: 0, y: 0 }))
				.build();

			ecs.commands.spawn({ position: { x: 10, y: 20 } });
			ecs.update(1 / 60);

			const entities = ecs.getEntitiesWithQuery(['position', 'velocity']);
			expect(entities.length).toBe(1);
			expect(entities[0]!.components.velocity).toEqual({ x: 0, y: 0 });
		});

		test('should auto-add required components on command buffer addComponent', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('position', 'velocity', () => ({ x: 0, y: 0 }))
				.build();

			const entity = ecs.spawn({ health: { value: 100 } });
			ecs.commands.addComponent(entity.id, 'position', { x: 10, y: 20 });
			ecs.update(1 / 60);

			expect(ecs.entityManager.getComponent(entity.id, 'velocity')).toEqual({ x: 0, y: 0 });
		});
	});

	describe('converging requirements', () => {
		test('should handle multiple triggers requiring the same component', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.withRequired('position', 'velocity', () => ({ x: 0, y: 0 }))
				.withRequired('health', 'velocity', () => ({ x: 1, y: 1 }))
				.build();

			// Spawn with just position — velocity default comes from position's requirement
			const e1 = ecs.spawn({ position: { x: 0, y: 0 } });
			expect(ecs.entityManager.getComponent(e1.id, 'velocity')).toEqual({ x: 0, y: 0 });

			// Spawn with both triggers — velocity is added by whichever trigger is processed first,
			// second trigger finds it already present and skips
			const e2 = ecs.spawn({ position: { x: 0, y: 0 }, health: { value: 100 } });
			expect(ecs.entityManager.getComponent(e2.id, 'velocity')).toBeDefined();
		});
	});

	describe('diamond dependency', () => {
		test('should handle diamond pattern (A requires B and C, both require D)', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			ecs.registerRequired('componentA', 'componentB', () => ({ b: 1 }));
			ecs.registerRequired('componentA', 'componentC', () => ({ c: 2 }));
			ecs.registerRequired('componentB', 'health', () => ({ value: 10 }));
			ecs.registerRequired('componentC', 'health', () => ({ value: 20 }));

			const entity = ecs.spawn({ componentA: { a: 1 } });

			expect(ecs.entityManager.getComponent(entity.id, 'componentB')).toEqual({ b: 1 });
			expect(ecs.entityManager.getComponent(entity.id, 'componentC')).toEqual({ c: 2 });
			// health is added by B's requirement (processed first, registration order)
			expect(ecs.entityManager.getComponent(entity.id, 'health')).toEqual({ value: 10 });
		});
	});

	describe('edge cases', () => {
		test('should work when no requirements are registered', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			const entity = ecs.spawn({ position: { x: 10, y: 20 } });
			expect(entity.components.position).toEqual({ x: 10, y: 20 });
			expect(ecs.entityManager.getComponent(entity.id, 'velocity')).toBeUndefined();
		});

		test('should not overwrite required component when re-adding trigger', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			ecs.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			const entity = ecs.spawn({ position: { x: 10, y: 20 } });
			expect(ecs.entityManager.getComponent(entity.id, 'velocity')).toEqual({ x: 0, y: 0 });

			// Manually set velocity to a custom value
			ecs.entityManager.addComponent(entity.id, 'velocity', { x: 99, y: 99 });

			// Re-add position (trigger) — should NOT overwrite velocity
			ecs.entityManager.addComponent(entity.id, 'position', { x: 20, y: 30 });

			expect(ecs.entityManager.getComponent(entity.id, 'velocity')).toEqual({ x: 99, y: 99 });
		});

		test('should handle requirement registered after entity already has trigger', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			// Spawn entity before registering requirement
			const entity = ecs.spawn({ position: { x: 10, y: 20 } });

			ecs.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			// Existing entity should NOT be retroactively updated
			expect(ecs.entityManager.getComponent(entity.id, 'velocity')).toBeUndefined();

			// But new spawns should work
			const e2 = ecs.spawn({ position: { x: 5, y: 5 } });
			expect(ecs.entityManager.getComponent(e2.id, 'velocity')).toEqual({ x: 0, y: 0 });
		});
	});

	describe('type safety', () => {
		test('should type-check component names in registerRequired', () => {
			const ecs = ECSpresso.create()
				.withComponentTypes<TestComponents>()
				.build();

			// Valid call
			ecs.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			// @ts-expect-error - invalid trigger component name
			ecs.registerRequired('nonExistent', 'velocity', () => ({ x: 0, y: 0 }));

			// @ts-expect-error - invalid required component name
			ecs.registerRequired('position', 'nonExistent', () => ({ x: 0, y: 0 }));

			// @ts-expect-error - factory returns wrong type for required component
			ecs.registerRequired('position', 'health', () => ({ x: 0, y: 0 }));
		});

		test('should type-check component names in bundle registerRequired', () => {
			const bundle = new Bundle<TestComponents>('test');

			// Valid call
			bundle.registerRequired('position', 'velocity', () => ({ x: 0, y: 0 }));

			// @ts-expect-error - invalid trigger component name
			bundle.registerRequired('nonExistent', 'velocity', () => ({ x: 0, y: 0 }));

			// @ts-expect-error - invalid required component name
			bundle.registerRequired('position', 'nonExistent', () => ({ x: 0, y: 0 }));

			// @ts-expect-error - factory returns wrong type for required component
			bundle.registerRequired('position', 'health', () => ({ x: 0, y: 0 }));
		});

		test('should type-check component names in builder withRequired', () => {
			ECSpresso.create()
				.withComponentTypes<TestComponents>()
				// Valid calls
				.withRequired('position', 'velocity', () => ({ x: 0, y: 0 }))
				// @ts-expect-error - invalid trigger component name
				.withRequired('nonExistent', 'velocity', () => ({ x: 0, y: 0 }))
				// @ts-expect-error - invalid required component name
				.withRequired('position', 'nonExistent', () => ({ x: 0, y: 0 }))
				// @ts-expect-error - factory returns wrong type for required component
				.withRequired('position', 'health', () => ({ x: 0, y: 0 }));
		});
	});
});
