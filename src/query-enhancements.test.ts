import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import { createQueryDefinition, type QueryResultEntity } from './types';
import type { WorldConfigFrom } from './type-utils';

interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	health: { value: number };
	sprite: { texture: string };
	dead: true;
	tag: string;
	parentMarker: true;
	childMarker: true;
}

// ==================== Optional Components ====================

describe('Optional Components', () => {
	test('entity with optional component present returns its value', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const results: Array<{ pos: { x: number; y: number }; hp: { value: number } | undefined }> = [];

		world.addSystem('test')
			.addQuery('entities', {
				with: ['position'],
				optional: ['health'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) {
					results.push({
						pos: entity.components.position,
						hp: entity.components.health,
					});
				}
			});

		world.spawn({ position: { x: 1, y: 2 }, health: { value: 100 } });
		world.update(0);

		expect(results).toHaveLength(1);
		expect(results[0]!.pos).toEqual({ x: 1, y: 2 });
		expect(results[0]!.hp).toEqual({ value: 100 });
	});

	test('entity without optional component returns undefined', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const results: Array<{ pos: { x: number; y: number }; hp: { value: number } | undefined }> = [];

		world.addSystem('test')
			.addQuery('entities', {
				with: ['position'],
				optional: ['health'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) {
					results.push({
						pos: entity.components.position,
						hp: entity.components.health,
					});
				}
			});

		world.spawn({ position: { x: 1, y: 2 } });
		world.update(0);

		expect(results).toHaveLength(1);
		expect(results[0]!.pos).toEqual({ x: 1, y: 2 });
		expect(results[0]!.hp).toBeUndefined();
	});

	test('optional does NOT affect matching - entity without optional still appears', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const matched: number[] = [];

		world.addSystem('test')
			.addQuery('entities', {
				with: ['position'],
				optional: ['health'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) {
					matched.push(entity.id);
				}
			});

		const e1 = world.spawn({ position: { x: 0, y: 0 }, health: { value: 100 } });
		const e2 = world.spawn({ position: { x: 1, y: 1 } }); // no health
		world.update(0);

		expect(matched.sort()).toEqual([e1.id, e2.id].sort());
	});

	test('optional component type is T | undefined (type-level check)', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();

		world.addSystem('test')
			.addQuery('entities', {
				with: ['position'],
				optional: ['health'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) {
					// health should be { value: number } | undefined
					// @ts-expect-error - cannot access .value directly without narrowing, it might be undefined
					const _hp: number = entity.components.health.value;
				}
			});
	});

	test('works with createQueryDefinition + QueryResultEntity', () => {
		const _query = createQueryDefinition({
			with: ['position'],
			without: ['dead'],
			optional: ['health'],
		});

		type Entity = QueryResultEntity<TestComponents, typeof _query>;

		function process(entity: Entity) {
			// position is guaranteed
			const x: number = entity.components.position.x;
			// health is T | undefined
			const hp: { value: number } | undefined = entity.components.health;
			// dead is excluded
			// @ts-expect-error - dead should not be accessible
			const _d = entity.components.dead;
			return { x, hp };
		}

		expect(typeof process).toBe('function');
	});
});

// ==================== Singleton Queries ====================

