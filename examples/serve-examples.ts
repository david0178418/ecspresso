import { serve } from "bun";
import home from './index.html';
import basiceMovement from './01-movement/movement.html';
import playerInput from './02-player-input/player-input.html';
import events from './03-events/events.html';
import bundles from './04-bundles/bundles.html';
import spaceInvaders from './05-space-invaders/space-invaders.html';
import turretShooter from './06-turret-shooter/turret-shooter.html';

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
		'/space-invaders/': spaceInvaders,
		'/turret-shooter/': turretShooter,
	},
});

console.log(`Listening on ${server.hostname}:${server.port}`);
