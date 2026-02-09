import { describe, test, expect } from 'bun:test';
import ECSpresso from './ecspresso';

// ==================== Test Types ====================

interface TestComponents {
	position: { x: number; y: number };
	velocity: { dx: number; dy: number };
	health: number;
	tag: string;
}

interface TestEvents {
	damaged: { entityId: number };
}

interface TestResources {
	counter: number;
}

// ==================== Test Helpers ====================

function createTestEcs() {
	return ECSpresso
		.create<TestComponents, TestEvents, TestResources>()
		.withResource('counter', 0)
		.build();
}

// ==================== Tests ====================

describe('setOnEntityEnter', () => {
	test('callback fires on first tick for matching entity', () => {
		const ecs = createTestEcs();
		const entered: number[] = [];

		ecs.addSystem('test')
			.addQuery('movers', { with: ['position', 'velocity'] as const })
			.setOnEntityEnter('movers', (entity) => {
				entered.push(entity.id);
			})
			.setProcess(() => {});

		const e = ecs.spawn({ position: { x: 0, y: 0 }, velocity: { dx: 1, dy: 0 } });

		expect(entered).toEqual([]);
		ecs.update(1 / 60);
		expect(entered).toEqual([e.id]);
	});

	test('not re-fired on subsequent ticks', () => {
		const ecs = createTestEcs();
		let enterCount = 0;

		ecs.addSystem('test')
			.addQuery('movers', { with: ['position'] as const })
			.setOnEntityEnter('movers', () => {
				enterCount++;
			})
			.setProcess(() => {});

		ecs.spawn({ position: { x: 0, y: 0 } });

		ecs.update(1 / 60);
		ecs.update(1 / 60);
		ecs.update(1 / 60);

		expect(enterCount).toBe(1);
	});

	test('re-entry fires again after component removed and re-added', () => {
		const ecs = createTestEcs();
		let enterCount = 0;

		ecs.addSystem('test')
			.addQuery('tagged', { with: ['tag'] as const })
			.setOnEntityEnter('tagged', () => {
				enterCount++;
			})
			.setProcess(() => {});

		const e = ecs.spawn({ tag: 'hello' });

		ecs.update(1 / 60);
		expect(enterCount).toBe(1);

		// Remove the component — entity leaves query
		ecs.entityManager.removeComponent(e.id, 'tag');
		ecs.update(1 / 60);

		// Re-add the component — entity re-enters query
		ecs.entityManager.addComponent(e.id, 'tag', 'world');
		ecs.update(1 / 60);
		expect(enterCount).toBe(2);
	});

	test('multiple entities each get their own callback', () => {
		const ecs = createTestEcs();
		const entered: number[] = [];

		ecs.addSystem('test')
			.addQuery('movers', { with: ['position'] as const })
			.setOnEntityEnter('movers', (entity) => {
				entered.push(entity.id);
			})
			.setProcess(() => {});

		const e1 = ecs.spawn({ position: { x: 0, y: 0 } });
		const e2 = ecs.spawn({ position: { x: 1, y: 1 } });

		ecs.update(1 / 60);
		expect(entered).toContain(e1.id);
		expect(entered).toContain(e2.id);
		expect(entered).toHaveLength(2);

		// Spawn another entity
		const e3 = ecs.spawn({ position: { x: 2, y: 2 } });
		ecs.update(1 / 60);
		expect(entered).toContain(e3.id);
		expect(entered).toHaveLength(3);
	});

	test('entity removal causes no errors', () => {
		const ecs = createTestEcs();
		let enterCount = 0;

		ecs.addSystem('test')
			.addQuery('movers', { with: ['position'] as const })
			.setOnEntityEnter('movers', () => {
				enterCount++;
			})
			.setProcess(() => {});

		const e = ecs.spawn({ position: { x: 0, y: 0 } });

		ecs.update(1 / 60);
		expect(enterCount).toBe(1);

		ecs.removeEntity(e.id);

		// Should not throw
		ecs.update(1 / 60);
		ecs.update(1 / 60);
	});

	test('fires before process (verify via ordered side-effect array)', () => {
		const ecs = createTestEcs();
		const log: string[] = [];

		ecs.addSystem('test')
			.addQuery('movers', { with: ['position'] as const })
			.setOnEntityEnter('movers', () => {
				log.push('enter');
			})
			.setProcess(() => {
				log.push('process');
			});

		ecs.spawn({ position: { x: 0, y: 0 } });

		ecs.update(1 / 60);
		expect(log).toEqual(['enter', 'process']);
	});

	test('system without process still fires enter callbacks', () => {
		const ecs = createTestEcs();
		const entered: number[] = [];

		ecs.addSystem('test')
			.addQuery('movers', { with: ['position'] as const })
			.setOnEntityEnter('movers', (entity) => {
				entered.push(entity.id);
			});

		const e = ecs.spawn({ position: { x: 0, y: 0 } });

		ecs.update(1 / 60);
		expect(entered).toEqual([e.id]);
	});

	test('disabled group prevents callbacks; re-enable does not cause false fires', () => {
		const ecs = createTestEcs();
		let enterCount = 0;

		ecs.addSystem('test')
			.inGroup('myGroup')
			.addQuery('movers', { with: ['position'] as const })
			.setOnEntityEnter('movers', () => {
				enterCount++;
			})
			.setProcess(() => {});

		ecs.spawn({ position: { x: 0, y: 0 } });

		// Disable the group before first tick
		ecs.disableSystemGroup('myGroup');

		ecs.update(1 / 60);
		ecs.update(1 / 60);
		expect(enterCount).toBe(0);

		// Re-enable — entity should now fire enter
		ecs.enableSystemGroup('myGroup');
		ecs.update(1 / 60);
		expect(enterCount).toBe(1);

		// Subsequent ticks should not re-fire
		ecs.update(1 / 60);
		expect(enterCount).toBe(1);
	});

	test('type safety: callback entity type matches query', () => {
		const ecs = createTestEcs();

		ecs.addSystem('test')
			.addQuery('movers', {
				with: ['position', 'velocity'] as const,
			})
			.setOnEntityEnter('movers', (entity) => {
				// These should be typed — compile-time check
				const _x: number = entity.components.position.x;
				const _dx: number = entity.components.velocity.dx;
				void _x;
				void _dx;
			})
			.setProcess(() => {});

		// Verification is that this compiles without error
		expect(true).toBe(true);
	});

	test('multiple queries with separate enter hooks on same system', () => {
		const ecs = createTestEcs();
		const enterLog: string[] = [];

		ecs.addSystem('test')
			.addQuery('positions', { with: ['position'] as const })
			.addQuery('tagged', { with: ['tag'] as const })
			.setOnEntityEnter('positions', () => {
				enterLog.push('position-enter');
			})
			.setOnEntityEnter('tagged', () => {
				enterLog.push('tag-enter');
			})
			.setProcess(() => {});

		// Entity that matches both queries
		ecs.spawn({ position: { x: 0, y: 0 }, tag: 'hello' });

		ecs.update(1 / 60);
		expect(enterLog).toContain('position-enter');
		expect(enterLog).toContain('tag-enter');
		expect(enterLog).toHaveLength(2);
	});

	test('entity spawned during process does not trigger enter until next tick', () => {
		const ecs = createTestEcs();
		const entered: number[] = [];

		ecs.addSystem('test')
			.addQuery('movers', { with: ['position'] as const })
			.setOnEntityEnter('movers', (entity) => {
				entered.push(entity.id);
			})
			.setProcess((_queries, _dt, ecsRef) => {
				// Spawn another entity during process on first tick only
				if (entered.length === 1) {
					ecsRef.spawn({ position: { x: 99, y: 99 } });
				}
			});

		ecs.spawn({ position: { x: 0, y: 0 } });

		ecs.update(1 / 60);
		// Only the original entity's enter should fire
		expect(entered).toHaveLength(1);

		// Next tick: the spawned entity should trigger enter
		ecs.update(1 / 60);
		expect(entered).toHaveLength(2);
	});

	test('receives ecs as second argument', () => {
		const ecs = createTestEcs();
		let receivedEcs = false;

		ecs.addSystem('test')
			.addQuery('movers', { with: ['position'] as const })
			.setOnEntityEnter('movers', (_entity, ecsRef) => {
				receivedEcs = ecsRef === ecs;
			})
			.setProcess(() => {});

		ecs.spawn({ position: { x: 0, y: 0 } });
		ecs.update(1 / 60);

		expect(receivedEcs).toBe(true);
	});
});
