import { Graphics, Sprite } from 'pixi.js';
import ECSpresso from "../../src";
import {
	createRenderer2DBundle,
	createSpriteComponents,
	type Renderer2DComponentTypes,
	type Renderer2DEventTypes,
	type Renderer2DResourceTypes,
} from "../../src/bundles/renderers/renderer2D";

interface Components extends Renderer2DComponentTypes {
	velocity: { x: number; y: number };
	radius: number;
}

const ecs = ECSpresso.create<Components, Renderer2DEventTypes, Renderer2DResourceTypes>()
	.withBundle(createRenderer2DBundle({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.build();

// Movement system
ecs
	.addSystem('move-entities')
	.addQuery('movingEntities', {
		with: ['localTransform', 'velocity', 'radius'],
	})
	.setProcess((queries, deltaTime, ecs) => {
		const pixiApp = ecs.getResource('pixiApp');
		for (const entity of queries.movingEntities) {
			const { localTransform, velocity, radius } = entity.components;
			localTransform.x += velocity.x * deltaTime;
			localTransform.y += velocity.y * deltaTime;

			// Bounce off edges
			const maxX = pixiApp.screen.width - radius;
			const maxY = pixiApp.screen.height - radius;
			if (localTransform.x > maxX || localTransform.x < radius) {
				localTransform.x = Math.max(radius, Math.min(maxX, localTransform.x));
				velocity.x *= -1;
			}
			if (localTransform.y > maxY || localTransform.y < radius) {
				localTransform.y = Math.max(radius, Math.min(maxY, localTransform.y));
				velocity.y *= -1;
			}
		}
	})
	.build();

// Initialize and spawn entities directly
await ecs.initialize();

const pixiApp = ecs.getResource('pixiApp');

// Spawn ball entity
const ballRadius = 30;
const sprite = new Sprite(
	pixiApp.renderer.generateTexture(
		new Graphics().circle(0, 0, ballRadius).fill(0x0000FF)
	)
);

ecs.spawn({
	...createSpriteComponents(sprite, {
		x: pixiApp.screen.width / 2,
		y: pixiApp.screen.height / 2,
	}, { anchor: { x: 0.5, y: 0.5 } }),
	velocity: { x: 300, y: 250 },
	radius: ballRadius,
});

