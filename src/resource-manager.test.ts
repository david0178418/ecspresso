import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import ResourceManager from './resource-manager';
import Bundle from './bundle';

interface TestComponents {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
}

interface TestEvents {
	resourceUpdated: { resourceName: string; newValue: any };
}

interface TestResources {
	config: { debug: boolean; maxEntities: number };
	gameState: { current: string; previous: string };
	logger: { log: (message: string) => void };
	counter: { increment: () => number };
}

describe('ResourceManager', () => {
	test('should add and get resources', () => {
		const resourceManager = new ResourceManager<TestResources>();
		resourceManager.add('config', { debug: true, maxEntities: 1000 });

		const config = resourceManager.get('config');
		expect(config).toEqual({ debug: true, maxEntities: 1000 });

		resourceManager.add('gameState', { current: 'mainMenu', previous: '' });
		expect(resourceManager.get('gameState')).toEqual({ current: 'mainMenu', previous: '' });
	});

	test('should add and get factory function values after initialization', async () => {
		const resourceManager = new ResourceManager<TestResources>();
		resourceManager.add('config', () => ({ debug: true, maxEntities: 1000 }));

		await resourceManager.initializeResources();

		const config = resourceManager.get('config');
		expect(config).toEqual({ debug: true, maxEntities: 1000 });
	});
	
	test('should add and get async factory function values after initialization', async () => {
		const resourceManager = new ResourceManager<TestResources>();
		resourceManager.add('config', async () => ({ debug: true, maxEntities: 1000 }));

		await resourceManager.initializeResources();

		const config = resourceManager.get('config');
		expect(config).toEqual({ debug: true, maxEntities: 1000 });
	});
	
	test('should add and get resources with type safety', () => {
		const resourceManager = new ResourceManager<TestResources>();
		// @ts-expect-error Throw an error when accessing a resource that doesn't exist
		resourceManager.add('not-a-resource', {});
		// @ts-expect-error Throw an error when setting the incorrect type
		resourceManager.add('config', true);
		// @ts-expect-error Throw an error when a factory function returns an incorrect type
		resourceManager.add('config', () => true);
		// @ts-expect-error Throw an error when a factory function returns an incorrect type
		resourceManager.add('config', async () => true);
		// @ts-expect-error Throw an error when accessing a resource that doesn't exist
		resourceManager.get('not-a-resource');
	});

	test('should check if a resource exists', () => {
		const resourceManager = new ResourceManager<TestResources>();
		resourceManager.add('config', { debug: true, maxEntities: 1000 });

		expect(resourceManager.has('config')).toBe(true);
		expect(resourceManager.has('gameState')).toBe(false);
	});

	test('should remove resources', () => {
		const resourceManager = new ResourceManager<TestResources>();
		resourceManager.add('config', { debug: true, maxEntities: 1000 });
		resourceManager.add('gameState', { current: 'mainMenu', previous: '' });

		resourceManager.remove('config');

		expect(resourceManager.has('config')).toBe(false);
		expect(resourceManager.has('gameState')).toBe(true);
	});

	test('should gracefully handle removing non-existent resources', () => {
		const resourceManager = new ResourceManager<TestResources>();
		resourceManager.add('config', { debug: true, maxEntities: 1000 });

		// Should not throw
		resourceManager.remove('gameState');
		expect(resourceManager.has('gameState')).toBe(false);
	});

	test('should handle resources in ECS systems', () => {
		// Create a system that uses resources
		const bundle = new Bundle<TestComponents, TestEvents, TestResources>()
			.addResource('config', { debug: true, maxEntities: 1000 })
			.addSystem('ConfigAwareSystem')
			.addQuery('entities', {
				with: ['position']
			})
			.setProcess((_queries, _deltaTime, ecs) => {
				// System should be able to access resources
				const config = ecs.getResource('config');
				if (config.debug) {
					systemDebugRan = true;
				}
			})
			.bundle;

		// Create the world with the bundle
		const world = ECSpresso.create<TestComponents, TestEvents, TestResources>()
			.withBundle(bundle)
			.build();

		// Track system execution
		let systemDebugRan = false;

		const entity = world.entityManager.createEntity();
		world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });

		// Update the world to run the system
		world.update(1/60);

		// Verify the system accessed the resource
		expect(systemDebugRan).toBe(true);
	});

	test('should support object and function resources', () => {
		// Create a custom logger
		const customLogger = {
			log: (message: string) => {
				loggedMessages.push(message);
			}
		};

		// Create a counter resource with a function
		const counter = {
			value: 0,
			increment: function() {
				this.value += 1;
				return this.value;
			}
		};

		// Track logged messages
		const loggedMessages: string[] = [];

		// Create a bundle with resources
		const bundle = new Bundle<TestComponents, TestEvents, TestResources>()
			.addResource('logger', customLogger)
			.addResource('counter', counter)
			.addSystem('ResourceSystem')
			.addQuery('entities', {
				with: ['position']
			})
			.setProcess((_queries, _deltaTime, ecs) => {
				const logger = ecs.getResource('logger');
				const counter = ecs.getResource('counter');

				// Use both resources
				const value = counter.increment();
				logger.log(`Counter value: ${value}`);
			})
			.bundle;

		// Create the world with the bundle
		const world = ECSpresso.create<TestComponents, TestEvents, TestResources>()
			.withBundle(bundle)
			.build();

		const entity = world.entityManager.createEntity();
		world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });

		// Update the world to run the system
		world.update(1/60);

		// Verify the resources were used correctly
		expect(counter.value).toBe(1);
		expect(loggedMessages).toEqual(['Counter value: 1']);

		// Update again to see that state is maintained
		world.update(1/60);
		expect(counter.value).toBe(2);
		expect(loggedMessages).toEqual(['Counter value: 1', 'Counter value: 2']);
	});

	test('should support resources in event handlers', () => {
		// Create resources for event handlers to use
		const gameState = { current: 'playing', previous: 'menu' };
		const logger = {
			log: (message: string) => {
				loggedMessages.push(message);
			}
		};

		// Track logged messages
		const loggedMessages: string[] = [];

		// Create a bundle with resources and event handlers
		const bundle = new Bundle<TestComponents, TestEvents, TestResources>()
			.addResource('gameState', gameState)
			.addResource('logger', logger)
			.addSystem('EventSystem')
			.setEventHandlers({
				resourceUpdated: {
					handler: (data, ecs) => {
						// Use resources in the event handler
						const logger = ecs.getResource('logger');
						const gameState = ecs.getResource('gameState');

						// Log the event
						logger.log(`Resource ${data.resourceName} updated to ${data.newValue} (game state: ${gameState.current})`);

						// Update game state
						gameState.previous = gameState.current;
						gameState.current = 'updated';
					}
				}
			})
			.bundle;

		// Create the world with the bundle
		const world = ECSpresso.create<TestComponents, TestEvents, TestResources>()
			.withBundle(bundle)
			.build();

		// Publish an event to trigger the handler
		world.eventBus.publish('resourceUpdated', {
			resourceName: 'config',
			newValue: { debug: false, maxEntities: 500 }
		});

		// Verify the resources were used and updated correctly
		expect(loggedMessages).toEqual([
			'Resource config updated to [object Object] (game state: playing)'
		]);
		expect(gameState).toEqual({ current: 'updated', previous: 'playing' });
	});
});