describe('Singleton Queries', () => {
	describe('getSingleton', () => {
		test('returns the entity when exactly 1 match', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
			const entity = world.spawn({ position: { x: 5, y: 10 }, tag: 'player' });

			const result = world.getSingleton(['position', 'tag']);
			expect(result.id).toBe(entity.id);
			expect(result.components.position).toEqual({ x: 5, y: 10 });
			expect(result.components.tag).toBe('player');
		});

		test('throws when 0 matches', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();

			expect(() => world.getSingleton(['position', 'tag'])).toThrow();
		});

		test('throws when >1 matches', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
			world.spawn({ position: { x: 0, y: 0 }, tag: 'a' });
			world.spawn({ position: { x: 1, y: 1 }, tag: 'b' });

			expect(() => world.getSingleton(['position', 'tag'])).toThrow();
		});

		test('supports without filter', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
			world.spawn({ position: { x: 0, y: 0 }, dead: true });
			const alive = world.spawn({ position: { x: 1, y: 1 } });

			const result = world.getSingleton(['position'], ['dead']);
			expect(result.id).toBe(alive.id);
		});
	});

	describe('tryGetSingleton', () => {
		test('returns entity when exactly 1 match', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
			const entity = world.spawn({ position: { x: 5, y: 10 } });

			const result = world.tryGetSingleton(['position']);
			expect(result).toBeDefined();
			expect(result!.id).toBe(entity.id);
		});

		test('returns undefined when 0 matches', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();

			const result = world.tryGetSingleton(['position']);
			expect(result).toBeUndefined();
		});

		test('throws when >1 matches', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
			world.spawn({ position: { x: 0, y: 0 } });
			world.spawn({ position: { x: 1, y: 1 } });

			expect(() => world.tryGetSingleton(['position'])).toThrow();
		});

		test('correct type narrowing on returned entity', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
			world.spawn({ position: { x: 5, y: 10 }, velocity: { x: 1, y: 1 } });

			const result = world.getSingleton(['position', 'velocity']);
			// Type system should guarantee these exist
			const x: number = result.components.position.x;
			const vx: number = result.components.velocity.x;
			expect(x).toBe(5);
			expect(vx).toBe(1);
		});
	});
});

// ==================== parentHas Relationship Queries ====================

