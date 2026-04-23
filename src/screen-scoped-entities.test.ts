import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';

type Components = {
	position: { x: number; y: number };
	enemy: { hp: number };
	ui: { label: string };
};

const buildWorld = async () => {
	const world = ECSpresso.create()
		.withComponentTypes<Components>()
		.withScreens(s => s
			.add('title', { initialState: () => ({}) })
			.add('playing', { initialState: () => ({}) })
			.add('pause', { initialState: () => ({}) })
		)
		.build();
	await world.initialize();
	return world;
};

describe('screen-scoped entity lifetimes', () => {
	test('world.spawn with scope removes entity on screenExit for that screen', async () => {
		const world = await buildWorld();

		await world.setScreen('playing', {});
		const scoped = world.spawn({ enemy: { hp: 10 } }, { scope: 'playing' });
		expect(world.entityManager.entityCount).toBe(1);

		await world.setScreen('title', {});
		expect(world.entityManager.entityCount).toBe(0);
		expect(world.entityManager.getEntity(scoped.id)).toBeUndefined();
	});

	test('entities without scope survive screen exit', async () => {
		const world = await buildWorld();
		await world.setScreen('playing', {});

		const unscoped = world.spawn({ enemy: { hp: 5 } });
		const scoped = world.spawn({ enemy: { hp: 7 } }, { scope: 'playing' });

		await world.setScreen('title', {});

		expect(world.entityManager.getEntity(unscoped.id)).toBeDefined();
		expect(world.entityManager.getEntity(scoped.id)).toBeUndefined();
	});

	test('scopes are keyed by screen name — exiting one does not affect another', async () => {
		const world = await buildWorld();
		await world.setScreen('playing', {});

		const a = world.spawn({ enemy: { hp: 1 } }, { scope: 'playing' });
		const b = world.spawn({ ui: { label: 'hud' } }, { scope: 'title' });

		await world.setScreen('title', {});
		expect(world.entityManager.getEntity(a.id)).toBeUndefined();
		expect(world.entityManager.getEntity(b.id)).toBeDefined();

		await world.setScreen('playing', {});
		expect(world.entityManager.getEntity(b.id)).toBeUndefined();
	});

	test('manually removing a scoped entity does not cause a zombie on later screen exit', async () => {
		const world = await buildWorld();
		await world.setScreen('playing', {});
		const scoped = world.spawn({ enemy: { hp: 10 } }, { scope: 'playing' });

		world.removeEntity(scoped.id);
		// Spawn a fresh entity — it may reuse the id slot; scope tracking must not target it.
		const replacement = world.spawn({ position: { x: 0, y: 0 } });

		await world.setScreen('title', {});
		expect(world.entityManager.getEntity(replacement.id)).toBeDefined();
	});

	test('spawnChild with scope is cleaned up on screenExit', async () => {
		const world = await buildWorld();
		await world.setScreen('playing', {});

		const parent = world.spawn({ position: { x: 0, y: 0 } });
		const child = world.spawnChild(parent.id, { enemy: { hp: 3 } }, { scope: 'playing' });

		await world.setScreen('title', {});
		expect(world.entityManager.getEntity(child.id)).toBeUndefined();
		expect(world.entityManager.getEntity(parent.id)).toBeDefined();
	});

	test('commands.spawn with scope is cleaned up on screenExit', async () => {
		const world = await buildWorld();
		await world.setScreen('playing', {});

		world.commands.spawn({ enemy: { hp: 1 } }, { scope: 'playing' });
		world.commands.playback(world);
		expect(world.entityManager.entityCount).toBe(1);

		await world.setScreen('title', {});
		expect(world.entityManager.entityCount).toBe(0);
	});

	test('commands.spawnChild with scope is cleaned up on screenExit', async () => {
		const world = await buildWorld();
		await world.setScreen('playing', {});

		const parent = world.spawn({ position: { x: 0, y: 0 } });
		world.commands.spawnChild(parent.id, { enemy: { hp: 1 } }, { scope: 'playing' });
		world.commands.playback(world);

		await world.setScreen('title', {});
		expect(world.entityManager.entityCount).toBe(1); // only parent remains
		expect(world.entityManager.getEntity(parent.id)).toBeDefined();
	});

	test('popScreen drains scope for the popped screen', async () => {
		const world = await buildWorld();
		await world.setScreen('playing', {});
		await world.pushScreen('pause', {});

		const pauseScoped = world.spawn({ ui: { label: 'pause-menu' } }, { scope: 'pause' });
		const gameplayScoped = world.spawn({ enemy: { hp: 10 } }, { scope: 'playing' });

		await world.popScreen();

		expect(world.entityManager.getEntity(pauseScoped.id)).toBeUndefined();
		expect(world.entityManager.getEntity(gameplayScoped.id)).toBeDefined();
	});

	test('setScreen from X directly to X still exits X first and drains its scope', async () => {
		const world = await buildWorld();
		await world.setScreen('playing', {});
		const a = world.spawn({ enemy: { hp: 1 } }, { scope: 'playing' });

		await world.setScreen('playing', {});
		// 'playing' exited then re-entered — the scoped entity from the first entry is gone.
		expect(world.entityManager.getEntity(a.id)).toBeUndefined();
	});

	test('type-level: scope must be a known screen name', async () => {
		const world = await buildWorld();
		// @ts-expect-error 'nope' is not a registered screen
		world.spawn({ position: { x: 0, y: 0 } }, { scope: 'nope' });
	});
});
