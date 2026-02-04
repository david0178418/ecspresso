import { describe, test, expect } from 'bun:test';
import ECSpresso from './ecspresso';
import Bundle from './bundle';
import type { ScreenDefinition } from './screen-types';

// ── shared test types ────────────────────────────────────────────────

type TC = {
	position: { x: number; y: number };
	health: number;
};

type TE = {
	hit: { damage: number };
};

type TR = {
	score: { value: number };
};

type TA = {
	sprite: HTMLImageElement;
};

// ── Type assertion tests (compile-time) ─────────────────────────────

describe('screen lifecycle hook typing via withScreens()', () => {
	test('onEnter hook ecs param allows typed resource access', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withResource('score', { value: 0 } as TR['score'])
			.withAssets(a => a.add('sprite', () => Promise.resolve(new Image()) as Promise<HTMLImageElement>))
			.withScreens(s => s
				.add('menu', {
					initialState: () => ({}),
					onEnter: (_config, ecs) => {
						const _score: { value: number } = ecs.getResource('score');
						void _score;
					},
				})
			)
			.build();

		expect(ecs).toBeDefined();
	});

	test('onExit hook ecs param allows typed resource access', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withResource('score', { value: 0 } as TR['score'])
			.withScreens(s => s
				.add('menu', {
					initialState: () => ({}),
					onExit: (ecs) => {
						const _score: { value: number } = ecs.getResource('score');
						void _score;
					},
				})
			)
			.build();

		expect(ecs).toBeDefined();
	});

	test('onEnter hook ecs param allows typed event emission', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withResource('score', { value: 0 } as TR['score'])
			.withScreens(s => s
				.add('menu', {
					initialState: () => ({}),
					onEnter: (_config, ecs) => {
						ecs.eventBus.publish('hit', { damage: 5 });
					},
				})
			)
			.build();

		expect(ecs).toBeDefined();
	});

	test('onEnter hook ecs param allows typed asset checking', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withResource('score', { value: 0 } as TR['score'])
			.withAssets(a => a.add('sprite', () => Promise.resolve(new Image()) as Promise<HTMLImageElement>))
			.withScreens(s => s
				.add('menu', {
					initialState: () => ({}),
					onEnter: (_config, ecs) => {
						const _loaded: boolean = ecs.isAssetLoaded('sprite');
						void _loaded;
					},
				})
			)
			.build();

		expect(ecs).toBeDefined();
	});

	test('onEnter hook ecs param allows typed entity spawning', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withResource('score', { value: 0 } as TR['score'])
			.withScreens(s => s
				.add('menu', {
					initialState: () => ({}),
					onEnter: (_config, ecs) => {
						ecs.spawn({ position: { x: 0, y: 0 } });
					},
				})
			)
			.build();

		expect(ecs).toBeDefined();
	});

	test('hook rejects invalid resource key', () => {
		ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withResource('score', { value: 0 } as TR['score'])
			.withScreens(s => s
				.add('menu', {
					initialState: () => ({}),
					onEnter: (_config, ecs) => {
						// @ts-expect-error - 'nonexistent' is not a valid resource key
						ecs.getResource('nonexistent');
					},
				})
			)
			.build();
	});

	test('hook rejects invalid event name', () => {
		ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withResource('score', { value: 0 } as TR['score'])
			.withScreens(s => s
				.add('menu', {
					initialState: () => ({}),
					onEnter: (_config, ecs) => {
						// @ts-expect-error - 'nonexistent' is not a valid event name
						ecs.eventBus.publish('nonexistent', {});
					},
				})
			)
			.build();
	});

	test('hook rejects invalid asset key', () => {
		ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withResource('score', { value: 0 } as TR['score'])
			.withAssets(a => a.add('sprite', () => Promise.resolve(new Image()) as Promise<HTMLImageElement>))
			.withScreens(s => s
				.add('menu', {
					initialState: () => ({}),
					onEnter: (_config, ecs) => {
						// @ts-expect-error - 'nonexistent' is not a valid asset key
						ecs.isAssetLoaded('nonexistent');
					},
				})
			)
			.build();
	});

	test('hook rejects invalid component in spawn', () => {
		ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withResource('score', { value: 0 } as TR['score'])
			.withScreens(s => s
				.add('menu', {
					initialState: () => ({}),
					onEnter: (_config, ecs) => {
						// @ts-expect-error - 'nonexistent' is not a valid component
						ecs.spawn({ nonexistent: true });
					},
				})
			)
			.build();
	});
});

// ── Runtime tests ───────────────────────────────────────────────────

describe('screen lifecycle hook runtime behavior', () => {
	test('onEnter hook is called and can use ecs to emit events', async () => {
		const received: Array<{ damage: number }> = [];

		const ecs = ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withResource('score', { value: 0 } as TR['score'])
			.withScreens(s => s
				.add('menu', {
					initialState: () => ({}),
					onEnter: (_config, ecs) => {
						ecs.eventBus.publish('hit', { damage: 10 });
					},
				})
			)
			.build();

		ecs.on('hit', (data) => { received.push(data); });
		await ecs.initialize();
		await ecs.setScreen('menu', {});

		expect(received).toHaveLength(1);
		expect(received[0]?.damage).toBe(10);
	});

	test('onExit hook is called and can use ecs to emit events', async () => {
		const received: Array<{ damage: number }> = [];

		const ecs = ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withResource('score', { value: 0 } as TR['score'])
			.withScreens(s => s
				.add('menu', {
					initialState: () => ({}),
					onExit: (ecs) => {
						ecs.eventBus.publish('hit', { damage: 99 });
					},
				})
				.add('play', {
					initialState: () => ({}),
				})
			)
			.build();

		ecs.on('hit', (data) => { received.push(data); });
		await ecs.initialize();
		await ecs.setScreen('menu', {});
		await ecs.setScreen('play', {});

		expect(received).toHaveLength(1);
		expect(received[0]?.damage).toBe(99);
	});

	test('config parameter in onEnter is correctly typed and received', async () => {
		const receivedLevels: number[] = [];

		const ecs = ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withResource('score', { value: 0 } as TR['score'])
			.withScreens(s => s
				.add('gameplay', {
					initialState: (config: { level: number }) => ({ score: 0, level: config.level }),
					onEnter: (config, _ecs) => {
						receivedLevels.push(config.level);
					},
				})
			)
			.build();

		await ecs.initialize();
		await ecs.setScreen('gameplay', { level: 42 });

		expect(receivedLevels).toEqual([42]);
	});
});

// ── Bundle screen hook typing ───────────────────────────────────────

describe('Bundle.addScreen hook typing', () => {
	test('hook receives typed ecs (type assertion for resource access)', () => {
		type BS = Record<string, ScreenDefinition>;

		const bundle = new Bundle<TC, TE, TR, TA, BS>('test');

		bundle.addScreen('menu', {
			initialState: () => ({}),
			onEnter: (_config, ecs) => {
				const _score: { value: number } = ecs.getResource('score');
				void _score;
			},
			onExit: (ecs) => {
				const _score: { value: number } = ecs.getResource('score');
				void _score;
			},
		});

		expect(bundle.getScreens().has('menu')).toBe(true);
	});
});
