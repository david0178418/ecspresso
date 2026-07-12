import ECSpresso from '../../src';
import { createTimerPlugin } from '../../src/plugins/scripting/timers';
import { createRenderer2DPlugin } from '../../src/plugins/rendering/renderer2D';
import { createPhysics2DPlugin } from '../../src/plugins/physics/physics2D';
import { createBoundsPlugin } from '../../src/plugins/spatial/bounds';
import { createCollisionPlugin, type LayersOf } from '../../src/plugins/physics/collision';
import collisionLayers from './collision-layers';
import { createInputPlugin } from './plugins/input-plugin';
import type { AppComponents, AppEvents, AppResources, TimerSlot } from './types';

type Layer = LayersOf<typeof collisionLayers>;

export const game = ECSpresso.create()
	.withPlugin(createTimerPlugin<TimerSlot>())
	.withPlugin(createRenderer2DPlugin({
		background: '#000000',
		container: '#game-container',
		renderLayers: ['game'],
		screenScale: { width: 800, height: 600 },
	}))
	.withPlugin(
		createPhysics2DPlugin<Layer, 'gameplay'>({
			integrationPriority: 200,
			systemGroup: 'gameplay',
		}),
	)
	.withPlugin(createBoundsPlugin({ priority: 100, systemGroup: 'gameplay' }))
	.withPlugin(
		createCollisionPlugin({
			layers: collisionLayers,
			priority: 50,
			systemGroup: 'gameplay',
		}),
	)
	.withPlugin(createInputPlugin())
	.withComponentTypes<AppComponents>()
	.withEventTypes<AppEvents>()
	.withResourceTypes<AppResources>()
	.withResource('gameState', { status: 'ready', level: 1, lives: 3 })
	.withResource('config', {
		playerSpeed: 200,
		enemySpeed: 50,
		projectileSpeed: 400,
		enemiesPerRow: 8,
		enemyRows: 4,
		shootCooldown: 0.5,
	})
	.withResource('score', { value: 0 })
	.withResource('enemyMovementState', {
		isMovingDown: false,
		currentDirection: 'right',
		lastEdgeHit: null,
	})
	.build();

export type Game = typeof game;
