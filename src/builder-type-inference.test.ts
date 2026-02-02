import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import type { TimerEventData } from './bundles/utils/timers';
import { createTimerBundle } from './bundles/utils/timers';
import { createTransformBundle, type TransformComponentTypes } from './bundles/utils/transform';
import type { ComponentsOf, EventsOf, ResourcesOf } from './types';

describe('Builder Type Inference', () => {
	test('withComponentTypes adds app component types', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<{
				position: { x: number; y: number };
				health: number;
			}>()
			.build();

		const entity = ecs.spawn({ position: { x: 1, y: 2 }, health: 100 });
		expect(entity.components.position.x).toBe(1);
		expect(entity.components.health).toBe(100);

		// Query works with inferred types
		const results = ecs.getEntitiesWithQuery(['position']);
		expect(results.length).toBe(1);
		expect(results[0]?.components.position.y).toBe(2);

		// @ts-expect-error - invalid component name
		ecs.spawn({ nonExistent: true });
	});

	test('withEventTypes adds app event types', () => {
		const ecs = ECSpresso.create()
			.withEventTypes<{
				gameStart: { level: number };
				gameEnd: true;
			}>()
			.build();

		let received: { level: number } | undefined = undefined;
		ecs.on('gameStart', (data) => {
			received = data;
		});
		ecs.eventBus.publish('gameStart', { level: 1 });
		expect(received).toBeDefined();
		expect(received!.level).toBe(1);

		// @ts-expect-error - invalid event name
		ecs.on('nonExistent', () => {});
	});

	test('multiple withComponentTypes calls accumulate', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<{ position: { x: number; y: number } }>()
			.withComponentTypes<{ velocity: { dx: number; dy: number } }>()
			.build();

		const entity = ecs.spawn({
			position: { x: 0, y: 0 },
			velocity: { dx: 1, dy: 1 },
		});
		expect(entity.components.position.x).toBe(0);
		expect(entity.components.velocity.dx).toBe(1);

		// Both types present in queries
		const results = ecs.getEntitiesWithQuery(['position', 'velocity']);
		expect(results.length).toBe(1);
	});

	test('combined: withBundle + withComponentTypes + withEventTypes + withResource', () => {
		const ecs = ECSpresso.create()
			.withBundle(createTransformBundle())
			.withComponentTypes<{ player: true; enemy: { type: string } }>()
			.withEventTypes<{ gameStart: true }>()
			.withResource('score', { value: 0 })
			.build();

		// Bundle components work
		const entity = ecs.spawn({
			localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			player: true as const,
		});
		expect(entity.components.localTransform.x).toBe(0);
		expect(entity.components.player).toBe(true);

		// App events work
		let fired = false;
		ecs.on('gameStart', () => { fired = true; });
		ecs.eventBus.publish('gameStart', true);
		expect(fired).toBe(true);

		// Resource works
		expect(ecs.getResource('score').value).toBe(0);
	});

	test('@ts-expect-error on invalid components/events after build', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<{ position: { x: number; y: number } }>()
			.withEventTypes<{ hit: { damage: number } }>()
			.build();

		// @ts-expect-error - 'velocity' not in component types
		ecs.spawn({ velocity: { x: 1, y: 1 } });

		// @ts-expect-error - 'miss' not in event types
		ecs.on('miss', () => {});
	});

	test('timer bundle with narrow event types in the chain', () => {
		type AppEvents = {
			playerRespawn: TimerEventData;
			scoreUpdate: { points: number };
		};

		const ecs = ECSpresso.create()
			.withBundle(createTimerBundle<AppEvents>())
			.withEventTypes<{ scoreUpdate: { points: number } }>()
			.build();

		// Timer component works
		const entity = ecs.spawn({
			timer: {
				elapsed: 0,
				duration: 1,
				repeat: false,
				active: true,
				justFinished: false,
				onComplete: 'playerRespawn' as const,
			},
		});
		expect(entity.components.timer.duration).toBe(1);

		// Custom events work alongside timer events
		let points = 0;
		ecs.on('scoreUpdate', (data) => { points = data.points; });
		ecs.eventBus.publish('scoreUpdate', { points: 42 });
		expect(points).toBe(42);
	});

	test('ComponentsOf, EventsOf, ResourcesOf extract correctly', () => {
		const timerBundle = createTimerBundle<{ tick: TimerEventData }>();
		const transformBundle = createTransformBundle();

		// These are compile-time checks — if they compile, the types are correct.
		// Each type is used in a variable assignment to prove it resolves to the expected shape.
		const _timerCCheck: ComponentsOf<typeof timerBundle> = {
			timer: { elapsed: 0, duration: 1, repeat: false, active: true, justFinished: false },
		};
		expect(_timerCCheck.timer.duration).toBe(1);

		const _timerECheck: EventsOf<typeof timerBundle> = { tick: { entityId: 0, duration: 1, elapsed: 1 } };
		expect(_timerECheck.tick.entityId).toBe(0);

		const _transformCCheck: ComponentsOf<typeof transformBundle> = {
			localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
			worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
		};
		expect(_transformCCheck.localTransform.x).toBe(0);

		const _transformRCheck: ResourcesOf<typeof transformBundle> = {};
		expect(_transformRCheck).toEqual({});
	});

	test('typeof ecs captures full inferred type', () => {
		const ecs = ECSpresso.create()
			.withBundle(createTransformBundle())
			.withComponentTypes<{ player: true }>()
			.withEventTypes<{ gameStart: true }>()
			.withResource('level', 1)
			.build();

		type ECS = typeof ecs;

		// Use the type alias in a function signature to prove it carries all types
		function spawnPlayer(world: ECS) {
			return world.spawn({
				localTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				worldTransform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
				player: true as const,
			});
		}

		const entity = spawnPlayer(ecs);
		expect(entity.components.player).toBe(true);
		expect(entity.components.localTransform.x).toBe(0);
	});

	test('backward compat: create<C,E,R>() still works', () => {
		interface Components {
			position: { x: number; y: number };
		}
		interface Events {
			hit: { damage: number };
		}
		interface Resources {
			config: { debug: boolean };
		}

		const ecs = ECSpresso.create<Components, Events, Resources>()
			.withResource('config', { debug: true })
			.build();

		const entity = ecs.spawn({ position: { x: 5, y: 10 } });
		expect(entity.components.position.x).toBe(5);
		expect(ecs.getResource('config').debug).toBe(true);

		let damage = 0;
		ecs.on('hit', (data) => { damage = data.damage; });
		ecs.eventBus.publish('hit', { damage: 25 });
		expect(damage).toBe(25);
	});

	test('identical overlapping types are OK (idempotent intersection)', () => {
		// Both the bundle and withComponentTypes declare the same localTransform type
		const ecs = ECSpresso.create()
			.withBundle(createTransformBundle())
			.withComponentTypes<{ localTransform: TransformComponentTypes['localTransform']; player: true }>()
			.build();

		const entity = ecs.spawn({
			localTransform: { x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 },
			worldTransform: { x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1 },
			player: true as const,
		});
		expect(entity.components.localTransform.x).toBe(1);
		expect(entity.components.player).toBe(true);
	});
});
