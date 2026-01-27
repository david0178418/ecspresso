import ECSpresso from '../../src';
import { createTimerBundle } from '../../src/bundles/utils/timers';
import createCollisionBundle from './bundles/collision-bundle';
import createInputBundle from './bundles/input-bundle';
import createRenderBundle from './bundles/render-bundle';
import createUIBundle from './bundles/ui-bundle';
import createGameLogicBundle from './bundles/game-logic-bundle';
import type { Components, Events, Resources } from './types';
import createInitBundle from './bundles/init-bundle';

const game = ECSpresso
	.create<Components, Events, Resources>()
	.withBundle(createTimerBundle())
	.withBundle(await createInitBundle())
	.withBundle(createInputBundle())
	.withBundle(await createRenderBundle())
	.withBundle(createUIBundle())
	.withBundle(createGameLogicBundle())
	.withBundle(createCollisionBundle())
	.build();

await game.initialize();
game.eventBus.publish('gameInit');
