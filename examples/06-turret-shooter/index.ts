import ECSpresso from '../../src';
import { createTimerPlugin } from '../../src/plugins/timers';
import createInitPlugin from './plugins/init-plugin';
import createInputPlugin from './plugins/input-plugin';
import createRenderPlugin from './plugins/render-plugin';
import createPhysicsPlugin from './plugins/physics-plugin';
import createAIPlugin from './plugins/ai-plugin';
import createGameplayPlugin from './plugins/gameplay-plugin';
import createUIPlugin from './plugins/ui-plugin';
import createGameStatePlugin from './plugins/game-state-plugin';
import type { Events } from './types';

// Create and initialize the game
async function initGame() {
	// Create ECS instance with our types
	const game = ECSpresso
		.create()
		.withPlugin(createTimerPlugin<Events>())
		.withPlugin(await createInitPlugin())
		.withPlugin(createInputPlugin())
		.withPlugin(createRenderPlugin())
		.withPlugin(createPhysicsPlugin())
		.withPlugin(createAIPlugin())
		.withPlugin(createGameplayPlugin())
		.withPlugin(createUIPlugin())
		.withPlugin(createGameStatePlugin())
		.build();

	// Initialize all resources and systems
	await game.initialize();

	// Start the game
	game.eventBus.publish('gameInit', true);
}

// Start the game when the page loads
window.addEventListener('load', initGame);
