import { Graphics, Sprite } from 'pixi.js';
import ECSpresso from "../../src";
import { createInputBundle } from "../../src/bundles/utils/input";
import {
	createRenderer2DBundle,
	createSpriteComponents,
} from "../../src/bundles/renderers/renderer2D";
import {
	createTimerBundle,
	createRepeatingTimer,
} from "../../src/bundles/utils/timers";
import {
	createPhysics2DBundle,
	createRigidBody,
} from "../../src/bundles/utils/physics2D";
import {
	createBoundsBundle,
	createWrapAtBounds,
} from "../../src/bundles/utils/bounds";
import {
	createCollisionBundle,
	createCollisionPairHandler,
	defineCollisionLayers,
	createCircleCollider,
} from "../../src/bundles/utils/collision";

const BALL_RADIUS = 30;

const layers = defineCollisionLayers({ player: ['enemy'], enemy: ['player'] });

const ecs = ECSpresso
	.create()
	.withBundle(createRenderer2DBundle({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.withBundle(createTimerBundle())
	.withBundle(createInputBundle({
		actions: {
			moveUp: { keys: ['w', 'ArrowUp'] },
			moveDown: { keys: ['s', 'ArrowDown'] },
			moveLeft: { keys: ['a', 'ArrowLeft'] },
			moveRight: { keys: ['d', 'ArrowRight'] },
		},
	}))
	.withBundle(createPhysics2DBundle({ layers }))
	.withBundle(createBoundsBundle())
	.withBundle(createCollisionBundle({ layers }))
	.withComponentTypes<{
		player: true;
		speed: number;
		enemySpawner: true;
		enemy: true;
	}>()
	.build();

ecs
	.addSystem('enemy-spawner')
	.addQuery('spawners', {
		with: ['timer', 'enemySpawner'],
	})
	.setProcess((queries, _deltaTimeMs, ecs) => {
		for (const spawner of queries.spawners) {
			if (!spawner.components.timer.justFinished) continue;

			console.log('spawning enemy triggered');
			const pixiApp = ecs.getResource('pixiApp');
			const sprite = createCircleSprite(0xFF0000);
			const speed = randomInt(300, 550);

			ecs.spawn({
				...createSpriteComponents(sprite, {
					x: randomInt(pixiApp.renderer.width),
					y: randomInt(pixiApp.renderer.height),
				}),
				...createRigidBody('kinematic'),
				...createRepeatingTimer<{}>(randomInt(3, 8)),
				...createWrapAtBounds(),
				...createCircleCollider(BALL_RADIUS),
				...layers.enemy(),
				speed,
				velocity: {
					x: randomInt(-speed, speed),
					y: randomInt(-speed, speed),
				},
				enemy: true,
			});
		}
	})
	.and()
	.addSystem('enemy-direction-change')
	.addQuery('enemies', {
		with: ['timer', 'velocity', 'speed', 'enemy'],
	})
	.setProcess((queries) => {
		for (const { components } of queries.enemies) {
			if (!components.timer.justFinished) continue;

			components.velocity.x = randomInt(-components.speed, components.speed);
			components.velocity.y = randomInt(-components.speed, components.speed);
		}
	})
	.and()
	.addSystem('player-control')
	.inPhase('preUpdate')
	.addQuery('players', {
		with: ['speed', 'localTransform', 'velocity'],
	})
	.setProcess((queries, _deltaTimeMs, ecs) => {
		const input = ecs.getResource('inputState');
		const [player] = queries.players;

		if (!player) return;

		const { velocity, speed } = player.components;

		velocity.y = input.actions.isActive('moveUp') ? -speed : input.actions.isActive('moveDown') ? speed : 0;
		velocity.x = input.actions.isActive('moveLeft') ? -speed : input.actions.isActive('moveRight') ? speed : 0;
	})
	.and()
	.addSystem('collision-handler')
	.setEventHandlers({
		collision: {
			handler: createCollisionPairHandler<typeof ecs>({
				'player:enemy': (_playerId, enemyId, ecs) => {
					console.log('collision detected');
					ecs.removeEntity(enemyId);
				},
			}),
		},
	})
	.build();

// Initialize ECS and resources
await ecs.initialize();

// Spawn player
const playerSprite = createCircleSprite(0x0000FF);
ecs.spawn({
	...createSpriteComponents(playerSprite, { x: 100, y: 100 }),
	...createRigidBody('kinematic'),
	...createWrapAtBounds(),
	...createCircleCollider(BALL_RADIUS),
	...layers.player(),
	player: true,
	speed: 500,
	velocity: { x: 0, y: 0 },
});

// Spawn enemy spawner entity with a repeating 5-second timer
ecs.spawn({
	...createRepeatingTimer<{}>(5),
	enemySpawner: true,
});

// Trigger initial spawn
const spawnerEntity = ecs.getEntitiesWithQuery(['enemySpawner', 'timer'])[0];
if (spawnerEntity) {
	spawnerEntity.components.timer.justFinished = true;
}

function createCircleSprite(color: number): Sprite {
	const texture = ecs.getResource('pixiApp').renderer.generateTexture(
		new Graphics().circle(0, 0, BALL_RADIUS).fill(color)
	);
	return new Sprite(texture);
}

function randomInt(min: number, max?: number): number {
	if (max === undefined) {
		max = min;
		min = 0;
	}
	return Math.floor(Math.random() * (max - min + 1)) + min;
}
