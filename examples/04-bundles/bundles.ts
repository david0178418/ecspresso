import { Graphics, Sprite } from 'pixi.js';
import ECSpresso, { Bundle, QueryResultEntity, createQueryDefinition } from "../../src";
import {
	createPixiBundle,
	createSpriteComponents,
	type PixiComponentTypes,
	type PixiEventTypes,
	type PixiResourceTypes,
} from "../../src/bundles/renderers/pixi";
import {
	createTimerBundle,
	createRepeatingTimer,
	type TimerComponentTypes,
} from "../../src/bundles/utils/timers";

interface Events extends PixiEventTypes {
	initializeGame: { someRandomData: Date };
	initializeMap: void;
	startGame: void;
}

interface Components extends PixiComponentTypes, TimerComponentTypes<Events> {
	player: true;
	speed: number;
	velocity: { x: number; y: number };
	enemySpawner: true;
	enemy: true;
}

interface Resources extends PixiResourceTypes {
	controlMap: ActiveKeyMap;
}

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

// Create an ECSpresso instance with our game bundles
const ecs = ECSpresso
	.create<Components, Events, Resources>()
	.withBundle(createPixiBundle({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.withBundle(createTimerBundle<Events>())
	.withBundle(createGameInitBundle())
	.withBundle(createPhysicsBundle())
	.withBundle(createEnemyControllerBundle())
	.withBundle(createPlayerControllerBundle())
	.build()
	// Add global resources
	.addResource('controlMap', createActiveKeyMap);

await ecs.initialize();

// Trigger game initialization
ecs.eventBus.publish('initializeGame', { someRandomData: new Date() });

interface ActiveKeyMap {
	left: boolean;
	right: boolean;
	up: boolean;
	down: boolean;
}

function createCircleSprite(color: number): Sprite {
	const texture = ecs.getResource('pixiApp').renderer.generateTexture(
		new Graphics().circle(0, 0, 30).fill(color)
	);
	return new Sprite(texture);
}

function createActiveKeyMap(): ActiveKeyMap {
	const controlMap: ActiveKeyMap = {
		up: false,
		down: false,
		left: false,
		right: false,
	};

	const keyToControl: Record<string, keyof ActiveKeyMap> = {
		'w': 'up',
		'ArrowUp': 'up',
		's': 'down',
		'ArrowDown': 'down',
		'a': 'left',
		'ArrowLeft': 'left',
		'd': 'right',
		'ArrowRight': 'right',
	};

	window.addEventListener('keydown', (event) => {
		const control = keyToControl[event.key];
		if (control) controlMap[control] = true;
	});

	window.addEventListener('keyup', (event) => {
		const control = keyToControl[event.key];
		if (control) controlMap[control] = false;
	});

	return controlMap;
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
		.addQuery('movingEntities', movingEntitiesQuery)
		.setProcess((queries, deltaTimeMs, ecs) => {
			const pixiApp = ecs.getResource('pixiApp');

			for (const entity of queries.movingEntities) {
				updatePosition(entity, deltaTimeMs);
				screenWrap(entity, pixiApp.renderer.width, pixiApp.renderer.height);
			}
		})
		.and()
		.addSystem('collision-detection')
		.addQuery('players', {
			with: ['localTransform', 'pixiSprite', 'player'],
		})
		.addQuery('enemies', {
			with: ['localTransform', 'pixiSprite', 'enemy'],
		})
		.setProcess((queries, _deltaTimeMs, ecs) => {
			const [player] = queries.players;
			if (!player) return;

			for (const enemy of queries.enemies) {
				const playerBounds = player.components.pixiSprite.sprite.getBounds();
				const enemyBounds = enemy.components.pixiSprite.sprite.getBounds();

				const isColliding =
					playerBounds.x < enemyBounds.x + enemyBounds.width &&
					playerBounds.x + playerBounds.width > enemyBounds.x &&
					playerBounds.y < enemyBounds.y + enemyBounds.height &&
					playerBounds.y + playerBounds.height > enemyBounds.y;

				if (isColliding) {
					console.log('collision detected');
					enemy.components.pixiSprite.sprite.destroy();
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
		.addQuery('players', {
			with: ['speed', 'localTransform', 'velocity'],
		})
		.setProcess((queries, _deltaTimeMs, ecs) => {
			const controlMap = ecs.getResource('controlMap');
			const [player] = queries.players;

			if (!player) return;

			const { velocity, speed } = player.components;

			velocity.y = controlMap.up ? -speed : controlMap.down ? speed : 0;
			velocity.x = controlMap.left ? -speed : controlMap.right ? speed : 0;
		})
		.and();
}