describe('parentHas Relationship Queries', () => {
	test('only entities whose parent has specified components match', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const matched: number[] = [];

		world.addSystem('test')
			.addQuery('entities', {
				with: ['childMarker'],
				parentHas: ['parentMarker'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) {
					matched.push(entity.id);
				}
			});

		const parent = world.spawn({ parentMarker: true as const });
		const child = world.spawnChild(parent.id, { childMarker: true as const });

		world.update(0);
		expect(matched).toEqual([child.id]);
	});

	test('entity with no parent excluded', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const matched: number[] = [];

		world.addSystem('test')
			.addQuery('entities', {
				with: ['childMarker'],
				parentHas: ['parentMarker'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) {
					matched.push(entity.id);
				}
			});

		// Orphan entity - no parent
		world.spawn({ childMarker: true as const });
		world.update(0);

		expect(matched).toEqual([]);
	});

	test('entity whose parent lacks component excluded', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const matched: number[] = [];

		world.addSystem('test')
			.addQuery('entities', {
				with: ['childMarker'],
				parentHas: ['parentMarker'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) {
					matched.push(entity.id);
				}
			});

		// Parent without the required marker
		const parent = world.spawn({ position: { x: 0, y: 0 } });
		world.spawnChild(parent.id, { childMarker: true as const });

		world.update(0);
		expect(matched).toEqual([]);
	});

	test('multiple parentHas components require ALL present on parent', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const matched: number[] = [];

		world.addSystem('test')
			.addQuery('entities', {
				with: ['childMarker'],
				parentHas: ['parentMarker', 'position'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) {
					matched.push(entity.id);
				}
			});

		// Parent with only one of the two required components
		const partialParent = world.spawn({ parentMarker: true as const });
		world.spawnChild(partialParent.id, { childMarker: true as const });

		// Parent with both required components
		const fullParent = world.spawn({ parentMarker: true as const, position: { x: 0, y: 0 } });
		const matchingChild = world.spawnChild(fullParent.id, { childMarker: true as const });

		world.update(0);
		expect(matched).toEqual([matchingChild.id]);
	});

	test('combined with with/without filters', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const matched: number[] = [];

		world.addSystem('test')
			.addQuery('entities', {
				with: ['childMarker', 'health'],
				without: ['dead'],
				parentHas: ['parentMarker'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) {
					matched.push(entity.id);
				}
			});

		const parent = world.spawn({ parentMarker: true as const });
		// has health, no dead, has parent with marker -> should match
		const good = world.spawnChild(parent.id, { childMarker: true as const, health: { value: 100 } });
		// has health AND dead -> should NOT match (without filter)
		world.spawnChild(parent.id, { childMarker: true as const, health: { value: 50 }, dead: true as const });
		// missing health -> should NOT match (with filter)
		world.spawnChild(parent.id, { childMarker: true as const });

		world.update(0);
		expect(matched).toEqual([good.id]);
	});

	test('grandparent components NOT checked (direct parent only)', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const matched: number[] = [];

		world.addSystem('test')
			.addQuery('entities', {
				with: ['childMarker'],
				parentHas: ['parentMarker'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) {
					matched.push(entity.id);
				}
			});

		// grandparent has marker, but parent does not
		const grandparent = world.spawn({ parentMarker: true as const });
		const middleParent = world.spawnChild(grandparent.id, { position: { x: 0, y: 0 } });
		world.spawnChild(middleParent.id, { childMarker: true as const });

		world.update(0);
		expect(matched).toEqual([]);
	});

	test('works through addQuery in system builder', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const matched: number[] = [];

		world.addSystem('test')
			.addQuery('children', {
				with: ['position'],
				parentHas: ['tag'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.children) {
					matched.push(entity.id);
				}
			});

		const parent = world.spawn({ tag: 'container' });
		const child = world.spawnChild(parent.id, { position: { x: 0, y: 0 } });

		world.update(0);
		expect(matched).toEqual([child.id]);
	});

	describe('reactive query integration', () => {
		test('onEnter fires when spawned as child of qualifying parent', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
			const entered: number[] = [];

			world.addReactiveQuery('children', {
				with: ['childMarker'],
				parentHas: ['parentMarker'],
				onEnter: (entity) => { entered.push(entity.id); },
			});

			const parent = world.spawn({ parentMarker: true as const });
			const child = world.spawnChild(parent.id, { childMarker: true as const });

			expect(entered).toEqual([child.id]);
		});

		test('onEnter fires when reparented to qualifying parent', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
			const entered: number[] = [];

			world.addReactiveQuery('children', {
				with: ['childMarker'],
				parentHas: ['parentMarker'],
				onEnter: (entity) => { entered.push(entity.id); },
			});

			const parent = world.spawn({ parentMarker: true as const });
			const child = world.spawn({ childMarker: true as const });
			expect(entered).toEqual([]); // Not matching yet - no parent

			world.setParent(child.id, parent.id);
			expect(entered).toEqual([child.id]);
		});

		test('onExit fires when orphaned', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
			const exited: number[] = [];

			world.addReactiveQuery('children', {
				with: ['childMarker'],
				parentHas: ['parentMarker'],
				onExit: (entityId) => { exited.push(entityId); },
			});

			const parent = world.spawn({ parentMarker: true as const });
			const child = world.spawnChild(parent.id, { childMarker: true as const });

			world.removeParent(child.id);
			expect(exited).toEqual([child.id]);
		});

		test('onExit fires when parent loses required component', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
			const exited: number[] = [];

			world.addReactiveQuery('children', {
				with: ['childMarker'],
				parentHas: ['parentMarker'],
				onExit: (entityId) => { exited.push(entityId); },
			});

			const parent = world.spawn({ parentMarker: true as const });
			const child = world.spawnChild(parent.id, { childMarker: true as const });

			world.entityManager.removeComponent(parent.id, 'parentMarker');
			expect(exited).toEqual([child.id]);
		});

		test('onEnter fires when parent gains required component', () => {
			const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
			const entered: number[] = [];

			world.addReactiveQuery('children', {
				with: ['childMarker'],
				parentHas: ['parentMarker'],
				onEnter: (entity) => { entered.push(entity.id); },
			});

			const parent = world.spawn({ position: { x: 0, y: 0 } });
			const child = world.spawnChild(parent.id, { childMarker: true as const });
			expect(entered).toEqual([]); // parent doesn't have parentMarker yet

			world.entityManager.addComponent(parent.id, 'parentMarker', true);
			expect(entered).toEqual([child.id]);
		});
	});
});

