import { describe, expect, test } from 'bun:test';
import ECSpresso from './ecspresso';
import type { ScreenDefinition } from './screen-types';
import type { SystemRegistrarOf } from './system-registrar';

type TestScreens = {
	menu: ScreenDefinition<{}, {}>;
	playing: ScreenDefinition<{}, {}>;
};

function createTestWorld() {
	return ECSpresso.create()
		.withComponentTypes<{
			position: { x: number; y: number };
			velocity: { x: number; y: number };
		}>()
		.withEventTypes<{
			hit: { damage: number };
		}>()
		.withResource('score', { value: 0 })
		.withAssets(assets => assets
			.add('playerTexture', () => Promise.resolve(new Image()))
		)
		.withScreens(screens => screens
			.add('menu', {
				initialState: () => ({}),
			})
			.add('playing', {
				initialState: () => ({}),
			})
		)
		.build();
}

function registerTypedSystems(
	systems: SystemRegistrarOf<ReturnType<typeof createTestWorld>>,
): void {
	systems.addSystem('typed')
		.addQuery('moving', {
			with: ['position', 'velocity'],
		})
		.withResources(['score'])
		.inScreens(['playing'])
		.excludeScreens(['menu'])
		.requiresAssets(['playerTexture'])
		.setEventHandlers({
			hit({ data }) {
				const damage: number = data.damage;
				void damage;
			},
		})
		.setProcess(({ queries, resources, ecs }) => {
			const x: number | undefined =
				queries.moving[0]?.components.position.x;
			const score: number = resources.score.value;
			const screen: keyof TestScreens | null =
				ecs.getCurrentScreen();

			void x;
			void score;
			void screen;
		});
}

function rejectNonSystemCapabilities(
	systems: SystemRegistrarOf<ReturnType<typeof createTestWorld>>,
): void {
	// @ts-expect-error - registrars expose only addSystem
	systems.addReactiveQuery('moving', { with: ['position'] });
	// @ts-expect-error - registrars cannot spawn entities
	systems.spawn({ position: { x: 0, y: 0 } });
	// @ts-expect-error - registrars cannot create nested scopes
	systems.systemScope({});
}

describe('SystemRegistrar types', () => {
	test('full worlds and scoped registrars satisfy the same narrow type', () => {
		const ecs = createTestWorld();
		const direct: SystemRegistrarOf<typeof ecs> = ecs;
		const scoped: SystemRegistrarOf<typeof ecs> = ecs.systemScope({
			inScreens: ['playing'],
		});

		registerTypedSystems(direct);
		registerTypedSystems(scoped);
		void rejectNonSystemCapabilities;

		expect(true).toBe(true);
	});

	test('systemScope rejects invalid defaults', () => {
		const ecs = createTestWorld();

		ecs.systemScope({
			// @ts-expect-error - invalid screen name
			inScreens: ['missing'],
		});
	});

	test('registrar builders reject invalid names', () => {
		const ecs = createTestWorld();
		const systems = ecs.systemScope({});

		systems.addSystem('invalid-query')
			// @ts-expect-error - invalid component name
			.addQuery('bad', { with: ['missing'] });
		systems.addSystem('invalid-resource')
			// @ts-expect-error - invalid resource name
			.withResources(['missing']);
	});

	test('per-system overrides remain typed', () => {
		const ecs = createTestWorld();
		const systems = ecs.systemScope({
			inScreens: ['playing'],
			phase: 'update',
		});

		systems.addSystem('override')
			.inScreens(['menu'])
			.excludeScreens(['playing'])
			.inPhase('render')
			.setPriority(10)
			.setProcess(() => {});

		expect(true).toBe(true);
	});
});
