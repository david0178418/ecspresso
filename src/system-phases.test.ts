import { describe, test, expect } from 'bun:test';
import ECSpresso from './ecspresso';

interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	tag: boolean;
	counter: { value: number };
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

describe('System Phases', () => {
	describe('phase ordering', () => {
		test('systems in different phases execute in phase order regardless of priority', () => {
			const ecs = createEcs();
			const executionOrder: string[] = [];

			// Register in reverse phase order with priorities that would reverse natural order
			ecs.addSystem('render-sys')
				.inPhase('render')
				.setPriority(9999)
				.setProcess(() => { executionOrder.push('render'); })
				.and();

			ecs.addSystem('preUpdate-sys')
				.inPhase('preUpdate')
				.setPriority(0)
				.setProcess(() => { executionOrder.push('preUpdate'); })
				.and();

			ecs.addSystem('update-sys')
				.inPhase('update')
				.setPriority(5000)
				.setProcess(() => { executionOrder.push('update'); })
				.and();

			ecs.addSystem('postUpdate-sys')
				.inPhase('postUpdate')
				.setPriority(100)
				.setProcess(() => { executionOrder.push('postUpdate'); })
				.and();

			ecs.addSystem('fixedUpdate-sys')
				.inPhase('fixedUpdate')
				.setPriority(10000)
				.setProcess(() => { executionOrder.push('fixedUpdate'); })
				.and();

			// Use a deltaTime large enough to trigger one fixedUpdate step
			ecs.update(1 / 60);

			expect(executionOrder).toEqual([
				'preUpdate', 'fixedUpdate', 'update', 'postUpdate', 'render',
			]);
		});
	});

	describe('within-phase priority', () => {
		test('higher priority systems execute first within the same phase', () => {
			const ecs = createEcs();
			const executionOrder: string[] = [];

			ecs.addSystem('low')
				.inPhase('update')
				.setPriority(10)
				.setProcess(() => { executionOrder.push('low'); })
				.and();

			ecs.addSystem('high')
				.inPhase('update')
				.setPriority(100)
				.setProcess(() => { executionOrder.push('high'); })
				.and();

			ecs.addSystem('medium')
				.inPhase('update')
				.setPriority(50)
				.setProcess(() => { executionOrder.push('medium'); })
				.and();

			ecs.update(1 / 60);

			expect(executionOrder).toEqual(['high', 'medium', 'low']);
		});

		test('registration order preserved for same priority within phase', () => {
			const ecs = createEcs();
			const executionOrder: string[] = [];

			ecs.addSystem('first')
				.inPhase('update')
				.setProcess(() => { executionOrder.push('first'); })
				.and();

			ecs.addSystem('second')
				.inPhase('update')
				.setProcess(() => { executionOrder.push('second'); })
				.and();

			ecs.addSystem('third')
				.inPhase('update')
				.setProcess(() => { executionOrder.push('third'); })
				.and();

			ecs.update(1 / 60);

			expect(executionOrder).toEqual(['first', 'second', 'third']);
		});
	});

	describe('default phase', () => {
		test('systems without inPhase() default to update', () => {
			const ecs = createEcs();
			const executionOrder: string[] = [];

			ecs.addSystem('pre')
				.inPhase('preUpdate')
				.setProcess(() => { executionOrder.push('pre'); })
				.and();

			// No inPhase call — should default to 'update'
			ecs.addSystem('default-phase')
				.setProcess(() => { executionOrder.push('default'); })
				.and();

			ecs.addSystem('post')
				.inPhase('postUpdate')
				.setProcess(() => { executionOrder.push('post'); })
				.and();

			ecs.update(1 / 60);

			expect(executionOrder).toEqual(['pre', 'default', 'post']);
		});
	});

	describe('fixedUpdate accumulator', () => {
		test('dt=1/30 with fixedDt=1/60 runs fixedUpdate twice', () => {
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(1 / 60)
				.build();

			let fixedCount = 0;

			ecs.addSystem('fixed')
				.inPhase('fixedUpdate')
				.setProcess(() => { fixedCount++; })
				.and();

			// dt = 1/30 = 2 * (1/60), should step twice
			ecs.update(1 / 30);

			expect(fixedCount).toBe(2);
		});

		test('dt=1/120 with fixedDt=1/60 runs fixedUpdate zero times', () => {
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(1 / 60)
				.build();

			let fixedCount = 0;

			ecs.addSystem('fixed')
				.inPhase('fixedUpdate')
				.setProcess(() => { fixedCount++; })
				.and();

			// dt = 1/120 < 1/60, should not step
			ecs.update(1 / 120);

			expect(fixedCount).toBe(0);
		});

		test('accumulator carries over between frames', () => {
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(1 / 60)
				.build();

			let fixedCount = 0;

			ecs.addSystem('fixed')
				.inPhase('fixedUpdate')
				.setProcess(() => { fixedCount++; })
				.and();

			// First frame: dt = 1/120 (half a step), no execution
			ecs.update(1 / 120);
			expect(fixedCount).toBe(0);

			// Second frame: dt = 1/120 again, accumulator now = 1/60, executes once
			ecs.update(1 / 120);
			expect(fixedCount).toBe(1);
		});
	});

	describe('fixedUpdate receives fixedDt', () => {
		test('fixedUpdate systems receive fixedDt, not the raw frame delta', () => {
			const fixedDt = 1 / 50;
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(fixedDt)
				.build();

			let receivedDt = -1;

			ecs.addSystem('fixed')
				.inPhase('fixedUpdate')
				.setProcess((_q, dt) => { receivedDt = dt; })
				.and();

			// dt large enough to trigger at least one step
			ecs.update(fixedDt);

			expect(receivedDt).toBe(fixedDt);
		});

		test('update phase still receives the raw frame delta', () => {
			const fixedDt = 1 / 50;
			const frameDt = 1 / 30;
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(fixedDt)
				.build();

			let receivedDt = -1;

			ecs.addSystem('normal')
				.inPhase('update')
				.setProcess((_q, dt) => { receivedDt = dt; })
				.and();

			ecs.update(frameDt);

			expect(receivedDt).toBe(frameDt);
		});
	});

	describe('spiral-of-death cap', () => {
		test('large delta capped at 8 fixed steps', () => {
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(1 / 60)
				.build();

			let fixedCount = 0;

			ecs.addSystem('fixed')
				.inPhase('fixedUpdate')
				.setProcess(() => { fixedCount++; })
				.and();

			// dt = 1 second = 60 steps at 1/60, but capped at 8
			ecs.update(1);

			expect(fixedCount).toBe(8);
		});

		test('accumulator resets after hitting spiral-of-death cap', () => {
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(1 / 60)
				.build();

			let fixedCount = 0;

			ecs.addSystem('fixed')
				.inPhase('fixedUpdate')
				.setProcess(() => { fixedCount++; })
				.and();

			// First frame: huge delta, capped at 8
			ecs.update(1);
			expect(fixedCount).toBe(8);

			// Second frame: normal delta, should get 1 step (no leftover from clamped accumulator)
			fixedCount = 0;
			ecs.update(1 / 60);
			expect(fixedCount).toBe(1);
		});
	});

	describe('interpolation alpha', () => {
		test('correct value after update with remainder', () => {
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(1 / 60)
				.build();

			// dt = 1.5 * fixedDt: one step, 0.5 * fixedDt remainder
			ecs.update(1.5 / 60);

			// alpha = remainder / fixedDt = (0.5 / 60) / (1 / 60) = 0.5
			expect(ecs.interpolationAlpha).toBeCloseTo(0.5, 5);
		});

		test('alpha is 0 when accumulator is exactly consumed', () => {
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(1 / 60)
				.build();

			// dt = exactly 1 step
			ecs.update(1 / 60);

			expect(ecs.interpolationAlpha).toBeCloseTo(0, 5);
		});

		test('alpha is 0 before any update', () => {
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(1 / 60)
				.build();

			expect(ecs.interpolationAlpha).toBe(0);
		});
	});

	describe('per-phase command buffer', () => {
		test('entity spawned in preUpdate visible to update', () => {
			const ecs = createEcs();
			let spawnedInPre = false;
			let foundInUpdate = false;

			ecs.addSystem('spawner')
				.inPhase('preUpdate')
				.setProcess((_q, _dt, ecs) => {
					if (!spawnedInPre) {
						ecs.commands.spawn({ tag: true });
						spawnedInPre = true;
					}
				})
				.and();

			ecs.addSystem('checker')
				.inPhase('update')
				.addQuery('tagged', { with: ['tag'] })
				.setProcess((queries) => {
					if (queries.tagged.length > 0) {
						foundInUpdate = true;
					}
				})
				.and();

			ecs.update(1 / 60);

			expect(spawnedInPre).toBe(true);
			expect(foundInUpdate).toBe(true);
		});

		test('entity spawned in fixedUpdate visible to postUpdate', () => {
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(1 / 60)
				.build();

			let spawnedInFixed = false;
			let foundInPostUpdate = false;

			ecs.addSystem('spawner')
				.inPhase('fixedUpdate')
				.setProcess((_q, _dt, ecs) => {
					if (!spawnedInFixed) {
						ecs.commands.spawn({ tag: true });
						spawnedInFixed = true;
					}
				})
				.and();

			ecs.addSystem('checker')
				.inPhase('postUpdate')
				.addQuery('tagged', { with: ['tag'] })
				.setProcess((queries) => {
					if (queries.tagged.length > 0) {
						foundInPostUpdate = true;
					}
				})
				.and();

			ecs.update(1 / 60);

			expect(spawnedInFixed).toBe(true);
			expect(foundInPostUpdate).toBe(true);
		});
	});

	describe('change detection across phases', () => {
		test('marks from preUpdate visible to update phase', () => {
			const ecs = createEcs();
			const e = ecs.spawn({ position: { x: 0, y: 0 } });

			// Flush spawn marks
			ecs.update(0);

			let changedSeenInUpdate = false;

			ecs.addSystem('marker')
				.inPhase('preUpdate')
				.setProcess((_q, _dt, ecs) => {
					ecs.markChanged(e.id, 'position');
				})
				.and();

			ecs.addSystem('reader')
				.inPhase('update')
				.addQuery('changed', { with: ['position'], changed: ['position'] })
				.setProcess((queries) => {
					if (queries.changed.length > 0) {
						changedSeenInUpdate = true;
					}
				})
				.and();

			ecs.update(1 / 60);

			expect(changedSeenInUpdate).toBe(true);
		});

		test('marks from fixedUpdate visible to postUpdate', () => {
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(1 / 60)
				.build();

			const e = ecs.spawn({ position: { x: 0, y: 0 } });

			// Flush spawn marks
			ecs.update(0);

			let changedSeenInPost = false;

			ecs.addSystem('marker')
				.inPhase('fixedUpdate')
				.setProcess((_q, _dt, ecs) => {
					ecs.markChanged(e.id, 'position');
				})
				.and();

			ecs.addSystem('reader')
				.inPhase('postUpdate')
				.addQuery('changed', { with: ['position'], changed: ['position'] })
				.setProcess((queries) => {
					if (queries.changed.length > 0) {
						changedSeenInPost = true;
					}
				})
				.and();

			ecs.update(1 / 60);

			expect(changedSeenInPost).toBe(true);
		});
	});

	describe('builder API', () => {
		test('inPhase() sets phase on the system', () => {
			const ecs = createEcs();
			const executionOrder: string[] = [];

			ecs.addSystem('post')
				.inPhase('postUpdate')
				.setProcess(() => { executionOrder.push('post'); })
				.and();

			ecs.addSystem('pre')
				.inPhase('preUpdate')
				.setProcess(() => { executionOrder.push('pre'); })
				.and();

			ecs.update(1 / 60);

			expect(executionOrder).toEqual(['pre', 'post']);
		});

		test('withFixedTimestep() configures dt', () => {
			const customDt = 1 / 30;
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(customDt)
				.build();

			expect(ecs.fixedDt).toBe(customDt);
		});

		test('default fixedDt is 1/60', () => {
			const ecs = createEcs();
			expect(ecs.fixedDt).toBe(1 / 60);
		});
	});

	describe('runtime phase change', () => {
		test('updateSystemPhase() moves system to a different phase', () => {
			const ecs = createEcs();
			const executionOrder: string[] = [];

			ecs.addSystem('mover')
				.inPhase('update')
				.setProcess(() => { executionOrder.push('mover'); })
				.and();

			ecs.addSystem('pre')
				.inPhase('preUpdate')
				.setProcess(() => { executionOrder.push('pre'); })
				.and();

			// First update: pre runs in preUpdate, mover runs in update phase
			ecs.update(1 / 60);
			expect(executionOrder).toEqual(['pre', 'mover']);

			// Move mover to preUpdate
			executionOrder.length = 0;
			const result = ecs.updateSystemPhase('mover', 'preUpdate');
			expect(result).toBe(true);

			ecs.update(1 / 60);
			// Both in preUpdate: mover was registered first, so it runs first (same priority)
			expect(executionOrder).toEqual(['mover', 'pre']);
		});

		test('updateSystemPhase() returns false for unknown system', () => {
			const ecs = createEcs();
			expect(ecs.updateSystemPhase('nonexistent', 'render')).toBe(false);
		});
	});

	describe('orthogonal features work within phases', () => {
		test('system groups work within phases', () => {
			const ecs = createEcs();
			const executionOrder: string[] = [];

			ecs.addSystem('grouped')
				.inPhase('update')
				.inGroup('myGroup')
				.setProcess(() => { executionOrder.push('grouped'); })
				.and();

			ecs.addSystem('ungrouped')
				.inPhase('update')
				.setProcess(() => { executionOrder.push('ungrouped'); })
				.and();

			// Disable the group
			ecs.disableSystemGroup('myGroup');
			ecs.update(1 / 60);

			expect(executionOrder).toEqual(['ungrouped']);

			// Enable the group
			executionOrder.length = 0;
			ecs.enableSystemGroup('myGroup');
			ecs.update(1 / 60);

			expect(executionOrder).toEqual(['grouped', 'ungrouped']);
		});

		test('removeSystem works with phased systems', () => {
			const ecs = createEcs();
			const executionOrder: string[] = [];

			ecs.addSystem('a')
				.inPhase('preUpdate')
				.setProcess(() => { executionOrder.push('a'); })
				.and();

			ecs.addSystem('b')
				.inPhase('update')
				.setProcess(() => { executionOrder.push('b'); })
				.and();

			ecs.update(1 / 60);
			expect(executionOrder).toEqual(['a', 'b']);

			executionOrder.length = 0;
			ecs.removeSystem('a');
			ecs.update(1 / 60);
			expect(executionOrder).toEqual(['b']);
		});

		test('updateSystemPriority works within phases', () => {
			const ecs = createEcs();
			const executionOrder: string[] = [];

			ecs.addSystem('a')
				.inPhase('update')
				.setPriority(10)
				.setProcess(() => { executionOrder.push('a'); })
				.and();

			ecs.addSystem('b')
				.inPhase('update')
				.setPriority(20)
				.setProcess(() => { executionOrder.push('b'); })
				.and();

			// b (20) before a (10)
			ecs.update(1 / 60);
			expect(executionOrder).toEqual(['b', 'a']);

			// Flip priorities
			executionOrder.length = 0;
			ecs.updateSystemPriority('a', 30);
			ecs.update(1 / 60);
			expect(executionOrder).toEqual(['a', 'b']);
		});
	});

	describe('phases with no systems', () => {
		test('empty phases do not cause errors', () => {
			const ecs = createEcs();

			// Only add a render phase system, all others empty
			ecs.addSystem('render-only')
				.inPhase('render')
				.setProcess(() => {})
				.and();

			// Should not throw
			ecs.update(1 / 60);
		});
	});

	describe('multiple fixedUpdate steps process queries correctly', () => {
		test('entity state accumulates across fixed steps', () => {
			const ecs = ECSpresso.create<TestComponents, TestEvents, TestResources>()
				.withFixedTimestep(1 / 60)
				.build();

			const e = ecs.spawn({ counter: { value: 0 } });

			ecs.addSystem('increment')
				.inPhase('fixedUpdate')
				.addQuery('counters', { with: ['counter'] })
				.setProcess((queries) => {
					for (const entity of queries.counters) {
						entity.components.counter.value++;
					}
				})
				.and();

			// dt = 2/60 => two fixed steps
			ecs.update(2 / 60);

			const counter = ecs.entityManager.getComponent(e.id, 'counter');
			expect(counter?.value).toBe(2);
		});
	});
});
