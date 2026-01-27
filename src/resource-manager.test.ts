import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import ResourceManager from './resource-manager';
import Bundle from './bundle';

// Test class for factory function detection tests
class TestClass {
	constructor(public value: number = 42) {}
	getValue() { return this.value; }
}

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
	controlMap: { up: boolean; down: boolean; left: boolean; right: boolean };
	objectInstance: typeof TestClass;
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

		world.spawn({
			position: { x: 0, y: 0 }
		});

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

		world.spawn({
			position: { x: 0, y: 0 }
		});

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

	describe('Factory Function Detection', () => {
		test('should correctly identify factory functions vs classes vs constructors', async () => {
			const resourceManager = new ResourceManager<TestResources>();

			// Regular factory function (like activeKeyMap from examples)
			function createControlMap() {
				const controlMap = {
					up: false,
					down: false,
					left: false,
					right: false,
				};
				
				// Simulate setting up event listeners like in the examples
				// (we can't actually do this in tests, but the structure is the same)
				return controlMap;
			}

			// Arrow function factory
			const createConfig = () => ({ debug: true, maxEntities: 1000 });

			// ES6 Class
			class TestClass {
				constructor(public value: number = 42) {}
				getValue() { return this.value; }
			}

			// Constructor function (old-style class)
			function OldStyleConstructor(this: any, value: number) {
				this.value = value;
			}
			OldStyleConstructor.prototype.getValue = function() { return this.value; };

			// Add different types of resources
			resourceManager.add('controlMap', createControlMap);
			resourceManager.add('config', createConfig);
			resourceManager.add('objectInstance', TestClass);

			// Initialize resources to trigger factory function execution
			await resourceManager.initializeResources();

			// Verify factory functions were executed correctly
			const controlMap = resourceManager.get('controlMap');
			expect(controlMap).toEqual({
				up: false,
				down: false,
				left: false,
				right: false,
			});

			const config = resourceManager.get('config');
			expect(config).toEqual({ debug: true, maxEntities: 1000 });

			// Class should be stored as-is, not executed
			const objectClass = resourceManager.get('objectInstance');
			expect(objectClass).toBe(TestClass);
		});

		test('should handle input system regression scenario', async () => {
			// This test specifically reproduces the input example scenario that was broken
			interface InputComponents {
				position: { x: number; y: number };
				velocity: { x: number; y: number };
				speed: number;
			}

			interface InputResources {
				controlMap: {
					up: boolean;
					down: boolean;
					left: boolean;
					right: boolean;
				};
			}

			// Simulate the activeKeyMap factory function from the examples
			function activeKeyMap() {
				const controlMap = {
					up: false,
					down: false,
					left: false,
					right: false,
				};

				// In real implementation, this would set up event listeners
				// For testing, we'll just return the object
				return controlMap;
			}

			// Create ECS instance like in the examples
			const world = new ECSpresso<InputComponents, {}, InputResources>();

			// Add the controlMap resource using the factory function
			world.addResource('controlMap', activeKeyMap);

			// Initialize resources (this should execute the factory function)
			await world.initializeResources();

			// Add a system that uses the controlMap resource
			let systemRan = false;
			world.addSystem('input-test')
				.addQuery('entities', { with: ['position', 'velocity', 'speed'] })
				.setProcess((_queries, _deltaTime, ecs) => {
					const controlMap = ecs.getResource('controlMap');
					
					// This should work - controlMap should be the object, not the function
					expect(typeof controlMap).toBe('object');
					expect(controlMap.up).toBe(false);
					expect(controlMap.down).toBe(false);
					expect(controlMap.left).toBe(false);
					expect(controlMap.right).toBe(false);
					
					systemRan = true;
				})
				.build();

			// Create an entity to trigger the system
			world.spawn({
				position: { x: 0, y: 0 },
				velocity: { x: 0, y: 0 },
				speed: 100
			});

			// Run the system
			world.update(1/60);

			// Verify the system ran successfully
			expect(systemRan).toBe(true);
		});
	});

	describe('Resource Dependencies', () => {
		test('should initialize resources in dependency order', async () => {
			const order: string[] = [];
			const rm = new ResourceManager<{ a: number; b: number; c: number }>();

			rm.add('c', {
				dependsOn: ['b'],
				factory: () => { order.push('c'); return 3; }
			});
			rm.add('a', () => { order.push('a'); return 1; });
			rm.add('b', {
				dependsOn: ['a'],
				factory: () => { order.push('b'); return 2; }
			});

			await rm.initializeResources();

			expect(order).toEqual(['a', 'b', 'c']);
		});

		test('should handle diamond dependencies', async () => {
			// D depends on B and C, both depend on A
			const order: string[] = [];
			const rm = new ResourceManager<{ a: number; b: number; c: number; d: number }>();

			rm.add('d', { dependsOn: ['b', 'c'], factory: () => { order.push('d'); return 4; } });
			rm.add('b', { dependsOn: ['a'], factory: () => { order.push('b'); return 2; } });
			rm.add('c', { dependsOn: ['a'], factory: () => { order.push('c'); return 3; } });
			rm.add('a', () => { order.push('a'); return 1; });

			await rm.initializeResources();

			expect(order[0]).toBe('a');           // A must be first
			expect(order[3]).toBe('d');           // D must be last
			expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
			expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
		});

		test('should detect circular dependencies', async () => {
			const rm = new ResourceManager<{ a: number; b: number }>();

			rm.add('a', { dependsOn: ['b'], factory: () => 1 });
			rm.add('b', { dependsOn: ['a'], factory: () => 2 });

			await expect(rm.initializeResources()).rejects.toThrow(/[Cc]ircular/);
		});

		test('should detect self-referential dependencies', async () => {
			const rm = new ResourceManager<{ a: number }>();

			rm.add('a', { dependsOn: ['a'], factory: () => 1 });

			await expect(rm.initializeResources()).rejects.toThrow(/[Cc]ircular/);
		});

		test('should allow factory to access dependencies via context', async () => {
			interface Res { config: { value: number }; derived: { doubled: number } }
			const rm = new ResourceManager<Res>();

			// Create a mock ECS instance with getResource method
			const mockEcs = {
				getResource: (key: keyof Res) => rm.get(key)
			};

			rm.add('config', { value: 42 });
			rm.add('derived', {
				dependsOn: ['config'],
				factory: (ecs) => ({ doubled: ecs.getResource('config').value * 2 })
			});

			await rm.initializeResources(mockEcs);

			expect(rm.get('derived')).toEqual({ doubled: 84 });
		});

		test('should work with async factories that have dependencies', async () => {
			const rm = new ResourceManager<{ sync: number; async: number }>();

			rm.add('sync', () => 1);
			rm.add('async', {
				dependsOn: ['sync'],
				factory: async () => {
					await new Promise(r => setTimeout(r, 10));
					return 2;
				}
			});

			await rm.initializeResources();

			expect(rm.get('async')).toBe(2);
		});

		test('backward compatibility - existing patterns still work', async () => {
			const rm = new ResourceManager<{ direct: number; factory: number; asyncFactory: number }>();

			rm.add('direct', 1);
			rm.add('factory', () => 2);
			rm.add('asyncFactory', async () => 3);

			await rm.initializeResources();

			expect(rm.get('direct')).toBe(1);
			expect(rm.get('factory')).toBe(2);
			expect(rm.get('asyncFactory')).toBe(3);
		});

		test('should handle multiple independent and dependent resources', async () => {
			const order: string[] = [];
			const rm = new ResourceManager<{ a: number; b: number; c: number; d: number; e: number }>();

			// Independent resources
			rm.add('a', () => { order.push('a'); return 1; });
			rm.add('b', () => { order.push('b'); return 2; });

			// c depends on a
			rm.add('c', {
				dependsOn: ['a'],
				factory: () => { order.push('c'); return 3; }
			});

			// d depends on b
			rm.add('d', {
				dependsOn: ['b'],
				factory: () => { order.push('d'); return 4; }
			});

			// e depends on c and d
			rm.add('e', {
				dependsOn: ['c', 'd'],
				factory: () => { order.push('e'); return 5; }
			});

			await rm.initializeResources();

			// a must come before c
			expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
			// b must come before d
			expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
			// c and d must come before e
			expect(order.indexOf('c')).toBeLessThan(order.indexOf('e'));
			expect(order.indexOf('d')).toBeLessThan(order.indexOf('e'));
		});

		test('should expose getDependencies for introspection', () => {
			const rm = new ResourceManager<{ a: number; b: number; c: number }>();

			rm.add('a', 1);
			rm.add('b', {
				dependsOn: ['a'],
				factory: () => 2
			});
			rm.add('c', () => 3);

			expect(rm.getDependencies('a')).toEqual([]);
			expect(rm.getDependencies('b')).toEqual(['a']);
			expect(rm.getDependencies('c')).toEqual([]);
		});
	});
});
