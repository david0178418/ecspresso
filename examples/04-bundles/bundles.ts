import { Graphics, Sprite } from 'pixi.js';
import ECSpresso, { Bundle, QueryResultEntity, createQueryDefinition } from "../../src";
import {
	createInputBundle,
	defineActionMap,
	type InputResourceTypes,
} from "../../src/bundles/utils/input";
import {
	createRenderer2DBundle,
	createSpriteComponents,
	type Renderer2DComponentTypes,
	type Renderer2DEventTypes,
	type Renderer2DResourceTypes,
} from "../../src/bundles/renderers/renderer2D";
import {
	createTimerBundle,
	createRepeatingTimer,
	type TimerComponentTypes,
} from "../../src/bundles/utils/timers";

interface Events extends Renderer2DEventTypes {
	initializeGame: { someRandomData: Date };
	initializeMap: void;
	startGame: void;
}

interface Components extends Renderer2DComponentTypes, TimerComponentTypes<Events> {
	player: true;
	speed: number;
	velocity: { x: number; y: number };
	enemySpawner: true;
	enemy: true;
}

interface Resources extends Renderer2DResourceTypes, InputResourceTypes {}

// Create reusable query definitions for better type extraction
const movingEntitiesQuery = createQueryDefinition({
	with: ['localTransform', 'velocity'],
});

// Extract entity types from query definitions for helper functions
type MovingEntity = QueryResultEntity<Components, typeof movingEntitiesQuery>;

// Helper functions with proper typing - these can be tested independently!
function updatePosition(entity: MovingEntity, deltaTime: number): void {
	const { localTransform, velocity } = entity.components;
	localTransform.x += velocity.x * deltaTime;
	localTransform.y += velocity.y * deltaTime;
}

function screenWrap(entity: MovingEntity, screenWidth: number, screenHeight: number): void {
	const { localTransform } = entity.components;

	if (localTransform.x < 0) localTransform.x = screenWidth;
	if (localTransform.x > screenWidth) localTransform.x = 0;
	if (localTransform.y < 0) localTransform.y = screenHeight;
	if (localTransform.y > screenHeight) localTransform.y = 0;
}

const actions = defineActionMap({
	moveUp: { keys: ['w', 'ArrowUp'] },
	moveDown: { keys: ['s', 'ArrowDown'] },
	moveLeft: { keys: ['a', 'ArrowLeft'] },
	moveRight: { keys: ['d', 'ArrowRight'] },
});

