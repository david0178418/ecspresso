import ECSpresso from '../../src';
import { createRenderer2DBundle } from '../../src/bundles/renderers/renderer2D';
import { createTimerBundle } from '../../src/bundles/utils/timers';
import { createPhysics2DBundle } from '../../src/bundles/utils/physics2D';
import { createBoundsBundle } from '../../src/bundles/utils/bounds';
import { createCollisionBundle } from '../../src/bundles/utils/collision';
import createCombatBundle from './bundles/combat-bundle';
import createInputProcessingBundle, { createInputBundle } from './bundles/input-bundle';
import createSpawnerBundle from './bundles/spawner-bundle';
import createUIBundle from './bundles/ui-bundle';
import createGameLogicBundle from './bundles/game-logic-bundle';
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
	.withBundle(createTimerBundle<Events>())
	.withBundle(createRenderer2DBundle({
		init: { background: '#000000', resizeTo: window },
		container: '#game-container',
		renderLayers: ['game'],
		screenScale: { width: 800, height: 600 },
	}))
	.withBundle(createPhysics2DBundle({ integrationPriority: 200, systemGroup: 'gameplay' }))
	.withBundle(createBoundsBundle({ priority: 100, systemGroup: 'gameplay' }))
	.withBundle(createCollisionBundle({ priority: 50, systemGroup: 'gameplay' }))
	.withBundle(createInputBundle())
	.withBundle(createInputProcessingBundle())
	.withBundle(createSpawnerBundle())
	.withBundle(createUIBundle())
	.withBundle(createGameLogicBundle())
	.withBundle(createCombatBundle())
	.build();

await game.initialize();
game.eventBus.publish('gameInit');
