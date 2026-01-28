import ECSpresso from '../../src';
import { createTimerBundle } from '../../src/bundles/utils/timers';
import { createMovementBundle } from '../../src/bundles/utils/movement';
import { createBoundsBundle, createBounds } from '../../src/bundles/utils/bounds';
import { createCollisionBundle } from '../../src/bundles/utils/collision';
import createGameCollisionBundle from './bundles/collision-bundle';
import createInputBundle from './bundles/input-bundle';
import createRenderBundle from './bundles/render-bundle';
import createUIBundle from './bundles/ui-bundle';
import createGameLogicBundle from './bundles/game-logic-bundle';
import type { Components, Events, Resources } from './types';
import createInitBundle from './bundles/init-bundle';

const game = ECSpresso
	.create<Components, Events, Resources>()
	.withResource('gameState', {
		status: 'ready',
		level: 1,
		lives: 3
	})
	.withResource('config', {
		playerSpeed: 200,
		enemySpeed: 50,
		projectileSpeed: 400,
		enemiesPerRow: 8,
		enemyRows: 4,
		shootCooldown: 0.5
	})
	.withResource('score', {
		value: 0
	})
	.withResource('enemyMovementState', {
		isMovingDown: false,
		currentDirection: 'right' as const,
		lastEdgeHit: null as 'left' | 'right' | null
	})
	// Bounds will be set dynamically based on screen size in init-bundle
	.withResource('bounds', createBounds(800, 600))
	.withBundle(createTimerBundle<Events>())
	.withBundle(createMovementBundle({ priority: 200 }))
	.withBundle(createBoundsBundle({ priority: 100 }))
	.withBundle(createCollisionBundle({ priority: 50 }))
	.withBundle(await createInitBundle())
	.withBundle(createInputBundle())
	.withBundle(await createRenderBundle())
	.withBundle(createUIBundle())
	.withBundle(createGameLogicBundle())
	.withBundle(createGameCollisionBundle())
	.build();

await game.initialize();
game.eventBus.publish('gameInit');
