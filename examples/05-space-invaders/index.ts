import ECSpresso from '../../src';
import { createPixiBundle } from '../../src/bundles/renderers/pixi';
import { createTimerBundle } from '../../src/bundles/utils/timers';
import { createMovementBundle } from '../../src/bundles/utils/movement';
import { createBoundsBundle, createBounds } from '../../src/bundles/utils/bounds';
import { createCollisionBundle } from '../../src/bundles/utils/collision';
import createCombatBundle from './bundles/combat-bundle';
import createInputBundle from './bundles/input-bundle';
import createSpawnerBundle from './bundles/spawner-bundle';
import createUIBundle from './bundles/ui-bundle';
import createGameLogicBundle from './bundles/game-logic-bundle';
import createInitBundle from './bundles/init-bundle';
import type { Components, Events, Resources } from './types';

const game = ECSpresso
	.create<Components, Events, Resources>()
	.withResource('gameState', { status: 'ready', level: 1, lives: 3 })
	.withResource('config', {
		playerSpeed: 200,
		enemySpeed: 50,
		projectileSpeed: 400,
		enemiesPerRow: 8,
		enemyRows: 4,
		shootCooldown: 0.5
	})
	.withResource('score', { value: 0 })
	.withResource('enemyMovementState', {
		isMovingDown: false,
		currentDirection: 'right',
		lastEdgeHit: null,
	})
	.withResource('bounds', createBounds(800, 600)) // Updated dynamically in init-bundle
	.withBundle(createTimerBundle<Events>())
	.withBundle(createPixiBundle({
		init: { background: '#000000', resizeTo: window },
		container: '#game-container',
	}))
	.withBundle(createMovementBundle({ priority: 200 }))
	.withBundle(createBoundsBundle({ priority: 100 }))
	.withBundle(createCollisionBundle({ priority: 50 }))
	.withBundle(createInitBundle())
	.withBundle(createInputBundle())
	.withBundle(createSpawnerBundle())
	.withBundle(createUIBundle())
	.withBundle(createGameLogicBundle())
	.withBundle(createCombatBundle())
	.build();

await game.initialize();
game.eventBus.publish('gameInit');
