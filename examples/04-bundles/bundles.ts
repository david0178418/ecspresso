import { Graphics, Sprite } from 'pixi.js';
import ECSpresso, { Bundle } from "../../src";
import { createInputBundle } from "../../src/bundles/input";
import type { InputResourceTypes } from "../../src/bundles/input";
import {
	createRenderer2DBundle,
	createSpriteComponents,
} from "../../src/bundles/renderers/renderer2D";
import type { Renderer2DComponentTypes, Renderer2DEventTypes, Renderer2DResourceTypes } from "../../src/bundles/renderers/renderer2D";
import {
	createTimerBundle,
	createRepeatingTimer,
} from "../../src/bundles/timers";
import type { TimerComponentTypes } from "../../src/bundles/timers";
import {
	createPhysics2DBundle,
	createRigidBody,
} from "../../src/bundles/physics2D";
import type { Physics2DComponentTypes } from "../../src/bundles/physics2D";
import {
	createBoundsBundle,
	createWrapAtBounds,
} from "../../src/bundles/bounds";
import type { BoundsComponentTypes, BoundsEventTypes } from "../../src/bundles/bounds";
import {
	createCollisionBundle,
	createCollisionPairHandler,
	defineCollisionLayers,
	createCircleCollider,
} from "../../src/bundles/collision";
import type { CollisionComponentTypes, CollisionEventTypes, LayersOf } from "../../src/bundles/collision";

// App-specific types (not from bundles)
interface AppEvents {
	initializeGame: { someRandomData: Date };
	initializeMap: void;
	startGame: void;
}

interface AppComponents {
	player: true;
	speed: number;
	enemySpawner: true;
	enemy: true;
}

// Aggregate types — needed by custom Bundle<> instances below.
// Bundle types are also added automatically via .withBundle() in the builder chain.
type Events = AppEvents & Renderer2DEventTypes & BoundsEventTypes & CollisionEventTypes<Layer>;
type Components = AppComponents & Renderer2DComponentTypes & TimerComponentTypes<Events> & Physics2DComponentTypes<Layer> & BoundsComponentTypes & CollisionComponentTypes<Layer>;
type Resources = Renderer2DResourceTypes & InputResourceTypes;

const bundleLayers = defineCollisionLayers({ player: ['enemy'], enemy: ['player'] });
type Layer = LayersOf<typeof bundleLayers>;

const BALL_RADIUS = 30;

// Create an ECSpresso instance with our game bundles
const ecs = ECSpresso
	.create()
	.withBundle(createRenderer2DBundle({
		init: { background: '#1099bb', resizeTo: window },
		container: document.body,
	}))
	.withBundle(createTimerBundle<Events>())
	.withBundle(createInputBundle({
		actions: {
			moveUp: { keys: ['w', 'ArrowUp'] },
			moveDown: { keys: ['s', 'ArrowDown'] },
			moveLeft: { keys: ['a', 'ArrowLeft'] },
			moveRight: { keys: ['d', 'ArrowRight'] },
		},
	}))
	.withBundle(createPhysics2DBundle())
	.withBundle(createBoundsBundle())
	.withBundle(createCollisionBundle({ layers: bundleLayers }))
	.withComponentTypes<AppComponents>()
	.withEventTypes<AppEvents>()
	.withBundle(createGameInitBundle())
	.withBundle(createCollisionHandlerBundle())
	.withBundle(createEnemyControllerBundle())
	.withBundle(createPlayerControllerBundle())
	.build();

await ecs.initialize();

// Trigger game initialization
ecs.eventBus.publish('initializeGame', { someRandomData: new Date() });

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

function createGameInitBundle() {
	return new Bundle<Components, Events, Resources>()
		.addSystem('init')
		.setEventHandlers({
			initializeGame: {
				handler(data, ecs) {
					console.log(`initializing at ${data.someRandomData.toLocaleDateString()}`);
					ecs.eventBus.publish('initializeMap');
				},
			},
			initializeMap: {
				handler(_eventData, ecs) {
					console.log('initializing map triggered');

					const sprite = createCircleSprite(0x0000FF);

					ecs.spawn({
						...createSpriteComponents(sprite, { x: 100, y: 100 }),
						...createRigidBody('kinematic'),
						...createWrapAtBounds(),
						...createCircleCollider(BALL_RADIUS),
						...bundleLayers.player(),
						player: true,
						speed: 500,
						velocity: { x: 0, y: 0 },
					});

					ecs.eventBus.publish('startGame');
				},
			},
			startGame: {
				handler(_eventData, ecs) {
					// Spawn enemy spawner entity with a repeating 5-second timer
					const spawnerEntity = ecs.spawn({
						...createRepeatingTimer<Events>(5),
						enemySpawner: true,
					});

					// Trigger initial spawn
					const spawner = ecs.entityManager.getComponent(spawnerEntity.id, 'timer');
					if (spawner) {
						spawner.justFinished = true;
					}
				}
			},
		})
		.and();
}

function createCollisionHandlerBundle() {
	return new Bundle<Components, Events, Resources>()
		.addSystem('collision-handler')
		.setEventHandlers({
			collision: {
				handler: createCollisionPairHandler<ECSpresso<Components, Events, Resources>>({
					'player:enemy': (_playerId, enemyId, ecs) => {
						console.log('collision detected');
						ecs.removeEntity(enemyId);
					},
				}),
			},
		})
		.and();
}

function createEnemyControllerBundle() {
	return new Bundle<Components, Events, Resources>()
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
					...createRepeatingTimer<Events>(randomInt(3, 8)),
					...createWrapAtBounds(),
					...createCircleCollider(BALL_RADIUS),
					...bundleLayers.enemy(),
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
		.and();
}

function createPlayerControllerBundle() {
	return new Bundle<Components, Events, Resources>()
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
		.and();
}
