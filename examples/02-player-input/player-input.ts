import { Application, Graphics, Sprite } from 'pixi.js';
import ECSpresso from "../../src";

interface Components {
	sprite: Sprite;
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

interface Resources {
	pixi: Application;
	controlMap: ActiveKeyMap;
}

const ecs = new ECSpresso<Components, {}, Resources>();

ecs
	.addResource('controlMap', activeKeyMap)
	.addResource('pixi', async () => {
		const pixi = new Application();

		await pixi.init({
			background: '#1099bb',
			resizeTo: window,
			});

		return pixi;
	})
	.addSystem('player-input')
	.setOnInitialize(async (ecs) => {
		const pixi = ecs.getResource('pixi');

		const canvasContainerEl = document
			.createElement('div')
			.appendChild(pixi.canvas);

		document.body.appendChild(canvasContainerEl);

		// Create ball entity
		const ballRadius = 30;
		const sprite = createCircleSprite(0x0000FF, pixi, ballRadius)
		sprite.anchor.set(0.5, 0.5); // "position" will be relative to the center of the sprite

		ecs.spawn({
			sprite,
			speed: 500,
			position: {
				x: pixi.screen.width / 2,
				y: pixi.screen.height / 2
			},
			velocity: {
				x: 0,
				y: 0
			}
		});

		pixi.stage.addChild(sprite);
	})
	.addQuery('playerInputEntities', {
		with: ['position', 'velocity', 'speed'],
	})
	.setProcess((queries, _deltaTime, ecs) => {
		const controlMap = ecs.getResource('controlMap');

		const [player] = queries.playerInputEntities;

		if(!player) return;


		if (controlMap.up) {
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
	.and()
	.addSystem('move-entities')
	.addQuery('movingEntities', {
		with: ['position', 'velocity'],
	})
	.setProcess((queries, deltaTime) => {
		for(const entity of queries.movingEntities) {
			const { position, velocity } = entity.components;

			// Update position
			position.x += velocity.x * deltaTime;
			position.y += velocity.y * deltaTime;
		}
	})
	.and()
	.addSystem('update-sprite-position')
	.addQuery('renderedEntities', {
		with: ['sprite', 'position'],
	})
	.setProcess((queries) => {
		for(const entity of queries.renderedEntities) {
			entity.components.sprite.position.set(
				entity.components.position.x,
				entity.components.position.y
			);
		}
	})
	.build();

await ecs.initialize();

ecs.getResource('pixi').ticker.add(ticker => {
	ecs.update(ticker.deltaMS / 1000);
});

function createCircleSprite(color: number, pixi: Application, radius: number): Sprite {
	const texture = pixi.renderer.generateTexture(
		new Graphics()
			.circle(0, 0, radius)
			.fill(color)
	);

	return new Sprite(texture);
}

interface ActiveKeyMap {
	left: boolean;
	right: boolean;
	up: boolean;
	down: boolean;
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