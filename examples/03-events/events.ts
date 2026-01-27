import { Container, Graphics, Sprite } from 'pixi.js';
import ECSpresso, { Entity } from "../../src";
import {
	createPixiBundle,
	createSpriteComponents,
	type PixiComponentTypes,
	type PixiEventTypes,
	type PixiResourceTypes,
} from "../../src/renderers/pixi";

interface Components extends PixiComponentTypes {
	player: true;
	speed: number;
	velocity: { x: number; y: number };
}

interface Events extends PixiEventTypes {
	initializeGame: { someRandomData: Date };
	spawnEnemy: void;
	updateEnemyDirection: { enemy: Entity<Components> };
	initializeMap: void;
	startGame: void;
}

interface Resources extends PixiResourceTypes {
	worldContainer: Container;
	controlMap: ActiveKeyMap;
}

interface ActiveKeyMap {
	left: boolean;
	right: boolean;
	up: boolean;
	down: boolean;
}

const ecs = ECSpresso
	.create<Components, Events, Resources>()
	.withBundle(createPixiBundle({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.build();

ecs
	.addResource('controlMap', createActiveKeyMap)
	.addSystem('init')
	.setEventHandlers({
		initializeGame: {
			handler(data, ecs) {
				console.log(`initializing at ${data.someRandomData.toLocaleDateString()}`);

				const pixiApp = ecs.getResource('pixiApp');
				const worldContainer = new Container();
				pixiApp.stage.addChild(worldContainer);
				ecs.addResource('worldContainer', worldContainer);

				ecs.eventBus.publish('initializeMap');
			},
		},
		initializeMap: {
			handler(_eventData, ecs) {
				console.log('initializing map triggered');
				const worldContainer = ecs.getResource('worldContainer');

				const sprite = createCircleSprite(0x0000FF);
				worldContainer.addChild(sprite);

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
				console.log('game started triggered');
				const pixiApp = ecs.getResource('pixiApp');

				pixiApp.ticker.add(ticker => {
					ecs.update(ticker.deltaMS / 1_000);
				});
			}
		},
	})
	.and()
	.addSystem('apply-velocity')
	.addQuery('movingEntities', {
		with: ['localTransform', 'velocity'],
	})
	.setProcess((queries, deltaTimeMs, ecs) => {
		const pixiApp = ecs.getResource('pixiApp');

		for (const entity of queries.movingEntities) {
			const { localTransform, velocity } = entity.components;
			localTransform.x += velocity.x * deltaTimeMs;
			localTransform.y += velocity.y * deltaTimeMs;

			// wrap around the screen
			if (localTransform.x < 0) localTransform.x = pixiApp.renderer.width;
			if (localTransform.x > pixiApp.renderer.width) localTransform.x = 0;
			if (localTransform.y < 0) localTransform.y = pixiApp.renderer.height;
			if (localTransform.y > pixiApp.renderer.height) localTransform.y = 0;
		}
	})
	.and()
	.addSystem('enemy-movement')
	.setEventHandlers({
		startGame: {
			handler(_eventData, ecs) {
				ecs.eventBus.publish('spawnEnemy');
				setInterval(() => {
					ecs.eventBus.publish('spawnEnemy');
				}, 5_000);
			}
		},
		spawnEnemy: {
			handler(_eventData, ecs) {
				console.log('spawning enemy triggered');
				const pixiApp = ecs.getResource('pixiApp');
				const worldContainer = ecs.getResource('worldContainer');

				const sprite = createCircleSprite(0xFF0000);
				worldContainer.addChild(sprite);

				const speed = randomInt(300, 550);

				const entity = ecs.spawn({
					...createSpriteComponents(sprite, {
						x: randomInt(pixiApp.renderer.width),
						y: randomInt(pixiApp.renderer.height),
					}),
					speed,
					velocity: {
						x: randomInt(-speed, speed),
						y: randomInt(-speed, speed),
					},
				});

				setInterval(() => {
					ecs.eventBus.publish('updateEnemyDirection', { enemy: entity });
				}, randomInt(3, 8) * 1_000);
			}
		},
		updateEnemyDirection: {
			handler(eventData) {
				const { enemy } = eventData;

				if (!(enemy.components.velocity && enemy.components.speed)) return;

				enemy.components.velocity.x = randomInt(-enemy.components.speed, enemy.components.speed);
				enemy.components.velocity.y = randomInt(-enemy.components.speed, enemy.components.speed);
			}
		}
	})
	.and()
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
	.and()
	.addSystem('collision-detection')
	.addQuery('players', {
		with: ['localTransform', 'pixiSprite', 'player'],
	})
	.addQuery('enemies', {
		with: ['localTransform', 'pixiSprite'],
		without: ['player'],
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
	.build();

// Start the game by publishing the initialization event
await ecs.initialize();
ecs.eventBus.publish('initializeGame', { someRandomData: new Date() });

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
