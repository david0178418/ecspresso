import ECSpresso from '../../src';
import createInitBundle from './bundles/init-bundle';
import createInputBundle from './bundles/input-bundle';
import createRenderBundle from './bundles/render-bundle';
import createGameLogicBundle from './bundles/game-logic-bundle';
import type { Components, Events, Resources } from './types';

// Create and initialize the game
async function initGame() {
	// Create ECS instance with our types
	const game = ECSpresso
		.create<Components, Events, Resources>()
		.withBundle(await createInitBundle())
		.withBundle(createInputBundle())
		.withBundle(createRenderBundle())
		.withBundle(createGameLogicBundle())
		.build();

	// Start the game
	game.eventBus.publish('gameInit', true);
}

// Start the game when the page loads
window.addEventListener('load', initGame);
