import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import Bundle from './bundle';

interface TestComponents {
	position: { x: number; y: number };
	health: { value: number };
}

interface TestEvents {
	entityCreated: { entityId: number };
	entityDestroyed: { entityId: number };
	componentAdded: { entityId: number; componentName: string };
	componentRemoved: { entityId: number; componentName: string };
	collision: { entity1Id: number; entity2Id: number };
	healthChanged: { entityId: number; oldValue: number; newValue: number };
	gameStateChanged: { oldState: string; newState: string };
	playerDamaged: { entityId: number; amount: number };
}

describe('EventSystem', () => {
	test('should allow subscribing to and publishing events', () => {
		const { eventBus } = new ECSpresso<TestComponents, TestEvents>();
		let receivedData: any = null;

		const unsubscribe = eventBus.subscribe('entityCreated', (data) => {
			receivedData = data;
		});

		eventBus.publish('entityCreated', { entityId: 1 });
		expect(receivedData).toEqual({ entityId: 1 });

		// Unsubscribe and verify it doesn't receive future events
		unsubscribe();
		eventBus.publish('entityCreated', { entityId: 2 });
		expect(receivedData).toEqual({ entityId: 1 }); // Should not be updated
	});

	test('should handle one-time event subscriptions', () => {
		const { eventBus } = new ECSpresso<TestComponents, TestEvents>();
		let normalEventCount = 0;
		let onceEventCount = 0;

		eventBus.subscribe('entityCreated', () => {
			normalEventCount++;
		});

		eventBus.once('entityCreated', () => {
			onceEventCount++;
		});

		eventBus.publish('entityCreated', { entityId: 1 });
		eventBus.publish('entityCreated', { entityId: 2 });
		eventBus.publish('entityCreated', { entityId: 3 });

		expect(normalEventCount).toBe(3);
		expect(onceEventCount).toBe(1);
	});

	test('should handle unsubscribing from events', () => {
		const { eventBus } = new ECSpresso<TestComponents, TestEvents>();
		let eventCount = 0;

		const unsubscribe = eventBus.subscribe('entityCreated', () => {
			eventCount++;
		});

		eventBus.publish('entityCreated', { entityId: 1 });
		expect(eventCount).toBe(1);

		unsubscribe();
		eventBus.publish('entityCreated', { entityId: 2 });

		expect(eventCount).toBe(1);
	});

	test('should handle clearing all events', () => {
		const { eventBus } = new ECSpresso<TestComponents, TestEvents>();
		let count1 = 0;
		let count2 = 0;

		eventBus.subscribe('entityCreated', () => { count1++; });
		eventBus.subscribe('entityDestroyed', () => { count2++; });
		eventBus.publish('entityCreated', { entityId: 1 });
		eventBus.publish('entityDestroyed', { entityId: 2 });

		expect(count1).toBe(1);
		expect(count2).toBe(1);

		eventBus.clear();
		eventBus.publish('entityCreated', { entityId: 3 });
		eventBus.publish('entityDestroyed', { entityId: 4 });

		expect(count1).toBe(1);
		expect(count2).toBe(1);
	});

	test('should handle clearing specific events', () => {
		const { eventBus } = new ECSpresso<TestComponents, TestEvents>();
		let count1 = 0;
		let count2 = 0;

		eventBus.subscribe('entityCreated', () => { count1++; });
		eventBus.subscribe('entityDestroyed', () => { count2++; });
		eventBus.clearEvent('entityCreated');
		eventBus.publish('entityCreated', { entityId: 1 });
		eventBus.publish('entityDestroyed', { entityId: 2 });

		// Only entityDestroyed should have been received
		expect(count1).toBe(0);
		expect(count2).toBe(1);
	});

	test('should auto-register event handlers from systems', () => {
		// Track if event handler is called
		let eventHandlerCalled = false;

		// Create a bundle with event handlers
		const bundle = new Bundle<TestComponents, TestEvents>()
			.addSystem('health-system')
			.setEventHandlers({
				playerDamaged: {
					handler: (data: { entityId: number; amount: number }) => {
						// Event handler for player damage
						eventHandlerCalled = true;
						expect(data.amount).toBe(10);
					}
				}
			})
			.bundle;

		// Create the world with the bundle
		const world = ECSpresso.create<TestComponents, TestEvents>()
			.withBundle(bundle)
			.build();

		// Create an entity
		const entity = world.entityManager.createEntity();
		world.entityManager.addComponent(entity.id, 'health', { value: 100 });

		// Publish an event to trigger the handler
		world.eventBus.publish('playerDamaged', { entityId: entity.id, amount: 10 });

		// Verify the event handler was called
		expect(eventHandlerCalled).toBe(true);
	});

	test('should provide eventBus and entityManager parameters to event handlers', () => {
		// Track what the event handler receives
		let receivedEntityManager: any = null;
		let receivedData: any = null;

		// Create a bundle with event handlers
		const bundle = new Bundle<TestComponents, TestEvents>()
			.addSystem('ParameterTestSystem')
			.setEventHandlers({
				healthChanged: {
					handler: (data, ecs) => {
						receivedData = data;
						receivedEntityManager = ecs.entityManager;
					}
				}
			})
			.bundle;

		// Create the world with the bundle
		const world = ECSpresso.create<TestComponents, TestEvents>()
			.withBundle(bundle)
			.build();

		// Create an entity with health component
		const entity = world.entityManager.createEntity();
		world.entityManager.addComponent(entity.id, 'health', { value: 100 });

		// Publish an event
		world.eventBus.publish('healthChanged', {
			entityId: entity.id,
			oldValue: 100,
			newValue: 80
		});

		// Verify that the handler received the correct parameters
		expect(receivedData).toEqual({
			entityId: entity.id,
			oldValue: 100,
			newValue: 80
		});
		expect(receivedEntityManager).not.toBeNull();

		// Verify that we can use the entity manager to get component data
		const health = receivedEntityManager.getComponent(entity.id, 'health');
		expect(health).toEqual({ value: 100 });
	});

	test('should handle event handlers during system lifecycle', () => {
		// Create a world
		const world = ECSpresso.create<TestComponents, TestEvents>()
			.build();

		// Create an entity with health component
		const entity = world.entityManager.createEntity();
		world.entityManager.addComponent(entity.id, 'health', { value: 100 });

		// Track events received
		const receivedEvents: string[] = [];

		// Subscribe directly to the event bus
		let unsubscribe: (() => void) | null = null;
		unsubscribe = world.eventBus.subscribe('healthChanged', (data: any) => {
			receivedEvents.push(`health:${data.oldValue}->${data.newValue}`);
		});

		// Publish an event to verify the handler works
		world.eventBus.publish('healthChanged', {
			entityId: entity.id,
			oldValue: 100,
			newValue: 90
		});

		// Check that the event was received
		expect(receivedEvents).toEqual(['health:100->90']);

		// Clear events and unsubscribe
		receivedEvents.length = 0;
		if (unsubscribe) {
			unsubscribe();
		}

		// Publish another event - should NOT be received since we unsubscribed
		world.eventBus.publish('healthChanged', {
			entityId: entity.id,
			oldValue: 90,
			newValue: 0
		});

		// No events should be received after unsubscribing
		expect(receivedEvents).toEqual([]);
	});

	test('should integrate event system with ECS for event-driven behavior', () => {
		// Track damage changes
		const damageLog: Record<number, string[]> = {};

		// Create a bundle with event handlers for damage system
		const bundle = new Bundle<TestComponents, TestEvents>()
			.addSystem('EventDrivenDamageSystem')
			.setEventHandlers({
				collision: {
					handler: (data, ecs) => {
						// Collision should reduce health of both entities
						const entity1 = ecs.entityManager.getEntity(data.entity1Id);
						const entity2 = ecs.entityManager.getEntity(data.entity2Id);

						if (entity1 && entity2) {
							if (ecs.entityManager.getComponent(entity1.id, 'health') &&
								ecs.entityManager.getComponent(entity2.id, 'health')) {

								// Get current health values
								const health1 = ecs.entityManager.getComponent(entity1.id, 'health');
								const health2 = ecs.entityManager.getComponent(entity2.id, 'health');

								if (health1 && health2) {
									// Log the damage
									damageLog[entity1.id] = damageLog[entity1.id] || [];
									damageLog[entity2.id] = damageLog[entity2.id] || [];
									damageLog[entity1.id].push(`health=${health1.value}`);
									damageLog[entity2.id].push(`health=${health2.value}`);

									// Apply damage
									const newHealth1 = { value: Math.max(0, health1.value - 10) };
									const newHealth2 = { value: Math.max(0, health2.value - 10) };

									ecs.entityManager.addComponent(entity1.id, 'health', newHealth1);
									ecs.entityManager.addComponent(entity2.id, 'health', newHealth2);

									// Emit health changed events
									ecs.eventBus.publish('healthChanged', {
										entityId: entity1.id,
										oldValue: health1.value,
										newValue: newHealth1.value
									});

									ecs.eventBus.publish('healthChanged', {
										entityId: entity2.id,
										oldValue: health2.value,
										newValue: newHealth2.value
									});
								}
							}
						}
					}
				},
				healthChanged: {
					handler(data) {
						// Log health changes
						if (!damageLog[data.entityId]) {
							damageLog[data.entityId] = [];
						}
						damageLog[data.entityId].push(`healthChanged=${data.newValue}`);
					}
				}
			})
			.bundle;

		// Create the world with the bundle
		const world = ECSpresso.create<TestComponents, TestEvents>()
			.withBundle(bundle)
			.build();

		// Create entities to test with
		const entity = world.entityManager.createEntity();
		world.entityManager.addComponent(entity.id, 'health', { value: 100 });
		world.entityManager.addComponent(entity.id, 'position', { x: 0, y: 0 });

		const entity2 = world.entityManager.createEntity();
		world.entityManager.addComponent(entity2.id, 'health', { value: 80 });
		world.entityManager.addComponent(entity2.id, 'position', { x: 10, y: 10 });

		// Simulate a collision between the entities
		world.eventBus.publish('collision', {
			entity1Id: entity.id,
			entity2Id: entity2.id
		});

		// Check that health values were logged and events were emitted
		expect(damageLog[entity.id]).toEqual([
			'health=100',
			'healthChanged=90'
		]);
		expect(damageLog[entity2.id]).toEqual([
			'health=80',
			'healthChanged=70'
		]);

		// Check that the health components were actually updated
		expect(world.entityManager.getComponent(entity.id, 'health')).toEqual({ value: 90 });
		expect(world.entityManager.getComponent(entity2.id, 'health')).toEqual({ value: 70 });
	});
});