// ==================== Query mutates ====================
//
// Verification strategy: downstream systems with `changed: [...]` filters are
// the realistic way to observe auto-marks. Direct `world.getEntitiesWithQuery`
// calls use the *instance* change threshold which advances past all marks at
// end of update, so post-update queries see nothing by design.

describe('query mutates', () => {
	test('auto-marks every iterated entity after process()', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const e1 = world.spawn({ position: { x: 0, y: 0 } });
		const e2 = world.spawn({ position: { x: 1, y: 1 } });
		const consumerSeen: number[] = [];

		world.addSystem('producer')
			.setPriority(10)
			.addQuery('entities', {
				with: ['position'],
				mutates: ['position'],
			})
			.setProcess(() => {});

		world.addSystem('consumer')
			.setPriority(0)
			.addQuery('entities', {
				with: ['position'],
				changed: ['position'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) consumerSeen.push(entity.id);
			});

		world.update(0);

		expect(consumerSeen.sort()).toEqual([e1.id, e2.id].sort());
	});

	test('absence of mutates preserves current behavior (no auto-mark)', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		world.spawn({ position: { x: 0, y: 0 } });
		const consumerSeenPerTick: number[] = [];

		world.addSystem('noop')
			.setPriority(10)
			.addQuery('entities', {
				with: ['position'],
			})
			.setProcess(() => {});

		world.addSystem('consumer')
			.setPriority(0)
			.addQuery('entities', {
				with: ['position'],
				changed: ['position'],
			})
			.runWhenEmpty()
			.setProcess(({ queries }) => {
				consumerSeenPerTick.push(queries.entities.length);
			});

		// Tick 1: spawn marks visible. Consumer sees 1.
		world.update(0);
		// Tick 2: spawn mark was consumed; producer did NOT auto-mark → consumer sees 0.
		world.update(0);

		expect(consumerSeenPerTick).toEqual([1, 0]);
	});

	test('empty query with mutates is a no-op', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();

		world.addSystem('empty')
			.addQuery('entities', {
				with: ['position'],
				mutates: ['position'],
			})
			.setProcess(() => {});

		expect(() => world.update(0)).not.toThrow();
	});

	test('multi-component mutates stamps all listed components', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const e1 = world.spawn({ position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } });
		const posSeen: number[] = [];
		const velSeen: number[] = [];

		world.addSystem('producer')
			.setPriority(10)
			.addQuery('entities', {
				with: ['position', 'velocity'],
				mutates: ['position', 'velocity'],
			})
			.setProcess(() => {});

		world.addSystem('pos-consumer')
			.setPriority(1)
			.addQuery('entities', { with: ['position'], changed: ['position'] })
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) posSeen.push(entity.id);
			});

		world.addSystem('vel-consumer')
			.setPriority(0)
			.addQuery('entities', { with: ['velocity'], changed: ['velocity'] })
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) velSeen.push(entity.id);
			});

		world.update(0);

		expect(posSeen).toEqual([e1.id]);
		expect(velSeen).toEqual([e1.id]);
	});

	test('singleton with mutates stamps the resolved entity', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const e1 = world.spawn({ position: { x: 0, y: 0 }, tag: 'player' });
		const consumerSeen: number[] = [];

		world.addSystem('producer')
			.setPriority(10)
			.addSingleton('player', {
				with: ['position', 'tag'],
				mutates: ['position'],
			})
			.setProcess(() => {});

		world.addSystem('consumer')
			.setPriority(0)
			.addQuery('entities', { with: ['position'], changed: ['position'] })
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) consumerSeen.push(entity.id);
			});

		world.update(0);

		expect(consumerSeen).toEqual([e1.id]);
	});

	test('absent singleton with mutates is a no-op', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();

		world.addSystem('single')
			.addSingleton('player', {
				with: ['position', 'tag'],
				mutates: ['position'],
			})
			.setProcess(() => {});

		expect(() => world.update(0)).not.toThrow();
	});

	test('mixed queries: only the mutating one auto-marks', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const posOnly = world.spawn({ position: { x: 0, y: 0 } });
		world.spawn({ velocity: { x: 0, y: 0 } });

		const posSeenPerTick: number[] = [];
		const velSeenPerTick: number[] = [];

		world.addSystem('producer')
			.setPriority(10)
			.addQuery('mutators', {
				with: ['position'],
				mutates: ['position'],
			})
			.addQuery('readers', {
				with: ['velocity'],
			})
			.setProcess(() => {});

		world.addSystem('pos-consumer')
			.setPriority(1)
			.addQuery('entities', { with: ['position'], changed: ['position'] })
			.runWhenEmpty()
			.setProcess(({ queries }) => {
				posSeenPerTick.push(queries.entities[0]?.id ?? -1);
			});

		world.addSystem('vel-consumer')
			.setPriority(0)
			.addQuery('entities', { with: ['velocity'], changed: ['velocity'] })
			.runWhenEmpty()
			.setProcess(({ queries }) => {
				velSeenPerTick.push(queries.entities.length);
			});

		// Tick 1: spawn marks visible. Not a clean signal for auto-mark.
		world.update(0);
		// Tick 2: spawn marks consumed. Only auto-marks from producer visible.
		world.update(0);

		expect(posSeenPerTick[1]).toBe(posOnly.id);
		expect(velSeenPerTick[1]).toBe(0);
	});

	test('downstream system with changed filter sees auto-marked entities', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const e1 = world.spawn({ position: { x: 0, y: 0 } });
		const consumerSeen: number[] = [];

		world.addSystem('producer')
			.setPriority(10)
			.addQuery('entities', {
				with: ['position'],
				mutates: ['position'],
			})
			.setProcess(() => {});

		world.addSystem('consumer')
			.setPriority(0)
			.addQuery('entities', {
				with: ['position'],
				changed: ['position'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) {
					consumerSeen.push(entity.id);
				}
			});

		world.update(0);

		expect(consumerSeen).toEqual([e1.id]);
	});

	test('system does not re-fire on its own auto-marks (no feedback loop)', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		world.spawn({ position: { x: 0, y: 0 } });
		const seenPerTick: number[] = [];

		world.addSystem('feedback')
			.addQuery('entities', {
				with: ['position'],
				changed: ['position'],
				mutates: ['position'],
			})
			.runWhenEmpty()
			.setProcess(({ queries }) => {
				seenPerTick.push(queries.entities.length);
			});

		// Tick 1: spawn mark visible → fires with 1 result. Auto-marks the entity.
		world.update(0);
		// Tick 2: threshold advanced past tick 1's marks (including the system's
		// own auto-marks) → query empty.
		world.update(0);
		// Tick 3: still empty.
		world.update(0);

		expect(seenPerTick).toEqual([1, 0, 0]);
	});

	test('setProcessEach + mutates stamps every iterated entity by default', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const e1 = world.spawn({ position: { x: 0, y: 0 } });
		const e2 = world.spawn({ position: { x: 1, y: 1 } });
		const consumerSeen: number[] = [];

		world.addSystem('producer')
			.setPriority(10)
			.setProcessEach(
				{ with: ['position'], mutates: ['position'] },
				() => {},
			);

		world.addSystem('consumer')
			.setPriority(0)
			.addQuery('entities', { with: ['position'], changed: ['position'] })
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) consumerSeen.push(entity.id);
			});

		world.update(0);

		expect(consumerSeen.sort()).toEqual([e1.id, e2.id].sort());
	});

	test('setProcessEach + mutates + return false skips auto-mark for that entity', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const stays = world.spawn({ position: { x: 0, y: 0 } });
		const skipped = world.spawn({ position: { x: 999, y: 999 } });
		const consumerSeenPerTick: Array<number[]> = [];

		world.addSystem('producer')
			.setPriority(10)
			.setProcessEach(
				{ with: ['position'], mutates: ['position'] },
				({ entity }) => {
					if (entity.id === skipped.id) return false;
					return true;
				},
			);

		world.addSystem('consumer')
			.setPriority(0)
			.addQuery('entities', { with: ['position'], changed: ['position'] })
			.runWhenEmpty()
			.setProcess(({ queries }) => {
				consumerSeenPerTick.push(queries.entities.map(e => e.id));
			});

		// Tick 1: spawn marks; consumer sees both.
		world.update(0);
		// Tick 2: producer's auto-mark skipped `skipped` → consumer sees only stays.
		world.update(0);

		expect(consumerSeenPerTick[1]).toEqual([stays.id]);
	});

	test('setProcessEach + mutates + return true stamps the entity', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		const e1 = world.spawn({ position: { x: 0, y: 0 } });
		const consumerSeen: number[] = [];

		world.addSystem('producer')
			.setPriority(10)
			.setProcessEach(
				{ with: ['position'], mutates: ['position'] },
				() => true,
			);

		world.addSystem('consumer')
			.setPriority(0)
			.addQuery('entities', { with: ['position'], changed: ['position'] })
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) consumerSeen.push(entity.id);
			});

		world.update(0);

		expect(consumerSeen).toEqual([e1.id]);
	});

	test('setProcessEach without mutates ignores return value', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();
		world.spawn({ position: { x: 0, y: 0 } });
		const consumerSeenPerTick: number[] = [];

		world.addSystem('producer')
			.setPriority(10)
			.setProcessEach(
				{ with: ['position'] },
				() => false,
			);

		world.addSystem('consumer')
			.setPriority(0)
			.addQuery('entities', { with: ['position'], changed: ['position'] })
			.runWhenEmpty()
			.setProcess(({ queries }) => {
				consumerSeenPerTick.push(queries.entities.length);
			});

		// Tick 1: spawn marks visible.
		world.update(0);
		// Tick 2: return-false was ignored because mutates wasn't declared — no auto-mark.
		world.update(0);

		expect(consumerSeenPerTick).toEqual([1, 0]);
	});

	test('readonly type narrowing: mutating a non-listed with-component is a type error', () => {
		const world = new ECSpresso<WorldConfigFrom<TestComponents>>();

		world.addSystem('readonly-narrowing')
			.addQuery('entities', {
				with: ['position', 'velocity'],
				mutates: ['position'],
			})
			.setProcess(({ queries }) => {
				for (const entity of queries.entities) {
					// position is in mutates → writable
					entity.components.position.x = 0;
					// velocity is in with but not mutates → readonly
					// @ts-expect-error velocity should be Readonly when not in mutates
					entity.components.velocity.x = 0;
				}
			});

		// No spawns; just verify the type-level assertion compiles under @ts-expect-error
		expect(() => world.update(0)).not.toThrow();
	});

	test('createQueryDefinition + mutates narrows correctly via QueryResultEntity', () => {
		const _query = createQueryDefinition({
			with: ['position', 'velocity'],
			mutates: ['position'],
		});

		type Entity = QueryResultEntity<TestComponents, typeof _query>;

		function process(entity: Entity) {
			// position is writable
			entity.components.position.x = 1;
			// velocity is readonly
			// @ts-expect-error velocity should be Readonly when not in mutates
			entity.components.velocity.x = 2;
			return entity.components.position.x;
		}

		expect(typeof process).toBe('function');
	});
});
