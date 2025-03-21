import { serve } from "bun";
import home from './index.html';
import basiceMovement from './01-movement/movement.html';
import playerInput from './02-player-input/player-input.html';
import events from './03-events/events.html';
import bundles from './04-bundles/bundles.html';
// import simpleEnemyBehavior from './03-simple-enemy-behavior/simple-enemy-behavior.html';

const server = serve({
	port: 3000,
	development: {
		hmr: true,
	},
	routes: {
		'/': home,
		'/movement/': basiceMovement,
		'/player-input/': playerInput,
		'/events/': events,
		'/bundles/': bundles,
		// '/simple-enemy-behavior': simpleEnemyBehavior
	},
});

console.log(`Listening on ${server.hostname}:${server.port}`);
