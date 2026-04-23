import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';

const buildWorld = async () => {
	const world = ECSpresso.create()
		.withScreens(s => s
			.add('title', { initialState: () => ({ selectedIndex: 0 }) })
			.add('playing', { initialState: (_config: { level: number }) => ({ score: 0 }) })
			.add('pause', { initialState: () => ({}) })
		)
		.build();
	await world.initialize();
	return world;
};

describe('onScreenEnter / onScreenExit', () => {
	test('onScreenEnter fires only when its named screen becomes active', async () => {
		const world = await buildWorld();
		const entered: string[] = [];

		world.onScreenEnter('title', () => entered.push('title'));
		world.onScreenEnter('playing', () => entered.push('playing'));

		await world.setScreen('title', {});
		await world.setScreen('playing', { level: 3 });

		expect(entered).toEqual(['title', 'playing']);
	});

	test('onScreenEnter handler receives typed config and ecs', async () => {
		const world = await buildWorld();
		const seen: Array<{ level: number; hasEcs: boolean }> = [];

		world.onScreenEnter('playing', ({ config, ecs }) => {
			seen.push({ level: config.level, hasEcs: ecs === world });
		});

		await world.setScreen('playing', { level: 7 });
		expect(seen).toEqual([{ level: 7, hasEcs: true }]);
	});

	test('onScreenExit fires only when its named screen exits', async () => {
		const world = await buildWorld();
		const exited: string[] = [];

		world.onScreenExit('title', () => exited.push('title'));
		world.onScreenExit('playing', () => exited.push('playing'));

		await world.setScreen('title', {});
		await world.setScreen('playing', { level: 1 });
		await world.setScreen('title', {});

		expect(exited).toEqual(['title', 'playing']);
	});

	test('onScreenExit handler receives ecs', async () => {
		const world = await buildWorld();
		let received: unknown = null;

		world.onScreenExit('playing', ({ ecs }) => { received = ecs; });

		await world.setScreen('playing', { level: 1 });
		await world.setScreen('title', {});

		expect(received).toBe(world);
	});

	test('multiple handlers on the same screen all fire in registration order', async () => {
		const world = await buildWorld();
		const order: number[] = [];

		world.onScreenEnter('title', () => order.push(1));
		world.onScreenEnter('title', () => order.push(2));
		world.onScreenEnter('title', () => order.push(3));

		await world.setScreen('title', {});
		expect(order).toEqual([1, 2, 3]);
	});

	test('returned disposer unsubscribes the handler', async () => {
		const world = await buildWorld();
		const entered: string[] = [];

		const off = world.onScreenEnter('title', () => entered.push('title'));

		await world.setScreen('title', {});
		expect(entered).toEqual(['title']);

		off();

		await world.setScreen('playing', { level: 1 });
		await world.setScreen('title', {});
		expect(entered).toEqual(['title']); // no additional call
	});

	test('works with pushScreen / popScreen', async () => {
		const world = await buildWorld();
		const events: string[] = [];

		world.onScreenEnter('playing', () => events.push('enter:playing'));
		world.onScreenEnter('pause', () => events.push('enter:pause'));
		world.onScreenExit('pause', () => events.push('exit:pause'));

		await world.setScreen('playing', { level: 1 });
		await world.pushScreen('pause', {});
		await world.popScreen();

		expect(events).toEqual(['enter:playing', 'enter:pause', 'exit:pause']);
	});

	test('onScreenExit does not fire for sibling screens', async () => {
		const world = await buildWorld();
		const exited: string[] = [];
		world.onScreenExit('title', () => exited.push('title'));

		await world.setScreen('playing', { level: 1 });
		await world.setScreen('pause', {});

		expect(exited).toEqual([]);
	});

	test('type-level: unknown screen name is rejected', async () => {
		const world = await buildWorld();
		// @ts-expect-error 'nope' is not a registered screen
		world.onScreenEnter('nope', () => {});
		// @ts-expect-error 'nope' is not a registered screen
		world.onScreenExit('nope', () => {});
	});
});