// Create an ECSpresso instance with our game bundles
const ecs = ECSpresso
	.create<Components, Events, Resources>()
	.withBundle(createRenderer2DBundle({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.withBundle(createTimerBundle<Events>())
	.withBundle(createInputBundle({ actions }))
	.withBundle(createGameInitBundle())
	.withBundle(createPhysicsBundle())
	.withBundle(createEnemyControllerBundle())
	.withBundle(createPlayerControllerBundle())
	.build();

await ecs.initialize();

// Trigger game initialization
ecs.eventBus.publish('initializeGame', { someRandomData: new Date() });

function createCircleSprite(color: number): Sprite {
	const texture = ecs.getResource('pixiApp').renderer.generateTexture(
		new Graphics().circle(0, 0, 30).fill(color)
	);
	return new Sprite(texture);
}

function randomInt(min: number, max?: number): number {
	if (max === undefined) {
		max = min;
		min = 0;
	}
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createGameInitBundle() {
	return new Bundle<Components, Events, Resources>()
		.addSystem('init')
		.setEventHandlers({
			initializeGame: {
				handler(data, ecs) {
					console.log(`initializing at ${data.someRandomData.toLocaleDateString()}`);
					ecs.eventBus.publish('initializeMap');
				},
			},
			initializeMap: {
				handler(_eventData, ecs) {
					console.log('initializing map triggered');

					const sprite = createCircleSprite(0x0000FF);

					ecs.spawn({
						...createSpriteComponents(sprite, { x: 100, y: 100 }),
						player: true,
						speed: 500,
						velocity: { x: 0, y: 0 },
					});

					ecs.eventBus.publish('startGame');
				},
			},
			startGame: {
				handler(_eventData, ecs) {
					// Spawn enemy spawner entity with a repeating 5-second timer
					const spawnerEntity = ecs.spawn({
						...createRepeatingTimer<Events>(5),
						enemySpawner: true,
					});

					// Trigger initial spawn
					const spawner = ecs.entityManager.getComponent(spawnerEntity.id, 'timer');
					if (spawner) {
						spawner.justFinished = true;
					}
				}
			},
		})
		.and();
}

function createPhysicsBundle() {
	return new Bundle<Components, Events, Resources>()
		.addSystem('apply-velocity')
		.inPhase('fixedUpdate')
		.addQuery('movingEntities', movingEntitiesQuery)
		.setProcess((queries, deltaTimeMs, ecs) => {
			const pixiApp = ecs.getResource('pixiApp');

			for (const entity of queries.movingEntities) {
				updatePosition(entity, deltaTimeMs);
				screenWrap(entity, pixiApp.renderer.width, pixiApp.renderer.height);
				ecs.markChanged(entity.id, 'localTransform');
			}
		})
		.and()
		.addSystem('collision-detection')
		.inPhase('postUpdate')
		.addQuery('players', {
			with: ['localTransform', 'sprite', 'player'],
		})
		.addQuery('enemies', {
			with: ['localTransform', 'sprite', 'enemy'],
		})
		.setProcess((queries, _deltaTimeMs, ecs) => {
			const [player] = queries.players;
			if (!player) return;

			for (const enemy of queries.enemies) {
				const playerBounds = player.components.sprite.getBounds();
				const enemyBounds = enemy.components.sprite.getBounds();

				const isColliding =
					playerBounds.x < enemyBounds.x + enemyBounds.width &&
					playerBounds.x + playerBounds.width > enemyBounds.x &&
					playerBounds.y < enemyBounds.y + enemyBounds.height &&
					playerBounds.y + playerBounds.height > enemyBounds.y;

				if (isColliding) {
					console.log('collision detected');
					enemy.components.sprite.destroy();
					ecs.removeEntity(enemy.id);
				}
			}
		})
		.and();
}

function createEnemyControllerBundle() {
	return new Bundle<Components, Events, Resources>()
		.addSystem('enemy-spawner')
		.addQuery('spawners', {
			with: ['timer', 'enemySpawner'],
		})
		.setProcess((queries, _deltaTimeMs, ecs) => {
			for (const spawner of queries.spawners) {
				if (!spawner.components.timer.justFinished) continue;

				console.log('spawning enemy triggered');
				const pixiApp = ecs.getResource('pixiApp');

				const sprite = createCircleSprite(0xFF0000);
				const speed = randomInt(300, 550);

				ecs.spawn({
					...createSpriteComponents(sprite, {
						x: randomInt(pixiApp.renderer.width),
						y: randomInt(pixiApp.renderer.height),
					}),
					...createRepeatingTimer<Events>(randomInt(3, 8)),
					speed,
					velocity: {
						x: randomInt(-speed, speed),
						y: randomInt(-speed, speed),
					},
					enemy: true,
				});
			}
		})
		.and()
		.addSystem('enemy-direction-change')
		.addQuery('enemies', {
			with: ['timer', 'velocity', 'speed', 'enemy'],
		})
		.setProcess((queries) => {
			for (const { components } of queries.enemies) {
				if (!components.timer.justFinished) continue;

				components.velocity.x = randomInt(-components.speed, components.speed);
				components.velocity.y = randomInt(-components.speed, components.speed);
			}
		})
		.and();
}

function createPlayerControllerBundle() {
	return new Bundle<Components, Events, Resources>()
		.addSystem('player-control')
		.inPhase('preUpdate')
		.addQuery('players', {
			with: ['speed', 'localTransform', 'velocity'],
		})
		.setProcess((queries, _deltaTimeMs, ecs) => {
			const input = ecs.getResource('inputState');
			const [player] = queries.players;

			if (!player) return;

			const { velocity, speed } = player.components;

			velocity.y = input.actions.isActive('moveUp') ? -speed : input.actions.isActive('moveDown') ? speed : 0;
			velocity.x = input.actions.isActive('moveLeft') ? -speed : input.actions.isActive('moveRight') ? speed : 0;
		})
		.and();
}
