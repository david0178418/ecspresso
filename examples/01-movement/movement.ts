import { Application, Graphics, Sprite } from 'pixi.js';
import ECSpresso from "../../src";

interface Components {
	sprite: Sprite;
	position: {
		x: number;
		y: number;
	};
	velocity: {
		x: number;
		y: number;
	};
	radius: number;
}

interface Resources {
	pixi: Application;
}

const ecs = new ECSpresso<Components, {}, Resources>()

ecs
	.addResource('pixi', async () => {
		const pixi = new Application();

		await pixi.init({
			background: '#1099bb',
			resizeTo: window,
		});
		return pixi;
	})
	.addSystem('move-entities')
	.addQuery('movingEntities', {
		with: ['position', 'velocity', 'radius'],
	})
	.setProcess((queries, deltaTime, ecs) => {
		const pixi = ecs.resourceManager.get('pixi');

		for(const entity of queries.movingEntities) {
			const { position, velocity, radius } = entity.components;

			// Update position
			position.x += velocity.x * deltaTime;
			position.y += velocity.y * deltaTime;

			// Bounce off screen edges
			const maxX = pixi.screen.width - radius;
			const maxY = pixi.screen.height - radius;
			const minX = radius;
			const minY = radius;

			if (position.x > maxX) {
				position.x = maxX;
				velocity.x *= -1;
			} else if (position.x < minX) {
				position.x = minX;
				velocity.x *= -1;
			}

			if (position.y > maxY) {
				position.y = maxY;
				velocity.y *= -1;
			} else if (position.y < minY) {
				position.y = minY;
				velocity.y *= -1;
			}
		}
	})
	.and()
	.addSystem('update-sprite-position')
	.addQuery('renderedEntities', {
		with: ['sprite', 'position'],
	})
	.setOnInitialize(async (ecs) => {
		const pixi = ecs.resourceManager.get('pixi');

		console.log('pixi', pixi);

		const canvasContainerEl = document
			.createElement('div')
			.appendChild(pixi.canvas);

		document.body.appendChild(canvasContainerEl);

		// Create ball entity
		const ballEntity = ecs.entityManager.createEntity();
		const ballRadius = 30;
		const sprite = createCircleSprite(0x0000FF, pixi, ballRadius)
		sprite.anchor.set(0.5, 0.5); // "position" will be relative to the center of the sprite

		ecs.entityManager.addComponents(ballEntity, {
			sprite,
			radius: ballRadius,
			position: {
				x: pixi.screen.width / 2,
				y: pixi.screen.height / 2
			},
			velocity: {
				x: 300,
				y: 250
			}
		});

		pixi.stage.addChild(sprite);
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

ecs
	.resourceManager.get('pixi')
	.ticker
	.add(ticker => {
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