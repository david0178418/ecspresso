import { Application, Container, Graphics, Sprite } from 'pixi.js';
import ECSpresso, { Entity } from "../../src";

interface Components {
	sprite: Sprite;
	player: true;
	enemy: true;
	frozen: true;
	position: {
		x: number;
		y: number;
	};
	velocity: {
		x: number;
		y: number;
	};
	acceleration: {
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
			},
		},
		startGame: {
			handler(_eventData, ecs) {
				console.log('game started triggered');
				const pixi = ecs.getResource('pixi');

				pixi.ticker.add(ticker => {
					ecs.update(ticker.deltaMS);
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
	.setProcess((queries, deltaTimeMs) => {
		for(const entity of queries.movingEntities) {
			entity.components.position.x += entity.components.velocity.x * deltaTimeMs;
			entity.components.position.y += entity.components.velocity.y * deltaTimeMs;
		}

	})
	.build()
	.ecspresso
	.addSystem('apply-acceleration')
	.addQuery('movingEntities', {
		with: ['acceleration', 'velocity'],
		without: ['frozen']
	})
	.setProcess((queries, deltaTimeMs) => {
		for(const entity of queries.movingEntities) {
			entity.components.velocity.x += entity.components.acceleration.x * deltaTimeMs;
			entity.components.velocity.y += entity.components.acceleration.y * deltaTimeMs;
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
				console.log('starting game triggered in enemy-movement');
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

					ecs.entityManager.addComponents(entity, {
						sprite,
						position: {
							x: Math.random() * pixi.renderer.width,
							y: Math.random() * pixi.renderer.height
						},
						velocity: {
							x: randomInt(-100, 100),
							y: randomInt(-100, 100),
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

				if (!enemy.components.acceleration) return;

				enemy.components.acceleration.x = randomInt(-100, 100);
				enemy.components.acceleration.y = randomInt(-100, 100);
			}
		}
	})
	.build()
	.ecspresso
	.addSystem('player-control')
	.addQuery('players', {
		with: ['sprite', 'position', 'velocity', 'acceleration']
	})
	.setProcess((queries, _deltaTimeMs, ecs) => {
		const controlMap = ecs.getResource('controlMap');
		const [player] = queries.players;

		if (!player) return;

		if (controlMap.up) {
			player.components.velocity.y -= 100;
		}
		if (controlMap.down) {
			player.components.velocity.y += 100;
		}
		if (controlMap.left) {
			player.components.velocity.x -= 100;
		}
		if (controlMap.right) {
			player.components.velocity.x += 100;
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
