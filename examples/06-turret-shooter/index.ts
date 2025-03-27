import ECSpresso from '../../src';
import createInitBundle from './bundles/init-bundle';
import createInputBundle from './bundles/input-bundle';
import createRenderBundle from './bundles/render-bundle';
import createPhysicsBundle from './bundles/physics-bundle';
import createAIBundle from './bundles/ai-bundle';
import createGameplayBundle from './bundles/gameplay-bundle';
import createUIBundle from './bundles/ui-bundle';
import createGameStateBundle from './bundles/game-state-bundle';
import type { Components, Events, Resources } from './types';

// Create and initialize the game
async function initGame() {
	// Create ECS instance with our types
	const game = ECSpresso
		.create<Components, Events, Resources>()
		.withBundle(await createInitBundle())
		.withBundle(createInputBundle())
		.withBundle(createRenderBundle())
		.withBundle(createPhysicsBundle())
		.withBundle(createAIBundle())
		.withBundle(createGameplayBundle())
		.withBundle(createUIBundle())
		.withBundle(createGameStateBundle())
		.build();

	// Start the game
	game.eventBus.publish('gameInit', true);
}

// Start the game when the page loads
window.addEventListener('load', initGame);
