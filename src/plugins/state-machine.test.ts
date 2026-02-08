import { describe, test, expect } from 'bun:test';
import ECSpresso from '../ecspresso';
import type { Plugin } from '../plugin';
import {
	defineStateMachine,
	createStateMachine,
	createStateMachinePlugin,
	createStateMachineHelpers,
	transitionTo,
	sendEvent,
	getStateMachineState,
	type StateMachine,
	type StateMachineComponentTypes,
	type StateMachineEventTypes,
	type StateMachineWorld,
	type StateTransitionEvent,
	type StatesOf,
} from './state-machine';

// ==================== Test Types ====================

interface TestComponents extends StateMachineComponentTypes {
	position: { x: number; y: number };
	health: number;
}

interface TestEvents extends StateMachineEventTypes {
	damaged: { entityId: number };
}

interface TestResources {
	playerNearby: boolean;
}

// ==================== Test Helpers ====================

function createTestEcs() {
	return ECSpresso
		.create<TestComponents, TestEvents, TestResources>()
		.withPlugin(createStateMachinePlugin())
		.withResource('playerNearby', false)
		.build();
}

const simpleFSM = defineStateMachine('simple', {
	initial: 'idle',
	states: {
		idle: {},
		walking: {},
		running: {},
	},
});

// ==================== Tests ====================

