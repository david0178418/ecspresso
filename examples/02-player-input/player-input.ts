import { Graphics, Sprite } from 'pixi.js';
import ECSpresso from "../../src";
import { createInputPlugin } from "../../src/plugins/input";
import {
	createRenderer2DPlugin,
	createLocalTransform,
} from "../../src/plugins/renderers/renderer2D";

// -- Build the world --
// Building on example 01, we add the input plugin for keyboard handling.
// Actions map named intents to physical keys — systems read actions, not raw keys.
const ecs = ECSpresso.create()
	.withPlugin(createRenderer2DPlugin({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.withPlugin(createInputPlugin({
		actions: {
			moveUp: { keys: ['w', 'ArrowUp'] },
			moveDown: { keys: ['s', 'ArrowDown'] },
			moveLeft: { keys: ['a', 'ArrowLeft'] },
			moveRight: { keys: ['d', 'ArrowRight'] },
		},
	}))
	.withComponentTypes<{
		velocity: { x: number; y: number };
		speed: number;
	}>()
	.build();

// -- Systems --

// Input: reads action state from the inputState resource and sets velocity.
// Runs in preUpdate so velocity is ready before the movement system.
ecs.addSystem('player-input')
	.inPhase('preUpdate')
	.addQuery('players', { with: ['velocity', 'speed'] })
	.setProcess((queries, _dt, ecs) => {
		const input = ecs.getResource('inputState');
		const [player] = queries.players;
		if (!player) return;

		const { velocity, speed } = player.components;
		velocity.x = input.actions.isActive('moveLeft') ? -speed : input.actions.isActive('moveRight') ? speed : 0;
		velocity.y = input.actions.isActive('moveUp') ? -speed : input.actions.isActive('moveDown') ? speed : 0;
	});

// Movement: applies velocity to position (same pattern as example 01)
ecs.addSystem('movement')
	.addQuery('moving', { with: ['localTransform', 'velocity'] })
	.setProcess((queries, dt) => {
		for (const entity of queries.moving) {
			const { localTransform, velocity } = entity.components;
			localTransform.x += velocity.x * dt;
			localTransform.y += velocity.y * dt;
		}
	});

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
	velocity: { x: 0, y: 0 },
	speed: 500,
});
