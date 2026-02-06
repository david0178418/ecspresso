import { Graphics, Sprite } from 'pixi.js';
import ECSpresso from "../../src";
import {
	createRenderer2DBundle,
	createLocalTransform,
} from "../../src/bundles/renderers/renderer2D";

// -- Build the world --
// Building on example 01, we add custom event types for inter-system communication.
// withEventTypes declares typed events that systems can publish and subscribe to.
const ecs = ECSpresso.create()
	.withBundle(createRenderer2DBundle({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.withComponentTypes<{
		velocity: { x: number; y: number };
		radius: number;
	}>()
	.withEventTypes<{
		wallHit: { x: number; y: number };
	}>()
	.build();

// -- Systems --

// Movement (same as example 01)
ecs.addSystem('movement')
	.addQuery('moving', { with: ['localTransform', 'velocity'] })
	.setProcess((queries, dt) => {
		for (const entity of queries.moving) {
			const { localTransform, velocity } = entity.components;
			localTransform.x += velocity.x * dt;
			localTransform.y += velocity.y * dt;
		}
	})
	.and();

// Bounce: reverses velocity at screen edges and publishes a wallHit event.
// Events decouple the "what happened" from the "what should happen in response."
ecs.addSystem('bounce')
	.addQuery('bouncing', { with: ['localTransform', 'velocity', 'radius'] })
	.setProcess((queries, _dt, ecs) => {
		const bounds = ecs.getResource('bounds');
		for (const entity of queries.bouncing) {
			const { localTransform, velocity, radius } = entity.components;
			if (localTransform.x > bounds.width - radius || localTransform.x < radius) {
				velocity.x *= -1;
				ecs.eventBus.publish('wallHit', { x: localTransform.x, y: localTransform.y });
			}
			if (localTransform.y > bounds.height - radius || localTransform.y < radius) {
				velocity.y *= -1;
				ecs.eventBus.publish('wallHit', { x: localTransform.x, y: localTransform.y });
			}
		}
	})
	.and();

// Trail spawner: subscribes to wallHit events via setEventHandlers.
// This system has no query and no process — it only reacts to events.
ecs.addSystem('trail-spawner')
	.setEventHandlers({
		wallHit: {
			handler({ x, y }, ecs) {
				ecs.spawn({
					graphics: new Graphics().circle(0, 0, 4).fill(0xFFFF00),
					...createLocalTransform(x, y),
				});
			},
		},
	})
	.and();

// -- Initialize and spawn --
await ecs.initialize();

const pixiApp = ecs.getResource('pixiApp');
const ballRadius = 30;
const sprite = new Sprite(
	pixiApp.renderer.generateTexture(
		new Graphics().circle(0, 0, ballRadius).fill(0x0000FF)
	)
);
sprite.anchor.set(0.5, 0.5);

ecs.spawn({
	sprite,
	...createLocalTransform(pixiApp.screen.width / 2, pixiApp.screen.height / 2),
	velocity: { x: 300, y: 250 },
	radius: ballRadius,
});
