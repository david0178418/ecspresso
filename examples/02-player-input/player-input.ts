import { Graphics, Sprite } from 'pixi.js';
import ECSpresso from "../../src";
import {
	createPixiBundle,
	createSpriteComponents,
	type PixiComponentTypes,
	type PixiEventTypes,
	type PixiResourceTypes,
} from "../../src/bundles/renderers/pixi";

interface Components extends PixiComponentTypes {
	speed: number;
	velocity: { x: number; y: number };
}

interface Resources extends PixiResourceTypes {
	controlMap: ActiveKeyMap;
}

interface ActiveKeyMap {
	left: boolean;
	right: boolean;
	up: boolean;
	down: boolean;
}

const ecs = ECSpresso
	.create<Components, PixiEventTypes, Resources>()
	.withBundle(createPixiBundle({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.withResource('controlMap', createActiveKeyMap())
	.build();

ecs
	.addSystem('player-input')
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
	.addQuery('movingEntities', {
		with: ['localTransform', 'velocity'],
	})
	.setProcess((queries, deltaTime) => {
		for (const entity of queries.movingEntities) {
			const { localTransform, velocity } = entity.components;
			localTransform.x += velocity.x * deltaTime;
			localTransform.y += velocity.y * deltaTime;
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

pixiApp.ticker.add(ticker => ecs.update(ticker.deltaMS / 1000));

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
