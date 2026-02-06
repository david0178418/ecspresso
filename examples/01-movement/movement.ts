import { Graphics, Sprite } from 'pixi.js';
import ECSpresso from "../../src";
import {
	createRenderer2DBundle,
	createLocalTransform,
} from "../../src/bundles/renderers/renderer2D";

// -- Step 1: Create the world --
// ECSpresso.create() starts a builder chain where you declare your types and bundles.
// The renderer2D bundle provides PixiJS rendering and a transform system.
// withComponentTypes adds app-specific component types (type-level only, no runtime cost).
const ecs = ECSpresso.create()
	.withBundle(createRenderer2DBundle({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.withComponentTypes<{
		velocity: { x: number; y: number };
		radius: number;
	}>()
	.build();

// -- Step 2: Define systems --
// A system processes entities that match a query each frame.
// Queries select entities by which components they have.

// Movement: applies velocity to position each frame
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

// Bounce: reverses velocity when an entity hits a screen edge
ecs.addSystem('bounce')
	.addQuery('bouncing', { with: ['localTransform', 'velocity', 'radius'] })
	.setProcess((queries, _dt, ecs) => {
		const bounds = ecs.getResource('bounds');
		for (const entity of queries.bouncing) {
			const { localTransform, velocity, radius } = entity.components;
			if (localTransform.x > bounds.width - radius || localTransform.x < radius) {
				velocity.x *= -1;
			}
			if (localTransform.y > bounds.height - radius || localTransform.y < radius) {
				velocity.y *= -1;
			}
		}
	})
	.and();

// -- Step 3: Initialize the world --
// initialize() sets up all bundle resources (e.g. the PixiJS application).
await ecs.initialize();

// -- Step 4: Spawn an entity --
// An entity is just an ID with components attached. Components are plain data objects.
// The sprite component auto-requires localTransform, visible, and worldTransform,
// so we only need to provide the ones we want to customize.
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
