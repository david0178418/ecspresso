import { describe, test, expect } from 'bun:test';
import ECSpresso from './ecspresso';
import Bundle from './bundle';
import CommandBuffer from './command-buffer';
import type { ScreenDefinition } from './screen-types';
import type { AssetsResource } from './asset-types';
import type { ScreenResource } from './screen-types';

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

type TS = {
	menu: ScreenDefinition<{}, {}>;
	play: ScreenDefinition<{}, { score: number }>;
};

function createFullWorld() {
	return ECSpresso.create()
		.withComponentTypes<TC>()
		.withEventTypes<TE>()
		.withResource('score', { value: 0 } as TR['score'])
		.withAssets(a => a.add('sprite', () => Promise.resolve(new Image()) as Promise<HTMLImageElement>))
		.withScreens(s => s
			.add('menu', { initialState: () => ({}) })
			.add('play', { initialState: () => ({ score: 0 }) })
		)
		.build();
}

type FullWorld = ReturnType<typeof createFullWorld>;

// ── onPostUpdate ─────────────────────────────────────────────────────

describe('onPostUpdate callback receives full generic params', () => {
	test('ecs param exposes asset and screen APIs', () => {
		const ecs = createFullWorld();

		ecs.onPostUpdate((world, _dt) => {
			// Type-level: asset access is typed
			const _loaded: boolean = world.isAssetLoaded('sprite');
			void _loaded;

			// Type-level: screen access is typed
			const _screen: 'menu' | 'play' | null = world.getCurrentScreen();
			void _screen;

			// Type-level: resource access is typed
			const _score: TR['score'] = world.getResource('score');
			void _score;
		});

		// Runtime: no crash
		ecs.update(0.016);
		expect(true).toBe(true);
	});

	test('ecs param rejects invalid asset/screen keys', () => {
		const ecs = createFullWorld();

		ecs.onPostUpdate((world, _dt) => {
			// @ts-expect-error - 'nonexistent' is not a valid asset key
			world.isAssetLoaded('nonexistent');

			// @ts-expect-error - 'nonexistent' is not a valid screen
			world.transitionTo('nonexistent');
		});

		expect(true).toBe(true);
	});
});

// ── addResource factory ──────────────────────────────────────────────

describe('addResource factory callback receives full generic params', () => {
	test('factory function ecs param exposes asset and screen APIs', () => {
		const ecs = createFullWorld();

		ecs.addResource('derived' as keyof TR, ((world: FullWorld) => {
			// Type-level: asset access is typed
			const _loaded: boolean = world.isAssetLoaded('sprite');
			void _loaded;

			// Type-level: screen access is typed
			const _screen: 'menu' | 'play' | null = world.getCurrentScreen();
			void _screen;

			return { value: 42 };
		}) as unknown as TR[keyof TR]);

		expect(true).toBe(true);
	});

	test('factory with deps ecs param exposes full types', () => {
		const ecs = createFullWorld();

		ecs.addResource('derived' as keyof TR, {
			dependsOn: ['score'],
			factory: (world: FullWorld) => {
				// Type-level: asset access is typed
				const _loaded: boolean = world.isAssetLoaded('sprite');
				void _loaded;

				return { value: world.getResource('score').value * 2 };
			},
			onDispose: (_resource: TR[keyof TR], world: FullWorld) => {
				// Type-level: screen access is typed
				const _screen: 'menu' | 'play' | null = world.getCurrentScreen();
				void _screen;
			},
		} as unknown as TR[keyof TR]);

		expect(true).toBe(true);
	});
});

// ── builder withResource ─────────────────────────────────────────────

describe('ECSpressoBuilder.withResource factory receives typed context', () => {
	test('factory function receives ecs with full type params', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withAssets(a => a.add('sprite', () => Promise.resolve(new Image()) as Promise<HTMLImageElement>))
			.withScreens(s => s
				.add('menu', { initialState: () => ({}) })
				.add('play', { initialState: () => ({ score: 0 }) })
			)
			.withResource('score', (world) => {
				// Type-level: asset access is typed
				const _loaded: boolean = world.isAssetLoaded('sprite');
				void _loaded;

				// Type-level: screen access is typed
				const _screen: 'menu' | 'play' | null = world.getCurrentScreen();
				void _screen;

				return { value: 0 };
			})
			.build();

		expect(ecs).toBeDefined();
	});

	test('factory with deps receives ecs with full type params', () => {
		const ecs = ECSpresso.create()
			.withComponentTypes<TC>()
			.withEventTypes<TE>()
			.withAssets(a => a.add('sprite', () => Promise.resolve(new Image()) as Promise<HTMLImageElement>))
			.withScreens(s => s
				.add('menu', { initialState: () => ({}) })
				.add('play', { initialState: () => ({ score: 0 }) })
			)
			.withResource('score', {
				factory: (world) => {
					// Type-level: asset access is typed
					const _loaded: boolean = world.isAssetLoaded('sprite');
					void _loaded;

					return { value: 0 };
				},
				onDispose: (_resource, world) => {
					// Type-level: screen access is typed
					const _screen: 'menu' | 'play' | null = world.getCurrentScreen();
					void _screen;
				},
			})
			.build();

		expect(ecs).toBeDefined();
	});
});

// ── Bundle.addResource ───────────────────────────────────────────────

describe('Bundle.addResource factory receives full generic params', () => {
	test('factory function ecs param is fully typed', () => {
		const bundle = new Bundle<TC, TE, TR, TA, TS>('test');

		bundle.addResource('score', (world) => {
			// Type-level: asset access is typed
			const _loaded: boolean = world.isAssetLoaded('sprite');
			void _loaded;

			// Type-level: screen access is typed
			const _screen: 'menu' | 'play' | null = world.getCurrentScreen();
			void _screen;

			return { value: 0 };
		});

		expect(bundle.hasResource('score')).toBe(true);
	});

	test('factory ecs param rejects invalid keys', () => {
		const bundle = new Bundle<TC, TE, TR, TA, TS>('test');

		bundle.addResource('score', (world) => {
			// @ts-expect-error - 'nonexistent' is not a valid asset key
			world.isAssetLoaded('nonexistent');

			// @ts-expect-error - 'nonexistent' is not a valid screen
			world.transitionTo('nonexistent');

			return { value: 0 };
		});

		expect(true).toBe(true);
	});
});

// ── CommandBuffer ────────────────────────────────────────────────────

describe('CommandBuffer carries full generic params', () => {
	test('accepts full 5-param ECSpresso in playback', () => {
		const ecs = createFullWorld();
		// Resource type includes user-defined TR plus built-in $assets/$screen from builder
		type FullR = TR & { $assets: AssetsResource<TA> } & { $screen: ScreenResource<TS> };
		const buffer = new CommandBuffer<TC, TE, FullR, TA, TS>();

		buffer.spawn({ position: { x: 1, y: 2 } });
		buffer.playback(ecs);

		const entities = ecs.getEntitiesWithQuery(['position']);
		expect(entities.length).toBe(1);
		expect(entities[0]?.components.position.x).toBe(1);
	});

	test('ecs.commands has full type params from builder-inferred world', () => {
		const ecs = createFullWorld();

		// ecs.commands should be CommandBuffer with full types — spawn should
		// only accept valid component subsets
		ecs.commands.spawn({ position: { x: 0, y: 0 } });

		// @ts-expect-error - invalid component
		ecs.commands.spawn({ nonExistent: true });

		ecs.commands.playback(ecs);
		expect(ecs.getEntitiesWithQuery(['position']).length).toBe(1);
	});
});
