import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import { definePlugin } from './plugin';
import type { ScreenDefinition } from './screen-types';

type TestComponents = {
	position: { x: number; y: number };
	health: number;
};

type TestEvents = {
	damage: { amount: number };
	heal: { amount: number };
};

type TestResources = {
	score: { value: number };
};

type TestAssets = {
	playerTexture: HTMLImageElement;
	enemyTexture: HTMLImageElement;
};

type TestScreens = {
	menu: ScreenDefinition<{ title: string }, { selected: number }>;
	gameplay: ScreenDefinition<{ level: number }, { score: number }>;
	pause: ScreenDefinition<{}, {}>;
};

function createTestWorld() {
	return ECSpresso.create()
		.withComponentTypes<TestComponents>()
		.withEventTypes<TestEvents>()
		.withResource('score', { value: 0 } as TestResources['score'])
		.withAssets(assets => assets
			.add('playerTexture', () => Promise.resolve(new Image()) as Promise<HTMLImageElement>)
			.add('enemyTexture', () => Promise.resolve(new Image()) as Promise<HTMLImageElement>)
		)
		.withScreens(screens => screens
			.add('menu', {
				initialState: () => ({ selected: 0 }),
			})
			.add('gameplay', {
				initialState: () => ({ score: 0 }),
			})
			.add('pause', {
				initialState: () => ({}),
			})
		)
		.build();
}

describe('SystemBuilder Type Safety for AssetTypes and ScreenStates', () => {
	test('inScreens accepts valid screen names', () => {
		const ecs = createTestWorld();

		ecs.addSystem('menuSystem')
			.inScreens(['menu'])
			.setProcess(() => {});

		ecs.addSystem('gameplaySystem')
			.inScreens(['gameplay', 'pause'])
			.setProcess(() => {});

		expect(true).toBe(true);
	});

	test('inScreens rejects invalid screen names', () => {
		const ecs = createTestWorld();

		ecs.addSystem('invalid')
			// @ts-expect-error - 'nonexistent' is not a valid screen name
			.inScreens(['nonexistent'])
			.setProcess(() => {});

		expect(true).toBe(true);
	});

	test('excludeScreens accepts valid screen names', () => {
		const ecs = createTestWorld();

		ecs.addSystem('excludePause')
			.excludeScreens(['pause'])
			.setProcess(() => {});

		ecs.addSystem('excludeMultiple')
			.excludeScreens(['menu', 'pause'])
			.setProcess(() => {});

		expect(true).toBe(true);
	});

	test('excludeScreens rejects invalid screen names', () => {
		const ecs = createTestWorld();

		ecs.addSystem('invalid')
			// @ts-expect-error - 'nonexistent' is not a valid screen name
			.excludeScreens(['nonexistent'])
			.setProcess(() => {});

		expect(true).toBe(true);
	});

	test('requiresAssets accepts valid asset keys', () => {
		const ecs = createTestWorld();

		ecs.addSystem('rendererSystem')
			.requiresAssets(['playerTexture'])
			.setProcess(() => {});

		ecs.addSystem('multiAssetSystem')
			.requiresAssets(['playerTexture', 'enemyTexture'])
			.setProcess(() => {});

		expect(true).toBe(true);
	});

	test('requiresAssets rejects invalid asset keys', () => {
		const ecs = createTestWorld();

		ecs.addSystem('invalid')
			// @ts-expect-error - 'nonexistent' is not a valid asset key
			.requiresAssets(['nonexistent'])
			.setProcess(() => {});

		expect(true).toBe(true);
	});

	test('setProcess ecs param has full A/S types', () => {
		const ecs = createTestWorld();

		ecs.addSystem('fullTyped')
			.addQuery('entities', { with: ['position'] as const })
			.setProcess(({ ecs: ecsParam }) => {
				// Asset access is typed
				const _asset: HTMLImageElement = ecsParam.getAsset('playerTexture');
				void _asset;

				// Screen access is typed
				const _screen: "menu" | "gameplay" | "pause" | null = ecsParam.getCurrentScreen();
				void _screen;

				// Resource access is typed
				const _score = ecsParam.getResource('score');
				void _score;
			});

		expect(true).toBe(true);
	});

	test('setOnInitialize ecs param has full A/S types', () => {
		const ecs = createTestWorld();

		ecs.addSystem('initTyped')
			.setOnInitialize((ecsParam) => {
				// Asset access is typed
				const _loaded: boolean = ecsParam.isAssetLoaded('enemyTexture');
				void _loaded;

				// Screen access is typed
				const _screen = ecsParam.getCurrentScreen();
				void _screen;
			})
			.setProcess(() => {});

		expect(true).toBe(true);
	});

	test('setEventHandlers ecs param has full A/S types', () => {
		const ecs = createTestWorld();

		ecs.addSystem('eventTyped')
			.setEventHandlers({
				damage({ ecs: ecsParam }) {
					// Asset access is typed
					const _asset = ecsParam.getAsset('playerTexture');
					void _asset;

					// Screen access is typed
					const _screen = ecsParam.getCurrentScreen();
					void _screen;
				},
			})
			.setProcess(() => {});

		expect(true).toBe(true);
	});

	test('setOnDetach ecs param has full A/S types', () => {
		const ecs = createTestWorld();

		ecs.addSystem('detachTyped')
			.setOnDetach((ecsParam) => {
				const _screen = ecsParam.getCurrentScreen();
				void _screen;

				const _loaded = ecsParam.isAssetLoaded('playerTexture');
				void _loaded;
			})
			.setProcess(() => {});

		expect(true).toBe(true);
	});

	test('plugin-defined systems thread A/S correctly', () => {
		const plugin = definePlugin('test-plugin')
			.withComponentTypes<TestComponents>()
			.withEventTypes<TestEvents>()
			.withResourceTypes<TestResources>()
			.withAssetTypes<TestAssets>()
			.withScreenTypes<TestScreens>()
			.install((world) => {
				world.addSystem('pluginSystem')
					.inScreens(['gameplay'])
					.requiresAssets(['playerTexture'])
					.setProcess(() => {});

				world.addSystem('invalidPlugin')
					// @ts-expect-error - invalid screen name in plugin system
					.inScreens(['nonexistent']);
			});

		ECSpresso.create()
			.withPlugin(plugin)
			.build();

		expect(true).toBe(true);
	});

	test('systems without screens/assets accept empty arrays', () => {
		const ecs = createTestWorld();

		ecs.addSystem('emptyScreens')
			.inScreens([])
			.excludeScreens([])
			.requiresAssets([])
			.setProcess(() => {});

		expect(true).toBe(true);
	});

	test('addSingleton types queries[name] as entity-or-undefined; regular queries stay arrays', () => {
		const ecs = createTestWorld();

		ecs.addSystem('singletonTypes')
			.addSingleton('boss', { with: ['health'] })
			.addQuery('mobs', { with: ['position'] })
			.setProcess(({ queries }) => {
				const bossHealth: number | undefined = queries.boss?.components.health;
				// @ts-expect-error — singleton is Entity | undefined, not Entity (no .components without narrowing)
				const directAccess = queries.boss.components.health;
				void directAccess;
				const firstMobX: number | undefined = queries.mobs[0]?.components.position.x;
				// @ts-expect-error — regular queries remain arrays, not a single entity
				const mobsAsEntity = queries.mobs.components;
				void mobsAsEntity;

				void bossHealth;
				void firstMobX;
			});

		expect(true).toBe(true);
	});
});
