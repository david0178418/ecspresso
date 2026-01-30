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
	speed: number;
	velocity: { x: number; y: number };
}

interface Resources extends Renderer2DResourceTypes {
	controlMap: ActiveKeyMap;
}

interface ActiveKeyMap {
	left: boolean;
	right: boolean;
	up: boolean;
	down: boolean;
}

const ecs = ECSpresso
	.create<Components, Renderer2DEventTypes, Resources>()
	.withBundle(createRenderer2DBundle({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.withResource('controlMap', createActiveKeyMap())
	.build();

ecs
	.addSystem('player-input')
	.inPhase('preUpdate')
	.addQuery('playerInputEntities', {
		with: ['localTransform', 'velocity', 'speed'],
	})
	.setProcess((queries, _deltaTime, ecs) => {
		const controlMap = ecs.getResource('controlMap');
		const [player] = queries.playerInputEntities;

		if (!player) return;

		const { velocity, speed } = player.components;

		velocity.y = controlMap.up ? -speed : controlMap.down ? speed : 0;
		velocity.x = controlMap.left ? -speed : controlMap.right ? speed : 0;
	})
	.and()
	.addSystem('move-entities')
	.inPhase('fixedUpdate')
	.addQuery('movingEntities', {
		with: ['localTransform', 'velocity'],
	})
	.setProcess((queries, deltaTime, ecs) => {
		for (const entity of queries.movingEntities) {
			const { localTransform, velocity } = entity.components;
			localTransform.x += velocity.x * deltaTime;
			localTransform.y += velocity.y * deltaTime;
			ecs.markChanged(entity.id, 'localTransform');
		}
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
	speed: 500,
	velocity: { x: 0, y: 0 },
});

function createActiveKeyMap() {
	const keyToControl: Record<string, keyof ActiveKeyMap> = {
		'w': 'up',
		'ArrowUp': 'up',
		's': 'down',
		'ArrowDown': 'down',
		'a': 'left',
		'ArrowLeft': 'left',
		'd': 'right',
		'ArrowRight': 'right',
	};

	// Store handler references for cleanup
	let onKeyDown: (event: KeyboardEvent) => void;
	let onKeyUp: (event: KeyboardEvent) => void;

	return {
		factory: (): ActiveKeyMap => {
			const controlMap: ActiveKeyMap = {
				up: false,
				down: false,
				left: false,
				right: false,
			};

			onKeyDown = (event) => {
				const control = keyToControl[event.key];
				if (control) controlMap[control] = true;
			};

			onKeyUp = (event) => {
				const control = keyToControl[event.key];
				if (control) controlMap[control] = false;
			};

			window.addEventListener('keydown', onKeyDown);
			window.addEventListener('keyup', onKeyUp);

			return controlMap;
		},
		onDispose: () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		}
	};
}
