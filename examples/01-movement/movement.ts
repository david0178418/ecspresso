import { Graphics, Sprite } from 'pixi.js';
import ECSpresso from "../../src";
import {
	createRenderer2DBundle,
	createSpriteComponents,
} from "../../src/bundles/renderers/renderer2D";
import {
	createPhysics2DBundle,
	createRigidBody,
} from "../../src/bundles/physics2D";

const ecs = ECSpresso.create()
	.withBundle(createRenderer2DBundle({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.withBundle(createPhysics2DBundle())
	.withComponentTypes<{ radius: number }>()
	.build();

// Bounce system — runs after movement bundle integrates velocity
ecs
	.addSystem('bounce')
	.inPhase('postUpdate')
	.addQuery('bouncingEntities', {
		with: ['worldTransform', 'velocity', 'radius'],
	})
	.setProcess((queries, _deltaTime, ecs) => {
		const bounds = ecs.getResource('bounds');
		for (const entity of queries.bouncingEntities) {
			const { worldTransform, velocity, radius } = entity.components;

			const maxX = bounds.width - radius;
			const maxY = bounds.height - radius;

			if (worldTransform.x > maxX || worldTransform.x < radius) {
				velocity.x *= -1;
			}
			if (worldTransform.y > maxY || worldTransform.y < radius) {
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
	...createRigidBody('kinematic'),
	velocity: { x: 300, y: 250 },
	radius: ballRadius,
});
