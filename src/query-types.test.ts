import { expect, describe, test } from 'bun:test';
import ECSpresso from './ecspresso';
import { QueryResultEntity, createQueryDefinition } from './types';

interface Components {
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	sprite: { url: string };
	health: { value: number };
	dead: true;
	player: true;
}

describe('Query Type Utilities', () => {
	test('QueryResultEntity should extract correct entity type from query definition', () => {
		// Define a query using the new pattern
		const movingEntitiesQuery = createQueryDefinition({
			with: ['position', 'velocity'] as const,
			without: ['dead'] as const
		} as const);

		// Extract the entity type
		type MovingEntity = QueryResultEntity<Components, typeof movingEntitiesQuery>;

		// Helper function that uses the extracted type
		function updatePosition(entity: MovingEntity, deltaTime: number) {
			// TypeScript should know these components exist and are the correct types
			entity.components.position.x += entity.components.velocity.x * deltaTime;
			entity.components.position.y += entity.components.velocity.y * deltaTime;
			
			// TypeScript should know these components are optional
			if (entity.components.health) {
				entity.components.health.value -= 1;
			}
			
			// TypeScript should prevent access to excluded components
			// @ts-expect-error - 'dead' component should not be accessible
			const deadStatus = entity.components.dead;
		}

		// Create an ECS world and test the integration
		const world = new ECSpresso<Components>();
		
		world.addSystem('movement')
			.addQuery('entities', movingEntitiesQuery)
			.setProcess((queries, deltaTime) => {
				for (const entity of queries.entities) {
					// This should work seamlessly with our helper function
					updatePosition(entity, deltaTime);
				}
			})
			.build();

		// Create test entity
		const entity = world.spawn({
			position: { x: 0, y: 0 },
			velocity: { x: 10, y: 5 },
			health: { value: 100 }
		});

		// Update and verify
		world.update(1);
		const position = world.entityManager.getComponent(entity.id, 'position');
		expect(position).toEqual({ x: 10, y: 5 });
		
		const health = world.entityManager.getComponent(entity.id, 'health');
		expect(health?.value).toBe(99);
	});

	test('should work with complex queries including multiple with/without clauses', () => {
		const playerQuery = createQueryDefinition({
			with: ['position', 'sprite', 'player'] as const,
			without: ['dead'] as const
		} as const);

		type PlayerEntity = QueryResultEntity<Components, typeof playerQuery>;

		function renderPlayer(entity: PlayerEntity) {
			// Should have access to required components
			const pos = entity.components.position;
			const sprite = entity.components.sprite;
			const isPlayer = entity.components.player;
			
			// Should have optional access to other components
			if (entity.components.health) {
				// Health is optional
			}
			
			// Should not have access to excluded components
			// @ts-expect-error - 'dead' component should not be accessible
			const deadStatus = entity.components.dead;
			
			return { pos, sprite, isPlayer };
		}

		const world = new ECSpresso<Components>();
		
		world.addSystem('playerRenderer')
			.addQuery('players', playerQuery)
			.setProcess((queries) => {
				for (const entity of queries.players) {
					renderPlayer(entity);
				}
			})
			.build();

		// Test it works
		expect(() => {
			const player = world.spawn({
				position: { x: 0, y: 0 },
				sprite: { url: 'player.png' },
				player: true
			});
			world.update(1);
			// Use the player variable to avoid TS warning
			expect(player.id).toBeGreaterThan(0);
		}).not.toThrow();
	});

	test('should work with inline query definitions', () => {
		// You can also use QueryResultEntity with inline definitions
		type RenderableEntity = QueryResultEntity<Components, {
			with: ['position', 'sprite'];
			without: ['dead'];
		}>;

		function render(entity: RenderableEntity) {
			// Required components should be guaranteed
			const x = entity.components.position.x;
			const y = entity.components.position.y;
			const sprite = entity.components.sprite.url;
			
			return { x, y, sprite };
		}

		// This should compile without issues
		expect(typeof render).toBe('function');
	});

	test('createQueryDefinition should preserve exact types', () => {
		const query1 = createQueryDefinition({
			with: ['position'] as const
		} as const);

		const query2 = createQueryDefinition({
			with: ['position', 'velocity'] as const,
			without: ['dead', 'player'] as const
		} as const);

		// Types should be preserved exactly
		type Entity1 = QueryResultEntity<Components, typeof query1>;
		type Entity2 = QueryResultEntity<Components, typeof query2>;

		// This test mainly verifies the types compile correctly
		expect(query1.with).toEqual(['position']);
		expect(query2.with).toEqual(['position', 'velocity']);
		expect(query2.without).toEqual(['dead', 'player']);
		
		// Use the types to avoid TS warnings - just verify they compile
		const checkType1: Entity1 = {} as Entity1;
		const checkType2: Entity2 = {} as Entity2;
		expect(typeof checkType1).toBe('object');
		expect(typeof checkType2).toBe('object');
	});
}); 