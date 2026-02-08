import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import { definePlugin } from './plugin';

// Define component types for testing
interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	health: { value: number };
	marker: { id: string };
}

interface TestEvents {
	testEvent: { value: number };
}

interface TestResources {
	testResource: { data: string };
}

describe('SystemBuilder', () => {
	test('should create a system that can query entities', () => {
		const processedIds: number[] = [];

		const plugin = definePlugin<TestComponents, {}, {}>({
			id: 'test',
			install(world) {
				world.addSystem('TestSystem')
					.addQuery('movingEntities', {
						with: ['position', 'velocity'],
						without: ['health']
					})
					.setProcess((queries) => {
						for (const entity of queries.movingEntities) {
							processedIds.push(entity.id);
						}
					})
					.and();
			},
		});

		const world = ECSpresso.create<TestComponents>()
			.withPlugin(plugin)
			.build();

		const entity1 = world.spawn({
			position: { x: 0, y: 0 },
			velocity: { x: 5, y: 10 }
		});

		const entity2 = world.spawn({
			position: { x: 10, y: 20 },
			velocity: { x: -5, y: 0 },
			health: { value: 100 }
		});

		world.update(1/60);

		expect(processedIds).toContain(entity1.id);
		expect(processedIds).not.toContain(entity2.id);
	});

	test('should handle multiple query definitions', () => {
		const queriesProcessed = {
			withMarker: [] as number[],
			withHealth: [] as number[],
		};

		const plugin = definePlugin<TestComponents, {}, {}>({
			id: 'multi-query',
			install(world) {
				world.addSystem('MultiQuerySystem')
					.addQuery('withMarker', {
						with: ['marker']
					})
					.addQuery('withHealth', {
						with: ['health']
					})
					.setProcess((queries) => {
						for (const entity of queries.withMarker) {
							queriesProcessed.withMarker.push(entity.id);
						}
						for (const entity of queries.withHealth) {
							queriesProcessed.withHealth.push(entity.id);
						}
					})
					.and();
			},
		});

		const world = ECSpresso.create<TestComponents>()
			.withPlugin(plugin)
			.build();

		const entity1 = world.spawn({
			marker: { id: 'entity1' }
		});

		const entity2 = world.spawn({
			health: { value: 100 }
		});

		const entity3 = world.spawn({
			marker: { id: 'entity3' },
			health: { value: 80 }
		});

		world.update(1/60);

		expect(queriesProcessed['withMarker']).toContain(entity1.id);
		expect(queriesProcessed['withMarker']).toContain(entity3.id);
		expect(queriesProcessed['withMarker']).not.toContain(entity2.id);

		expect(queriesProcessed['withHealth']).toContain(entity2.id);
		expect(queriesProcessed['withHealth']).toContain(entity3.id);
		expect(queriesProcessed['withHealth']).not.toContain(entity1.id);
	});

	test('should support lifecycle hooks', async () => {
		let onInitializeCalled = false;
		let onDetachCalled = false;
		let processCalledCount = 0;

		const plugin = definePlugin<TestComponents, {}, {}>({
			id: 'lifecycle',
			install(world) {
				world.addSystem('LifecycleSystem')
					.setOnInitialize(() => {
						onInitializeCalled = true;
					})
					.addQuery('entities', {
						with: ['position']
					})
					.setProcess(() => {
						processCalledCount++;
					})
					.setOnDetach(() => {
						onDetachCalled = true;
					})
					.and();
			},
		});

		const world = ECSpresso.create<TestComponents>()
			.withPlugin(plugin)
			.build();

		await world.initialize();

		expect(onInitializeCalled).toBe(true);
		expect(onDetachCalled).toBe(false);
		expect(processCalledCount).toBe(0);

		world.spawn({
			position: { x: 0, y: 0 }
		});

		world.update(1/60);
		expect(processCalledCount).toBe(1);

		world.removeSystem('LifecycleSystem');
		expect(onDetachCalled).toBe(true);

		world.update(1/60);
		expect(processCalledCount).toBe(1);
	});

	test('should support statically typed queries with correct component access', () => {
		const plugin = definePlugin<TestComponents, {}, {}>({
			id: 'typed',
			install(world) {
				world.addSystem('TypedSystem')
					.addQuery('entities', {
						with: ['position', 'health']
					})
					.setProcess((queries) => {
						for (const entity of queries.entities) {
							const pos = entity.components.position;
							const health = entity.components.health;

							pos.x += 1;
							pos.y += 2;

							health.value -= 1;
						}
					})
					.and();
			},
		});

		const world = ECSpresso.create<TestComponents>()
			.withPlugin(plugin)
			.build();

		const entity = world.spawn({
			position: { x: 10, y: 20 },
			health: { value: 100 }
		});

		world.update(1/60);

		const updatedPos = world.entityManager.getComponent(entity.id, 'position');
		const updatedHealth = world.entityManager.getComponent(entity.id, 'health');

		expect(updatedPos).toEqual({ x: 11, y: 22 });
		expect(updatedHealth).toEqual({ value: 99 });
	});

	test('should support and() method for ECSpresso-attached builders', () => {
		let system1Processed = false;
		let system2Processed = false;

		const world = ECSpresso.create<TestComponents>().build();

		world
			.addSystem('system1')
			.addQuery('moving', { with: ['position', 'velocity'] })
			.setProcess(() => { system1Processed = true; })
			.and()
			.addSystem('system2')
			.addQuery('healthy', { with: ['position', 'health'] })
			.setProcess(() => { system2Processed = true; })
			.and();

		world.spawn({ position: { x: 0, y: 0 }, velocity: { x: 1, y: 1 } });
		world.spawn({ position: { x: 0, y: 0 }, health: { value: 100 } });
		world.update(1/60);

		expect(system1Processed).toBe(true);
		expect(system2Processed).toBe(true);
	});

	test('and() should return correctly typed ECSpresso for chaining', () => {
		const world = ECSpresso.create<TestComponents, TestEvents, TestResources>().build();

		const result = world
			.addSystem('test')
			.setProcess(() => {})
			.and();

		// Type check: result should have ECSpresso methods
		expect(typeof result.addSystem).toBe('function');
		expect(typeof result.addResource).toBe('function');
		expect(typeof result.spawn).toBe('function');

		// Verify it's the same ECSpresso instance
		expect(result).toBe(world);
	});
});
