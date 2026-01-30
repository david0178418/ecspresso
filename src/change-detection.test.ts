import { describe, test, expect } from 'bun:test';
import ECSpresso from './ecspresso';
import { createQueryDefinition } from './types';

interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	health: { value: number };
	tag: boolean;
}

interface TestEvents {
	test: boolean;
}

interface TestResources {
	counter: number;
}

function createEcs() {
	return ECSpresso.create<TestComponents, TestEvents, TestResources>().build();
}

describe('Change Detection', () => {
	describe('markChanged and changed query', () => {
		test('markChanged stamps sequence; changed query returns only marked entities', () => {
			const ecs = createEcs();
			const e1 = ecs.spawn({ position: { x: 0, y: 0 } });
			ecs.spawn({ position: { x: 1, y: 1 } });

			// Flush spawn marks
			ecs.update(0);

			// Mark only e1 as changed
			ecs.markChanged(e1.id, 'position');

			const changed = ecs.getEntitiesWithQuery(['position'], [], ['position']);
			expect(changed.length).toBe(1);
			expect(changed[0]?.id).toBe(e1.id);
		});

		test('unchanged entities excluded from changed query but still in normal queries', () => {
			const ecs = createEcs();
			const e1 = ecs.spawn({ position: { x: 0, y: 0 } });
			ecs.spawn({ position: { x: 1, y: 1 } });

			// Flush spawn marks
			ecs.update(0);
			ecs.markChanged(e1.id, 'position');

			// Changed query: only e1
			const changed = ecs.getEntitiesWithQuery(['position'], [], ['position']);
			expect(changed.length).toBe(1);

			// Normal query: both
			const all = ecs.getEntitiesWithQuery(['position']);
			expect(all.length).toBe(2);
		});

		test('changed status expires after one update', () => {
			const ecs = createEcs();
			const e1 = ecs.spawn({ position: { x: 0, y: 0 } });

			// Flush spawn marks
			ecs.update(0);

			// Mark changed
			ecs.markChanged(e1.id, 'position');

			const visible = ecs.getEntitiesWithQuery(['position'], [], ['position']);
			expect(visible.length).toBe(1);

			// One update later: mark expired (threshold advances past it)
			ecs.update(0);
			const expired = ecs.getEntitiesWithQuery(['position'], [], ['position']);
			expect(expired.length).toBe(0);
		});
	});

	describe('auto-marking', () => {
		test('addComponent auto-marks changed', () => {
			const ecs = createEcs();
			const entity = ecs.spawn({ position: { x: 0, y: 0 } });

			// Tick 1
			ecs.update(0);

			// Add a new component — should auto-mark 'velocity' as changed
			ecs.entityManager.addComponent(entity.id, 'velocity', { x: 1, y: 1 });

			const changed = ecs.getEntitiesWithQuery(['velocity'], [], ['velocity']);
			expect(changed.length).toBe(1);
			expect(changed[0]?.id).toBe(entity.id);
		});

		test('spawn auto-marks all components changed', () => {
			const ecs = createEcs();

			// Tick 1
			ecs.update(0);

			const entity = ecs.spawn({ position: { x: 0, y: 0 }, velocity: { x: 1, y: 1 } });

			const changedPos = ecs.getEntitiesWithQuery(['position'], [], ['position']);
			expect(changedPos.length).toBe(1);
			expect(changedPos[0]?.id).toBe(entity.id);

			const changedVel = ecs.getEntitiesWithQuery(['velocity'], [], ['velocity']);
			expect(changedVel.length).toBe(1);
			expect(changedVel[0]?.id).toBe(entity.id);
		});

		test('addComponents auto-marks all added components changed', () => {
			const ecs = createEcs();
			const entity = ecs.spawn({ position: { x: 0, y: 0 } });

			ecs.update(0);

			ecs.entityManager.addComponents(entity.id, {
				velocity: { x: 1, y: 1 },
				health: { value: 100 },
			});

			const changedVel = ecs.getEntitiesWithQuery(['velocity'], [], ['velocity']);
			expect(changedVel.length).toBe(1);

			const changedHealth = ecs.getEntitiesWithQuery(['health'], [], ['health']);
			expect(changedHealth.length).toBe(1);
		});
	});

	describe('system integration', () => {
		test('system with changed query skipped when no entities changed', () => {
			const ecs = createEcs();
			ecs.spawn({ position: { x: 0, y: 0 } });

			let processCallCount = 0;

			ecs.addSystem('test-changed')
				.addQuery('entities', {
					with: ['position'] as const,
					changed: ['position'] as const,
				})
				.setProcess((_queries) => {
					processCallCount++;
				})
				.and();

			// First update — spawn auto-marked position, system sees it
			ecs.update(0);
			expect(processCallCount).toBe(1);

			// Second update — no changes, system should be skipped
			ecs.update(0);
			expect(processCallCount).toBe(1);
		});

		test('system with changed query receives only changed entities', () => {
			const ecs = createEcs();
			const e1 = ecs.spawn({ position: { x: 0, y: 0 } });
			ecs.spawn({ position: { x: 1, y: 1 } });

			// Flush spawn marks
			ecs.update(0);

			const receivedIds: number[] = [];

			// Add marking system with higher priority (runs first)
			ecs.addSystem('marker')
				.setPriority(10)
				.setProcess((_queries, _dt, ecs) => {
					ecs.markChanged(e1.id, 'position');
				})
				.and();

			// Add reading system with lower priority (runs second)
			ecs.addSystem('reader')
				.setPriority(0)
				.addQuery('entities', {
					with: ['position'] as const,
					changed: ['position'] as const,
				})
				.setProcess((queries) => {
					for (const entity of queries.entities) {
						receivedIds.push(entity.id);
					}
				})
				.and();

			ecs.update(0);

			expect(receivedIds).toEqual([e1.id]);
		});
	});

	describe('cross-priority ordering', () => {
		test('changed query catches marks from lower-priority systems on next update', () => {
			const ecs = createEcs();
			const entity = ecs.spawn({ position: { x: 0, y: 0 } });

			// Flush spawn marks
			ecs.update(0);

			let changedCount = 0;

			// High-priority consumer runs first
			ecs.addSystem('reader')
				.setPriority(100)
				.addQuery('changed', {
					with: ['position'] as const,
					changed: ['position'] as const,
				})
				.setProcess((queries) => {
					changedCount = queries.changed.length;
				})
				.and();

			// Low-priority producer runs second
			ecs.addSystem('marker')
				.setPriority(0)
				.setProcess((_queries, _dt, ecs) => {
					ecs.markChanged(entity.id, 'position');
				})
				.and();

			// First update with systems: reader runs before marker
			ecs.update(0);

			// Second update: reader should see marker's mark from previous update
			changedCount = 0;
			ecs.update(0);
			expect(changedCount).toBe(1);
		});
	});

	describe('OR semantics for multiple changed components', () => {
		test('changed: [pos, vel] matches if either was changed', () => {
			const ecs = createEcs();
			const e1 = ecs.spawn({ position: { x: 0, y: 0 }, velocity: { x: 1, y: 1 } });
			const e2 = ecs.spawn({ position: { x: 2, y: 2 }, velocity: { x: 3, y: 3 } });
			ecs.spawn({ position: { x: 4, y: 4 }, velocity: { x: 5, y: 5 } });

			// Flush spawn marks
			ecs.update(0);

			// Mark only position on e1
			ecs.markChanged(e1.id, 'position');
			// Mark only velocity on e2
			ecs.markChanged(e2.id, 'velocity');
			// e3 has neither marked

			const changed = ecs.getEntitiesWithQuery(
				['position', 'velocity'],
				[],
				['position', 'velocity']
			);

			const ids = changed.map(e => e.id).sort();
			expect(ids).toEqual([e1.id, e2.id].sort());
		});
	});

	describe('changed + without interaction', () => {
		test('changed filter respects without exclusions', () => {
			const ecs = createEcs();
			const e1 = ecs.spawn({ position: { x: 0, y: 0 } });
			const e2 = ecs.spawn({ position: { x: 1, y: 1 }, tag: true });

			ecs.update(0);

			ecs.markChanged(e1.id, 'position');
			ecs.markChanged(e2.id, 'position');

			// Query with changed + without tag
			const changed = ecs.getEntitiesWithQuery(
				['position'],
				['tag'],
				['position']
			);

			expect(changed.length).toBe(1);
			expect(changed[0]?.id).toBe(e1.id);
		});
	});

	describe('command buffer markChanged', () => {
		test('command buffer queues markChanged for playback', () => {
			const ecs = createEcs();
			const entity = ecs.spawn({ position: { x: 0, y: 0 } });

			// Flush spawn marks
			ecs.update(0);

			// Queue markChanged via command buffer
			ecs.commands.markChanged(entity.id, 'position');

			// Not yet applied
			const beforePlayback = ecs.getEntitiesWithQuery(['position'], [], ['position']);
			expect(beforePlayback.length).toBe(0);

			// Playback (happens at end of update)
			ecs.commands.playback(ecs);

			const afterPlayback = ecs.getEntitiesWithQuery(['position'], [], ['position']);
			expect(afterPlayback.length).toBe(1);
		});

		test('command buffer addComponent auto-marks via wrapped method', () => {
			const ecs = createEcs();
			const entity = ecs.spawn({ position: { x: 0, y: 0 } });

			ecs.update(0);

			// Queue addComponent via command buffer
			ecs.commands.addComponent(entity.id, 'velocity', { x: 1, y: 1 });

			// Playback
			ecs.commands.playback(ecs);

			const changed = ecs.getEntitiesWithQuery(['velocity'], [], ['velocity']);
			expect(changed.length).toBe(1);
		});
	});

	describe('entity removal', () => {
		test('entity removal clears change sequences', () => {
			const ecs = createEcs();
			const entity = ecs.spawn({ position: { x: 0, y: 0 } });

			ecs.update(0);
			ecs.markChanged(entity.id, 'position');

			// Verify it's tracked
			const before = ecs.getEntitiesWithQuery(['position'], [], ['position']);
			expect(before.length).toBe(1);

			// Remove entity
			ecs.removeEntity(entity.id);

			// Spawn new entity at potentially same ID slot
			const newEntity = ecs.spawn({ position: { x: 1, y: 1 } });

			// The new entity should show as changed (auto-marked on spawn)
			// Old entity's sequences were cleared on removal
			const changed = ecs.getEntitiesWithQuery(['position'], [], ['position']);
			expect(changed.length).toBe(1);
			expect(changed[0]?.id).toBe(newEntity.id);
		});
	});

	describe('idempotency', () => {
		test('multiple markChanged calls per tick are idempotent', () => {
			const ecs = createEcs();
			const entity = ecs.spawn({ position: { x: 0, y: 0 } });

			ecs.update(0);

			ecs.markChanged(entity.id, 'position');
			ecs.markChanged(entity.id, 'position');
			ecs.markChanged(entity.id, 'position');

			const changed = ecs.getEntitiesWithQuery(['position'], [], ['position']);
			expect(changed.length).toBe(1);
		});
	});

	describe('currentTick getter', () => {
		test('starts at 0 and increments each update', () => {
			const ecs = createEcs();

			expect(ecs.currentTick).toBe(0);

			ecs.update(0);
			expect(ecs.currentTick).toBe(1);

			ecs.update(0);
			expect(ecs.currentTick).toBe(2);

			ecs.update(0);
			expect(ecs.currentTick).toBe(3);
		});
	});

	describe('createQueryDefinition', () => {
		test('accepts changed field', () => {
			const queryDef = createQueryDefinition({
				with: ['position', 'velocity'] as const satisfies ReadonlyArray<keyof TestComponents>,
				without: ['tag'] as const satisfies ReadonlyArray<keyof TestComponents>,
				changed: ['position'] as const satisfies ReadonlyArray<keyof TestComponents>,
			});

			expect(queryDef.with).toEqual(['position', 'velocity']);
			expect(queryDef.without).toEqual(['tag']);
			expect(queryDef.changed).toEqual(['position']);
		});
	});
});
