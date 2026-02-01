import { Graphics, Sprite } from 'pixi.js';
import ECSpresso from "../../src";
import {
	createInputBundle,
	type InputResourceTypes,
} from "../../src/bundles/utils/input";
import {
	createRenderer2DBundle,
	createSpriteComponents,
	type Renderer2DComponentTypes,
	type Renderer2DEventTypes,
	type Renderer2DResourceTypes,
} from "../../src/bundles/renderers/renderer2D";
import {
	createPhysics2DBundle,
	createRigidBody,
	type Physics2DComponentTypes,
} from "../../src/bundles/utils/physics2D";

interface Components extends Renderer2DComponentTypes, Physics2DComponentTypes {
	speed: number;
}

interface Resources extends Renderer2DResourceTypes, InputResourceTypes {}

const ecs = ECSpresso
	.create<Components, Renderer2DEventTypes, Resources>()
	.withBundle(createRenderer2DBundle({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.withBundle(createPhysics2DBundle())
	.withBundle(createInputBundle({
		actions: {
			moveUp: { keys: ['w', 'ArrowUp'] },
			moveDown: { keys: ['s', 'ArrowDown'] },
			moveLeft: { keys: ['a', 'ArrowLeft'] },
			moveRight: { keys: ['d', 'ArrowRight'] },
		},
	}))
	.build();

ecs
	.addSystem('player-input')
	.inPhase('preUpdate')
	.addQuery('playerInputEntities', {
		with: ['localTransform', 'velocity', 'speed'],
	})
	.setProcess((queries, _deltaTime, ecs) => {
		const input = ecs.getResource('inputState');
		const [player] = queries.playerInputEntities;

		if (!player) return;

		const { velocity, speed } = player.components;

		velocity.y = input.actions.isActive('moveUp') ? -speed : input.actions.isActive('moveDown') ? speed : 0;
		velocity.x = input.actions.isActive('moveLeft') ? -speed : input.actions.isActive('moveRight') ? speed : 0;
	})
	.build();

await ecs.initialize();

const pixiApp = ecs.getResource('pixiApp');

// Create ball entity
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
	speed: 500,
	velocity: { x: 0, y: 0 },
});
