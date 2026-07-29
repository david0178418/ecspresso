import { describe, expect, test } from 'bun:test';
import ECSpresso from './ecspresso';

function createScreenWorld() {
	return ECSpresso.create()
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

describe('world.systemScope()', () => {
	test('applies phase and priority defaults while per-system overrides win', () => {
		const order: string[] = [];
		const ecs = ECSpresso.create().build();
		const systems = ecs.systemScope({
			phase: 'render',
			priority: 100,
		});

		systems.addSystem('default-render')
			.setProcess(() => { order.push('default-render'); });
		systems.addSystem('overridden-update')
			.inPhase('update')
			.setPriority(0)
			.setProcess(() => { order.push('overridden-update'); });
		ecs.addSystem('direct-update')
			.setPriority(50)
			.setProcess(() => { order.push('direct-update'); });

		ecs.update(1 / 60);

		expect(order).toEqual([
			'direct-update',
			'overridden-update',
			'default-render',
		]);
	});

	test('applies an inScreens default', async () => {
		const ran: string[] = [];
		const ecs = createScreenWorld();
		const systems = ecs.systemScope({
			inScreens: ['playing'],
		});

		systems.addSystem('playing-only')
			.setProcess(() => { ran.push('playing-only'); });

		await ecs.setScreen('menu', {});
		ecs.update(1 / 60);
		expect(ran).toEqual([]);

		await ecs.setScreen('playing', {});
		ecs.update(1 / 60);
		expect(ran).toEqual(['playing-only']);
	});

	test('excludeScreens gates systems without an inScreens default', async () => {
		const ran: string[] = [];
		const ecs = createScreenWorld();
		const systems = ecs.systemScope({
			excludeScreens: ['menu'],
		});

		systems.addSystem('not-menu')
			.setProcess(() => { ran.push('not-menu'); });

		await ecs.setScreen('menu', {});
		ecs.update(1 / 60);
		expect(ran).toEqual([]);

		await ecs.setScreen('playing', {});
		ecs.update(1 / 60);
		expect(ran).toEqual(['not-menu']);
	});

	test('inScreens([]) clears a captured gate', async () => {
		const ran: string[] = [];
		const ecs = createScreenWorld();
		const systems = ecs.systemScope({ inScreens: ['playing'] });

		systems.addSystem('always')
			.inScreens([])
			.setProcess(() => { ran.push('always'); });

		await ecs.setScreen('menu', {});
		ecs.update(1 / 60);

		expect(ran).toEqual(['always']);
	});

	test('defaults do not leak to direct registration or other registrars', () => {
		const order: string[] = [];
		const ecs = ECSpresso.create().build();
		const renderSystems = ecs.systemScope({ phase: 'render' });
		const updateSystems = ecs.systemScope({ priority: 100 });

		renderSystems.addSystem('render')
			.setProcess(() => { order.push('render'); });
		updateSystems.addSystem('scoped-update')
			.setProcess(() => { order.push('scoped-update'); });
		ecs.addSystem('direct-update')
			.setProcess(() => { order.push('direct-update'); });

		ecs.update(1 / 60);

		expect(order).toEqual([
			'scoped-update',
			'direct-update',
			'render',
		]);
	});

	test('captures a copy of the defaults object and screen arrays', async () => {
		const ran: string[] = [];
		const ecs = createScreenWorld();
		const inScreens: Array<'menu' | 'playing'> = ['playing'];
		const excludeScreens: Array<'menu' | 'playing'> = [];
		const defaults = {
			inScreens,
			excludeScreens,
			phase: 'update' as 'update' | 'render',
		};
		const systems = ecs.systemScope(defaults);

		defaults.phase = 'render';
		inScreens[0] = 'menu';
		excludeScreens.push('playing');

		systems.addSystem('captured')
			.setProcess(() => { ran.push('captured'); });

		await ecs.setScreen('playing', {});
		ecs.update(1 / 60);

		expect(ran).toEqual(['captured']);
	});

	test('retained registrar can add systems after initialization', async () => {
		const ran: string[] = [];
		const ecs = ECSpresso.create().build();
		const systems = ecs.systemScope({ phase: 'update' });

		await ecs.initialize();
		systems.addSystem('late')
			.setProcess(() => { ran.push('late'); });
		ecs.update(1 / 60);

		expect(ran).toEqual(['late']);
	});

	test('preserves pending-builder registration order', () => {
		const order: string[] = [];
		const ecs = ECSpresso.create().build();
		const systems = ecs.systemScope({});

		ecs.addSystem('first').setProcess(() => { order.push('first'); });
		systems.addSystem('second').setProcess(() => { order.push('second'); });
		ecs.addSystem('third').setProcess(() => { order.push('third'); });

		ecs.update(1 / 60);

		expect(order).toEqual(['first', 'second', 'third']);
	});
});