describe('State Machine Plugin', () => {
	// --- defineStateMachine ---

	describe('defineStateMachine', () => {
		test('creates definition with correct id, initial, and states', () => {
			const def = defineStateMachine('enemy', {
				initial: 'patrol',
				states: {
					patrol: {},
					chase: {},
					attack: {},
				},
			});

			expect(def.id).toBe('enemy');
			expect(def.initial).toBe('patrol');
			expect(Object.keys(def.states)).toEqual(['patrol', 'chase', 'attack']);
		});

		test('returns a frozen object', () => {
			const def = defineStateMachine('test', {
				initial: 'a',
				states: { a: {}, b: {} },
			});

			expect(Object.isFrozen(def)).toBe(true);
			expect(Object.isFrozen(def.states)).toBe(true);
		});
	});

	// --- createStateMachine ---

	describe('createStateMachine', () => {
		test('returns component with initial state, null previous, 0 stateTime', () => {
			const result = createStateMachine(simpleFSM);

			expect(result.stateMachine.current).toBe('idle');
			expect(result.stateMachine.previous).toBeNull();
			expect(result.stateMachine.stateTime).toBe(0);
			expect(result.stateMachine.definition).toBe(simpleFSM);
		});

		test('overrides initial state when specified', () => {
			const result = createStateMachine(simpleFSM, { initial: 'running' });

			expect(result.stateMachine.current).toBe('running');
			expect(result.stateMachine.previous).toBeNull();
			expect(result.stateMachine.stateTime).toBe(0);
		});
	});

	// --- onEnter lifecycle ---

	describe('onEnter', () => {
		test('called on first update tick for initial state', () => {
			const ecs = createTestEcs();
			const enterCalls: number[] = [];

			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						onEnter: (_ecs, entityId) => { enterCalls.push(entityId); },
					},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });

			expect(enterCalls).toEqual([]);
			ecs.update(1 / 60);
			expect(enterCalls).toEqual([entity.id]);
		});

		test('not called again on subsequent ticks', () => {
			const ecs = createTestEcs();
			let enterCount = 0;

			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						onEnter: () => { enterCount++; },
					},
				},
			});

			ecs.spawn({ ...createStateMachine(fsm) });

			ecs.update(1 / 60);
			ecs.update(1 / 60);
			ecs.update(1 / 60);
			expect(enterCount).toBe(1);
		});
	});

	// --- onUpdate lifecycle ---

	describe('onUpdate', () => {
		test('called each tick with correct deltaTime', () => {
			const ecs = createTestEcs();
			const updateDts: number[] = [];

			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						onUpdate: (_ecs, _id, dt) => { updateDts.push(dt); },
					},
				},
			});

			ecs.spawn({ ...createStateMachine(fsm) });

			ecs.update(1 / 60);
			ecs.update(1 / 30);
			ecs.update(1 / 120);

			expect(updateDts).toEqual([1 / 60, 1 / 30, 1 / 120]);
		});
	});

	// --- onExit lifecycle ---

	describe('onExit', () => {
		test('called when leaving a state via transitionTo', () => {
			const ecs = createTestEcs();
			let exitCalled = false;

			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						onExit: () => { exitCalled = true; },
					},
					walking: {},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });

			// Initialize the entity
			ecs.update(1 / 60);
			expect(exitCalled).toBe(false);

			transitionTo(ecs, entity.id, 'walking');
			expect(exitCalled).toBe(true);
		});
	});

	// --- Guard transitions ---

	describe('guard transitions', () => {
		test('evaluated each tick, fires when guard returns true', () => {
			const ecs = createTestEcs();
			let shouldTransition = false;

			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						transitions: [{
							target: 'alert',
							guard: () => shouldTransition,
						}],
					},
					alert: {},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });

			// First tick: guard fails, stay in idle
			ecs.update(1 / 60);
			expect(getStateMachineState(ecs, entity.id)).toBe('idle');

			// Second tick: guard still fails
			ecs.update(1 / 60);
			expect(getStateMachineState(ecs, entity.id)).toBe('idle');

			// Enable guard
			shouldTransition = true;
			ecs.update(1 / 60);
			expect(getStateMachineState(ecs, entity.id)).toBe('alert');
		});

		test('first passing guard wins', () => {
			const ecs = createTestEcs();

			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						transitions: [
							{ target: 'first', guard: () => true },
							{ target: 'second', guard: () => true },
						],
					},
					first: {},
					second: {},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			expect(getStateMachineState(ecs, entity.id)).toBe('first');
		});
	});

	// --- transitionTo ---

	describe('transitionTo', () => {
		test('changes state, fires hooks, returns true', () => {
			const ecs = createTestEcs();
			const log: string[] = [];

			const fsm = defineStateMachine('test', {
				initial: 'a',
				states: {
					a: {
						onExit: () => { log.push('exit-a'); },
					},
					b: {
						onEnter: () => { log.push('enter-b'); },
					},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60); // Initialize

			const result = transitionTo(ecs, entity.id, 'b');

			expect(result).toBe(true);
			expect(getStateMachineState(ecs, entity.id)).toBe('b');
			expect(log).toEqual(['exit-a', 'enter-b']);
		});

		test('invalid target returns false', () => {
			const ecs = createTestEcs();

			const fsm = defineStateMachine('test', {
				initial: 'a',
				states: { a: {}, b: {} },
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			const result = transitionTo(ecs, entity.id, 'nonexistent');
			expect(result).toBe(false);
			expect(getStateMachineState(ecs, entity.id)).toBe('a');
		});

		test('returns false for entity without stateMachine', () => {
			const ecs = createTestEcs();
			const entity = ecs.spawn({ position: { x: 0, y: 0 } });

			const result = transitionTo(ecs, entity.id, 'idle');
			expect(result).toBe(false);
		});
	});

	// --- sendEvent ---

	describe('sendEvent', () => {
		test('matches on handler and transitions', () => {
			const ecs = createTestEcs();

			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						on: { startWalk: 'walking' },
					},
					walking: {},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			const result = sendEvent(ecs, entity.id, 'startWalk');
			expect(result).toBe(true);
			expect(getStateMachineState(ecs, entity.id)).toBe('walking');
		});

		test('respects guard in on handler', () => {
			const ecs = createTestEcs();
			let allowed = false;

			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						on: {
							tryWalk: {
								target: 'walking',
								guard: () => allowed,
							},
						},
					},
					walking: {},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			// Guard blocks transition
			const result1 = sendEvent(ecs, entity.id, 'tryWalk');
			expect(result1).toBe(false);
			expect(getStateMachineState(ecs, entity.id)).toBe('idle');

			// Guard allows transition
			allowed = true;
			const result2 = sendEvent(ecs, entity.id, 'tryWalk');
			expect(result2).toBe(true);
			expect(getStateMachineState(ecs, entity.id)).toBe('walking');
		});

		test('no handler returns false', () => {
			const ecs = createTestEcs();

			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						on: { knownEvent: 'walking' },
					},
					walking: {},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			const result = sendEvent(ecs, entity.id, 'unknownEvent');
			expect(result).toBe(false);
		});
	});

	// --- stateTransition event ---

	describe('stateTransition event', () => {
		test('published via eventBus on transition', () => {
			const ecs = createTestEcs();
			const events: StateTransitionEvent[] = [];

			ecs.eventBus.subscribe('stateTransition', (data) => {
				events.push(data);
			});

			const fsm = defineStateMachine('enemy', {
				initial: 'idle',
				states: {
					idle: {},
					chase: {},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			transitionTo(ecs, entity.id, 'chase');

			expect(events).toHaveLength(1);
			expect(events[0]!.entityId).toBe(entity.id);
			expect(events[0]!.from).toBe('idle');
			expect(events[0]!.to).toBe('chase');
			expect(events[0]!.definitionId).toBe('enemy');
		});
	});

	// --- previousState tracking ---

	describe('previousState tracking', () => {
		test('tracks previous state across transitions', () => {
			const ecs = createTestEcs();

			const entity = ecs.spawn({ ...createStateMachine(simpleFSM) });
			ecs.update(1 / 60);

			expect(ecs.entityManager.getComponent(entity.id, 'stateMachine')!.previous).toBeNull();

			transitionTo(ecs, entity.id, 'walking');
			expect(ecs.entityManager.getComponent(entity.id, 'stateMachine')!.previous).toBe('idle');

			transitionTo(ecs, entity.id, 'running');
			expect(ecs.entityManager.getComponent(entity.id, 'stateMachine')!.previous).toBe('walking');
		});
	});

	// --- stateTime ---

	describe('stateTime', () => {
		test('accumulates and resets on transition', () => {
			const ecs = createTestEcs();

			const entity = ecs.spawn({ ...createStateMachine(simpleFSM) });

			ecs.update(0.1);
			ecs.update(0.2);

			const sm1 = ecs.entityManager.getComponent(entity.id, 'stateMachine')!;
			expect(sm1.stateTime).toBeCloseTo(0.3);

			transitionTo(ecs, entity.id, 'walking');
			const sm2 = ecs.entityManager.getComponent(entity.id, 'stateMachine')!;
			expect(sm2.stateTime).toBe(0);

			ecs.update(0.15);
			const sm3 = ecs.entityManager.getComponent(entity.id, 'stateMachine')!;
			expect(sm3.stateTime).toBeCloseTo(0.15);
		});
	});

	// --- Multiple entities ---

	describe('multiple entities', () => {
		test('different machines process independently', () => {
			const ecs = createTestEcs();

			const fsmA = defineStateMachine('a', {
				initial: 'on',
				states: {
					on: { transitions: [{ target: 'off', guard: () => true }] },
					off: {},
				},
			});

			const fsmB = defineStateMachine('b', {
				initial: 'start',
				states: {
					start: {},
					end: {},
				},
			});

			const entityA = ecs.spawn({ ...createStateMachine(fsmA) });
			const entityB = ecs.spawn({ ...createStateMachine(fsmB) });

			ecs.update(1 / 60);

			// A should have transitioned via guard, B should stay
			expect(getStateMachineState(ecs, entityA.id)).toBe('off');
			expect(getStateMachineState(ecs, entityB.id)).toBe('start');
		});
	});

	// --- Entity removal ---

	describe('entity removal', () => {
		test('no errors on subsequent updates after entity removal', () => {
			const ecs = createTestEcs();

			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						onUpdate: () => {},
					},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			ecs.removeEntity(entity.id);

			// Should not throw
			ecs.update(1 / 60);
			ecs.update(1 / 60);
		});

		test('component removal cleans up tracking even before first tick', async () => {
			const ecs = createTestEcs();
			let enterCount = 0;

			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						onEnter: () => { enterCount++; },
					},
				},
			});

			await ecs.initialize();

			// Spawn, add the component, then remove it — all before any tick
			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.entityManager.removeComponent(entity.id, 'stateMachine');

			// Re-add the component
			ecs.entityManager.addComponent(entity.id, 'stateMachine', createStateMachine(fsm).stateMachine);
			ecs.update(1 / 60);

			// onEnter should fire for the re-added component (entity treated as fresh)
			expect(enterCount).toBe(1);
		});

		test('re-spawned entity gets fresh initialization', () => {
			const ecs = createTestEcs();
			let enterCount = 0;

			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						onEnter: () => { enterCount++; },
					},
				},
			});

			const entity1 = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);
			expect(enterCount).toBe(1);

			ecs.removeEntity(entity1.id);
			ecs.update(1 / 60);

			// Spawn a new entity — should get onEnter again
			ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);
			expect(enterCount).toBe(2);
		});
	});

	// --- getStateMachineState ---

	describe('getStateMachineState', () => {
		test('returns current state', () => {
			const ecs = createTestEcs();
			const entity = ecs.spawn({ ...createStateMachine(simpleFSM) });

			expect(getStateMachineState(ecs, entity.id)).toBe('idle');
		});

		test('returns undefined for entity without stateMachine', () => {
			const ecs = createTestEcs();
			const entity = ecs.spawn({ position: { x: 0, y: 0 } });

			expect(getStateMachineState(ecs, entity.id)).toBeUndefined();
		});
	});

	// --- Guard transition fires hooks in correct order ---

	describe('transition hook ordering', () => {
		test('onExit fires before onEnter during guard transition', () => {
			const ecs = createTestEcs();
			const log: string[] = [];

			const fsm = defineStateMachine('test', {
				initial: 'a',
				states: {
					a: {
						onExit: () => { log.push('exit-a'); },
						transitions: [{ target: 'b', guard: () => true }],
					},
					b: {
						onEnter: () => { log.push('enter-b'); },
					},
				},
			});

			ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			expect(log).toEqual(['exit-a', 'enter-b']);
		});
	});

	// --- createStateMachineHelpers ---

	describe('createStateMachineHelpers', () => {
		type TestECS = ECSpresso<TestComponents, TestEvents, TestResources>;

		function createHelpersTestEcs() {
			const helpers = createStateMachineHelpers<TestECS>();
			const ecs = ECSpresso
				.create<TestComponents, TestEvents, TestResources>()
				.withPlugin(createStateMachinePlugin())
				.withResource('playerNearby', false)
				.build();
			return { ecs, helpers };
		}

		test('helpers defineStateMachine produces valid definitions', () => {
			const { helpers } = createHelpersTestEcs();

			const fsm = helpers.defineStateMachine('enemy', {
				initial: 'patrol',
				states: {
					patrol: {},
					chase: {},
				},
			});

			expect(fsm.id).toBe('enemy');
			expect(fsm.initial).toBe('patrol');
			expect(Object.keys(fsm.states)).toEqual(['patrol', 'chase']);
			expect(Object.isFrozen(fsm)).toBe(true);
		});

		test('plugin installs and processes entities', () => {
			const { ecs, helpers } = createHelpersTestEcs();
			const enterCalls: number[] = [];

			const fsm = helpers.defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						onEnter: (_ecs, entityId) => { enterCalls.push(entityId); },
					},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			expect(enterCalls).toEqual([entity.id]);
		});

		test('helpers definitions work with standalone transitionTo', () => {
			const { ecs, helpers } = createHelpersTestEcs();
			const log: string[] = [];

			const fsm = helpers.defineStateMachine('test', {
				initial: 'a',
				states: {
					a: { onExit: () => { log.push('exit-a'); } },
					b: { onEnter: () => { log.push('enter-b'); } },
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			const result = transitionTo(ecs, entity.id, 'b');
			expect(result).toBe(true);
			expect(getStateMachineState(ecs, entity.id)).toBe('b');
			expect(log).toEqual(['exit-a', 'enter-b']);
		});

		test('helpers definitions work with standalone sendEvent', () => {
			const { ecs, helpers } = createHelpersTestEcs();

			const fsm = helpers.defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: { on: { go: 'walking' } },
					walking: {},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			const result = sendEvent(ecs, entity.id, 'go');
			expect(result).toBe(true);
			expect(getStateMachineState(ecs, entity.id)).toBe('walking');
		});

		test('helpers guard transitions receive typed ecs', () => {
			const { ecs, helpers } = createHelpersTestEcs();
			let shouldTransition = false;

			const fsm = helpers.defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {
						transitions: [{
							target: 'alert',
							guard: (ecsWorld) => {
								// Verify typed access: ecsWorld.hasResource is available
								ecsWorld.hasResource('playerNearby');
								return shouldTransition;
							},
						}],
					},
					alert: {},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);
			expect(getStateMachineState(ecs, entity.id)).toBe('idle');

			shouldTransition = true;
			ecs.update(1 / 60);
			expect(getStateMachineState(ecs, entity.id)).toBe('alert');
		});
	});

	// --- Type Safety ---

	describe('type safety', () => {
		// Conditional type helper for compile-time assertions
		type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

		test('bare defaults — StateMachine defaults to string', () => {
			const _smCheck: IsExact<StateMachine['current'], string> = true;
			const _smPrev: IsExact<StateMachine['previous'], string | null> = true;
			expect(_smCheck).toBe(true);
			expect(_smPrev).toBe(true);
		});

		test('bare defaults — StateTransitionEvent defaults to string', () => {
			const _from: IsExact<StateTransitionEvent['from'], string> = true;
			const _to: IsExact<StateTransitionEvent['to'], string> = true;
			expect(_from).toBe(true);
			expect(_to).toBe(true);
		});

		test('StateMachineComponentTypes<S> narrows current', () => {
			type Narrowed = StateMachineComponentTypes<'idle' | 'chase'>;
			const _check: IsExact<Narrowed['stateMachine']['current'], 'idle' | 'chase'> = true;
			expect(_check).toBe(true);
		});

		test('StateTransitionEvent<S> narrows from/to', () => {
			type Narrowed = StateTransitionEvent<'idle' | 'chase'>;
			const _from: IsExact<Narrowed['from'], 'idle' | 'chase'> = true;
			const _to: IsExact<Narrowed['to'], 'idle' | 'chase'> = true;
			expect(_from).toBe(true);
			expect(_to).toBe(true);
		});

		test('createStateMachine preserves S in returned component', () => {
			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: { idle: {}, chase: {} },
			});
			const component = createStateMachine(fsm);
			const _check: IsExact<typeof component.stateMachine.current, 'idle' | 'chase'> = true;
			expect(_check).toBe(true);
		});

		test('StatesOf extracts S from definition', () => {
			const fsm = defineStateMachine('test', {
				initial: 'idle',
				states: { idle: {}, chase: {} },
			});
			type S = StatesOf<typeof fsm>;
			const _check: IsExact<S, 'idle' | 'chase'> = true;
			expect(_check).toBe(true);
		});

		test('StatesOf union across multiple definitions', () => {
			const fsmA = defineStateMachine('a', {
				initial: 'idle',
				states: { idle: {}, run: {} },
			});
			const fsmB = defineStateMachine('b', {
				initial: 'patrol',
				states: { patrol: {}, chase: {} },
			});
			type AllStates = StatesOf<typeof fsmA> | StatesOf<typeof fsmB>;
			const _check: IsExact<AllStates, 'idle' | 'run' | 'patrol' | 'chase'> = true;
			expect(_check).toBe(true);
		});

		test('plugin parameterization flows through world', () => {
			type States = 'idle' | 'chase';
			const plugin = createStateMachinePlugin<States>();

			type PluginComponents = (typeof plugin) extends Plugin<infer C, infer _E, infer _R, infer _A, infer _S, infer _L, infer _G, infer _AG, infer _RQ> ? C : never;
			const _check: IsExact<PluginComponents['stateMachine']['current'], States> = true;
			expect(_check).toBe(true);
		});

		test('event subscription narrows with S', () => {
			type Narrowed = StateMachineEventTypes<'idle' | 'chase'>;
			const _check: IsExact<Narrowed['stateTransition']['from'], 'idle' | 'chase'> = true;
			const _check2: IsExact<Narrowed['stateTransition']['to'], 'idle' | 'chase'> = true;
			expect(_check).toBe(true);
			expect(_check2).toBe(true);
		});
	});

	// --- Typed Helpers Runtime ---

	describe('typed helpers runtime', () => {
		function createTypedHelpersEcs() {
			const helpers = createStateMachineHelpers<StateMachineWorld>();
			const ecs = ECSpresso
				.create()
				.withPlugin(createStateMachinePlugin())
				.withComponentTypes<{ position: { x: number; y: number }; health: number }>()
				.withEventTypes<{ damaged: { entityId: number } }>()
				.withResource('playerNearby', false)
				.build();
			return { ecs, helpers };
		}

		test('typed helpers definitions and components work at runtime', () => {
			const { ecs, helpers } = createTypedHelpersEcs();

			const fsm = helpers.defineStateMachine('enemy', {
				initial: 'idle',
				states: {
					idle: {},
					chase: {},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			expect(getStateMachineState(ecs, entity.id)).toBe('idle');

			transitionTo(ecs, entity.id, 'chase');
			expect(getStateMachineState(ecs, entity.id)).toBe('chase');
		});

		test('typed helpers events carry correct state name values', () => {
			const { ecs, helpers } = createTypedHelpersEcs();
			const events: StateTransitionEvent[] = [];

			ecs.eventBus.subscribe('stateTransition', (data) => {
				events.push(data);
			});

			const fsm = helpers.defineStateMachine('test', {
				initial: 'idle',
				states: {
					idle: {},
					chase: {},
				},
			});

			const entity = ecs.spawn({ ...createStateMachine(fsm) });
			ecs.update(1 / 60);

			transitionTo(ecs, entity.id, 'chase');

			expect(events).toHaveLength(1);
			expect(events[0]!.from).toBe('idle');
			expect(events[0]!.to).toBe('chase');
		});
	});
});
