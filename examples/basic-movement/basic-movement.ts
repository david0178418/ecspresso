import { Application, Container, Graphics, Sprite } from 'pixi.js';
import ECSpresso, { Entity } from "../../src";

interface Components {
	sprite: Sprite;
	player: true;
	enemy: true;
	frozen: true;
	speed: number;
	position: {
		x: number;
		y: number;
	};
	velocity: {
		x: number;
		y: number;
	};
}

interface Events {
	initializeGame: {
		someRandomData: Date;
	};
	spawnEnemy: void;
	updateEnemyDirection: {
		enemy: Entity<Components>;
	};
	initializeMap: void;
	startGame: void;
}

interface Resources {
	pixi: Application;
	worldContainer: Container;
	controlMap: {
		up: boolean;
		down: boolean;
		left: boolean;
		right: boolean;
	};
}

new ECSpresso<Components, Events, Resources>()
	.addResource('controlMap', activeKeyMap())
	.addResource('pixi', await initPixi())
	.addSystem('init')
	.setEventHandlers({
		initializeGame: {
			handler(data, ecs) {
				console.log(`initializing at ${data.someRandomData.toLocaleDateString()}`);

				const pixi = ecs.getResource('pixi');

				const canvasContainerEl = document
					.createElement('div')
					.appendChild(pixi.canvas);

				document.body.appendChild(canvasContainerEl);

				ecs.eventBus.publish('initializeMap');
			},
		},
		initializeMap: {
			handler(_eventData, ecs) {
				console.log('initializing map triggered');
				const pixi = ecs.getResource('pixi');
				const worldContainer = new Container();

				pixi.stage.addChild(worldContainer);

				ecs.addResource('worldContainer', worldContainer);

				const playerEntity = ecs.entityManager.createEntity();
				const sprite = createCircleSprite(0x0000FF, pixi);
				worldContainer.addChild(sprite);
				ecs.entityManager.addComponents(playerEntity, {
					sprite,
					speed: 500,
					position: {
						x: 100,
						y: 100
					},
					velocity: {
						x: 0,
						y: 0
					},
					acceleration: {
						x: 0,
						y: 0
					},
				});

				ecs.eventBus.publish('startGame');
			},
		},
		startGame: {
			handler(_eventData, ecs) {
				console.log('game started triggered');
				const pixi = ecs.getResource('pixi');

				pixi.ticker.add(ticker => {
					ecs.update(ticker.deltaMS / 1_000);
				});
			}
		},
	})
	.build()
	.ecspresso
	.addSystem('apply-velocity')
	.addQuery('movingEntities', {
		with: ['position', 'velocity'],
		without: ['frozen']
	})
	.setProcess((queries, deltaTimeMs, ecs) => {
		for(const entity of queries.movingEntities) {
			entity.components.position.x += entity.components.velocity.x * deltaTimeMs;
			entity.components.position.y += entity.components.velocity.y * deltaTimeMs;

			// wrap around the screen
			const pixi = ecs.resourceManager.get('pixi');
			if (entity.components.position.x < 0) {
				entity.components.position.x = pixi.renderer.width;
			}
			if (entity.components.position.x > pixi.renderer.width) {
				entity.components.position.x = 0;
			}
			if (entity.components.position.y < 0) {
				entity.components.position.y = pixi.renderer.height;
			}
			if (entity.components.position.y > pixi.renderer.height) {
				entity.components.position.y = 0;
			}
		}
	})
	.build()
	.ecspresso
	.addSystem('update-sprite-position')
	.addQuery('movingEntities', {
		with: ['sprite', 'position'],
	})
	.setProcess((queries) => {
		for(const entity of queries.movingEntities) {
			entity.components.sprite.position.set(
				entity.components.position.x,
				entity.components.position.y
			);
		}
	})
	.build()
	.ecspresso
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
				const pixi = ecs.resourceManager.get('pixi');
					const entity = ecs.entityManager.createEntity();
					const sprite = createCircleSprite(0xFF0000, pixi);
					const worldContainer = ecs.resourceManager.get('worldContainer');
					worldContainer.addChild(sprite);

					const speed = randomInt(300, 550);

					ecs.entityManager.addComponents(entity, {
						sprite,
						speed,
						position: {
							x: randomInt(pixi.renderer.width),
							y: randomInt(pixi.renderer.height),
						},
						velocity: {
							x: randomInt(-speed, speed),
							y: randomInt(-speed, speed),
						},
						acceleration: {
							x: 0,
							y: 0
						},
					});

					setInterval(() => {
						ecs.eventBus.publish('updateEnemyDirection', { enemy: entity });
					}, randomInt(3, 8) * 1_000);
			}
		},
		updateEnemyDirection: {
			handler(_eventData) {
				const { enemy } = _eventData;

				if (!(enemy.components.velocity && enemy.components.speed)) return;

				enemy.components.velocity.x = randomInt(-enemy.components.speed, enemy.components.speed);
				enemy.components.velocity.y = randomInt(-enemy.components.speed, enemy.components.speed);
			}
		}
	})
	.build()
	.ecspresso
	.addSystem('player-control')
	.addQuery('players', {
		with: [
			'speed',
			'position',
			'velocity'
		],
	})
	.setProcess((queries, _deltaTimeMs, ecs) => {
		const controlMap = ecs.getResource('controlMap');
		const [player] = queries.players;

		if (!player) return;

		if (controlMap.up) {500
			player.components.velocity.y = -player.components.speed;
		} else if (controlMap.down) {
			player.components.velocity.y = player.components.speed;
		} else {
			player.components.velocity.y = 0;
		}

		if (controlMap.left) {
			player.components.velocity.x = -player.components.speed;
		} else if (controlMap.right) {
			player.components.velocity.x = player.components.speed;
		} else {
			player.components.velocity.x = 0;
		}
	})
	.build()
	.ecspresso
	.eventBus
	.publish('initializeGame', {
		someRandomData: new Date(),
	});

async function initPixi() {
	const pixi = new Application();

	await pixi.init({
		background: '#1099bb',
		resizeTo: window,
	});

	return pixi;
}

interface ActiveKeyMap {
	left: boolean;
	right: boolean;
	up: boolean;
	down: boolean;
}

function createCircleSprite(color: number, pixi: Application): Sprite {
	const texture = pixi.renderer.generateTexture(
		new Graphics()
			.circle(0, 0, 30)
			.fill(color)
	);

	return new Sprite(texture);
}

function activeKeyMap() {
	const controlMap: ActiveKeyMap = {
		up: false,
		down: false,
		left: false,
		right: false,
	};

	window.addEventListener('keydown', (event) => {
		switch(event.key) {
			case 'w':
			case 'ArrowUp':
				controlMap.up = true;
				break;
			case 's':
			case 'ArrowDown':
				controlMap.down = true;
				break;
			case 'a':
			case 'ArrowLeft':
				controlMap.left = true;
				break;
			case 'd':
			case 'ArrowRight':
				controlMap.right = true;
				break;
		}
	});

	window.addEventListener('keyup', (event) => {
		switch(event.key) {
			case 'w':
			case 'ArrowUp':
				controlMap.up = false;
				break;
			case 's':
			case 'ArrowDown':
				controlMap.down = false;
				break;
			case 'a':
			case 'ArrowLeft':
				controlMap.left = false;
				break;
			case 'd':
			case 'ArrowRight':
				controlMap.right = false;
				break;
		}
	});

	return controlMap;
}

function randomInt(min: number, max?: number) {
	if (max === undefined) {
		max = min;
		min = 0;
	}

	return Math.floor(Math.random() * (max - min + 1)) + min;
}
